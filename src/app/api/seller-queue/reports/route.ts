// =============================================================================
// GET /api/seller-queue/reports — relatórios da fila (últimos N dias).
// Gate: sellerQueue.reports. ?days=7 &unitId=. Tenant/unit-scoped.
// Retorna: por vendedor (atendidos/timeouts/recusas + tempo médio de aceite),
// clientes presenciais (total/recorrentes), suspeitas (fraude), penalidades e
// um resumo gerencial do piloto de conformidade da fila.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { unitFromRequest } from '@/lib/seller-queue/queue'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { applyRankingParticipationFilter } from '@/lib/ranking/participation'
import { computeComplianceAdjustments, readCompliancePilotConfig } from '@/lib/seller-queue/compliance'
import { getPrimaryRiskReason, getRecommendedAction } from '@/lib/seller-queue/reporting'

// Cache curto em memória: o ranking de N dias é a consulta mais cara do módulo.
// Com vários da unidade olhando o dashboard, todos batem aqui a cada 30s em fases
// diferentes → sem cache, N recomputações por janela. O cache colapsa em UMA por
// (tenant+unidade+parâmetros) a cada REPORT_TTL_MS. Por-instância (Vercel), mas
// já reduz muito a carga. Janela rolante desloca ≤ TTL — irrelevante p/ 7 dias.
type ReportCacheEntry = { data: unknown; expires: number }
const reportCache = new Map<string, ReportCacheEntry>()
const REPORT_TTL_MS = 25_000

function reportCacheGet(key: string): unknown | null {
  const hit = reportCache.get(key)
  if (hit && hit.expires > Date.now()) return hit.data
  if (hit) reportCache.delete(key)
  return null
}
function reportCacheSet(key: string, data: unknown) {
  if (reportCache.size > 500) { const now = Date.now(); for (const [k, v] of reportCache) if (v.expires <= now) reportCache.delete(k) }
  reportCache.set(key, { data, expires: Date.now() + REPORT_TTL_MS })
}

function formatTrendDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.reports')) return forbiddenResponse('Sem acesso aos relatórios.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.reports'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  const days = Math.min(Math.max(Number(sp.get('days')) || 7, 1), 90)
  // Período custom (from/to ISO) tem prioridade sobre days.
  const fromParam = sp.get('from'), toParam = sp.get('to')
  const since = fromParam ? new Date(fromParam) : new Date(Date.now() - days * 86400000)
  const until = toParam ? new Date(new Date(toParam).getTime() + 86400000 - 1) : null // fim do dia
  const dateRange = until ? { gte: since, lte: until } : { gte: since }
  // Filtro opcional por vendedor.
  const sellerFilter = sp.get('sellerId') || null
  // Quem enxerga a loja inteira pode ver o consolidado por unidade.
  const tenantWide = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO'].includes(user.role)

  const cacheKey = `${tenantId}:${unitId}:${fromParam ?? ''}:${toParam ?? ''}:${days}:${sellerFilter ?? ''}:${tenantWide ? 1 : 0}`
  const cached = reportCacheGet(cacheKey)
  if (cached) return NextResponse.json({ success: true, data: cached, cached: true })

  try {
    const attWhere = { tenantId, unitId, calledAt: dateRange, ...(sellerFilter ? { sellerId: sellerFilter } : {}) }
    const [unitConfig, attendances, arrivals, fraud, complianceCases, penalties, compliancePendencies] = await Promise.all([
      prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } }, select: { config: true } }),
      prisma.sellerQueueAttendance.findMany({ where: attWhere, select: { sellerId: true, status: true, calledAt: true, acceptedAt: true }, take: 5000 }),
      prisma.sellerQueueCustomerArrival.findMany({ where: { tenantId, unitId, createdAt: dateRange }, select: { recurring: true, createdAt: true }, take: 5000 }),
      prisma.sellerQueueFraudFlag.findMany({ where: { tenantId, unitId, status: 'OPEN', createdAt: dateRange }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.sellerQueueFraudFlag.findMany({
        where: { tenantId, unitId, createdAt: dateRange },
        select: { id: true, sellerId: true, status: true, severity: true, reviewedAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.sellerQueuePenalty.findMany({ where: { tenantId, unitId, active: true, createdAt: dateRange }, take: 500 }),
      prisma.pendency.findMany({
        where: {
          tenantId,
          unitId,
          originModule: 'SELLER_QUEUE_COMPLIANCE',
          createdAt: dateRange,
        },
        select: { id: true, status: true, severity: true, originRecordId: true, createdAt: true },
        take: 500,
      }),
    ])
    const compliancePilot = readCompliancePilotConfig(unitConfig?.config)
    const dailyTrendMap = new Map<string, { label: string; cases: number; confirmed: number; dismissed: number }>()
    const rangeEnd = until ?? new Date()
    const cursor = new Date(since)
    cursor.setHours(0, 0, 0, 0)
    const endDay = new Date(rangeEnd)
    endDay.setHours(0, 0, 0, 0)
    while (cursor <= endDay) {
      const key = formatTrendDay(cursor)
      dailyTrendMap.set(key, {
        label: cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        cases: 0,
        confirmed: 0,
        dismissed: 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    for (const complianceCase of complianceCases) {
      const dayKey = formatTrendDay(complianceCase.createdAt)
      const bucket = dailyTrendMap.get(dayKey)
      if (!bucket) continue
      bucket.cases += 1
      if (complianceCase.status === 'CONFIRMED') bucket.confirmed += 1
      if (complianceCase.status === 'DISMISSED') bucket.dismissed += 1
    }
    const complianceTrend = [...dailyTrendMap.values()]
    const complianceSellerMap = new Map<string, { sellerId: string; cases: number; confirmed: number; highSeverity: number }>()
    for (const complianceCase of complianceCases) {
      if (!complianceCase.sellerId) continue
      const current = complianceSellerMap.get(complianceCase.sellerId) ?? {
        sellerId: complianceCase.sellerId,
        cases: 0,
        confirmed: 0,
        highSeverity: 0,
      }
      current.cases += 1
      if (complianceCase.status === 'CONFIRMED') current.confirmed += 1
      if (complianceCase.severity === 'HIGH') current.highSeverity += 1
      complianceSellerMap.set(complianceCase.sellerId, current)
    }

    // Agrega por vendedor.
    type Agg = { finished: number; timeouts: number; rejected: number; called: number; acceptMs: number; acceptN: number }
    const by = new Map<string, Agg>()
    const g = (id: string) => { let a = by.get(id); if (!a) { a = { finished: 0, timeouts: 0, rejected: 0, called: 0, acceptMs: 0, acceptN: 0 }; by.set(id, a) } return a }
    for (const a of attendances) {
      const x = g(a.sellerId); x.called++
      if (a.status === 'FINISHED') x.finished++
      else if (a.status === 'EXPIRED') x.timeouts++
      else if (a.status === 'REJECTED') x.rejected++
      if (a.acceptedAt) { x.acceptMs += a.acceptedAt.getTime() - a.calledAt.getTime(); x.acceptN++ }
    }
    const sellerIds = [...by.keys()]
    const names = new Map<string, string>()
    if (sellerIds.length) {
      const us = await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } })
      us.forEach((u) => names.set(u.id, u.name))
    }
    const complianceSellerIds = [...complianceSellerMap.keys()].filter((id) => !names.has(id))
    if (complianceSellerIds.length) {
      const complianceUsers = await prisma.user.findMany({ where: { id: { in: complianceSellerIds } }, select: { id: true, name: true } })
      complianceUsers.forEach((u) => names.set(u.id, u.name))
    }
    const complianceAdjustments = await computeComplianceAdjustments({
      tenantId,
      unitId,
      window: { start: since, end: until ?? new Date() },
    })
    const bySellerRaw = sellerIds.map((id) => {
      const a = by.get(id)!
      const compliance = complianceAdjustments.get(id)
      return {
        sellerId: id,
        sellerName: names.get(id) ?? id,
        finished: a.finished,
        timeouts: a.timeouts,
        rejected: a.rejected,
        called: a.called,
        avgAcceptSeconds: a.acceptN ? Math.round(a.acceptMs / a.acceptN / 1000) : null,
        compliancePoints: compliance?.points ?? 0,
        complianceTimeouts: compliance?.timeoutEvents ?? 0,
        complianceConfirmedFrauds: compliance?.confirmedFrauds ?? 0,
        compliancePendingFrauds: compliance?.pendingFrauds ?? 0,
      }
    })
    const bySeller = (await applyRankingParticipationFilter(bySellerRaw, {
      tenantId,
      unitId,
      rankingType: 'ATTENDANCE',
    })).sort((x, y) => y.finished - x.finished)
    const complianceRiskBySeller = [...complianceSellerMap.values()]
      .map((entry) => {
        const ranking = bySeller.find((seller) => seller.sellerId === entry.sellerId)
        const compliancePoints = ranking?.compliancePoints ?? 0
        const riskScore = (entry.cases * 2) + (entry.confirmed * 3) + (entry.highSeverity * 4) + Math.min(compliancePoints, 30)
        const primaryReason = getPrimaryRiskReason({
          highSeverity: entry.highSeverity,
          confirmed: entry.confirmed,
          cases: entry.cases,
          compliancePoints,
        })
        const recommendedAction = getRecommendedAction(primaryReason)
        return {
          sellerId: entry.sellerId,
          sellerName: names.get(entry.sellerId) ?? entry.sellerId,
          cases: entry.cases,
          confirmed: entry.confirmed,
          highSeverity: entry.highSeverity,
          compliancePoints,
          riskScore,
          primaryReason,
          recommendedAction,
        }
      })
      .sort((a, b) => b.riskScore - a.riskScore || b.confirmed - a.confirmed || b.cases - a.cases)
      .slice(0, 5)

    // Consolidado por unidade (loja inteira) — só para quem enxerga o tenant.
    let byUnit: { unitId: string; unitName: string; called: number; finished: number; timeouts: number }[] = []
    if (tenantWide) {
      const all = await prisma.sellerQueueAttendance.findMany({ where: { tenantId, calledAt: dateRange, ...(sellerFilter ? { sellerId: sellerFilter } : {}) }, select: { unitId: true, status: true }, take: 20000 })
      const um = new Map<string, { called: number; finished: number; timeouts: number }>()
      for (const a of all) {
        let u = um.get(a.unitId); if (!u) { u = { called: 0, finished: 0, timeouts: 0 }; um.set(a.unitId, u) }
        u.called++
        if (a.status === 'FINISHED') u.finished++
        else if (a.status === 'EXPIRED') u.timeouts++
      }
      const unitIds = [...um.keys()]
      const unitNames = new Map<string, string>()
      if (unitIds.length) {
        const us = await prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } })
        us.forEach((u) => unitNames.set(u.id, u.name))
      }
      byUnit = unitIds.map((id) => ({ unitId: id, unitName: unitNames.get(id) ?? id, ...um.get(id)! })).sort((x, y) => y.finished - x.finished)
    }

    const data = {
      days,
      tenantWide,
      compliancePilot: {
        enabled: compliancePilot.enabled,
        notifyManagers: compliancePilot.notifyManagers,
        autoCreateManagerPendency: compliancePilot.autoCreateManagerPendency,
        requireConfirmedFraudForRanking: compliancePilot.requireConfirmedFraudForRanking,
      },
      complianceSummary: {
        openFraudFlags: fraud.length,
        highSeverityFlags: fraud.filter((f) => f.severity === 'HIGH').length,
        mediumSeverityFlags: fraud.filter((f) => f.severity === 'MEDIUM').length,
        casesByStatus: {
          open: complianceCases.filter((f) => f.status === 'OPEN').length,
          confirmed: complianceCases.filter((f) => f.status === 'CONFIRMED').length,
          dismissed: complianceCases.filter((f) => f.status === 'DISMISSED').length,
        },
        casesBySeverity: {
          high: complianceCases.filter((f) => f.severity === 'HIGH').length,
          medium: complianceCases.filter((f) => f.severity === 'MEDIUM').length,
          low: complianceCases.filter((f) => f.severity === 'LOW').length,
        },
        reviewedCases: complianceCases.filter((f) => f.reviewedAt != null).length,
        openCompliancePendencies: compliancePendencies.filter((p) => !['FINALIZADA', 'CANCELADA'].includes(p.status)).length,
        resolvedCompliancePendencies: compliancePendencies.filter((p) => ['FINALIZADA', 'CANCELADA'].includes(p.status)).length,
        totalCases: complianceCases.length,
        latestPendencyAt: compliancePendencies.map((p) => p.createdAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
        trend: complianceTrend,
        topSellers: [...complianceSellerMap.values()]
          .map((entry) => ({
            sellerId: entry.sellerId,
            sellerName: names.get(entry.sellerId) ?? entry.sellerId,
            cases: entry.cases,
            confirmed: entry.confirmed,
            highSeverity: entry.highSeverity,
          }))
          .sort((a, b) => b.cases - a.cases || b.confirmed - a.confirmed)
          .slice(0, 5),
        riskBySeller: complianceRiskBySeller,
      },
      byUnit,
      totals: {
        arrivals: arrivals.length,
        recurring: arrivals.filter((a) => a.recurring).length,
        attendances: attendances.length,
        finished: attendances.filter((a) => a.status === 'FINISHED').length,
        timeouts: attendances.filter((a) => a.status === 'EXPIRED').length,
      },
      bySeller,
      fraudFlags: fraud,
      penalties,
    }
    reportCacheSet(cacheKey, data)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
