// =============================================================================
// POST /api/crm/leads/[id]/archive — Arquivar lead (soft: status=DISCARDED + flag).
// O lead sai do Kanban mas permanece pesquisável. Gate: crm.lead.archive.
// Body: { reason }
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
  if (!await canAccessModuleForUser(user, 'crm.lead.archive')) return forbiddenResponse('Sem permissão para arquivar.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true, status: true, convertedDealId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')
    if (lead.convertedDealId) return NextResponse.json({ success: false, error: 'Este lead tem negociação vinculada. Considere marcar como sucesso em vez de arquivar.' }, { status: 409 })

    const b = await req.json().catch(() => ({}))
    const reason = String(b?.reason ?? '').trim()
    if (!reason) return NextResponse.json({ success: false, error: 'Informe o motivo do arquivamento.' }, { status: 400 })

    const now = new Date()
    // Arquivamento usa metadata para distinguir de "DISCARDED" normal.
    const currentMeta = (lead as { metadata?: Record<string,unknown> }).metadata ?? {}
    await prisma.marketingLead.update({ where: { id }, data: {
      status: 'DISCARDED' as never,
      lostReason: `[ARQUIVADO] ${reason}`,
      lastContactAt: now,
      metadata: { ...(typeof currentMeta === 'object' ? currentMeta : {}), archived: true, archivedAt: now.toISOString(), archivedBy: user.id, archiveReason: reason } as never,
    }})
    await prisma.crmLeadInteraction.create({ data: { tenantId, leadId: id, type: 'NOTE', result: 'ARCHIVED', summary: `Lead arquivado: ${reason}`, authorId: user.id, authorName: user.name, occurredAt: now }}).catch(() => {})
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'ARCHIVE', entity: 'MarketingLead', entityId: id, userName: user.name, userRole: user.role, afterData: { reason } })
    return NextResponse.json({ success: true })
  } catch (err) { return handlePrismaError(err) }
}
