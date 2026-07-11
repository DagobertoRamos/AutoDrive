// =============================================================================
// GET/POST /api/crm/leads/[id]/interactions — Interações do lead (ligações,
// WhatsApp, notas, propostas, visitas, etc.). Paginado. Gate: crm.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

const VALID_TYPES = ['CALL','WHATSAPP','EMAIL','NOTE','VISIT','PROPOSAL','FINANCING','NEGOTIATION','ATTENDANCE','RETURN','NO_CONTACT','OTHER']

export async function GET(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const sp = new URL(req.url).searchParams
    const page = Math.max(1, Number(sp.get('page') ?? 1))
    const perPage = Math.min(50, Math.max(1, Number(sp.get('perPage') ?? 20)))
    const [total, rows] = await Promise.all([
      prisma.crmLeadInteraction.count({ where: { tenantId, leadId: id } }).catch(() => 0),
      prisma.crmLeadInteraction.findMany({ where: { tenantId, leadId: id }, orderBy: { occurredAt: 'desc' }, skip: (page - 1) * perPage, take: perPage }).catch(() => []),
    ])
    return NextResponse.json({ success: true, data: rows, meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) } })
  } catch (err) { return handlePrismaError(err) }
}

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.interaction.create')) return forbiddenResponse('Sem permissão para registrar interações.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const b = await req.json().catch(() => ({}))
    const type = VALID_TYPES.includes(String(b?.type ?? '').toUpperCase()) ? String(b.type).toUpperCase() : 'NOTE'
    const occurredAt = b?.occurredAt ? new Date(b.occurredAt) : new Date()
    const summary = String(b?.summary ?? '').trim() || null
    const nextActionAt = b?.nextActionAt ? new Date(b.nextActionAt) : null

    const interaction = await prisma.crmLeadInteraction.create({ data: {
      tenantId, leadId: id, type, channel: b?.channel ? String(b.channel) : null,
      result: b?.result ? String(b.result) : null, summary, objections: b?.objections ? String(b.objections).trim() : null,
      nextAction: b?.nextAction ? String(b.nextAction).trim() : null, nextActionAt, nextActionUserId: b?.nextActionUserId ?? null,
      discussedVehicle: b?.discussedVehicle ? String(b.discussedVehicle).trim() : null,
      authorId: user.id, authorName: user.name, occurredAt,
    }})
    // Atualiza lastContactAt do lead se a interação for relevante.
    await prisma.marketingLead.update({ where: { id }, data: { lastContactAt: occurredAt } }).catch(() => {})
    return NextResponse.json({ success: true, data: interaction }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
