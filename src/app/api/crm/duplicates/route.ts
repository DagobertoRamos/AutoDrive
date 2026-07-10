// =============================================================================
// CRM F2 — Fila de revisão de DUPLICIDADES (candidatos à mesclagem, modo alerta).
// GET lista os PENDING da loja, enriquecido com os dois leads. Gate: gestor+.
// (A mesclagem em si é fase posterior; aqui é só revisão/dispensa.)
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return forbiddenResponse('Sem permissão para revisar duplicidades.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const rows = await prisma.crmMergeCandidate.findMany({
    where: { tenantId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }).catch(() => [] as never[])
  if (!rows.length) return NextResponse.json({ success: true, data: [] })

  const leadIds = Array.from(new Set(rows.flatMap((r) => [r.leadId, r.matchedLeadId].filter(Boolean)))) as string[]
  const leads = await prisma.marketingLead.findMany({ where: { id: { in: leadIds }, tenantId }, select: { id: true, name: true, phone: true, email: true, status: true, source: true } }).catch(() => [])
  const byId = new Map(leads.map((l) => [l.id, l]))

  const data = rows.map((r) => ({
    id: r.id,
    matchType: r.matchType,
    reason: r.reason,
    createdAt: r.createdAt,
    lead: byId.get(r.leadId) ?? { id: r.leadId },
    matchedLead: r.matchedLeadId ? byId.get(r.matchedLeadId) ?? { id: r.matchedLeadId } : null,
  }))
  return NextResponse.json({ success: true, data })
}
