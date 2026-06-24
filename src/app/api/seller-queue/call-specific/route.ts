// =============================================================================
// POST /api/seller-queue/call-specific — chama um colaborador ESPECÍFICO
// (responsável / pós-vendas / superior), na fila ou fora dela. Cria uma chegada
// mínima e chama o vendedor escolhido. SEMPRE auditado (antifraude — furar a
// ordem fica registrado). Gate: sellerQueue.view (qualquer um com acesso à fila).
// Body: { sellerId: string, reason?: string }
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'
import { getOrCreateQueue, logQueueEvent, unitFromRequest } from '@/lib/seller-queue/queue'
import { callSpecificSeller } from '@/lib/seller-queue/call'
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
    const body = await req.json().catch(() => ({}))
    const sellerId = typeof body?.sellerId === 'string' ? body.sellerId : null
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
    if (!sellerId) return NextResponse.json({ success: false, error: 'Informe o colaborador (sellerId).' }, { status: 400 })

    // O alvo precisa ser da mesma loja/unidade.
    const target = await prisma.user.findUnique({ where: { id: sellerId }, select: { id: true, name: true, tenantId: true, unitId: true, status: true } })
    if (!target || target.tenantId !== tenantId || target.unitId !== unitId) {
      return NextResponse.json({ success: false, error: 'Colaborador inválido para esta unidade.' }, { status: 400 })
    }
    if (target.status !== 'ATIVO') return NextResponse.json({ success: false, error: 'Colaborador inativo.' }, { status: 400 })

    const queue = await getOrCreateQueue(tenantId, unitId)
    const arrival = await prisma.sellerQueueCustomerArrival.create({
      data: {
        tenantId, unitId, queueId: queue.id, registeredById: user.id,
        customerName: null, customerPhone: null, recurring: false,
        requestedSellerId: sellerId, status: 'PENDING', notes: reason ?? 'Chamada de colaborador específico',
      },
    })
    await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'CUSTOMER_ARRIVED', actorId: user.id, arrivalId: arrival.id, reason: 'chamada específica' })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CALL_SPECIFIC', entity: 'SellerQueueAttendance', entityId: sellerId, userName: user.name, userRole: user.role })

    const call = await callSpecificSeller({ tenantId, unitId, queueId: queue.id, arrivalId: arrival.id, actorId: user.id, sellerId, reason })

    if (!call.ok) {
      await prisma.sellerQueueCustomerArrival.update({ where: { id: arrival.id }, data: { status: 'CANCELED' } }).catch(() => {})
    }
    return NextResponse.json({ success: true, data: { arrivalId: arrival.id, call } }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
