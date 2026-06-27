// =============================================================================
// POST /api/seller-queue/quick-call — "Chamar vendedor da vez" (1 toque).
// Qualquer pessoa com acesso à fila (sellerQueue.view, inclui auxiliar) chama o
// vendedor da vez sem cadastrar cliente e SEM exigir check-in próprio. Cria uma
// chegada mínima (sem cliente) e dispara callForArrival (lock atômico). Se o
// vendedor não aceitar, o auto-timeout da tela chama o próximo. Quem aceita
// cadastra o cliente depois. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'

export const maxDuration = 30 // reenvios de web push (iPhone) rodam em 2º plano
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'
import { getOrCreateQueue, logQueueEvent, unitFromRequest } from '@/lib/seller-queue/queue'
import { callForArrival } from '@/lib/seller-queue/call'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })

  try {
    const queue = await getOrCreateQueue(tenantId, unitId)

    // Chegada mínima, sem dados de cliente (o vendedor que aceitar cadastra depois).
    const arrival = await prisma.sellerQueueCustomerArrival.create({
      data: {
        tenantId, unitId, queueId: queue.id, registeredById: user.id,
        customerName: null, customerPhone: null, recurring: false,
        status: 'PENDING', notes: 'Chamada rápida (sem cadastro)',
      },
    })
    await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'CUSTOMER_ARRIVED', actorId: user.id, arrivalId: arrival.id, reason: 'chamada rápida' })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'QUICK_CALL_DA_VEZ', entity: 'SellerQueueCustomerArrival', entityId: arrival.id, userName: user.name, userRole: user.role })

    // Sem preferSellerId: chama estritamente o próximo da ordem (vendedor da vez).
    const call = await callForArrival({ tenantId, unitId, queueId: queue.id, arrivalId: arrival.id, actorId: user.id, customerName: null, recurring: false })

    // Se ninguém disponível, cancela a chegada órfã para não poluir o painel.
    if (!call.ok) {
      await prisma.sellerQueueCustomerArrival.update({ where: { id: arrival.id }, data: { status: 'CANCELED' } }).catch(() => {})
    }

    return NextResponse.json({ success: true, data: { arrivalId: arrival.id, call } }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
