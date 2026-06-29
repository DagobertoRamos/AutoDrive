// =============================================================================
// POST /api/seller-queue/attendances/:id/reject — vendedor recusa (com motivo).
// Gate: sellerQueue.attend. Quem recusa está OCUPADO → fica PAUSADO automatica-
// mente (sai do rodízio até voltar manualmente) e o próximo é chamado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export const maxDuration = 30 // reenvios de web push (iPhone) rodam em 2º plano
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { rejectSchema } from '@/lib/validators/seller-queue'
import { logQueueEvent } from '@/lib/seller-queue/queue'
import { callForArrival } from '@/lib/seller-queue/call'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.attend')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.attend'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const att = await prisma.sellerQueueAttendance.findUnique({ where: { id } })
    if (!att) return NextResponse.json({ success: false, error: 'Atendimento não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, att.tenantId)) return forbiddenResponse('Atendimento de outra loja.')
    if (att.sellerId !== user.id) return forbiddenResponse('Apenas o vendedor chamado pode recusar.')
    if (att.status !== 'CALLED') return NextResponse.json({ success: false, error: 'Este atendimento não está aguardando aceite.' }, { status: 409 })

    const d = rejectSchema.parse(await req.json())
    await prisma.$transaction(async (tx) => {
      await tx.sellerQueueAttendance.update({ where: { id: att.id }, data: { status: 'REJECTED', rejectedAt: new Date(), rejectReason: d.reason } })
      // Recusou = está ocupado → PAUSA automática (sai do rodízio até voltar).
      await tx.sellerQueueEntry.updateMany({ where: { queueId: att.queueId, sellerId: user.id, status: { in: ['CALLED', 'NEXT', 'WAITING'] } }, data: { status: 'PAUSED', pausedAt: new Date() } })
      if (att.arrivalId) await tx.sellerQueueCustomerArrival.update({ where: { id: att.arrivalId }, data: { status: 'PENDING' } })
    })
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'REJECTED', sellerId: user.id, actorId: user.id, arrivalId: att.arrivalId, attendanceId: att.id, reason: d.reason })
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'PAUSE', sellerId: user.id, actorId: user.id, attendanceId: att.id, reason: 'recusou (ocupado) — pausado automaticamente' })

    // Chama o próximo para o mesmo cliente.
    const call = att.arrivalId
      ? await callForArrival({ tenantId, unitId: att.unitId, queueId: att.queueId, arrivalId: att.arrivalId, actorId: user.id, reason: 'recusa' })
      : { ok: false, reason: 'Sem cliente vinculado.' }
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'REJECT', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { call } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
