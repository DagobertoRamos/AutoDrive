// =============================================================================
// ranking/service.ts — Ranking comercial + qualidade de venda (AutoDrive)
//
// Mede DESEMPENHO, não só quantidade: soma pontos por evento concluído (pesos
// configuráveis por tenant via RankingRule) e penaliza pendências/cancelamentos.
// Reaproveita os agregadores de Metas para as métricas positivas. Cálculo 100%
// no service layer; isolamento por tenant/unidade sempre aplicado.
// =============================================================================

import type { GoalPeriod, UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { MANAGEMENT_ROLES } from '@/lib/auth-guards'
import { aggregateAchieved, type AggregationWindow } from '@/lib/goals/aggregators'

// ── Defaults (espelham a especificação) ───────────────────────────────────────

export const DEFAULT_RULE = {
  weightSale:            100,
  weightPurchase:        40,
  weightReturn:          25,
  weightDocumentation:   20,
  weightWarranty:        30,
  weightService:         20,
  weightOverduePendency: -15,
  weightCanceledSale:    -50,
  weightLateDocument:    -10,
}

/** Ordem de critérios de desempate (chaves de RankingMetrics). */
export const DEFAULT_TIEBREAKERS = [
  'sales',
  'documentations',
  'warranties',
  'services',
  'overduePendencies', // menos é melhor
  'returns',
  'qualityScore',
] as const

type RuleWeights = {
  weightSale:            number
  weightPurchase:        number
  weightReturn:          number
  weightDocumentation:   number
  weightWarranty:        number
  weightService:         number
  weightOverduePendency: number
  weightCanceledSale:    number
  weightLateDocument:    number
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface RankingMetrics {
  sales:             number
  purchases:         number
  returns:           number
  documentations:    number
  warranties:        number
  services:          number
  overduePendencies: number
  canceledSales:     number
  lateDocuments:     number
}

export interface RankingEntry {
  userId:       string
  sellerId:     string
  name:         string
  unitId:       string | null
  metrics:      RankingMetrics
  totalPoints:  number
  qualityScore: number
  rank:         number
  notes:        string[]
}

// ── RBAC ────────────────────────────────────────────────────────────────────

export function canManageRanking(role: UserRole): boolean {
  return MANAGEMENT_ROLES.includes(role)
}

// ── Janela de período ─────────────────────────────────────────────────────────

/** Deriva a janela [start,end] de um período (ou usa datas explícitas). */
export function resolvePeriodWindow(
  period: GoalPeriod,
  now: Date,
  explicitStart?: Date,
  explicitEnd?: Date,
): AggregationWindow {
  if (explicitStart && explicitEnd) return { start: explicitStart, end: explicitEnd }

  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const endOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 23, 59, 59, 999)

  switch (period) {
    case 'DAILY':
      return { start: new Date(y, m, d), end: endOfDay(now) }
    case 'WEEKLY': {
      const day = now.getDay() // 0=domingo
      const start = new Date(y, m, d - day)
      return { start, end: endOfDay(new Date(y, m, d - day + 6)) }
    }
    case 'QUARTERLY': {
      const q = Math.floor(m / 3)
      return { start: new Date(y, q * 3, 1), end: endOfDay(new Date(y, q * 3 + 3, 0)) }
    }
    case 'YEARLY':
      return { start: new Date(y, 0, 1), end: endOfDay(new Date(y, 11, 31)) }
    case 'MONTHLY':
    case 'CUSTOM':
    default:
      return { start: new Date(y, m, 1), end: endOfDay(new Date(y, m + 1, 0)) }
  }
}

// ── Métricas negativas ──────────────────────────────────────────────────────────

async function negativeMetrics(
  tenantId: string,
  unitId: string | null,
  sellerId: string,
  w: AggregationWindow,
): Promise<{ canceledSales: number; overduePendencies: number; lateDocuments: number; notes: string[] }> {
  const notes: string[] = []

  const canceledSales = await prisma.deal.count({
    where: {
      tenantId,
      ...(unitId ? { unitId } : {}),
      sellerId,
      type:        { in: ['VENDA', 'TROCA'] },
      status:      'CANCELADA',
      cancelledAt: { gte: w.start, lte: w.end },
    },
  })

  const overduePendencies = await prisma.pendency.count({
    where: {
      tenantId,
      responsibleId: sellerId,
      status:        'VENCIDA',
      OR: [
        { dueDate: { gte: w.start, lte: w.end } },
        { dueDate: null, updatedAt: { gte: w.start, lte: w.end } },
      ],
    },
  })

  // "Documento atrasado" ainda não tem prazo modelado — provisório.
  const lateDocuments = 0
  notes.push('lateDocuments provisório (0): falta modelar prazo de documento.')

  return { canceledSales, overduePendencies, lateDocuments, notes }
}

// ── Cálculo por vendedor ───────────────────────────────────────────────────────

async function computeSellerMetrics(
  tenantId: string,
  unitId: string | null,
  sellerId: string,
  w: AggregationWindow,
): Promise<{ metrics: RankingMetrics; notes: string[] }> {
  const scope = { tenantId, unitId, sellerId }
  const notes: string[] = []

  const [sales, purchases, returns, documentations, warranties, services] = await Promise.all([
    aggregateAchieved('SALES_EXCHANGE', scope, w),
    aggregateAchieved('PURCHASE', scope, w),
    aggregateAchieved('RETURN', scope, w),
    aggregateAchieved('DOCUMENTATION', scope, w),
    aggregateAchieved('EXTENDED_WARRANTY', scope, w),
    aggregateAchieved('SERVICE', scope, w),
  ])
  for (const r of [returns, warranties]) if (r.note) notes.push(r.note)

  const neg = await negativeMetrics(tenantId, unitId, sellerId, w)
  notes.push(...neg.notes)

  return {
    metrics: {
      sales:             sales.value,
      purchases:         purchases.value,
      returns:           returns.value,
      documentations:    documentations.value,
      warranties:        warranties.value,
      services:          services.value,
      overduePendencies: neg.overduePendencies,
      canceledSales:     neg.canceledSales,
      lateDocuments:     neg.lateDocuments,
    },
    notes,
  }
}

export function pointsFor(m: RankingMetrics, weights: RuleWeights): number {
  return (
    m.sales * weights.weightSale +
    m.purchases * weights.weightPurchase +
    m.returns * weights.weightReturn +
    m.documentations * weights.weightDocumentation +
    m.warranties * weights.weightWarranty +
    m.services * weights.weightService +
    m.overduePendencies * weights.weightOverduePendency +
    m.canceledSales * weights.weightCanceledSale +
    m.lateDocuments * weights.weightLateDocument
  )
}

/** Índice de qualidade da venda: aproveitamento agregado por venda. */
export function qualityFor(m: RankingMetrics): number {
  if (m.sales <= 0) return 0
  const complementary = m.documentations + m.warranties + m.services + m.returns
  return Math.round((complementary / m.sales) * 10000) / 100
}

// ── Ordenação com desempate ─────────────────────────────────────────────────────

function metricValue(e: RankingEntry, key: string): number {
  if (key === 'qualityScore') return e.qualityScore
  return (e.metrics as unknown as Record<string, number>)[key] ?? 0
}

export function sortRanking(entries: RankingEntry[], tiebreakers: string[]): RankingEntry[] {
  return [...entries].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    for (const key of tiebreakers) {
      const av = metricValue(a, key)
      const bv = metricValue(b, key)
      if (av === bv) continue
      // overduePendencies: menos é melhor (ascendente); demais: mais é melhor.
      return key === 'overduePendencies' ? av - bv : bv - av
    }
    return 0
  })
}

