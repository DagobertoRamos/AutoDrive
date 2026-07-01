// =============================================================================
// integrations/autoconf.ts — importa negociações do AutoConf → Deal no AutoDrive.
// Autenticação por TOKEN de integração por tenant (SystemSetting). De-para de
// loja (AutoConf → unidade) e resolução de vendedor por nome dentro da unidade.
// A comissão em si é gerada pelo motor existente (respeita a chave da unidade).
// =============================================================================

import { prisma } from '@/lib/prisma'

// ── Normalização de texto (case/acentos/pontuação-insensível) ────────────────
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ── Token de integração (por tenant) ─────────────────────────────────────────
const TOKEN_KEY = (tenantId: string) => `t:${tenantId}:autoconf_token`

export async function resolveTenantByToken(token: string): Promise<string | null> {
  if (!token || token.length < 10) return null
  const row = await prisma.systemSetting.findFirst({
    where: { key: { endsWith: ':autoconf_token' }, value: token },
    select: { key: true },
  }).catch(() => null)
  if (!row) return null
  const m = row.key.match(/^t:(.+):autoconf_token$/)
  return m ? m[1] : null
}

export async function getToken(tenantId: string): Promise<string | null> {
  const row = await prisma.systemSetting.findFirst({ where: { key: TOKEN_KEY(tenantId) }, select: { value: true } }).catch(() => null)
  return row?.value ?? null
}

export async function setToken(tenantId: string, token: string): Promise<void> {
  const key = TOKEN_KEY(tenantId)
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value: token } })
  else await prisma.systemSetting.create({ data: { key, value: token, group: 'integrations' } })
}

// ── De-para de loja (AutoConf label → unitId) ────────────────────────────────
const UNITMAP_KEY = (tenantId: string) => `t:${tenantId}:autoconf_unit_map`

export async function getUnitMap(tenantId: string): Promise<Record<string, string>> {
  const row = await prisma.systemSetting.findFirst({ where: { key: UNITMAP_KEY(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row?.value) return {}
  try { const j = JSON.parse(row.value); return (j && typeof j === 'object') ? j : {} } catch { return {} }
}

export async function setUnitMap(tenantId: string, map: Record<string, string>): Promise<void> {
  const key = UNITMAP_KEY(tenantId)
  const value = JSON.stringify(map)
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key, value, group: 'integrations' } })
}

/** Resolve a unidade: 1) de-para explícito (por chave normalizada); 2) nome da
 *  unidade que contenha/coincida com a loja. Retorna null se não achar. */
export async function resolveUnitId(tenantId: string, loja: string | null | undefined): Promise<string | null> {
  const key = norm(loja)
  if (!key) return null
  const map = await getUnitMap(tenantId)
  // de-para guarda chaves normalizadas
  for (const [k, unitId] of Object.entries(map)) {
    if (norm(k) === key) return unitId
  }
  const units = await prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true } })
  const exact = units.find((u) => norm(u.name) === key)
  if (exact) return exact.id
  // "easycar - loja 01" ↔ "easycar veiculos loja 1": casa por palavras-chave
  const kw = key.replace(/easycar|veiculos|loja/g, '').trim() // sobra "matriz"/"01"/"1"/"galpao"
  if (kw) {
    const byKw = units.find((u) => norm(u.name).includes(kw) || (kw === '01' && norm(u.name).includes(' 1')) || (kw === '1' && norm(u.name).includes(' 1')))
    if (byKw) return byKw.id
  }
  return null
}

/** Resolve o vendedor por nome DENTRO da unidade (normalizado). Tenta igualdade,
 *  depois "todas as palavras do nome batem". Retorna null se ambíguo/ausente. */
export async function resolveSellerId(unitId: string, name: string | null | undefined): Promise<string | null> {
  const n = norm(name)
  if (!n) return null
  const sellers = await prisma.seller.findMany({ where: { unitId, active: true }, select: { id: true, fullName: true } })
  const exact = sellers.find((s) => norm(s.fullName) === n)
  if (exact) return exact.id
  const words = n.split(' ').filter((w) => w.length >= 3)
  const matches = sellers.filter((s) => { const sn = norm(s.fullName); return words.every((w) => sn.includes(w)) })
  return matches.length === 1 ? matches[0].id : null
}

// ── Mapas de tipo/status AutoConf → AutoDrive ────────────────────────────────
const TYPE_MAP: Record<string, string> = { venda: 'VENDA', compra: 'COMPRA', troca: 'TROCA', consignacao: 'CONSIGNACAO' }
const STATUS_MAP: Record<string, string> = {
  finalizada: 'FINALIZADA',
  'pendente contrato': 'AGUARDANDO_CONTRATO',
  'pendente nfe': 'AGUARDANDO_DOCUMENTACAO',
  cancelada: 'CANCELADA',
  'aguardando aprovacao': 'AGUARDANDO_APROVACAO',
}
export function mapType(tipo: string | null | undefined): string { return TYPE_MAP[norm(tipo)] ?? 'VENDA' }
export function mapStatus(status: string | null | undefined): string { return STATUS_MAP[norm(status)] ?? 'EM_ANDAMENTO' }

// ── Tipos das linhas vindas da extensão ──────────────────────────────────────
export interface AutoconfVehicle { modelo?: string | null; placa?: string | null; valor?: number | null }
export interface AutoconfRow {
  externalId: number | string
  tipo: string
  status: string
  criadoEm?: string | null
  vendedor?: string | null
  loja?: string | null
  cliente?: string | null
  clienteEmail?: string | null
  clienteContato?: string | null
  veiculosSaida?: AutoconfVehicle[]
  veiculosEntrada?: AutoconfVehicle[]
  saleAmount?: number | null
  purchaseAmount?: number | null
}

export interface ProcessRowResult {
  externalId: string
  action: 'created' | 'updated' | 'skipped'
  reason?: string
  unit?: string | null
  seller?: string | null
  dealNumber?: string
}
