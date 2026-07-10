// =============================================================================
// POST /api/seller-queue/attendance-auth/[id]/decide — líder+/gerência aprova ou
// recusa o pedido de atendimento (agendamento/retorno). Na aprovação, CRIA o
// atendimento (o vendedor passa a atender). Nunca o próprio solicitante decide.
// Body: { decision: 'approve' | 'reject', reason? }. Gate: sellerQueue.lead.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { getOrCreateQueue, logQueueEvent } from '@/lib/seller-queue/queue'
import { notify } from '@/services/notification.service'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.lead')) return forbiddenResponse('Sem permissão para autorizar atendimentos.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const body = await req.json().catch(() => ({}))
    const decision = body?.decision === 'approve' || body?.decision === 'reject' ? body.decision : ''
    if (!decision) return NextResponse.json({ success: false, error: 'Decisão inválida.' }, { status: 400 })
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    const auth = await prisma.sellerAttendanceAuthorization.findFirst({ where: { id, tenantId } })
    if (!auth) return NextResponse.json({ success: false, error: 'Pedido não encontrado.' }, { status: 404 })
    if (auth.status !== 'PENDING') return NextResponse.json({ success: false, error: 'Este pedido já foi decidido.' }, { status: 409 })
    // Anti-fraude: quem pediu não pode aprovar o próprio pedido.
    if (auth.requesterUserId === user.id) return NextResponse.json({ success: false, error: 'Você não pode autorizar o seu próprio pedido.' }, { status: 403 })

    const label = auth.visitType === 'AGENDAMENTO' ? 'agendamento' : 'retorno'

    if (decision === 'reject') {
      if (reason.length < 3) return NextResponse.json({ success: false, error: 'Informe o motivo da recusa.' }, { status: 400 })
      await prisma.sellerAttendanceAuthorization.update({ where: { id }, data: { status: 'REJECTED', decidedByUserId: user.id, decidedAt: new Date(), decisionReason: reason } })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'REJECT', entity: 'SellerAttendanceAuthorization', entityId: id, userName: user.name, userRole: user.role })
      await notify({ userId: auth.requesterUserId, tenantId, type: 'WARNING', title: '❌ Atendimento não autorizado', message: `Seu pedido de ${label} (${auth.customerName ?? 'cliente'}) foi recusado. Motivo: ${reason}`, actionUrl: '/vendedor-da-vez', metadata: { kind: 'attendance_auth_result', priority: 'high' }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] }).catch(() => {})
      return NextResponse.json({ success: true, data: { status: 'REJECTED' } })
    }

    // approve → cria o atendimento para o vendedor (mesma mecânica do "marcar atendendo").
    const busy = await prisma.sellerQueueAttendance.findFirst({ where: { sellerId: auth.requesterUserId, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } }, select: { id: true } })
    if (busy) return NextResponse.json({ success: false, error: 'O vendedor já está em atendimento ativo.' }, { status: 409 })

    const queue = await getOrCreateQueue(tenantId, auth.unitId)
    const now = new Date()
    const arrival = await prisma.sellerQueueCustomerArrival.create({
      data: { tenantId, unitId: auth.unitId, queueId: queue.id, registeredById: user.id, customerName: auth.customerName, customerPhone: auth.customerPhone, customerEmail: auth.customerEmail, recurring: auth.visitType === 'RETORNO', status: 'IN_ATTENDANCE', notes: auth.notes ?? `Autorizado por ${user.name}` },
    })
    const att = await prisma.sellerQueueAttendance.create({
      data: { tenantId, unitId: auth.unitId, queueId: queue.id, sellerId: auth.requesterUserId, arrivalId: arrival.id, visitType: auth.visitType, status: 'IN_ATTENDANCE', calledAt: now, acceptedAt: now, startedAt: now, createdById: user.id },
    })
    const entry = await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: queue.id, sellerId: auth.requesterUserId } }, select: { id: true } })
    if (entry) await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'IN_ATTENDANCE', lastActiveAt: now } })
    else await prisma.sellerQueueEntry.create({ data: { tenantId, unitId: auth.unitId, queueId: queue.id, sellerId: auth.requesterUserId, status: 'IN_ATTENDANCE', lastActiveAt: now } })

    await prisma.sellerAttendanceAuthorization.update({ where: { id }, data: { status: 'APPROVED', decidedByUserId: user.id, decidedAt: now, attendanceId: att.id } })
    await logQueueEvent({ tenantId, unitId: auth.unitId, queueId: queue.id, type: 'MANAGER_OVERRIDE', sellerId: auth.requesterUserId, actorId: user.id, attendanceId: att.id, reason: `Autorizado ${label} para ${auth.customerName ?? 'cliente'}` })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'APPROVE', entity: 'SellerAttendanceAuthorization', entityId: id, userName: user.name, userRole: user.role })
    await notify({ userId: auth.requesterUserId, tenantId, type: 'SUCCESS', title: '✅ Atendimento autorizado', message: `Seu ${label} (${auth.customerName ?? 'cliente'}) foi autorizado por ${user.name}. Bom atendimento!`, actionUrl: '/vendedor-da-vez', metadata: { kind: 'attendance_auth_result', priority: 'high' }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] }).catch(() => {})

    return NextResponse.json({ success: true, data: { status: 'APPROVED', attendanceId: att.id } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
