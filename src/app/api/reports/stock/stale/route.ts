// =============================================================================
// /api/reports/stock/stale — Relatório de Veículos Parados (read-only)
// Veículos em estoque há mais tempo (dias em estoque). Faixas + lista. Multi-tenant.
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

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')
  { const gate = await assertModuleEnabled(user, 'logs'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const minDays = Math.max(0, Number(searchParams.get('minDays') ?? 60) || 60)
    const unitId = searchParams.get('unitId') || undefined

    const where = tenantWhere(user.role, tenantId, {
      active: true, stockStatus: { notIn: OUT_OF_STOCK }, ...(unitId ? { unitId } : {}),
    })

    const vehicles = await prisma.vehicle.findMany({
      where: where as never,
      take: 1000,
      select: {
        id: true, plate: true, brand: true, model: true, version: true, year: true, modelYear: true,
        km: true, stockStatus: true, salePrice: true, entryDate: true,
      },
    })

    const now = Date.now()
    const withDays = vehicles.map((v) => ({
      id: v.id, plate: v.plate, brand: v.brand, model: v.model, version: v.version,
      year: v.modelYear ?? v.year, km: v.km, status: v.stockStatus, salePrice: num(v.salePrice),
      entryDate: v.entryDate,
      daysInStock: v.entryDate ? Math.max(0, Math.floor((now - new Date(v.entryDate).getTime()) / 86400000)) : null,
    }))

    const buckets = [
      { label: '0–30 dias', min: 0, max: 30, count: 0, totalSale: 0 },
      { label: '31–60 dias', min: 31, max: 60, count: 0, totalSale: 0 },
      { label: '61–90 dias', min: 61, max: 90, count: 0, totalSale: 0 },
      { label: '90+ dias', min: 91, max: Infinity, count: 0, totalSale: 0 },
    ]
    for (const v of withDays) {
      const d = v.daysInStock ?? 0
      const b = buckets.find((x) => d >= x.min && d <= x.max)
      if (b) { b.count++; b.totalSale += v.salePrice }
    }

    const items = withDays
      .filter((v) => (v.daysInStock ?? 0) >= minDays)
      .sort((a, b) => (b.daysInStock ?? 0) - (a.daysInStock ?? 0))

    return NextResponse.json({
      success: true,
      minDays,
      summary: {
        totalEmEstoque: withDays.length,
        parados: items.length,
        valorParado: items.reduce((s, v) => s + v.salePrice, 0),
      },
      buckets: buckets.map((b) => ({ label: b.label, count: b.count, totalSale: b.totalSale })),
      data: items,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
