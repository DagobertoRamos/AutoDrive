// =============================================================================
// /api/reports/stock/margin — Relatório de Margem por Veículo (read-only)
// Margem = preço de venda − preço de compra. Em estoque. Multi-tenant.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const OUT_OF_STOCK = ['VENDIDO', 'CANCELADO', 'DEVOLVIDO']
const num = (v: unknown): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')
  { const gate = await assertModuleEnabled(user, 'logs'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const unitId = new URL(req.url).searchParams.get('unitId') || undefined

    const where = tenantWhere(user.role, tenantId, {
      active: true, stockStatus: { notIn: OUT_OF_STOCK }, ...(unitId ? { unitId } : {}),
    })

    const vehicles = await prisma.vehicle.findMany({
      where: where as never,
      take: 1000,
      select: {
        id: true, plate: true, brand: true, model: true, version: true, year: true, modelYear: true,
        stockStatus: true, salePrice: true, purchasePrice: true, fipeValue: true,
      },
    })

    const data = vehicles
      .map((v) => {
        const sale = num(v.salePrice), purchase = num(v.purchasePrice)
        const margin = round2(sale - purchase)
        const marginPct = purchase > 0 ? round2((margin / purchase) * 100) : null
        return {
          id: v.id, plate: v.plate, brand: v.brand, model: v.model, version: v.version,
          year: v.modelYear ?? v.year, status: v.stockStatus,
          salePrice: sale, purchasePrice: purchase, fipeValue: num(v.fipeValue), margin, marginPct,
        }
      })
      .filter((v) => v.purchasePrice > 0 || v.salePrice > 0)
      .sort((a, b) => b.margin - a.margin)

    const withBoth = data.filter((v) => v.purchasePrice > 0 && v.salePrice > 0)
    const totalSale = data.reduce((s, v) => s + v.salePrice, 0)
    const totalPurchase = data.reduce((s, v) => s + v.purchasePrice, 0)
    const totalMargin = round2(totalSale - totalPurchase)
    const avgMarginPct = withBoth.length
      ? round2(withBoth.reduce((s, v) => s + (v.marginPct ?? 0), 0) / withBoth.length)
      : 0

    return NextResponse.json({
      success: true,
      summary: { count: data.length, totalSale, totalPurchase, totalMargin, avgMarginPct },
      data,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
