// =============================================================================
// seller-queue/queue.ts — helpers de fila (acesso ao banco).
// Data do dia, fila por unidade/dia, config da unidade, registro de presença
// e de eventos (auditoria). Reutilizado pelas rotas /api/seller-queue/*.
// =============================================================================

import { prisma } from '../prisma'
import type { Prisma, SellerQueueEventType, SellerPresenceMethod } from '@prisma/client'
import { evaluatePresence, type PresenceConfig, type PresenceInput, type PresenceResult } from './geo'
import { flagFraud } from './fraud'

const STORE_PANEL_EMAILS = new Set(['filadeatendimento@easycarveiculo.com.br'])

export function isQueuePanelFallbackUser(user: { email?: string | null }): boolean {
  return STORE_PANEL_EMAILS.has(String(user.email ?? '').trim().toLowerCase())
}

/** Data (sem hora) de hoje, em UTC — suficiente p/ o campo @db.Date da fila. */
export function queueDate(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * Unidade efetiva da requisição: `?unitId=` (override explícito) → unidade do
 * próprio usuário → cookie `sq_unit` (apenas p/ quem NÃO tem unidade, ex.: MASTER).
 * IMPORTANTE: a unidade própria precede o cookie. As rotas de escrita (check-in,
 * pause, etc.) usam `user.unitId` direto; se a leitura priorizasse o cookie, um
 * cookie `sq_unit` herdado (de uma sessão MASTER no mesmo navegador) faria o
 * vendedor gravar numa unidade e ler de outra — entrava na fila e "sumia".
 */
export function unitFromRequest(req: Request, fallback: string | null | undefined): string | null {
  const q = new URL(req.url).searchParams.get('unitId')
  if (q) return q
  if (fallback) return fallback
  const c = req.headers.get('cookie') ?? ''
  const m = c.match(/(?:^|;\s*)sq_unit=([^;]+)/)
  if (m) return decodeURIComponent(m[1])
  return null
}

/** Unidade segura para leituras do painel/dashboard da fila. */
export async function resolveQueueUnitForRead(
  req: Request,
  user: { unitId?: string | null },
  tenantId: string,
): Promise<{ unitId: string | null; unitName: string | null; error?: string; status?: number }> {
  const requested = unitFromRequest(req, user.unitId)
  if (requested) {
    const unit = await prisma.unit.findFirst({
      where: { id: requested, tenantId },
      select: { id: true, name: true },
    })
    if (!unit) {
      return { unitId: null, unitName: null, error: 'Unidade inválida ou não vinculada à sua empresa.', status: 403 }
    }
    return { unitId: unit.id, unitName: unit.name }
  }

  const units = await prisma.unit.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
    take: 2,
  })

  if (units.length === 1) return { unitId: units[0].id, unitName: units[0].name }
  if (units.length === 0) return { unitId: null, unitName: null, error: 'Nenhuma unidade ativa encontrada para esta empresa.', status: 400 }
  return {
    unitId: null,
    unitName: null,
    error: 'Este usuário de painel não possui unidade configurada. Configure a unidade no cadastro do usuário.',
    status: 400,
  }
}

/** Config da fila da unidade (ou null se não houver). */
export async function getUnitConfig(tenantId: string, unitId: string) {
  return prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } } })
}

/** Converte a config persistida no shape de validação de presença. */
export function toPresenceConfig(cfg: Awaited<ReturnType<typeof getUnitConfig>>): PresenceConfig | null {
  if (!cfg) return null
  return {
    active: cfg.active,
    presenceMethods: cfg.presenceMethods,
    geofenceLat: cfg.geofenceLat,
    geofenceLng: cfg.geofenceLng,
    geofenceRadiusM: cfg.geofenceRadiusM,
    qrSecret: cfg.qrSecret,
  }
}

/** Pega (ou cria) a fila aberta da unidade para hoje. */
export async function getOrCreateQueue(tenantId: string, unitId: string) {
  const date = queueDate()
  const existing = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date } } })
  if (existing) return existing
  try {
    return await prisma.sellerQueue.create({ data: { tenantId, unitId, date, status: 'OPEN' } })
  } catch {
    // corrida: outro request criou — relê
    return prisma.sellerQueue.findUniqueOrThrow({ where: { tenantId_unitId_date: { tenantId, unitId, date } } })
  }
}

