// =============================================================================
// GET /api/seller-queue/compliance/overview — Visão geral da Central de
// Conformidade: ocorrências pendentes, penalidades, restrições, recursos.
// Gate: sellerQueue.reports. Tenant+unit-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModule } from '@/lib/permissions'
import { unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'
import { readCompliancePilotConfig } from '@/lib/seller-queue/compliance'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.reports')) return forbiddenResponse('Sem acesso.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ? new Date(sp.get('from')!) : new Date(Date.now() - 30 * 86400000)
  const to   = sp.get('to')   ? new Date(sp.get('to')!)   : new Date()

  try {
    const unitCfg = await getUnitConfig(tenantId, unitId ?? '')
    const complianceCfg = readCompliancePilotConfig(unitCfg?.config)

    const baseWhere = { tenantId, ...(unitId ? { unitId } : {}) }
    const [
      pendingFlags,
      confirmedFlags,
      dismissedFlags,
      activePenalties,
      expiredPenalties,
      totalPoints,
    ] = await Promise.all([
      prisma.sellerQueueFraudFlag.count({ where: { ...baseWhere, status: { in: ['OPEN','REVIEWED'] }, createdAt: { gte: from, lte: to } } }),
      prisma.sellerQueueFraudFlag.count({ where: { ...baseWhere, status: 'CONFIRMED', createdAt: { gte: from, lte: to } } }),
      prisma.sellerQueueFraudFlag.count({ where: { ...baseWhere, status: 'DISMISSED', createdAt: { gte: from, lte: to } } }),
      prisma.sellerQueuePenalty.count({ where: { ...baseWhere, active: true } }),
      prisma.sellerQueuePenalty.count({ where: { ...baseWhere, active: false, createdAt: { gte: from, lte: to } } }),
      prisma.sellerQueuePenalty.aggregate({ where: { ...baseWhere, active: true }, _sum: { points: true } }),
    ])

    // Restrições ativas: penalidades com endsAt no futuro.
    const now = new Date()
    const restrictions = await prisma.sellerQueuePenalty.findMany({
      where: { ...baseWhere, active: true, endsAt: { gte: now } },
      select: { id: true, sellerId: true, points: true, reason: true, type: true, startsAt: true, endsAt: true },
      orderBy: { endsAt: 'asc' },
      take: 20,
    })
    const sellerIds = [...new Set(restrictions.map(r => r.sellerId))]
    const sellers = sellerIds.length ? await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } }).catch(() => []) : []
    const nameMap = new Map(sellers.map(s => [s.id, s.name]))

    return NextResponse.json({
      success: true,
      data: {
        period: { from, to },
        complianceEnabled: complianceCfg.enabled,
        occurrences: { pending: pendingFlags, confirmed: confirmedFlags, dismissed: dismissedFlags, total: pendingFlags + confirmedFlags + dismissedFlags },
        penalties: { active: activePenalties, expired: expiredPenalties, totalActivePoints: totalPoints._sum.points ?? 0 },
        restrictions: restrictions.map(r => ({ ...r, sellerName: nameMap.get(r.sellerId) ?? r.sellerId })),
      },
    })
  } catch (err) {
    console.error('[compliance/overview]', err)
    return NextResponse.json({ success: false, error: 'Erro ao carregar visão geral.' }, { status: 500 })
  }
}
