// =============================================================================
// GET/POST /api/crm/leads/[id]/visits — Visitas agendadas do lead.
// GET: lista todas. POST: agenda nova. Tolerante a migration pendente.
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
    const rows = await prisma.crmLeadVisit.findMany({ where: { tenantId, leadId: id }, orderBy: { scheduledAt: 'desc' }, take: 50 }).catch(() => [])
    return NextResponse.json({ success: true, data: rows })
  } catch (err) { return handlePrismaError(err) }
}

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.visit.manage')) return forbiddenResponse('Sem permissão para gerenciar visitas.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const b = await req.json().catch(() => ({}))
    if (!b?.scheduledAt) return NextResponse.json({ success: false, error: 'Informe a data e hora da visita.' }, { status: 400 })

    const visit = await prisma.crmLeadVisit.create({ data: {
      tenantId, leadId: id,
      unitId: b?.unitId ? String(b.unitId) : lead.unitId ?? null,
      hostUserId: b?.hostUserId ? String(b.hostUserId) : lead.assignedToUserId ?? null,
      scheduledAt: new Date(b.scheduledAt),
      durationMinutes: Number(b?.durationMinutes) || 60,
      status: 'SCHEDULED', objective: b?.objective ? String(b.objective).trim() : null,
      vehicleRef: b?.vehicleRef ? String(b.vehicleRef).trim() : null,
      clientConfirmed: Boolean(b?.clientConfirmed),
      notes: b?.notes ? String(b.notes).trim() : null,
      createdByUserId: user.id,
    }})
    return NextResponse.json({ success: true, data: visit }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
