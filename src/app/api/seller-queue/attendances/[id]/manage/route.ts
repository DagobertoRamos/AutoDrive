// =============================================================================
// POST /api/seller-queue/attendances/:id/manage — ciclo do atendimento pela
// GESTÃO: reabrir, cancelar ou excluir. Mantém o LEAD interligado (reabrir →
// lead volta a WORKING; cancelar/excluir → lead DISCARDED). Gate: sellerQueue
// .manage. Auditado. Body: { action: 'reopen' | 'cancel' | 'delete' }
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant } from '@/lib/finance/finance-service'
import { logQueueEvent } from '@/lib/seller-queue/queue'
import type { LeadStatus } from '@prisma/client'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Apenas a gestão pode reabrir/cancelar/excluir atendimentos.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action as 'reopen' | 'cancel' | 'delete' | undefined
    if (!action || !['reopen', 'cancel', 'delete'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
    }

    const att = await prisma.sellerQueueAttendance.findUnique({ where: { id }, select: { id: true, tenantId: true, unitId: true, queueId: true, sellerId: true, status: true, leadId: true, arrivalId: true } })
    if (!att) return NextResponse.json({ success: false, error: 'Atendimento não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, att.tenantId)) return forbiddenResponse('Atendimento de outra loja.')

    const setLead = async (status: LeadStatus) => {
      if (att.leadId) await prisma.marketingLead.update({ where: { id: att.leadId }, data: { status, lastContactAt: new Date() } }).catch(() => {})
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
