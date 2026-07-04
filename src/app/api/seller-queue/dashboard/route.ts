// =============================================================================
// GET /api/seller-queue/dashboard — dados OPERACIONAIS agregados (atendimentos
// ativos + lembretes + bloqueios) numa chamada. Gate: sellerQueue.view.
// Reduz o polling do dashboard. Ranking(7d)/log ficam em cadência lenta no front.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { unitFromRequest } from '@/lib/seller-queue/queue'
import { getQueueDashboardData } from '@/lib/seller-queue/dashboard'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    const canManage = await canAccessModuleForUser(user, 'sellerQueue.manage')
    const data = await getQueueDashboardData({ tenantId, unitId, userId: user.id, canManage })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
