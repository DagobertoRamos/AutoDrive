// =============================================================================
// POST /api/seller-queue/attendances/:id/timeout — aceite expirou.
// Pode ser disparado pela gestão (sellerQueue.lead) ou automaticamente por
// qualquer viewer quando o prazo passou. Move o vendedor ao fim, registra
// penalidade, AVISA a gestão e chama o próximo. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { notifyByRole } from '@/services/notification.service'
import { timeoutSchema } from '@/lib/validators/seller-queue'
import { logQueueEvent } from '@/lib/seller-queue/queue'
import { moveEntryToEnd } from '@/lib/seller-queue/attendance'
import { callForArrival } from '@/lib/seller-queue/call'

type Ctx = { params: Promise<{ id: string }> }
const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER']

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const att = await prisma.sellerQueueAttendance.findUnique({ where: { id } })
    if (!att) return NextResponse.json({ success: false, error: 'Atendimento não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, att.tenantId)) return forbiddenResponse('Atendimento de outra loja.')
    if (att.status !== 'CALLED') return NextResponse.json({ success: false, error: 'Este atendimento não está aguardando aceite.' }, { status: 409 })

    const isLead = canAccessModule(user.role, 'sellerQueue.lead')
    const expired = !!att.acceptDeadline && att.acceptDeadline.getTime() < Date.now()
    if (!isLead && !expired) return forbiddenResponse('O prazo de aceite ainda não expirou.')

    const d = timeoutSchema.parse(await req.json().catch(() => ({})))
    await prisma.$transaction(async (tx) => {
      await tx.sellerQueueAttendance.update({ where: { id: att.id }, data: { status: 'EXPIRED' } })
      await moveEntryToEnd(tx, att.queueId, att.sellerId)
      await tx.sellerQueuePenalty.create({ data: { tenantId, unitId: att.unitId, sellerId: att.sellerId, type: 'TIMEOUT', reason: d.reason ?? 'Não aceitou no prazo', points: 1, appliedById: user.id } })
      if (att.arrivalId) await tx.sellerQueueCustomerArrival.update({ where: { id: att.arrivalId }, data: { status: 'PENDING' } })
    })
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'TIMEOUT', sellerId: att.sellerId, actorId: user.id, arrivalId: att.arrivalId, attendanceId: att.id })
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'MOVED_TO_END', sellerId: att.sellerId, actorId: user.id, attendanceId: att.id })

    // Avisa a gestão (best-effort).
    await notifyByRole({
      tenantId, roles: MANAGER_ROLES, type: 'WARNING',
      title: 'Vendedor não aceitou no prazo',
      message: 'Um cliente presencial não foi aceito a tempo — o próximo vendedor foi chamado.',
      actionUrl: '/vendedor-da-vez/painel', metadata: { kind: 'seller_queue_timeout', attendanceId: att.id, unitId: att.unitId },
    }).catch(() => {})

    const call = att.arrivalId
      ? await callForArrival({ tenantId, unitId: att.unitId, queueId: att.queueId, arrivalId: att.arrivalId, actorId: user.id, reason: 'timeout' })
      : { ok: false, reason: 'Sem cliente vinculado.' }
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'TIMEOUT', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { call } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