// ── Regra do tenant ───────────────────────────────────────────────────────────

/** Carrega a regra ativa do tenant ou retorna os defaults da plataforma. */
export async function getRankingRule(tenantId: string | null): Promise<RuleWeights & { tiebreakers: string[] }> {
  const rule = tenantId
    ? await prisma.rankingRule.findFirst({ where: { tenantId, active: true }, orderBy: { createdAt: 'desc' } })
    : null

  const weights: RuleWeights = rule ?? DEFAULT_RULE
  const tiebreakers =
    rule && Array.isArray(rule.tiebreakers) ? (rule.tiebreakers as string[]) : [...DEFAULT_TIEBREAKERS]

  return { ...weights, tiebreakers }
}

// ── Ranking principal ───────────────────────────────────────────────────────────

export interface RankingResult {
  period:  GoalPeriod
  window:  { start: Date; end: Date }
  scope:   'GENERAL' | 'UNIT'
  unitId:  string | null
  entries: RankingEntry[]
  notes:   string[]
}

/**
 * Calcula o ranking de um tenant (geral ou de uma unidade) num período.
 * Não persiste — use persistRanking para gravar o cache.
 */
export async function computeRanking(opts: {
  tenantId: string
  unitId?:  string | null
  period:   GoalPeriod
  now:      Date
  start?:   Date
  end?:     Date
}): Promise<RankingResult> {
  const { tenantId, unitId = null, period, now } = opts
  const window = resolvePeriodWindow(period, now, opts.start, opts.end)
  const rule = await getRankingRule(tenantId)

  const sellers = await prisma.seller.findMany({
    where: { active: true, unit: { tenantId }, ...(unitId ? { unitId } : {}) },
    select: { id: true, userId: true, fullName: true, shortName: true, unitId: true },
  })

  const allNotes = new Set<string>()
  const rawEntries: RankingEntry[] = []

  for (const s of sellers) {
    const { metrics, notes } = await computeSellerMetrics(tenantId, unitId, s.id, window)
    notes.forEach((n) => allNotes.add(n))
    rawEntries.push({
      userId:       s.userId,
      sellerId:     s.id,
      name:         s.shortName || s.fullName,
      unitId:       s.unitId,
      metrics,
      totalPoints:  pointsFor(metrics, rule),
      qualityScore: qualityFor(metrics),
      rank:         0,
      notes:        [],
    })
  }

  const sorted = sortRanking(rawEntries, rule.tiebreakers)
  sorted.forEach((e, i) => (e.rank = i + 1))

  return {
    period,
    window,
    scope:   unitId ? 'UNIT' : 'GENERAL',
    unitId,
    entries: sorted,
    notes:   [...allNotes],
  }
}

