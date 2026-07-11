// =============================================================================
// POST /api/crm/leads/[id]/transfer — Transfere o lead para outro responsável.
// Regras: o vendedor pode transferir o PRÓPRIO lead (crm.lead.transfer.own);
// gerente+ pode transferir qualquer lead do escopo (crm.lead.transfer).
// Body: { toUserId, reason, note?, transferTasks?, transferVisits? }
// Grava evento de auditoria + notifica o novo responsável.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'
import { prisma as db } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const TRANSFER_REASONS = ['CLIENT_REQUEST','SELLER_EXPERTISE','ABSENCE','UNIT_CHANGE','OVERLOAD','ONGOING_NEGOTIATION','DISTRIBUTION_ERROR','MANAGEMENT_REQUEST','OTHER']

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const lead = await db.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true, name: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })

    // Autorização dupla:
    // (a) usuário transfere o próprio lead (crm.lead.transfer.own) OU
    // (b) gerente+ transfere qualquer lead do escopo (crm.lead.transfer).
    const isOwner = lead.assignedToUserId === user.id
    const canTransferOwn  = await canAccessModuleForUser(user, 'crm.lead.transfer.own')
    const canTransferUnit = await canAccessModuleForUser(user, 'crm.lead.transfer')
    const scope = await resolveCrmScope(user)
    const inScope = scope && canAccessLeadByScope(scope, user, lead)

    if (isOwner && canTransferOwn) { /* ok */ }
    else if (canTransferUnit && inScope) { /* ok */ }
    else return forbiddenResponse('Sem permissão para transferir este lead.')

    const body = await req.json().catch(() => ({}))
    const toUserId: string = typeof body?.toUserId === 'string' ? body.toUserId.trim() : ''
    const reason: string   = typeof body?.reason   === 'string' ? body.reason.trim()   : ''
    const note: string     = typeof body?.note     === 'string' ? body.note.trim()     : ''
    const transferTasks    = body?.transferTasks !== false
    const transferVisits   = body?.transferVisits !== false

    if (!toUserId) return NextResponse.json({ success: false, error: 'Informe o novo responsável.' }, { status: 400 })
    if (!reason) return NextResponse.json({ success: false, error: 'Informe o motivo da transferência.' }, { status: 400 })
    if (toUserId === user.id && lead.assignedToUserId === user.id)
      return NextResponse.json({ success: false, error: 'O destinatário é o mesmo responsável atual.' }, { status: 400 })

    // Valida o destinatário (ativo, mesmo tenant, cargo elegível).
    const dest = await db.user.findFirst({ where: { id: toUserId, tenantId, status: 'ATIVO' }, select: { id: true, name: true, role: true } })
    if (!dest) return NextResponse.json({ success: false, error: 'Destinatário inválido ou inativo nesta loja.' }, { status: 400 })

    const prevOwnerId = lead.assignedToUserId
    const now = new Date()

    await db.$transaction(async (tx) => {
      // Atualiza o responsável do lead.
      await tx.marketingLead.update({ where: { id }, data: { assignedToUserId: toUserId, lastContactAt: now } })
      // Registra atribuição (fonte de verdade de histórico de responsáveis).
      await tx.marketingLeadAssignment.create({ data: { tenantId, leadId: id, assignedToUserId: toUserId, assignedByUserId: user.id, mode: 'MANUAL', status: 'ASSIGNED', reason } })
      // Transfere tarefas abertas.
      if (transferTasks) {
        await tx.marketingLeadTask.updateMany({ where: { leadId: id, status: 'PENDING', assignedToUserId: prevOwnerId ?? undefined }, data: { assignedToUserId: toUserId } })
      }
      // Transfere visitas futuras.
      if (transferVisits) {
        await tx.crmLeadVisit.updateMany({ where: { leadId: id, tenantId, status: { in: ['SCHEDULED','CONFIRMED'] }, hostUserId: prevOwnerId ?? undefined }, data: { hostUserId: toUserId } }).catch(() => {})
      }
    })

    // Notifica o novo responsável.
    await db.notification.create({ data: { userId: toUserId, tenantId, type: 'NOVA_PENDENCIA', title: 'Lead transferido para você', message: `${user.name} transferiu o lead${lead.name ? ' de ' + lead.name : ''} para você. Motivo: ${reason}`, actionUrl: `/crm/leads/${id}` } }).catch(() => {})
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'TRANSFER', entity: 'MarketingLead', entityId: id, userName: user.name, userRole: user.role, afterData: { toUserId, reason, note, prevOwnerId, transferTasks, transferVisits } })

    return NextResponse.json({ success: true, data: { toUserId, toUserName: dest.name, prevOwnerId } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
