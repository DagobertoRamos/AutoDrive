// =============================================================================
// Conexões das lojas com os provedores (BYOC). Segredos cifrados (AES-256-GCM,
// src/lib/crypto.ts); a API devolve só dicas mascaradas. Uma conexão ATIVA por
// domínio e escopo (loja inteira ou filial). Teste antes de ativar.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { createHmac } from 'crypto'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/crypto'
import { OpsError, recordEvent, type Actor } from './operations'
import { providerEntry, type ConnectorDomain } from './providers-catalog'

export interface ResolvedConnection {
  id: string | null
  providerId: string
  environment: 'HOMOLOGACAO' | 'PRODUCAO'
  credentials: Record<string, string>
  settings: Record<string, unknown>
  /** Conta da AutoDrive (padrão da plataforma), não da loja. */
  platform?: boolean
}

/**
 * Conta da própria AutoDrive: o MASTER conecta uma vez e ela vale para toda loja
 * que não conectou um provedor próprio. Só onde a AutoDrive contrata (consulta
 * de débitos); RENAVE, notas e transferência seguem sendo da loja (BYOC).
 */
export const PLATFORM_TENANT = '__autodrive__'
export const PLATFORM_DOMAINS: ReadonlySet<string> = new Set(['VEHICLE_DATA'])
const isPlatform = (tenantId: string) => tenantId === PLATFORM_TENANT

const MANUAL: Omit<ResolvedConnection, 'providerId'> = { id: null, environment: 'PRODUCAO', credentials: {}, settings: {} }

function mask(v: string): string {
  if (!v) return ''
  return v.length <= 6 ? '••••' : `••••${v.slice(-4)}`
}

function readSecrets(enc: string | null): Record<string, string> {
  if (!enc) return {}
  try { return JSON.parse(decrypt(enc)) as Record<string, string> } catch { return {} }
}

/** Conexão ativa do domínio (filial primeiro, depois loja inteira); sem ela, modo manual. */
export async function activeConnection(tenantId: string, domain: ConnectorDomain, unitId?: string | null): Promise<ResolvedConnection> {
  const rows = await prisma.integrationConnection.findMany({
    where: { tenantId, domain, status: 'ACTIVE', scopeKey: { in: [unitId ?? 'ALL', 'ALL'] } },
    orderBy: { updatedAt: 'desc' },
  }).catch(() => [])
  const row = rows.find((r) => r.scopeKey === unitId) ?? rows.find((r) => r.scopeKey === 'ALL')
  if (row) return resolved(row)
  // Sem conexão própria: a conta padrão da AutoDrive, quando houver.
  if (PLATFORM_DOMAINS.has(domain) && !isPlatform(tenantId)) {
    const def = await platformConnectionRow(domain)
    if (def) return { ...resolved(def), platform: true }
  }
  return { ...MANUAL, providerId: 'MANUAL' }
}

function resolved(row: { id: string; providerId: string; environment: string; settings: Prisma.JsonValue; secretsEncrypted: string | null }): ResolvedConnection {
  return {
    id: row.id, providerId: row.providerId, environment: row.environment === 'HOMOLOGACAO' ? 'HOMOLOGACAO' : 'PRODUCAO',
    credentials: { ...((row.settings as Record<string, string> | null) ?? {}), ...readSecrets(row.secretsEncrypted) },
    settings: (row.settings as Record<string, unknown> | null) ?? {},
  }
}

function platformConnectionRow(domain: string) {
  return prisma.integrationConnection.findFirst({ where: { tenantId: PLATFORM_TENANT, domain, status: 'ACTIVE' }, orderBy: { updatedAt: 'desc' } }).catch(() => null)
}

/** Provedor padrão da AutoDrive por área (para a loja só importa quem é). */
export async function platformDefaults(): Promise<Record<string, { providerId: string; environment: string } | null>> {
  const out: Record<string, { providerId: string; environment: string } | null> = {}
  for (const d of PLATFORM_DOMAINS) {
    const row = await platformConnectionRow(d)
    out[d] = row ? { providerId: row.providerId, environment: row.environment } : null
  }
  return out
}

