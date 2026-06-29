// =============================================================================
// POST /api/seller-queue/start-attendance — a GESTÃO inicia um atendimento JÁ
// EM ANDAMENTO para um vendedor escolhido (ou para si mesma), sem tocar/chamar.
// Cria uma chegada mínima e abre o atendimento direto (IN_ATTENDANCE).
// Gate: sellerQueue.manage (gerente para cima). Auditado.
// Body: { sellerId?: string }  — sem sellerId = inicia para o próprio usuário.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'
import { getOrCreateQueue, logQueueEvent, unitFromRequest } from '@/lib/seller-queue/queue'
import { startAgendamento } from '@/lib/seller-queue/call'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Apenas a gestão pode iniciar atendimentos.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })

  try {
    const body = await req.json().catch(() => ({}))
    // Sem sellerId = inicia para o próprio gestor (atender ele mesmo).
    const sellerId = typeof body?.sellerId === 'string' && body.sellerId ? body.sellerId : user.id

    // O alvo precisa ser da mesma loja/unidade e estar ativo.
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
        requestedSellerId: sellerId, status: 'PENDING', notes: 'Atendimento iniciado pela gestão',
      },
    })

    const call = await startAgendamento({ tenantId, unitId, queueId: queue.id, arrivalId: arrival.id, actorId: user.id, sellerId })
    if (!call.ok) {
      await prisma.sellerQueueCustomerArrival.update({ where: { id: arrival.id }, data: { status: 'CANCELED' } }).catch(() => {})
      return NextResponse.json({ success: false, error: call.reason ?? 'Não foi possível iniciar o atendimento.' }, { status: 409 })
    }
    await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'CUSTOMER_ARRIVED', actorId: user.id, arrivalId: arrival.id, reason: 'atendimento iniciado pela gestão' })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'START_ATTENDANCE', entity: 'SellerQueueAttendance', entityId: call.attendanceId ?? sellerId, userName: user.name, userRole: user.role })

    return NextResponse.json({ success: true, data: { arrivalId: arrival.id, attendanceId: call.attendanceId, sellerName: target.name } }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
