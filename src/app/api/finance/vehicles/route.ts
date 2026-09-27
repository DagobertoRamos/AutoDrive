// =============================================================================
// GET /api/finance/vehicles?q=&pendentes=1 — Financeiro › Custos de veículos.
// Carros com lançamentos (compra, serviços, documentação, multas…): placa,
// veículo, negociação, total, pago, a pagar. Clique abre a conciliação.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canSeeVehicleFinance } from '@/lib/stock/vehicle-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canSeeVehicleFinance(user.role)) return forbiddenResponse()
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const sp = req.nextUrl.searchParams
    const q = (sp.get('q') ?? '').trim()
    const onlyPending = sp.get('pendentes') === '1'

    const grouped = await prisma.financialEntry.groupBy({
      by: ['vehicleId', 'status', 'type'],
      where: { ...tenantWhere(user.role, tenantId), vehicleId: { not: null } },
      _sum: { amount: true }, _count: { _all: true },
    })
    const byVehicle = new Map<string, { total: number; paid: number; pending: number; revenue: number; count: number; pendingCount: number }>()
    for (const r of grouped) {
      if (!r.vehicleId || r.status === 'CANCELADO') continue
      const cur = byVehicle.get(r.vehicleId) ?? { total: 0, paid: 0, pending: 0, revenue: 0, count: 0, pendingCount: 0 }
      const amt = Number(r._sum.amount ?? 0)
      if (r.type === 'RECEITA') cur.revenue += amt
      else {
        cur.total += amt
        if (r.status === 'PAGO') cur.paid += amt
        else { cur.pending += amt; cur.pendingCount += r._count._all }
      }
      cur.count += r._count._all
      byVehicle.set(r.vehicleId, cur)
    }
    let ids = [...byVehicle.keys()]
    if (onlyPending) ids = ids.filter((id) => (byVehicle.get(id)?.pendingCount ?? 0) > 0)
    const vehicles = ids.length ? await prisma.vehicle.findMany({
      where:  { id: { in: ids }, ...(q ? { OR: [{ plate: { contains: q.replace(/[^a-z0-9]/gi, ''), mode: 'insensitive' } }, { brand: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: {
        id: true, plate: true, brand: true, model: true, version: true, stockStatus: true, stockType: true, entryDate: true,
        dealVehicles: { where: { deal: { status: { not: 'CANCELADA' } } }, select: { role: true, deal: { select: { dealNumber: true } } } },
      },
      orderBy: { entryDate: 'desc' },
    }) : []
    const data = vehicles.map((v) => ({
      id: v.id, plate: v.plate, title: [v.brand, v.model, v.version].filter(Boolean).join(' '), stockStatus: v.stockStatus, stockType: v.stockType,
      entryDate: v.entryDate, deals: v.dealVehicles.map((d) => ({ role: d.role, number: d.deal.dealNumber })),
      ...byVehicle.get(v.id)!,
    }))
    const totals = data.reduce((a, r) => ({ total: a.total + r.total, paid: a.paid + r.paid, pending: a.pending + r.pending }), { total: 0, paid: 0, pending: 0 })
    return NextResponse.json({ success: true, data, totals })
  } catch (err) {
    return handlePrismaError(err)
  }
}
