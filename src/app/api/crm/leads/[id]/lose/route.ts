// =============================================================================
// POST /api/crm/leads/[id]/lose — Marcar lead como PERDIDO, DESQUALIFICADO ou RECICLADO.
// Body: { outcome: 'LOST'|'DISCARDED'|'RECYCLED', reason, note?, recycleAt?, competitor? }
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.lead.mark_lost')) return forbiddenResponse('Sem permissão.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true, status: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const b = await req.json().catch(() => ({}))
    const outcome: string = ['LOST','DISCARDED','RECYCLED'].includes(String(b?.outcome)) ? String(b.outcome) : 'LOST'
    const reason: string  = String(b?.reason ?? '').trim()
    if (!reason) return NextResponse.json({ success: false, error: 'Informe o motivo.' }, { status: 400 })

    const note     = b?.note     ? String(b.note).trim()     : null
    const competitor = b?.competitor ? String(b.competitor).trim() : null
    const recycleAt  = outcome === 'RECYCLED' && b?.recycleAt ? new Date(b.recycleAt) : null
    const now = new Date()

    await prisma.marketingLead.update({ where: { id }, data: {
      status: outcome as never, lostReason: [reason, competitor ? `Concorrente: ${competitor}` : '', note ?? ''].filter(Boolean).join(' | '),
      lastContactAt: now,
    }})
    await prisma.crmLeadInteraction.create({ data: { tenantId, leadId: id, type: 'NOTE', result: outcome, summary: `Lead ${outcome === 'LOST' ? 'perdido' : outcome === 'DISCARDED' ? 'desqualificado' : 'reciclado'}: ${reason}${competitor ? ' · Concorrente: ' + competitor : ''}${note ? ' · ' + note : ''}.`, authorId: user.id, authorName: user.name, occurredAt: now }}).catch(() => {})
    if (recycleAt) {
      await prisma.marketingLeadTask.create({ data: { tenantId, leadId: id, type: 'FOLLOW_UP', title: 'Retorno — cliente potencial para ciclo futuro', status: 'PENDING', dueAt: recycleAt, assignedToUserId: lead.assignedToUserId ?? undefined, createdById: user.id } }).catch(() => {})
    }
    await createSafeAuditLog({ userId: user.id, tenantId, action: outcome, entity: 'MarketingLead', entityId: id, userName: user.name, userRole: user.role, afterData: { reason, competitor, recycleAt } })
    return NextResponse.json({ success: true })
  } catch (err) { return handlePrismaError(err) }
}