export async function connectionById(id: string): Promise<ResolvedConnection & { tenantId: string; domain: string } | null> {
  const row = await prisma.integrationConnection.findUnique({ where: { id } })
  if (!row) return null
  return {
    id: row.id, tenantId: row.tenantId, domain: row.domain, providerId: row.providerId,
    environment: row.environment === 'HOMOLOGACAO' ? 'HOMOLOGACAO' : 'PRODUCAO',
    credentials: { ...((row.settings as Record<string, string> | null) ?? {}), ...readSecrets(row.secretsEncrypted) },
    settings: (row.settings as Record<string, unknown> | null) ?? {},
  }
}

export async function listConnections(tenantId: string) {
  const rows = await prisma.integrationConnection.findMany({ where: { tenantId }, orderBy: [{ domain: 'asc' }, { updatedAt: 'desc' }] })
  return rows.map((r) => ({
    id: r.id, domain: r.domain, providerId: r.providerId, unitId: r.unitId, environment: r.environment, status: r.status,
    hints: (r.maskedHints as Record<string, string> | null) ?? {}, settings: (r.settings as Record<string, unknown> | null) ?? {},
    lastTestAt: r.lastTestAt, lastTestOk: r.lastTestOk, lastError: r.lastError, updatedAt: r.updatedAt,
  }))
}

/**
 * Cria/atualiza a conexão. Campo secreto em branco mantém o valor salvo.
 * Toda alteração volta a conexão para rascunho até o próximo teste.
 */
