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
import { readAttendanceTypesConfig, typeConsumesTurn } from '@/lib/seller-queue/attendance-types-config'
import { ensureAttendanceLead } from '@/lib/seller-queue/lead'
import { concludePersonalItemByAttendance, listPersonalQueueForAgent, callNextPersonalItem } from '@/lib/seller-queue/personal-queue'
import type { SellerAttendanceType, SellerAttendanceResult } from '@prisma/client'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'

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
    const isLead = await canAccessModuleForUser(user, 'queue.finish_other_attendance')
    if (att.sellerId !== user.id && !isLead) return forbiddenResponse('Apenas o vendedor do atendimento ou a gestão pode finalizar.')
    if (!['IN_ATTENDANCE', 'ACCEPTED'].includes(att.status)) return NextResponse.json({ success: false, error: 'Atendimento não está em andamento.' }, { status: 409 })

    // Config da loja: se o vendedor NÃO pode finalizar, só a gestão (líder/gerente).
    const cfgFinish = await getUnitConfig(tenantId, att.unitId)
    const allowSellerFinish = (cfgFinish?.config as { allowSellerFinish?: boolean } | null)?.allowSellerFinish ?? true
    if (!allowSellerFinish && att.sellerId === user.id && !isLead) {
      return forbiddenResponse('A finalização do atendimento é feita pela gestão (configuração da loja).')
    }

    const bodyJson = await req.json()
    const d = finishSchema.parse(bodyJson)
    const hasCustomer = Boolean(d.customerId) || (Boolean(d.customerName?.trim()) && (d.customerPhone ?? '').replace(/\D/g, '').length >= 10)

    let allowBypassCustomer = false
    const durationMin = (Date.now() - new Date(att.startedAt ?? att.calledAt).getTime()) / 60000

    if (att.visitType === 'INFORMACAO_RAPIDA') {
      const cfgExtras = (cfgFinish?.config as Record<string, any>) ?? {}
      const infoTimeLimit = typeof cfgExtras.infoRapidaTimeLimitMinutes === 'number' ? cfgExtras.infoRapidaTimeLimitMinutes : 3
      if (durationMin <= infoTimeLimit || isLead) {
        allowBypassCustomer = true
      } else {
        return NextResponse.json({
          success: false,
          error: `O atendimento de Informação Rápida excedeu o limite de ${infoTimeLimit} minutos. É necessário cadastrar os dados do cliente para finalizar.`
        }, { status: 400 })
      }
    }

    if (!hasCustomer && !allowBypassCustomer) {
      return NextResponse.json({ success: false, error: 'Para finalizar o atendimento, cadastre os dados mínimos do cliente.' }, { status: 400 })
    }
    if (d.result !== 'CONVERTED_TO_NEGOTIATION' && !d.notes?.trim()) {
      return NextResponse.json({ success: false, error: 'Informe uma observação/motivo quando o atendimento não gerar negociação.' }, { status: 400 })
    }

    // Tipo de atendimento (natureza da visita) decide se consome a vez da fila.
    let consumesTurn = typeConsumesTurn(readAttendanceTypesConfig(cfgFinish?.config), att.visitType)
    if (att.visitType === 'INFORMACAO_RAPIDA') {
      const rule = (cfgFinish?.config as any)?.infoRapidaConsumesTurn ?? 'NO'
      if (rule === 'YES') {
        consumesTurn = true
      } else if (rule === 'NO') {
        consumesTurn = false
      } else if (rule === 'TIME_LIMIT') {
        const cfgExtras = (cfgFinish?.config as Record<string, any>) ?? {}
        const infoTimeLimit = typeof cfgExtras.infoRapidaTimeLimitMinutes === 'number' ? cfgExtras.infoRapidaTimeLimitMinutes : 3
        consumesTurn = durationMin > infoTimeLimit
      }
    }

    // REGRA: o vendedor só VOLTA para a fila principal quando ZERAR a fila
    // individual. Se ainda há clientes na fila individual dele, ele NÃO retorna
    // à rotação — em vez disso, o próximo item é CHAMADO (toca p/ aceitar) logo
    // abaixo. Conta os itens ainda aguardando (o item deste atendimento já está
    // CHAMADO/EM_ATENDIMENTO, então não entra nessa contagem).
    const pendingPersonalCount = await prisma.agentPersonalQueueItem.count({
      where: { tenantId, unitId: att.unitId, agentUserId: att.sellerId, status: 'AGUARDANDO' },
    }).catch(() => 0)
    const hasPendingPersonal = pendingPersonalCount > 0

    await prisma.$transaction(async (tx) => {
      await tx.sellerQueueAttendance.update({
        where: { id: att.id },
        data: {
          status: 'FINISHED', finishedAt: new Date(),
          type: d.type as SellerAttendanceType, result: d.result as SellerAttendanceResult,
          dealId: d.dealId ?? null, leadId: d.leadId ?? null, notes: d.notes ?? null,
        },
      })
      if (hasPendingPersonal) {
        // NÃO volta p/ a fila principal (ainda tem cliente na fila individual).
        // Só contabiliza o atendimento; o próximo item vai TOCAR abaixo.
        await tx.sellerQueueEntry.updateMany({ where: { queueId: att.queueId, sellerId: att.sellerId }, data: { attendanceCount: { increment: 1 }, lastActiveAt: new Date() } })
      } else if (consumesTurn) {
        // "Consome a vez": vai ao FIM da fila (padrão).
        await moveEntryToEnd(tx, att.queueId, att.sellerId, { countAttendance: true })
      } else {
        // Tipo que NÃO consome → volta a AGUARDAR mantendo a posição.
        await tx.sellerQueueEntry.updateMany({ where: { queueId: att.queueId, sellerId: att.sellerId, status: { in: ['IN_ATTENDANCE', 'CALLED'] } }, data: { status: 'WAITING', pausedAt: null, lastActiveAt: new Date() } })
      }
      if (att.arrivalId) await tx.sellerQueueCustomerArrival.update({ where: { id: att.arrivalId }, data: { status: 'DONE' } })
    })

    let out: { leadId?: string | null; dealId?: string | null; customerId?: string | null } | null = null

    if (allowBypassCustomer && !hasCustomer) {
      await logQueueEvent({
        tenantId,
        unitId: att.unitId,
        queueId: att.queueId,
        type: 'ATTENDANCE_FINISHED',
        sellerId: att.sellerId,
        actorId: user.id,
        arrivalId: att.arrivalId,
        attendanceId: att.id,
        reason: 'Informação rápida finalizada sem cadastro de cliente conforme configuração da fila'
      })
    } else {
      await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'ATTENDANCE_FINISHED', sellerId: att.sellerId, actorId: user.id, arrivalId: att.arrivalId, attendanceId: att.id, reason: d.result })
      if (consumesTurn) await logQueueEvent({ tenantId, unitId: att.unitId, queueId: att.queueId, type: 'MOVED_TO_END', sellerId: att.sellerId, actorId: user.id, attendanceId: att.id })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'FINISH', entity: 'SellerQueueAttendance', entityId: att.id, userName: user.name, userRole: user.role })

      // Gera/reaproveita o lead (sem duplicar), acha-ou-cria o cliente e — se
      // virou negociação — cria a negociação (Deal RASCUNHO) e linka tudo.
      out = await ensureAttendanceLead({
        tenantId, unitId: att.unitId, sellerId: att.sellerId, actorId: user.id,
        attendanceId: att.id, arrivalId: att.arrivalId, result: d.result, attendanceType: d.type,
        dealId: d.dealId ?? null, notes: d.notes ?? null,
        existingLeadId: d.leadId ?? null, existingCustomerId: d.customerId ?? null,
        customerName: d.customerName ?? null, customerPhone: d.customerPhone ?? null, customerEmail: d.customerEmail ?? null,
      }).catch(() => null)
      if (out) {
        await prisma.sellerQueueAttendance.update({ where: { id: att.id }, data: { leadId: out.leadId, dealId: out.dealId, customerId: out.customerId } }).catch(() => {})
      }
    }

    // Fila individual: conclui o item ligado a este atendimento (se houver).
    await concludePersonalItemByAttendance(att.id).catch(() => {})

    // REGRA: se ainda há clientes na fila individual, TOCA para o vendedor aceitar
    // o PRÓXIMO (não volta à fila principal). Só zerando a fila individual é que
    // ele retorna à rotação (já tratado acima no update da entry).
    let nextPersonalCalled = false
    if (hasPendingPersonal) {
      const next = await callNextPersonalItem({ tenantId, unitId: att.unitId, agentUserId: att.sellerId, actorId: user.id }).catch(() => ({ called: false }))
      nextPersonalCalled = next.called
    }
    const personalQueuePending = await listPersonalQueueForAgent(tenantId, att.unitId, att.sellerId).then((l) => l.length).catch(() => 0)

    return NextResponse.json({ success: true, data: { leadId: out?.leadId ?? null, dealId: out?.dealId ?? null, customerId: out?.customerId ?? null, personalQueuePending, nextPersonalCalled } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
