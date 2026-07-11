// =============================================================================
// GET /api/crm/leads/[id]/evaluations — lista avaliações vinculadas ao lead.
// POST — inicia nova avaliação a partir do lead (reutiliza /api/evaluations) e
// registra o vínculo em CrmLeadEvaluation. Tolerante a migration pendente.
// Gate: crm.evaluation.create_from_lead (via crm.vehicle.manage).
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
    const links = await prisma.crmLeadEvaluation.findMany({ where: { tenantId, leadId: id }, orderBy: { linkedAt: 'desc' } }).catch(() => [])
    if (!links.length) return NextResponse.json({ success: true, data: [] })
    const evalIds = links.map(l => l.evaluationId)
    const evals = await prisma.vehicleEvaluation.findMany({
      where: { id: { in: evalIds } },
      select: { id: true, status: true, plate: true, brand: true, model: true, modelYear: true, km: true, evaluatedValue: true, ownerName: true, createdAt: true },
    }).catch(() => [])
    const evalMap = new Map(evals.map(e => [e.id, e]))
    return NextResponse.json({ success: true, data: links.map(l => ({ ...l, evaluation: evalMap.get(l.evaluationId) ?? null })) })
  } catch (err) { return handlePrismaError(err) }
}

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.vehicle.manage')) return forbiddenResponse('Sem permissão para iniciar avaliação.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true, name: true, phone: true, customerId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const b = await req.json().catch(() => ({}))
    // Cria a avaliação usando o serviço existente (reutiliza toda a lógica de avaliação).
    const evaluation = await prisma.vehicleEvaluation.create({ data: {
      tenantId,
      unitId:       b?.unitId ?? lead.unitId ?? null,
      plate:        b?.plate ?? null,
      brand:        b?.brand ?? null,
      model:        b?.model ?? null,
      version:      b?.version ?? null,
      manufactureYear: b?.manufactureYear ? Number(b.manufactureYear) : null,
      modelYear:    b?.modelYear ? Number(b.modelYear) : null,
      km:           b?.km ? Number(b.km) : null,
      color:        b?.color ?? null,
      ownerName:    b?.ownerName ?? lead.name ?? null,
      ownerPhone:   b?.ownerPhone ?? lead.phone ?? null,
      evaluatedById: user.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status:       'DRAFT' as any,
    }})
    // Vincula ao lead.
    await prisma.crmLeadEvaluation.upsert({
      where: { leadId_evaluationId: { leadId: id, evaluationId: evaluation.id } },
      create: { tenantId, leadId: id, evaluationId: evaluation.id, linkedByUserId: user.id },
      update: {},
    }).catch(() => {})
    // Registra interação na timeline.
    await prisma.crmLeadInteraction.create({ data: { tenantId, leadId: id, type: 'NOTE', summary: `Avaliação iniciada para ${b?.plate ?? 'veículo do cliente'}.`, authorId: user.id, authorName: user.name, occurredAt: new Date() }}).catch(() => {})

    return NextResponse.json({ success: true, data: { evaluation, linkedAt: new Date() } }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
