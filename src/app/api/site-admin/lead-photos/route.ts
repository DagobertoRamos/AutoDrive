// GET /api/site-admin/lead-photos?leadId= — fotos que o cliente enviou pelo site
// (pré-avaliação). Mesma regra de acesso do lead no CRM (escopo todos/unidade/próprios).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const scope = await resolveCrmScope(user)
  if (!scope) return forbiddenResponse('Sem acesso aos leads do CRM.')
  const leadId = new URL(req.url).searchParams.get('leadId') ?? ''
  const lead = await prisma.marketingLead.findFirst({ where: { id: leadId, tenantId }, select: { assignedToUserId: true, unitId: true, metadata: true } }).catch(() => null)
  if (!lead || !canAccessLeadByScope(scope, user, lead)) return NextResponse.json({ success: true, data: [] })
  const meta = (lead.metadata && typeof lead.metadata === 'object' ? lead.metadata : {}) as { sitePhotos?: unknown }
  const ids = Array.isArray(meta.sitePhotos) ? meta.sitePhotos.filter((x): x is string => typeof x === 'string') : []
  return NextResponse.json({ success: true, data: ids.map((id) => ({ id, url: `/api/site-admin/lead-photos/${id}` })) })
}
