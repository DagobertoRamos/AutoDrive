// =============================================================================
// PATCH /api/crm/leads/[id]/visits/[visitId]
// Ações no ciclo de vida da visita. Body: { action, ...campos }
//   confirm     → CONFIRMED (clientConfirmed=true)
//   reschedule  → RESCHEDULED (nova scheduledAt + motivo; incrementa rescheduleCount)
//   cancel      → CANCELLED (cancelReason)
//   arrive      → "cliente chegou" (registra interação, mantém status)
//   complete    → COMPLETED (completedAt + notas)
//   no_show     → NO_SHOW (registra no histórico, gera interação)
//   update      → atualiza campos livres (sem mudar status)
// Tolerante a migration pendente. Gate: crm.visit.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

const ACTIONS = new Set(['confirm','reschedule','cancel','arrive','complete','no_show','update'])

export async function PATCH(
  req: Request,
  ctxArg: { params: { id: string; visitId: string } | Promise<{ id: string; visitId: string }> }
) {
  const { id: leadId, visitId } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.visit.manage')) return forbiddenResponse('Sem permissão para gerenciar visitas.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const visit = await prisma.crmLeadVisit.findFirst({ where: { id: visitId, tenantId, leadId } })
    if (!visit) return NextResponse.json({ success: false, error: 'Visita não encontrada.' }, { status: 404 })

    const b = await req.json().catch(() => ({}))
    const action: string = typeof b?.action === 'string' ? b.action : 'update'
    if (!ACTIONS.has(action)) return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })

    const now = new Date()
    let updateData: Record<string, unknown> = {}
    let interactionType: string | null = null
    let interactionSummary: string | null = null

    switch (action) {
      case 'confirm':
        if (!['SCHEDULED','RESCHEDULED'].includes(visit.status))
          return NextResponse.json({ success: false, error: 'Só é possível confirmar visitas agendadas.' }, { status: 409 })
        updateData = { status: 'CONFIRMED', clientConfirmed: true }
        break

      case 'reschedule': {
        if (['COMPLETED','NO_SHOW','CANCELLED'].includes(visit.status))
          return NextResponse.json({ success: false, error: 'Não é possível reagendar esta visita.' }, { status: 409 })
        if (!b?.scheduledAt)
          return NextResponse.json({ success: false, error: 'Informe a nova data e hora.' }, { status: 400 })
        updateData = {
          status: 'RESCHEDULED',
          scheduledAt: new Date(b.scheduledAt),
          rescheduleCount: visit.rescheduleCount + 1,
          notes: b?.reason ? `[Reagendamento ${visit.rescheduleCount + 1}] ${String(b.reason).trim()}\n${visit.notes ?? ''}`.trim() : visit.notes,
          clientConfirmed: false,
        }
        interactionType = 'VISIT'
        interactionSummary = `Visita reagendada para ${new Date(b.scheduledAt).toLocaleString('pt-BR')}. ${b?.reason ?? ''}`
        break
      }

      case 'cancel':
        if (['COMPLETED','NO_SHOW','CANCELLED'].includes(visit.status))
          return NextResponse.json({ success: false, error: 'Visita já encerrada.' }, { status: 409 })
        updateData = { status: 'CANCELLED', cancelReason: b?.reason ? String(b.reason).trim() : null }
        interactionType = 'VISIT'
        interactionSummary = `Visita cancelada. ${b?.reason ?? ''}`
        break

      case 'arrive':
        // Cliente chegou: apenas registra interação, não muda o status da visita.
        interactionType = 'ATTENDANCE'
        interactionSummary = `Cliente chegou para a visita agendada${visit.vehicleRef ? ` — ${visit.vehicleRef}` : ''}.`
        break

      case 'complete':
        if (!['SCHEDULED','CONFIRMED','RESCHEDULED'].includes(visit.status))
          return NextResponse.json({ success: false, error: 'Visita não está ativa para ser concluída.' }, { status: 409 })
        updateData = { status: 'COMPLETED', completedAt: now, notes: b?.notes ? String(b.notes).trim() : visit.notes }
        interactionType = 'VISIT'
        interactionSummary = `Visita concluída.${b?.notes ? ' ' + String(b.notes).trim() : ''}`
        break

      case 'no_show':
        if (!['SCHEDULED','CONFIRMED','RESCHEDULED'].includes(visit.status))
          return NextResponse.json({ success: false, error: 'Visita não está ativa.' }, { status: 409 })
        updateData = { status: 'NO_SHOW', notes: `[Não compareceu] ${visit.notes ?? ''}`.trim() }
        interactionType = 'VISIT'
        interactionSummary = `Cliente não compareceu à visita agendada para ${visit.scheduledAt.toLocaleString('pt-BR')}.`
        break

      case 'update':
        if (b?.scheduledAt) updateData.scheduledAt = new Date(b.scheduledAt)
        if (b?.objective  !== undefined) updateData.objective  = String(b.objective ?? '').trim() || null
        if (b?.vehicleRef !== undefined) updateData.vehicleRef = String(b.vehicleRef ?? '').trim() || null
        if (b?.notes      !== undefined) updateData.notes      = String(b.notes ?? '').trim() || null
        if (b?.hostUserId !== undefined) updateData.hostUserId = String(b.hostUserId ?? '') || null
        if (b?.unitId     !== undefined) updateData.unitId     = String(b.unitId ?? '') || null
        if (b?.durationMinutes !== undefined) updateData.durationMinutes = Number(b.durationMinutes) || 60
        break
    }

    // Aplica a alteração (tolerante: se a tabela não existe, trata o erro).
    const updated = Object.keys(updateData).length
      ? await prisma.crmLeadVisit.update({ where: { id: visitId }, data: updateData })
      : visit

    // Registra interação na linha do tempo quando faz sentido.
    if (interactionType) {
      await prisma.crmLeadInteraction.create({ data: {
        tenantId, leadId, type: interactionType, result: action.toUpperCase(),
        summary: interactionSummary, authorId: user.id, authorName: user.name,
        occurredAt: now,
      }}).catch(() => {})
      // Atualiza lastContactAt do lead.
      await prisma.marketingLead.update({ where: { id: leadId }, data: { lastContactAt: now } }).catch(() => {})
    }

    await createSafeAuditLog({ userId: user.id, tenantId, action: `VISIT_${action.toUpperCase()}`, entity: 'CrmLeadVisit', entityId: visitId, userName: user.name, userRole: user.role }).catch(() => {})

    // Notifica o anfitrião em reagendamentos e cancelamentos.
    if (['reschedule','cancel'].includes(action) && visit.hostUserId && visit.hostUserId !== user.id) {
      const msgs: Record<string,string> = { reschedule: 'Uma visita foi reagendada.', cancel: 'Uma visita foi cancelada.' }
      await prisma.notification.create({ data: { userId: visit.hostUserId, tenantId, type: 'INFO', title: msgs[action] ?? 'Atualização de visita', message: interactionSummary ?? '', actionUrl: `/crm/leads/${leadId}` } }).catch(() => {})
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(
  req: Request,
  ctxArg: { params: { id: string; visitId: string } | Promise<{ id: string; visitId: string }> }
) {
  const { id: leadId, visitId } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.visit.manage')) return forbiddenResponse('Sem permissão.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const visit = await prisma.crmLeadVisit.findFirst({ where: { id: visitId, tenantId, leadId } })
    if (!visit) return NextResponse.json({ success: false, error: 'Visita não encontrada.' }, { status: 404 })
    if (['COMPLETED','NO_SHOW'].includes(visit.status))
      return NextResponse.json({ success: false, error: 'Não é possível excluir uma visita já concluída — use cancelar.' }, { status: 409 })
    await prisma.crmLeadVisit.delete({ where: { id: visitId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
