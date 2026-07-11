// =============================================================================
// GET/POST /api/crm/leads/[id]/summary — Resumo comercial estruturado do lead
// (versionado: cada POST cria nova versão, nunca sobrescreve). Gate: crm.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    // Retorna a versão mais recente + histórico de versões (só metadados).
    const [latest, history] = await Promise.all([
      prisma.crmLeadSummary.findFirst({ where: { tenantId, leadId: id }, orderBy: { version: 'desc' } }).catch(() => null),
      prisma.crmLeadSummary.findMany({ where: { tenantId, leadId: id }, orderBy: { version: 'desc' }, select: { id: true, version: true, authorId: true, authorName: true, createdAt: true }, take: 20 }).catch(() => []),
    ])
    return NextResponse.json({ success: true, data: { latest, history } })
  } catch (err) { return handlePrismaError(err) }
}

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const b = await req.json().catch(() => ({}))
    const maxVersion = await prisma.crmLeadSummary.aggregate({ where: { tenantId, leadId: id }, _max: { version: true } }).catch(() => ({ _max: { version: 0 } }))
    const nextVersion = (maxVersion._max.version ?? 0) + 1

    const summary = await prisma.crmLeadSummary.create({ data: {
      tenantId, leadId: id, version: nextVersion,
      objective: b?.objective ? String(b.objective).trim() : null,
      desiredVehicle: b?.desiredVehicle ? String(b.desiredVehicle).trim() : null,
      hasTradeIn: Boolean(b?.hasTradeIn),
      tradeInVehicle: b?.tradeInVehicle ? String(b.tradeInVehicle).trim() : null,
      tradeInValue: b?.tradeInValue ? (b.tradeInValue as Prisma.Decimal) : null,
      budget: b?.budget ? (b.budget as Prisma.Decimal) : null,
      downPayment: b?.downPayment ? (b.downPayment as Prisma.Decimal) : null,
      monthlyPayment: b?.monthlyPayment ? (b.monthlyPayment as Prisma.Decimal) : null,
      paymentMethod: b?.paymentMethod ? String(b.paymentMethod) : null,
      purchaseTimeline: b?.purchaseTimeline ? String(b.purchaseTimeline) : null,
      objections: b?.objections ? String(b.objections).trim() : null,
      competitors: b?.competitors ? String(b.competitors).trim() : null,
      narrative: b?.narrative ? String(b.narrative).trim() : null,
      authorId: user.id, authorName: user.name,
    }})
    return NextResponse.json({ success: true, data: summary }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
