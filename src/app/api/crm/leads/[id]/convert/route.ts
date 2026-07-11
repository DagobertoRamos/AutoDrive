// =============================================================================
// POST /api/crm/leads/[id]/convert — Marcar lead como CONVERTIDO (sucesso).
// Significa conversão em negociação, NÃO libera comissão/ranking.
// Body: { dealId?, note? }  — dealId pode ser omitido com permissão especial.
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
  if (!await canAccessModuleForUser(user, 'crm.lead.convert')) return forbiddenResponse('Sem permissão para converter lead.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true, status: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')
    if (lead.status === 'CONVERTED') return NextResponse.json({ success: false, error: 'Lead já convertido.' }, { status: 409 })

    const b = await req.json().catch(() => ({}))
    const dealId = b?.dealId ? String(b.dealId) : null
    const note   = b?.note   ? String(b.note).trim()   : null

    const now = new Date()
    await prisma.marketingLead.update({ where: { id }, data: { status: 'CONVERTED' as never, convertedDealId: dealId ?? undefined, convertedAt: now, lastContactAt: now } })
    if (dealId) {
      await prisma.crmLeadDeal.upsert({ where: { leadId_dealId: { leadId: id, dealId } }, create: { tenantId, leadId: id, dealId, isPrimary: true, linkedByUserId: user.id }, update: { isPrimary: true } }).catch(() => {})
    }
    await prisma.crmLeadInteraction.create({ data: { tenantId, leadId: id, type: 'NOTE', result: 'CONVERTED', summary: note ?? `Lead convertido${dealId ? ` — negociação ${dealId.slice(-8)}` : ''}.`, authorId: user.id, authorName: user.name, occurredAt: now }}).catch(() => {})
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CONVERT', entity: 'MarketingLead', entityId: id, userName: user.name, userRole: user.role, afterData: { dealId, note } })
    return NextResponse.json({ success: true })
  } catch (err) { return handlePrismaError(err) }
}
