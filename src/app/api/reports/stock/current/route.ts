// =============================================================================
// /api/reports/stock/current — Relatório de Estoque Atual (read-only)
// Veículos atualmente em estoque (ativos, não vendidos/cancelados/devolvidos),
// com totais (venda/compra/FIPE), quebra por status e lista. Multi-tenant.
// =============================================================================

import { NextResponse } from 'next/server'
import {
  getSessionUser,
  assertTenantId,
  tenantWhere,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

const OUT_OF_STOCK = ['VENDIDO', 'CANCELADO', 'DEVOLVIDO']

const num = (v: unknown): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const unitId = searchParams.get('unitId') || undefined

    const where = tenantWhere(user.role, tenantId, {
      active: true,
      stockStatus: { notIn: OUT_OF_STOCK },
      ...(unitId ? { unitId } : {}),
    })

    const [agg, byStatusRaw, items] = await Promise.all([
      prisma.vehicle.aggregate({
        where: where as never,
        _count: { _all: true },
        _sum: { salePrice: true, purchasePrice: true, fipeValue: true },
      }),
      prisma.vehicle.groupBy({
        by: ['stockStatus'],
        where: where as never,
        _count: { _all: true },
        _sum: { salePrice: true },
      }),
      prisma.vehicle.findMany({
        where: where as never,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        take: 500,
        select: {
          id: true, plate: true, brand: true, model: true, version: true, year: true, modelYear: true,
          km: true, color: true, conditionType: true, stockStatus: true, stockType: true,
          salePrice: true, purchasePrice: true, fipeValue: true, entryDate: true,
        },
      }),
    ])

    const now = Date.now()
    const data = items.map((v) => ({
      id: v.id, plate: v.plate, brand: v.brand, model: v.model, version: v.version,
      year: v.modelYear ?? v.year, km: v.km, color: v.color,
      condition: v.conditionType, status: v.stockStatus, stockType: v.stockType,
      salePrice: num(v.salePrice), purchasePrice: num(v.purchasePrice), fipeValue: num(v.fipeValue),
      entryDate: v.entryDate,
      daysInStock: v.entryDate ? Math.max(0, Math.floor((now - new Date(v.entryDate).getTime()) / 86400000)) : null,
    }))

    const byStatus = byStatusRaw
      .map((g) => ({ status: g.stockStatus, count: g._count._all, totalSale: num(g._sum.salePrice) }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      success: true,
      summary: {
        count: agg._count._all,
        totalSale: num(agg._sum.salePrice),
        totalPurchase: num(agg._sum.purchasePrice),
        totalFipe: num(agg._sum.fipeValue),
      },
      byStatus,
      data,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
