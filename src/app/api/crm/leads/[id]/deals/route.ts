// =============================================================================
// GET/POST /api/crm/leads/[id]/deals — Negociações vinculadas ao lead (N:M).
// GET: lista com detalhes do Deal. POST: vincula negociação existente.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const links = await prisma.crmLeadDeal.findMany({ where: { tenantId, leadId: id }, orderBy: [{ isPrimary: 'desc' }, { linkedAt: 'desc' }] }).catch(() => [])
    if (!links.length) return NextResponse.json({ success: true, data: [] })
    const dealIds = links.map(l => l.dealId)
    const deals = await prisma.deal.findMany({ where: { id: { in: dealIds }, tenantId }, select: { id: true, dealNumber: true, status: true, type: true, createdAt: true } }).catch(() => [])
    const dealMap = new Map(deals.map(d => [d.id, d]))
    const data = links.map(l => ({ ...l, deal: dealMap.get(l.dealId) ?? null }))
    return NextResponse.json({ success: true, data })
  } catch (err) { return handlePrismaError(err) }
}

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.deal.link')) return forbiddenResponse('Sem permissão para vincular negociações.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const b = await req.json().catch(() => ({}))
    const dealId = b?.dealId ? String(b.dealId) : ''
    if (!dealId) return NextResponse.json({ success: false, error: 'Informe o ID da negociação.' }, { status: 400 })
    const deal = await prisma.deal.findFirst({ where: { id: dealId, tenantId }, select: { id: true, dealNumber: true, status: true } })
    if (!deal) return NextResponse.json({ success: false, error: 'Negociação não encontrada nesta loja.' }, { status: 404 })

    const link = await prisma.crmLeadDeal.upsert({
      where: { leadId_dealId: { leadId: id, dealId } },
      create: { tenantId, leadId: id, dealId, isPrimary: Boolean(b?.isPrimary), linkedByUserId: user.id },
      update: { isPrimary: Boolean(b?.isPrimary) },
    })
    return NextResponse.json({ success: true, data: { ...link, deal } }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
