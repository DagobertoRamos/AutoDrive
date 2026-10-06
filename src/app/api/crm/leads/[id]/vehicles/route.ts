// =============================================================================
// GET/POST /api/crm/leads/[id]/vehicles — Veículos de interesse do lead (N:M).
// GET: lista todos (incluindo removidos). POST: { vehicleId } (estoque) ou
// { brand, model, year } (fora do estoque) — regras em lib/crm/lead-vehicles.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'
import { addManualInterest, addStockInterest } from '@/lib/crm/lead-vehicles'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const includeRemoved = new URL(req.url).searchParams.get('includeRemoved') === '1'
    const rows = await prisma.crmLeadVehicle.findMany({
      where: { tenantId, leadId: id, ...(includeRemoved ? {} : { removedAt: null }) },
      orderBy: [{ isPrimary: 'desc' }, { addedAt: 'asc' }],
    }).catch(() => [])
    return NextResponse.json({ success: true, data: rows })
  } catch (err) { return handlePrismaError(err) }
}

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.vehicle.manage')) return forbiddenResponse('Sem permissão.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const lead = await prisma.marketingLead.findFirst({ where: { id, tenantId }, select: { id: true, assignedToUserId: true, unitId: true } })
    if (!lead) return NextResponse.json({ success: false, error: 'Lead não encontrado.' }, { status: 404 })
    const scope = await resolveCrmScope(user)
    if (!scope || !canAccessLeadByScope(scope, user, lead)) return forbiddenResponse('Sem acesso a este lead.')

    const b = await req.json().catch(() => ({}))
    const vehicleId = b?.vehicleId ? String(b.vehicleId) : null
    const model = String(b?.model ?? '').trim()
    if (!vehicleId && !model) return NextResponse.json({ success: false, error: 'Informe o modelo.' }, { status: 400 })
    const year = Number(b?.year)
    const entry = vehicleId
      ? await addStockInterest(tenantId, id, vehicleId, user.id)
      : await addManualInterest(tenantId, id, { brand: b?.brand ? String(b.brand) : null, model, year: Number.isInteger(year) && year > 1900 && year < 2100 ? year : null }, user.id)
    if (!entry) return NextResponse.json({ success: false, error: 'Veículo não encontrado no estoque.' }, { status: 404 })
    return NextResponse.json({ success: true, data: entry }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
