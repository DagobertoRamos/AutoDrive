// =============================================================================
// GET /api/quality/overview — visão geral de qualidade de todos os vendedores.
// Gate: sellerQueue.reports (gerente+). Tenant+unit-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModule } from '@/lib/permissions'
import { unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'
import { readQualityConfig } from '@/lib/quality/config'
import { getQualityOverview } from '@/lib/quality/score'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.reports')) return forbiddenResponse('Sem acesso.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)

  try {
    const unitCfg = await getUnitConfig(tenantId, unitId ?? '')
    const cfg = readQualityConfig(unitCfg?.config)
    const sellers = await getQualityOverview(tenantId, unitId, cfg)
    return NextResponse.json({ success: true, data: { enabled: cfg.enabled, scorePeriodDays: cfg.scorePeriodDays, thresholds: cfg.thresholds, sellers } })
  } catch (err) {
    console.error('[quality/overview]', err)
    return NextResponse.json({ success: false, error: 'Erro.' }, { status: 500 })
  }
}
