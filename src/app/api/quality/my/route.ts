// =============================================================================
// GET /api/quality/my — score de qualidade do próprio usuário.
// Gate: qualquer usuário autenticado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'
import { readQualityConfig } from '@/lib/quality/config'
import { computeQualityScore, checkUnresolvedPendenciesLimit } from '@/lib/quality/score'
import { QUALITY_EVENT_TYPE_LABELS } from '@/lib/quality/types'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)

  try {
    const unitCfg = await getUnitConfig(tenantId, unitId ?? '')
    const cfg = readQualityConfig(unitCfg?.config)
    const [score, unresolvedCheck] = await Promise.all([
      computeQualityScore(user.id, tenantId, unitCfg?.config),
      checkUnresolvedPendenciesLimit(user.id, tenantId, unitCfg?.config),
    ])

    const since = cfg.enabled ? new Date(Date.now() - cfg.scorePeriodDays * 86400000) : new Date()
    const recentEvents = cfg.enabled ? await prisma.qualityEvent.findMany({
      where: { tenantId, sellerId: user.id, appliedAt: { gte: since } },
      orderBy: { appliedAt: 'desc' },
      take: 50,
      select: { id: true, category: true, type: true, points: true, reason: true, appliedAt: true, active: true, reversedAt: true, referenceId: true, referenceType: true, appliedById: true },
    }).catch(() => []) : []

    return NextResponse.json({
      success: true,
      data: {
        enabled: cfg.enabled,
        score: score.total,
        breakdown: score.breakdown,
        restrictions: score.restrictions,
        periodDays: cfg.scorePeriodDays,
        thresholds: cfg.thresholds,
        unresolvedPendencies: unresolvedCheck,
        recentEvents: recentEvents.map(e => ({
          ...e,
          typeLabel: QUALITY_EVENT_TYPE_LABELS[e.type as keyof typeof QUALITY_EVENT_TYPE_LABELS] ?? e.type,
        })),
      },
    })
  } catch (err) {
    console.error('[quality/my]', err)
    return NextResponse.json({ success: false, error: 'Erro.' }, { status: 500 })
  }
}
