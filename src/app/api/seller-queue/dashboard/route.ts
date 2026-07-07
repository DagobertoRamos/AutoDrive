// =============================================================================
// GET /api/seller-queue/dashboard — dados OPERACIONAIS agregados (atendimentos
// ativos + lembretes + bloqueios) numa chamada. Gate: sellerQueue.view.
// Reduz o polling do dashboard. Ranking(7d)/log ficam em cadência lenta no front.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled, canAccessModuleForUser, isModuleEnabled } from '@/lib/tenant-modules'
import { isQueuePanelFallbackUser, resolveQueueUnitForRead } from '@/lib/seller-queue/queue'
import { getQueueDashboardData } from '@/lib/seller-queue/dashboard'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const [canViewQueue, canViewPanel, canViewDashboard] = await Promise.all([
    canAccessModuleForUser(user, 'sellerQueue.view'),
    canAccessModuleForUser(user, 'queue.panel.view'),
    canAccessModuleForUser(user, 'queue.dashboard.view'),
  ])
  const panelFallback = isQueuePanelFallbackUser(user)
  if (!canViewQueue && !canViewPanel && !canViewDashboard && !panelFallback) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  if (canViewQueue) {
    const gate = await assertModuleEnabled(user, 'sellerQueue.view')
    if (gate) return gate
  } else if (user.role !== 'MASTER' && !await isModuleEnabled(tenantId, 'sellerQueue.view')) {
    return forbiddenResponse('Este recurso não está habilitado para a sua loja. Fale com o suporte.')
  }
  try {
    const unitScope = await resolveQueueUnitForRead(req, user, tenantId)
    if (!unitScope.unitId) {
      return NextResponse.json({ success: false, error: unitScope.error ?? 'Informe a unidade (?unitId=).' }, { status: unitScope.status ?? 400 })
    }
    const unitId = unitScope.unitId
    const canManage = await canAccessModuleForUser(user, 'sellerQueue.manage')
    const data = await getQueueDashboardData({ tenantId, unitId, userId: user.id, canManage })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
