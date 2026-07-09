// =============================================================================
// POST /api/seller-queue/attendances/:id/manage — ciclo do atendimento pela
// GESTÃO: finalizar, reabrir, cancelar, excluir ou transferir. Mantém o LEAD
// interligado (finalizar/reabrir → WORKING; cancelar/excluir → DISCARDED). Gate:
// sellerQueue.manage. Auditado.
// Body: { action: 'finish' | 'reopen' | 'cancel' | 'delete' | 'transfer', toSellerId? }
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'
import { logQueueEvent, getUnitConfig, nextPosition } from '@/lib/seller-queue/queue'
import { notifySellerCalled } from '@/lib/seller-queue/notify'
import type { LeadStatus } from '@prisma/client'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action as 'reopen' | 'cancel' | 'delete' | 'transfer' | 'finish' | undefined
    if (!action || !['reopen', 'cancel', 'delete', 'transfer', 'finish'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
    }
    const permissionByAction: Record<string, string> = {
      transfer: 'queue.transfer_attendance',
      finish: 'queue.finish_other_attendance',
      reopen: 'queue.takeover_attendance',
      cancel: 'queue.finish_other_attendance',
      delete: 'queue.finish_other_attendance',
    }
    if (!await canAccessModuleForUser(user, permissionByAction[action])) {
      return forbiddenResponse('Sem permissão para gerenciar este atendimento.')
    }

    const att = await prisma.sellerQueueAttendance.findUnique({ where: { id }, select: { id: true, tenantId: true, unitId: true, queueId: true, sellerId: true, status: true, leadId: true, arrivalId: true } })
    if (!att) return NextResponse.json({ success: false, error: 'Atendimento não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, att.tenantId)) return forbiddenResponse('Atendimento de outra loja.')

    const setLead = async (status: LeadStatus) => {
      if (att.leadId) await prisma.marketingLead.update({ where: { id: att.leadId }, data: { status, lastContactAt: new Date() } }).catch(() => {})
    }

    if (action === 'transfer') {
      const toSellerId = typeof body?.toSellerId === 'string' ? body.toSellerId : ''
      if (!toSellerId) return NextResponse.json({ success: false, error: 'Informe o vendedor de destino.' }, { status: 400 })
      if (toSellerId === att.sellerId) return NextResponse.json({ success: false, error: 'Já é o vendedor atual.' }, { status: 409 })
      // Destino é qualquer COLABORADOR do tenant (aceita gerente/líder, que podem
      // não ter registro Seller e ficam fora da rotação — antes exigia Seller e dava 404).
      const destUser = await prisma.user.findFirst({ where: { id: toSellerId, tenantId }, select: { id: true } })
      if (!destUser) return NextResponse.json({ success: false, error: 'Colaborador de destino não encontrado nesta loja.' }, { status: 404 })
      const busy = await prisma.sellerQueueAttendance.findFirst({ where: { queueId: att.queueId, sellerId: toSellerId, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } }, select: { id: true } })
      if (busy) return NextResponse.json({ success: false, error: 'O colaborador de destino já está em atendimento.' }, { status: 409 })
      const cfg = await getUnitConfig(tenantId, att.unitId)
      const timeout = cfg?.acceptTimeoutSeconds ?? 60
      const now = new Date()
      const originalSellerId = att.sellerId
      // Atômico: reatribui o atendimento ao destino, LIBERA o vendedor original
      // (senão ele fica preso em IN_ATTENDANCE sem atendimento) e marca o destino.
      await prisma.$transaction(async (tx) => {
        await tx.sellerQueueAttendance.update({ where: { id }, data: { sellerId: toSellerId, status: 'CALLED', calledAt: now, acceptDeadline: new Date(now.getTime() + timeout * 1000), acceptedAt: null, startedAt: null } })
        await tx.sellerQueueEntry.updateMany({ where: { queueId: att.queueId, sellerId: originalSellerId, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } }, data: { status: 'WAITING', lastActiveAt: now } })
        await tx.sellerQueueEntry.updateMany({ where: { queueId: att.queueId, sellerId: toSellerId, status: 'WAITING' }, data: { status: 'CALLED', lastActiveAt: now } })
      })
      await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'CALLED', sellerId: toSellerId, actorId: user.id, attendanceId: att.id, reason: 'atendimento transferido pela gestão' })
      await notifySellerCalled({ tenantId, sellerId: toSellerId, timeoutSeconds: timeout, attendanceId: att.id, arrivalId: att.arrivalId, customerName: null, recurring: false, whatsapp: cfg?.alertWhatsapp ?? false })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'TRANSFER', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true })
    }

    if (action === 'finish') {
      if (att.status === 'FINISHED' || att.status === 'CANCELED') {
        return NextResponse.json({ success: false, error: 'Atendimento já encerrado.' }, { status: 409 })
      }
      await prisma.sellerQueueAttendance.update({ where: { id }, data: { status: 'FINISHED', finishedAt: new Date() } })
      await setLead('WORKING')
      if (att.arrivalId) await prisma.sellerQueueCustomerArrival.update({ where: { id: att.arrivalId }, data: { status: 'DONE' } }).catch(() => {})
      // Devolve o vendedor para o fim da fila (fica disponível de novo).
      await prisma.sellerQueueEntry.updateMany({ where: { queueId: att.queueId, sellerId: att.sellerId, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE', 'NEXT'] } }, data: { status: 'WAITING', position: await nextPosition(att.queueId), lastActiveAt: new Date() } }).catch(() => {})
      await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'ATTENDANCE_FINISHED', sellerId: att.sellerId, actorId: user.id, attendanceId: att.id, reason: 'finalizado pela gestão' })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'FINISH', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true })
    }

    if (action === 'reopen') {
      if (att.status !== 'FINISHED' && att.status !== 'CANCELED') {
        return NextResponse.json({ success: false, error: 'Só dá para reabrir um atendimento finalizado/cancelado.' }, { status: 409 })
      }
      await prisma.sellerQueueAttendance.update({ where: { id }, data: { status: 'IN_ATTENDANCE', finishedAt: null } })
      await setLead('WORKING')
      await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'ATTENDANCE_STARTED', sellerId: att.sellerId, actorId: user.id, attendanceId: att.id, reason: 'reaberto pela gestão' })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'REOPEN', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true })
    }

    if (action === 'cancel') {
      await prisma.sellerQueueAttendance.update({ where: { id }, data: { status: 'CANCELED', finishedAt: new Date() } })
      await setLead('DISCARDED')
      if (att.arrivalId) await prisma.sellerQueueCustomerArrival.update({ where: { id: att.arrivalId }, data: { status: 'CANCELED' } }).catch(() => {})
      await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'ATTENDANCE_FINISHED', sellerId: att.sellerId, actorId: user.id, attendanceId: att.id, reason: 'cancelado pela gestão' })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'CANCEL', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true })
    }

    // delete
    await setLead('DISCARDED')
    await prisma.sellerQueueAttendance.delete({ where: { id } }).catch(() => {})
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'DELETE', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
