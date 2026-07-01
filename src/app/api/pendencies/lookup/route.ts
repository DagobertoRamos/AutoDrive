// =============================================================================
// GET /api/pendencies/lookup?plate=&negotiation= — busca dados para pré-preencher
// o cadastro da pendência a partir da PLACA (Vehicle) ou da NEGOCIAÇÃO (Deal).
// Retorna cliente, unidade, responsável (Seller.id) e o veículo, quando achar.
// Gate: pendencies. Tenant-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'pendencies')) return forbiddenResponse('Sem acesso às pendências.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const plate = (sp.get('plate') ?? '').trim().toUpperCase().replace(/\s+/g, '')
  const neg = (sp.get('negotiation') ?? '').trim()

  try {
    // 1) Por negociação (Deal): traz cliente, unidade e vendedor responsável.
    if (neg) {
      const deal = await prisma.deal.findFirst({
        where: { tenantId, dealNumber: { contains: neg, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, dealNumber: true, unitId: true, sellerId: true, type: true, customer: { select: { name: true } } },
      })
      if (deal) {
        return NextResponse.json({ success: true, data: { source: 'deal', dealId: deal.id, negotiation: deal.dealNumber, customerName: deal.customer?.name ?? null, unitId: deal.unitId ?? null, responsibleId: deal.sellerId ?? null, plate: null, vehicle: null } })
      }
    }
    // 2) Por placa (Vehicle): cliente, unidade e o veículo.
    if (plate) {
      const v = await prisma.vehicle.findFirst({
        where: { tenantId, plate },
        select: { plate: true, unitId: true, brand: true, model: true, customer: { select: { name: true } } },
      })
      if (v) {
        return NextResponse.json({ success: true, data: { source: 'vehicle', dealId: null, negotiation: null, customerName: v.customer?.name ?? null, unitId: v.unitId ?? null, responsibleId: null, plate: v.plate, vehicle: [v.brand, v.model].filter(Boolean).join(' ') || null } })
      }
    }
    return NextResponse.json({ success: true, data: null })
  } catch (err) {
    return handlePrismaError(err)
  }
}