/** Persiste o ranking calculado como cache (RankingScore por vendedor/período). */
export async function persistRanking(result: RankingResult, tenantId: string): Promise<number> {
  const rule = await prisma.rankingRule.findFirst({ where: { tenantId, active: true }, select: { id: true } })

  for (const e of result.entries) {
    await prisma.rankingScore.upsert({
      where: {
        tenantId_userId_periodStart_periodEnd: {
          tenantId,
          userId:      e.userId,
          periodStart: result.window.start,
          periodEnd:   result.window.end,
        },
      },
      create: {
        ruleId:            rule?.id ?? null,
        tenantId,
        unitId:            e.unitId,
        userId:            e.userId,
        period:            result.period,
        periodStart:       result.window.start,
        periodEnd:         result.window.end,
        sales:             e.metrics.sales,
        purchases:         e.metrics.purchases,
        returns:           e.metrics.returns,
        documentations:    e.metrics.documentations,
        warranties:        e.metrics.warranties,
        services:          e.metrics.services,
        overduePendencies: e.metrics.overduePendencies,
        canceledSales:     e.metrics.canceledSales,
        lateDocuments:     e.metrics.lateDocuments,
        totalPoints:       e.totalPoints,
        qualityScore:      e.qualityScore,
        rankGeneral:       result.scope === 'GENERAL' ? e.rank : null,
        rankUnit:          result.scope === 'UNIT' ? e.rank : null,
      },
      update: {
        ruleId:            rule?.id ?? null,
        unitId:            e.unitId,
        period:            result.period,
        sales:             e.metrics.sales,
        purchases:         e.metrics.purchases,
        returns:           e.metrics.returns,
        documentations:    e.metrics.documentations,
        warranties:        e.metrics.warranties,
        services:          e.metrics.services,
        overduePendencies: e.metrics.overduePendencies,
        canceledSales:     e.metrics.canceledSales,
        lateDocuments:     e.metrics.lateDocuments,
        totalPoints:       e.totalPoints,
        qualityScore:      e.qualityScore,
        ...(result.scope === 'GENERAL' ? { rankGeneral: e.rank } : { rankUnit: e.rank }),
      },
    })
  }
  return result.entries.length
}
