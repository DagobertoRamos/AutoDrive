// =============================================================================
// GET/POST /api/crm/leads/[id]/vehicles — Veículos de interesse do lead (N:M).
// GET: lista todos (incluindo removidos). POST: adiciona novo interesse.
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

    // Se vinculado a veículo, busca snapshot do estoque.
    let snapshot: { brand?: string|null; model?: string|null; version?: string|null; year?: number|null; plate?: string|null } = {}
    if (vehicleId) {
      const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: { brand: true, model: true, version: true, modelYear: true, plate: true } }).catch(() => null)
      if (v) snapshot = { brand: v.brand, model: v.model, version: v.version, year: v.modelYear, plate: v.plate }
    }

    const entry = await prisma.crmLeadVehicle.create({ data: {
      tenantId, leadId: id, vehicleId,
      brand: b?.brand ?? snapshot?.brand ?? null, model: b?.model ?? snapshot?.model ?? null,
      version: b?.version ?? snapshot?.version ?? null, year: b?.year ?? snapshot?.year ?? null,
      plate: b?.plate ?? snapshot?.plate ?? null, priceViewed: b?.priceViewed ?? null,
      interest: b?.interest ?? 'PRIMARY', status: 'INTERESTED',
      role: ['COMPRA','TROCA','VENDA','CONSIGNACAO','AVALIACAO'].includes(String(b?.role ?? '')) ? String(b.role) : 'COMPRA',
      isPrimary: Boolean(b?.isPrimary), notes: b?.notes ? String(b.notes).trim() : null,
      addedByUserId: user.id,
    }})
    return NextResponse.json({ success: true, data: entry }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
