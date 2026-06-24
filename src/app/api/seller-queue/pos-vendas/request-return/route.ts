// =============================================================================
// POST /api/seller-queue/pos-vendas/request-return — o colaborador pede para
// voltar à fila depois do pós-vendas. Avisa os superiores p/ autorização.
// Gate: sellerQueue.checkIn (o próprio). Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { requestReturn } from '@/lib/seller-queue/pos-vendas'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.checkIn')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = user.unitId
  if (!unitId) return forbiddenResponse('Seu usuário não tem unidade vinculada.')
  try {
    const r = await requestReturn(tenantId, unitId, user.id)
    if (!r.ok) return NextResponse.json({ success: false, error: r.reason ?? 'Não foi possível pedir o retorno.' }, { status: 409 })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'POS_VENDA_RETURN_REQUEST', entity: 'SellerQueuePosVenda', entityId: user.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
