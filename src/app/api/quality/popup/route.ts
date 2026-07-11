// =============================================================================
// GET /api/quality/popup — endpoint leve para o QualityScoreWatcher.
// Retorna score total, se deve mostrar popup, restrições ativas.
// Gate: qualquer usuário autenticado.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'
import { getPopupScore } from '@/lib/quality/score'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)

  try {
    const unitCfg = await getUnitConfig(tenantId, unitId ?? '')
    const data = await getPopupScore(user.id, tenantId, unitCfg?.config)
    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: true, data: { total: 0, popup: false, warn: false, enabled: false, restrictions: [] } })
  }
}
