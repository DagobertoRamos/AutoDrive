// =============================================================================
// /api/seller-queue/customer-arrivals — cliente na loja.
//   GET  : sellerQueue.view           — clientes do dia (PENDING/CALLING/ASSIGNED)
//   POST : sellerQueue.customerArrived — registra chegada e CHAMA o vendedor da vez
// Regra: quem registra precisa estar com check-in ativo e NÃO escolhe o atendente.
// Cliente recorrente (lead/negociação/responsável) é identificado em LEITURA.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createArrivalSchema } from '@/lib/validators/seller-queue'
import { queueDate, getOrCreateQueue, getUnitConfig, logQueueEvent , unitFromRequest } from '@/lib/seller-queue/queue'
import { detectRecurringCustomer } from '@/lib/seller-queue/recurring'
import { callForArrival, callSpecificSeller, startAgendamento } from '@/lib/seller-queue/call'
import { startPosVenda } from '@/lib/seller-queue/pos-vendas'
import { flagFraud } from '@/lib/seller-queue/fraud'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const ACTIVE_ENTRY = ['WAITING', 'NEXT', 'CALLED', 'ACCEPTED', 'IN_ATTENDANCE', 'PAUSED']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
    if (!queue) return NextResponse.json({ success: true, data: [] })
    const rows = await prisma.sellerQueueCustomerArrival.findMany({
      where: { queueId: queue.id },
      orderBy: { createdAt: 'desc' }, take: 200,
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.customerArrived')) return forbiddenResponse('Sem permissão para registrar cliente.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.customerArrived'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = user.unitId
  if (!unitId) return forbiddenResponse('Seu usuário não tem unidade vinculada.')
  try {
    const d = createArrivalSchema.parse(await req.json())
    const queue = await getOrCreateQueue(tenantId, unitId)

    // Antifraude: quem registra precisa estar com check-in ATIVO.
    const myEntry = await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: queue.id, sellerId: user.id } }, select: { status: true } })
    if (!myEntry || !ACTIVE_ENTRY.includes(myEntry.status)) {
      return NextResponse.json({ success: false, error: 'Faça check-in na fila antes de registrar um cliente.' }, { status: 403 })
    }

    const recurring = await detectRecurringCustomer(tenantId, d.customerPhone, d.customerName)
    const cfg = await getUnitConfig(tenantId, unitId)

    const arrival = await prisma.sellerQueueCustomerArrival.create({
      data: {
        tenantId, unitId, queueId: queue.id, registeredById: user.id,
        customerName: d.customerName ?? null, customerPhone: d.customerPhone ?? null,
        customerId: recurring.customerId ?? null, leadId: recurring.leadId ?? null,
        recurring: recurring.recurring, suggestedSellerId: recurring.suggestedSellerId ?? null,
        requestedSellerId: d.requestedSellerId ?? null, status: 'PENDING', notes: d.notes ?? null,
      },
    })
    await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'CUSTOMER_ARRIVED', actorId: user.id, arrivalId: arrival.id, reason: recurring.recurring ? 'recorrente' : 'novo' })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CUSTOMER_ARRIVED', entity: 'SellerQueueCustomerArrival', entityId: arrival.id, userName: user.name, userRole: user.role })

    // Antifraude: mesmo telefone registrado de novo em ≤10min → suspeita de cliente duplicado.
    const digits = (d.customerPhone ?? '').replace(/\D/g, '')
    if (digits.length >= 8) {
      const dup = await prisma.sellerQueueCustomerArrival.findFirst({
        where: { queueId: queue.id, id: { not: arrival.id }, customerPhone: { contains: digits.slice(-8) }, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
        select: { id: true },
      })
      if (dup) await flagFraud({ tenantId, unitId, actorId: user.id, arrivalId: arrival.id, kind: 'DUPLICATE', severity: 'MEDIUM', detail: 'Mesmo telefone registrado novamente em menos de 10 minutos.' })
    }

    // Modo de atendimento escolhido por quem registra.
    let call: { ok: boolean; reason?: string; sellerId?: string; attendanceId?: string }
    const mode = d.mode ?? 'NORMAL'

    if ((mode === 'SPECIFIC' || mode === 'POS_VENDAS' || mode === 'AGENDAMENTO') && d.targetSellerId) {
      // Valida que o colaborador escolhido é da mesma unidade.
      const target = await prisma.user.findUnique({ where: { id: d.targetSellerId }, select: { tenantId: true, unitId: true, status: true } })
      if (!target || target.tenantId !== tenantId || target.unitId !== unitId || target.status !== 'ATIVO') {
        return NextResponse.json({ success: false, error: 'Colaborador inválido para esta unidade.' }, { status: 400 })
      }
      if (mode === 'POS_VENDAS') {
        const pv = await startPosVenda({ tenantId, unitId, sellerId: d.targetSellerId, startedById: user.id })
        if (pv.ok) await prisma.sellerQueueCustomerArrival.update({ where: { id: arrival.id }, data: { status: 'ASSIGNED' } }).catch(() => {})
        call = pv.ok ? { ok: true } : { ok: false, reason: pv.reason }
      } else if (mode === 'AGENDAMENTO') {
        call = await startAgendamento({ tenantId, unitId, queueId: queue.id, arrivalId: arrival.id, actorId: user.id, sellerId: d.targetSellerId, customerName: d.customerName ?? null })
      } else {
        call = await callSpecificSeller({ tenantId, unitId, queueId: queue.id, arrivalId: arrival.id, actorId: user.id, sellerId: d.targetSellerId, customerName: d.customerName ?? null })
      }
    } else {
      // NORMAL: cliente pediu por nome (se a regra permitir) > responsável (recorrente) > vendedor da vez.
      let preferSellerId: string | null = null
      if (d.requestedSellerId && cfg && !cfg.requestByNameRequiresApproval) preferSellerId = d.requestedSellerId
      else if (recurring.suggestedSellerId && (cfg?.recurringCustomerRule ?? 'RESPONSIBLE') === 'RESPONSIBLE') preferSellerId = recurring.suggestedSellerId
      call = await callForArrival({ tenantId, unitId, queueId: queue.id, arrivalId: arrival.id, actorId: user.id, preferSellerId, customerName: d.customerName ?? null, recurring: recurring.recurring })
    }

    return NextResponse.json({ success: true, data: { arrivalId: arrival.id, recurring, call } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
