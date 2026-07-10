// =============================================================================
// CRM F1 — Etiquetas de um LEAD (N:N). POST { tagId } aplica · DELETE ?tagId=
// remove. Gate: crm + escopo do lead (own/unit/all). Tenant-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { resolveCrmScope, canAccessLeadByScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

async function loadLead(req: Request, leadId: string) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  if (!await canAccessModuleForUser(user, 'crm')) return { error: forbiddenResponse('Sem acesso ao CRM.') }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { error: forbiddenResponse(actingTenantError(user)) }
  const scope = await resolveCrmScope(user)
  if (!scope) return { error: forbiddenResponse('Sem acesso aos leads.') }
  const lead = await prisma.marketingLead.findFirst({ where: { id: leadId, tenantId }, select: { id: true, assignedToUserId: true, unitId: true } })
  if (!lead) return { error: NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 }) }
  if (!canAccessLeadByScope(scope, user, lead)) return { error: forbiddenResponse('Sem acesso a este lead.') }
  return { user, tenantId, lead }
}

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const g = await loadLead(req, id); if ('error' in g) return g.error
  try {
    const tagId = String((await req.json().catch(() => ({})))?.tagId ?? '')
    if (!tagId) return NextResponse.json({ success: false, error: 'Informe a etiqueta (tagId).' }, { status: 400 })
    const tag = await prisma.crmTag.findFirst({ where: { id: tagId, tenantId: g.tenantId, active: true }, select: { id: true } })
    if (!tag) return NextResponse.json({ success: false, error: 'Etiqueta inválida.' }, { status: 400 })
    await prisma.crmLeadTag.upsert({
      where: { leadId_tagId: { leadId: id, tagId } },
      create: { tenantId: g.tenantId, leadId: id, tagId, createdByUserId: g.user.id },
      update: {},
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const g = await loadLead(req, id); if ('error' in g) return g.error
  try {
    const tagId = new URL(req.url).searchParams.get('tagId') ?? ''
    if (!tagId) return NextResponse.json({ success: false, error: 'Informe a etiqueta (tagId).' }, { status: 400 })
    await prisma.crmLeadTag.deleteMany({ where: { leadId: id, tagId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
