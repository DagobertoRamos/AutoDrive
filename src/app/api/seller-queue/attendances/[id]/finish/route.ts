// =============================================================================
// POST /api/seller-queue/attendances/:id/finish — finaliza o atendimento.
// Gate: sellerQueue.attend (o próprio vendedor) ou sellerQueue.lead (gestão).
// Exige tipo + resultado. Move o vendedor ao FIM da fila. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { finishSchema } from '@/lib/validators/seller-queue'
import { logQueueEvent, getUnitConfig } from '@/lib/seller-queue/queue'
import { moveEntryToEnd } from '@/lib/seller-queue/attendance'
import { ensureAttendanceLead } from '@/lib/seller-queue/lead'
import type { SellerAttendanceType, SellerAttendanceResult } from '@prisma/client'
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
    const isLead = canAccessModule(user.role, 'sellerQueue.lead')
    if (att.sellerId !== user.id && !isLead) return forbiddenResponse('Apenas o vendedor do atendimento ou a gestão pode finalizar.')
    if (!['IN_ATTENDANCE', 'ACCEPTED'].includes(att.status)) return NextResponse.json({ success: false, error: 'Atendimento não está em andamento.' }, { status: 409 })

    // Config da loja: se o vendedor NÃO pode finalizar, só a gestão (líder/gerente).
    const cfgFinish = await getUnitConfig(tenantId, att.unitId)
    const allowSellerFinish = (cfgFinish?.config as { allowSellerFinish?: boolean } | null)?.allowSellerFinish ?? true
    if (!allowSellerFinish && att.sellerId === user.id && !isLead) {
      return forbiddenResponse('A finalização do atendimento é feita pela gestão (configuração da loja).')
    }

    const d = finishSchema.parse(await req.json())
    await prisma.$transaction(async (tx) => {
      await tx.sellerQueueAttendance.update({
        where: { id: att.id },
        data: {
          status: 'FINISHED', finishedAt: new Date(),
          type: d.type as SellerAttendanceType, result: d.result as SellerAttendanceResult,
          dealId: d.dealId ?? null, leadId: d.leadId ?? null, notes: d.notes ?? null,
        },
      })
      await moveEntryToEnd(tx, att.queueId, att.sellerId, { countAttendance: true })
      if (att.arrivalId) await tx.sellerQueueCustomerArrival.update({ where: { id: att.arrivalId }, data: { status: 'DONE' } })
    })
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'ATTENDANCE_FINISHED', sellerId: att.sellerId, actorId: user.id, arrivalId: att.arrivalId, attendanceId: att.id, reason: d.result })
    await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'MOVED_TO_END', sellerId: att.sellerId, actorId: user.id, attendanceId: att.id })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'FINISH', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })

    // Gera/reaproveita o lead (sem duplicar), acha-ou-cria o cliente e — se
    // virou negociação — cria a negociação (Deal RASCUNHO) e linka tudo.
    const out = await ensureAttendanceLead({
      tenantId, unitId: att.unitId, sellerId: att.sellerId, actorId: user.id,
      attendanceId: att.id, arrivalId: att.arrivalId, result: d.result, attendanceType: d.type,
      dealId: d.dealId ?? null, notes: d.notes ?? null,
      existingLeadId: d.leadId ?? null, existingCustomerId: d.customerId ?? null,
      customerName: d.customerName ?? null, customerPhone: d.customerPhone ?? null, customerEmail: d.customerEmail ?? null,
    }).catch(() => null)
    if (out) {
      await prisma.sellerQueueAttendance.update({ where: { id: att.id }, data: { leadId: out.leadId, dealId: out.dealId, customerId: out.customerId } }).catch(() => {})
    }

    return NextResponse.json({ success: true, data: { leadId: out?.leadId ?? null, dealId: out?.dealId ?? null, customerId: out?.customerId ?? null } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