/** Próxima posição (fim da fila). */
export async function nextPosition(queueId: string): Promise<number> {
  const agg = await prisma.sellerQueueEntry.aggregate({ where: { queueId }, _max: { position: true } })
  return (agg._max.position ?? 0) + 1
}

/** Registra um evento de auditoria da fila. Best-effort. */
export async function logQueueEvent(data: {
  tenantId: string
  unitId?: string | null
  queueId?: string | null
  type: SellerQueueEventType
  sellerId?: string | null
  actorId?: string | null
  arrivalId?: string | null
  attendanceId?: string | null
  entryId?: string | null
  reason?: string | null
  metadata?: Prisma.InputJsonValue
}): Promise<void> {
  try {
    await prisma.sellerQueueEvent.create({
      data: {
        tenantId: data.tenantId, unitId: data.unitId ?? null, queueId: data.queueId ?? null,
        type: data.type, sellerId: data.sellerId ?? null, actorId: data.actorId ?? null,
        arrivalId: data.arrivalId ?? null, attendanceId: data.attendanceId ?? null, entryId: data.entryId ?? null,
        reason: data.reason ?? null, ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
    })
  } catch { /* auditoria não bloqueia a operação */ }
}

/** Avalia + registra um SellerPresenceCheck. Retorna o resultado da avaliação. */
export async function recordPresence(args: {
  tenantId: string
  unitId: string
  sellerId: string
  context: string // CHECK_IN | CALL | ACCEPT | REVALIDATION | CHECK_OUT | PAUSE | RESUME
  cfg: PresenceConfig | null
  input: PresenceInput
  override?: { byId: string; reason: string; method: 'MANAGER_OVERRIDE' | 'LEADER_OVERRIDE' } | null
}): Promise<PresenceResult> {
  let result: PresenceResult
  if (args.override) {
    result = { ok: true, method: args.override.method }
    // Antifraude: se a presença real (GPS) reprovaria por estar FORA do raio,
    // o override liberou alguém de fora → registra suspeita p/ revisão.
    const real = evaluatePresence(args.cfg, args.input)
    if (real.method === 'GPS' && !real.ok && real.distanceM != null) {
      result.distanceM = real.distanceM
      const radius = args.cfg?.geofenceRadiusM ?? 0
      await flagFraud({
        tenantId: args.tenantId, unitId: args.unitId, sellerId: args.sellerId, actorId: args.override.byId,
        kind: 'CHECK_IN_OUTSIDE', severity: real.distanceM > radius * 2 ? 'HIGH' : 'MEDIUM',
        detail: `Override de presença a ${real.distanceM}m da loja (raio ${radius}m) — contexto ${args.context}.`,
        metadata: { distanceM: real.distanceM, radius, context: args.context },
      })
    }
  } else {
    result = evaluatePresence(args.cfg, args.input)
  }
  await prisma.sellerPresenceCheck.create({
    data: {
      tenantId: args.tenantId, unitId: args.unitId, sellerId: args.sellerId,
      method: result.method as SellerPresenceMethod, context: args.context, success: result.ok,
      latitude: args.input.latitude ?? null, longitude: args.input.longitude ?? null,
      accuracyM: args.input.accuracyM ?? null, distanceM: result.distanceM ?? null,
      deviceId: args.input.deviceId ?? null,
      overrideById: args.override?.byId ?? null, overrideReason: args.override?.reason ?? null,
    },
  }).catch(() => {})
  return result
}

export async function isUserQueueResponsible(user: { id: string; role: string; tenantId: string; unitId?: string | null }): Promise<boolean> {
  const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
  if (MANAGE_ROLES.includes(user.role)) return true
  const unitId = user.unitId
  if (!unitId) return false
  const cfg = await getUnitConfig(user.tenantId, unitId)
  if (!cfg) return false
  const responsibleUserIds = (cfg.config as any)?.responsibleUserIds ?? []
  return responsibleUserIds.includes(user.id)
}
