// =============================================================================
// Quality System — Computação do score e restrições de acesso.
// Score = soma de pontos de QualityEvents ativos no período configurado.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { readQualityConfig, DEFAULT_QUALITY_CONFIG, QualityThresholds } from './config'
import { QUALITY_CATEGORIES, QUALITY_EVENT_TYPE_LABELS, QualityCategory } from './types'

export interface QualityBreakdown {
  category:   QualityCategory
  label:      string
  points:     number
  eventCount: number
}

export interface QualityScore {
  total:        number
  breakdown:    QualityBreakdown[]
  restrictions: QualityRestriction[]
  periodDays:   number
  enabled:      boolean
}

export interface QualityRestriction {
  action:  'POPUP' | 'WARN' | 'BLOCK_PENDENCY' | 'BLOCK_LEADS' | 'BLOCK_SALES' | 'BLOCK_QUEUE'
  label:   string
  message: string
}

export interface QualityAccessResult {
  allowed:    boolean
  restriction: QualityRestriction | null
  score:      number
}

function resolveRestrictions(total: number, t: QualityThresholds): QualityRestriction[] {
  const out: QualityRestriction[] = []
  if (total <= t.blockQueueAt)         out.push({ action: 'BLOCK_QUEUE',    label: 'Bloqueado da fila',           message: `Score ${total}. Você está temporariamente fora da fila de atendimento.` })
  if (total <= t.blockNewSalesAt)      out.push({ action: 'BLOCK_SALES',    label: 'Negociações bloqueadas',      message: `Score ${total}. Você não pode criar novas negociações até melhorar seu score.` })
  if (total <= t.blockLeadsAt)         out.push({ action: 'BLOCK_LEADS',    label: 'Leads bloqueados',            message: `Score ${total}. Você não pode acessar a central de leads.` })
  if (total <= t.blockPendencyCreateAt) out.push({ action: 'BLOCK_PENDENCY', label: 'Criação de pendências bloq.', message: `Score ${total}. Resolva as pendências em aberto antes de criar novas.` })
  if (total <= t.warnAt)               out.push({ action: 'WARN',           label: 'Score baixo',                 message: `Seu score de qualidade está em ${total}. Resolva as pendências e atualize os leads.` })
  if (total <= t.popupAt)              out.push({ action: 'POPUP',          label: 'Aviso de qualidade',          message: `Score de qualidade: ${total}. Atenção necessária.` })
  return out
}

export async function computeQualityScore(sellerId: string, tenantId: string, unitCfgJson?: unknown): Promise<QualityScore> {
  const cfg = readQualityConfig(unitCfgJson ?? null)
  if (!cfg.enabled) return { total: 0, breakdown: [], restrictions: [], periodDays: cfg.scorePeriodDays, enabled: false }

  const since = new Date(Date.now() - cfg.scorePeriodDays * 86400000)
  const events = await prisma.qualityEvent.findMany({
    where: { tenantId, sellerId, active: true, appliedAt: { gte: since } },
    select: { category: true, type: true, points: true },
  }).catch(() => [])

  const byCategory = new Map<QualityCategory, { points: number; count: number }>()
  let total = 0
  for (const e of events) {
    total += e.points
    const key = e.category as QualityCategory
    const cur = byCategory.get(key) ?? { points: 0, count: 0 }
    byCategory.set(key, { points: cur.points + e.points, count: cur.count + 1 })
  }

  const breakdown: QualityBreakdown[] = Array.from(byCategory.entries()).map(([cat, v]) => ({
    category: cat,
    label: QUALITY_CATEGORIES[cat] ?? cat,
    points: v.points,
    eventCount: v.count,
  })).sort((a, b) => a.points - b.points)

  return { total, breakdown, restrictions: resolveRestrictions(total, cfg.thresholds), periodDays: cfg.scorePeriodDays, enabled: true }
}

export async function getQualityAccess(sellerId: string, tenantId: string, action: QualityRestriction['action'], unitCfgJson?: unknown): Promise<QualityAccessResult> {
  const score = await computeQualityScore(sellerId, tenantId, unitCfgJson)
  const restriction = score.restrictions.find(r => r.action === action) ?? null
  return { allowed: !restriction, restriction, score: score.total }
}

/** Carrega config da unidade do vendedor para uso nos guards. */
export async function loadUnitCfgForSeller(tenantId: string, unitId: string | null): Promise<unknown> {
  if (!unitId) return null
  const cfg = await prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } }, select: { config: true } }).catch(() => null)
  return cfg?.config ?? null
}

/** Verifica pendências em aberto vs. limite e retorna restrição se exceder. */
export async function checkUnresolvedPendenciesLimit(sellerId: string, tenantId: string, unitCfgJson?: unknown): Promise<{ exceeded: boolean; count: number; max: number }> {
  const cfg = readQualityConfig(unitCfgJson ?? null)
  const max = cfg.thresholds.maxUnresolvedPendencies
  const seller = await prisma.seller.findFirst({ where: { userId: sellerId }, select: { id: true } }).catch(() => null)
  if (!seller) return { exceeded: false, count: 0, max }
  const count = await prisma.pendency.count({
    where: { tenantId, responsibleId: seller.id, status: { in: ['ABERTA','EM_ANDAMENTO','AGUARDANDO_RESPOSTA','PAUSADA','REATIVADA'] } },
  }).catch(() => 0)
  return { exceeded: cfg.enabled && count >= max, count, max }
}

/** Score resumido para pop-up (leve — sem breakdown). */
export async function getPopupScore(sellerId: string, tenantId: string, unitCfgJson?: unknown): Promise<{ total: number; popup: boolean; warn: boolean; enabled: boolean; restrictions: QualityRestriction[] }> {
  const cfg = readQualityConfig(unitCfgJson ?? null)
  if (!cfg.enabled) return { total: 0, popup: false, warn: false, enabled: false, restrictions: [] }
  const since = new Date(Date.now() - cfg.scorePeriodDays * 86400000)
  const agg = await prisma.qualityEvent.aggregate({ where: { tenantId, sellerId, active: true, appliedAt: { gte: since } }, _sum: { points: true } }).catch(() => null)
  const total = agg?._sum?.points ?? 0
  const restrictions = resolveRestrictions(total, cfg.thresholds)
  return { total, popup: total <= cfg.thresholds.popupAt, warn: total <= cfg.thresholds.warnAt, enabled: true, restrictions }
}

/** Overview de todos os vendedores para gestão. */
export async function getQualityOverview(tenantId: string, unitId: string | null, cfg: ReturnType<typeof readQualityConfig>) {
  if (!cfg.enabled) return []
  const since = new Date(Date.now() - cfg.scorePeriodDays * 86400000)
  const unitWhere = unitId ? { unitId } : {}

  const events = await prisma.qualityEvent.groupBy({
    by: ['sellerId'],
    where: { tenantId, active: true, appliedAt: { gte: since }, ...unitWhere },
    _sum: { points: true },
    _count: { _all: true },
  }).catch(() => [])

  const sellerIds = events.map(e => e.sellerId)
  const users = sellerIds.length ? await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true, unitId: true } }).catch(() => []) : []
  const nameOf = new Map(users.map(u => [u.id, u.name]))

  return events.map(e => ({
    sellerId: e.sellerId,
    sellerName: nameOf.get(e.sellerId) ?? e.sellerId,
    total: e._sum.points ?? 0,
    eventCount: e._count._all,
    restrictions: resolveRestrictions(e._sum.points ?? 0, cfg.thresholds),
  })).sort((a, b) => a.total - b.total) // pior score primeiro
}
