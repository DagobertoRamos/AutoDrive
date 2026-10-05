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
    // Chamada da fila individual: o cliente é do vendedor — volta p/ a fila dele.
    const personalItem = await prisma.agentPersonalQueueItem.findFirst({ where: { attendanceId: att.id, status: 'CHAMADO' }, select: { id: true } })
    const claimed = await prisma.$transaction(async (tx) => {
      const upd = await tx.sellerQueueAttendance.updateMany({ where: { id: att.id, status: 'CALLED' }, data: { status: 'REJECTED', rejectedAt: new Date(), rejectReason: d.reason } })
      if (upd.count !== 1) return false
      if (personalItem) await tx.agentPersonalQueueItem.update({ where: { id: personalItem.id }, data: { status: 'AGUARDANDO', attendanceId: null } })
      // Recusou = está ocupado → PAUSA automática (sai do rodízio até voltar).
      await tx.sellerQueueEntry.updateMany({ where: { queueId: att.queueId, sellerId: user.id, status: { in: ['CALLED', 'NEXT', 'WAITING'] } }, data: { status: 'PAUSED', pausedAt: new Date() } })
      if (att.arrivalId && !personalItem) await tx.sellerQueueCustomerArrival.update({ where: { id: att.arrivalId }, data: { status: 'PENDING' } })
      return true
    })
    if (!claimed) return NextResponse.json({ success: false, error: 'Este atendimento não está aguardando aceite.' }, { status: 409 })
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'REJECTED', sellerId: user.id, actorId: user.id, arrivalId: att.arrivalId, attendanceId: att.id, reason: d.reason })
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'PAUSE', sellerId: user.id, actorId: user.id, attendanceId: att.id, reason: 'recusou (ocupado) — pausado automaticamente' })

    // Chama o próximo para o mesmo cliente.
    const call = att.arrivalId && !personalItem
      ? await callForArrival({ tenantId, unitId: att.unitId, queueId: att.queueId, arrivalId: att.arrivalId, actorId: user.id, reason: 'recusa' })
      : { ok: false, reason: personalItem ? 'Fila individual: devolvido à fila do vendedor.' : 'Sem cliente vinculado.' }
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'REJECT', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { call } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
