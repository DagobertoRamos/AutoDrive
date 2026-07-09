// =============================================================================
// GET /api/pendencies/lookup?plate=&negotiation= — busca dados para pré-preencher
// o cadastro da pendência a partir da NEGOCIAÇÃO (Deal) ou da PLACA. A placa é
// normalizada (uppercase, sem hífen/espaço) e casada com equivalência antigo ⇄
// Mercosul; busca por placa também localiza a NEGOCIAÇÃO (via DealVehicle) para
// trazer o vendedor responsável. Ignora só negociações canceladas. Se o registro
// estiver em OUTRA unidade, ainda retorna e sinaliza (otherUnitName).
// Gate: pendencies. Tenant-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { normalizePlate, platePrefix, plateMatches } from '@/lib/plate'
import type { DealStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// Qualquer negociação que NÃO esteja cancelada é elegível (spec).
const EXCLUDED_DEAL_STATUS: DealStatus[] = ['CANCELADA']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'pendencies')) return forbiddenResponse('Sem acesso às pendências.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const plate = normalizePlate(sp.get('plate'))
  const neg = (sp.get('negotiation') ?? '').trim()

  // Nome da unidade do achado quando difere da unidade do usuário (aviso na UI).
  const otherUnit = async (unitId: string | null): Promise<string | null> => {
    if (!unitId || !user.unitId || unitId === user.unitId) return null
    const u = await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } })
    return u?.name ?? null
  }

  try {
    // 1) Por negociação (Deal.dealNumber): cliente, unidade e vendedor.
    if (neg) {
      const deal = await prisma.deal.findFirst({
        where: { tenantId, dealNumber: { contains: neg, mode: 'insensitive' }, status: { notIn: EXCLUDED_DEAL_STATUS } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, dealNumber: true, unitId: true, sellerId: true, customer: { select: { name: true } } },
      })
      if (deal) {
        return NextResponse.json({ success: true, data: { source: 'deal', dealId: deal.id, negotiation: deal.dealNumber, customerName: deal.customer?.name ?? null, unitId: deal.unitId ?? null, responsibleId: deal.sellerId ?? null, plate: null, vehicle: null, otherUnitName: await otherUnit(deal.unitId ?? null) } })
      }
    }

    // 2) Por placa: primeiro tenta a NEGOCIAÇÃO (traz responsável), depois o veículo.
    if (plate.length >= 2) {
      const prefix = platePrefix(plate)

      // 2a) DealVehicle.plate → Deal não cancelado. Pré-filtro barato por prefixo,
      // depois casamento robusto (normalizado + antigo⇄Mercosul) em memória.
      const dvs = await prisma.dealVehicle.findMany({
        where: { plate: { startsWith: prefix, mode: 'insensitive' }, deal: { tenantId, status: { notIn: EXCLUDED_DEAL_STATUS } } },
        orderBy: { deal: { createdAt: 'desc' } },
        select: { plate: true, brand: true, model: true, deal: { select: { id: true, dealNumber: true, unitId: true, sellerId: true, customer: { select: { name: true } } } } },
        take: 50,
      })
      const dv = dvs.find((d) => plateMatches(plate, d.plate))
      if (dv?.deal) {
        return NextResponse.json({ success: true, data: { source: 'deal', dealId: dv.deal.id, negotiation: dv.deal.dealNumber, customerName: dv.deal.customer?.name ?? null, unitId: dv.deal.unitId ?? null, responsibleId: dv.deal.sellerId ?? null, plate: normalizePlate(dv.plate), vehicle: [dv.brand, dv.model].filter(Boolean).join(' ') || null, otherUnitName: await otherUnit(dv.deal.unitId ?? null) } })
      }

      // 2b) Vehicle.plate (estoque/cadastro) — sem negociação vinculada.
      const vehicles = await prisma.vehicle.findMany({
        where: { tenantId, plate: { startsWith: prefix, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        select: { plate: true, unitId: true, brand: true, model: true, customer: { select: { name: true } } },
        take: 50,
      })
      const v = vehicles.find((x) => plateMatches(plate, x.plate))
      if (v) {
        return NextResponse.json({ success: true, data: { source: 'vehicle', dealId: null, negotiation: null, customerName: v.customer?.name ?? null, unitId: v.unitId ?? null, responsibleId: null, plate: normalizePlate(v.plate), vehicle: [v.brand, v.model].filter(Boolean).join(' ') || null, otherUnitName: await otherUnit(v.unitId ?? null) } })
      }
    }

    return NextResponse.json({ success: true, data: null })
  } catch (err) {
    return handlePrismaError(err)
  }
}