export async function saveConnection(tenantId: string, input: { domain: string; providerId: string; environment?: string; unitId?: string | null; fields: Record<string, unknown> }, actor: Actor) {
  const entry = providerEntry(input.domain, input.providerId)
  if (!entry) throw new OpsError('Provedor inválido.', 400)
  if (entry.mode === 'MANUAL') throw new OpsError('O modo manual não precisa de conexão.', 400)
  const environment = input.environment === 'HOMOLOGACAO' ? 'HOMOLOGACAO' : 'PRODUCAO'
  if (isPlatform(tenantId) && (!PLATFORM_DOMAINS.has(entry.domain) || input.unitId)) throw new OpsError('A conta da AutoDrive só vale para a consulta de débitos, em todas as lojas.', 400)
  const scopeKey = input.unitId || 'ALL'
  if (input.unitId && !(await prisma.unit.findFirst({ where: { id: input.unitId, tenantId }, select: { id: true } }))) throw new OpsError('Filial inválida.', 400)
  const current = await prisma.integrationConnection.findUnique({ where: { tenantId_domain_providerId_scopeKey: { tenantId, domain: entry.domain, providerId: entry.id, scopeKey } } })
  const secrets = readSecrets(current?.secretsEncrypted ?? null)
  const settings: Record<string, string> = { ...((current?.settings as Record<string, string> | null) ?? {}) }
  const hints: Record<string, string> = { ...((current?.maskedHints as Record<string, string> | null) ?? {}) }
  for (const f of entry.fields) {
    const raw = input.fields[f.key]
    const v = typeof raw === 'string' ? raw.trim() : ''
    if (f.secret) {
      if (v) { secrets[f.key] = v.slice(0, 4000); hints[f.key] = mask(v) }
    } else if (raw !== undefined) {
      if (f.key === 'baseUrl' && v && !/^https:\/\//i.test(v)) throw new OpsError('O endereço da API precisa começar com https://', 400)
      settings[f.key] = v.slice(0, 500)
      hints[f.key] = v.slice(0, 500)
    }
  }
  const missing = entry.fields.filter((f) => f.required && !(f.secret ? secrets[f.key] : settings[f.key]))
  if (missing.length) throw new OpsError(`Preencha: ${missing.map((f) => f.label).join(', ')}.`, 400)
  const data = {
    environment, status: 'DRAFT', unitId: input.unitId || null,
    secretsEncrypted: Object.keys(secrets).length ? encrypt(JSON.stringify(secrets)) : null,
    maskedHints: hints as Prisma.InputJsonValue, settings: settings as Prisma.InputJsonValue, updatedById: actor.id ?? null, lastError: null,
  }
  const saved = current
    ? await prisma.integrationConnection.update({ where: { id: current.id }, data })
    : await prisma.integrationConnection.create({ data: { ...data, tenantId, domain: entry.domain, providerId: entry.id, scopeKey, createdById: actor.id ?? null } })
  await prisma.auditLog.create({ data: { tenantId: isPlatform(tenantId) ? null : tenantId, userId: actor.id ?? null, userName: actor.name ?? null, userRole: actor.role ?? null, action: current ? 'CONNECTION_UPDATED' : 'CONNECTION_CREATED', entity: 'IntegrationConnection', entityId: saved.id, afterData: { domain: entry.domain, providerId: entry.id, environment, hints } as never } }).catch(() => {})
  return saved
}

export async function recordTest(id: string, ok: boolean, error: string | null) {
  await prisma.integrationConnection.update({ where: { id }, data: { lastTestAt: new Date(), lastTestOk: ok, lastError: ok ? null : (error ?? 'Falha no teste').slice(0, 500), ...(ok ? {} : { status: 'ERROR' }) } })
}

/** Ativa (exige teste ok) e desativa as outras do mesmo domínio/escopo. */
export async function activateConnection(tenantId: string, id: string, actor: Actor) {
  const c = await prisma.integrationConnection.findFirst({ where: { id, tenantId } })
  if (!c) throw new OpsError('Conexão não encontrada.', 404)
  if (!c.lastTestOk) throw new OpsError('Teste a conexão antes de ativar.', 409)
  await prisma.$transaction([
    prisma.integrationConnection.updateMany({ where: { tenantId, domain: c.domain, scopeKey: c.scopeKey, status: 'ACTIVE', id: { not: c.id } }, data: { status: 'DISABLED' } }),
    prisma.integrationConnection.update({ where: { id: c.id }, data: { status: 'ACTIVE', updatedById: actor.id ?? null } }),
  ])
  if (!isPlatform(tenantId)) await recordEvent({ tenantId, type: 'CONNECTION_ACTIVATED', title: `Conexão ${c.providerId} ativada (${c.domain}).`, actor, technical: true })
}

export async function disableConnection(tenantId: string, id: string, actor: Actor) {
  const r = await prisma.integrationConnection.updateMany({ where: { id, tenantId }, data: { status: 'DISABLED', updatedById: actor.id ?? null } })
  if (!r.count) throw new OpsError('Conexão não encontrada.', 404)
  if (!isPlatform(tenantId)) await recordEvent({ tenantId, type: 'CONNECTION_DISABLED', title: 'Conexão desativada.', actor, technical: true })
}

/**
 * Provedor + contexto (credenciais da loja) para uma chamada. `prefer` mantém o
 * provedor de um ciclo já iniciado (ex.: RENAVE começou numa integradora).
 */
export async function providerContext(tenantId: string, domain: ConnectorDomain, unitId: string | null | undefined, prefer?: string | null): Promise<{ providerId: string; ctx: { tenantId: string; unitId: string | null; credentials: Record<string, string>; environment: 'HOMOLOGACAO' | 'PRODUCAO'; connectionId: string | null } }> {
  let conn = await activeConnection(tenantId, domain, unitId)
  if (prefer && prefer !== conn.providerId) {
    const row = prefer === 'MANUAL' ? null : await prisma.integrationConnection.findFirst({ where: { tenantId, domain, providerId: prefer, status: { in: ['ACTIVE', 'DISABLED'] } }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
    const c = row ? await connectionById(row.id) : null
    conn = c ?? { ...conn, id: null, providerId: prefer, credentials: {}, settings: {} }
  }
  return { providerId: conn.providerId, ctx: { tenantId, unitId: unitId ?? null, credentials: conn.credentials, environment: conn.environment, connectionId: conn.id } }
}

/** Token do webhook de uma conexão (vai na URL cadastrada no provedor). */
export function connectionWebhookToken(connectionId: string): string {
  const secret = process.env.OPS_WEBHOOK_SECRET ?? process.env.NEXTAUTH_SECRET ?? 'autodrive'
  return createHmac('sha256', secret).update(`conn:${connectionId}`).digest('hex').slice(0, 40)
}

export function connectionWebhookUrl(connectionId: string): string {
  const base = (process.env.NEXTAUTH_URL ?? 'https://www.appautodrive.online').replace(/\/+$/, '')
  return `${base}/api/webhook/connections/${connectionId}?t=${connectionWebhookToken(connectionId)}`
}
