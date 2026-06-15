// =============================================================================
// /api/reports/stock/turnover — Giro de Estoque (read-only)
// Veículos que SAÍRAM do estoque (exitDate) + tempo médio até a venda. Multi-tenant.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

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
    const unitId = new URL(req.url).searchParams.get('unitId') || undefined

    const where = tenantWhere(user.role, tenantId, {
      exitDate: { not: null }, ...(unitId ? { unitId } : {}),
    })

    const vehicles = await prisma.vehicle.findMany({
      where: where as never,
      orderBy: { exitDate: 'desc' },
      take: 1000,
      select: {
        id: true, plate: true, brand: true, model: true, version: true, year: true, modelYear: true,
        stockStatus: true, salePrice: true, entryDate: true, exitDate: true,
      },
    })

    const data = vehicles.map((v) => {
      const days = v.entryDate && v.exitDate
        ? Math.max(0, Math.floor((new Date(v.exitDate).getTime() - new Date(v.entryDate).getTime()) / 86400000))
        : null
      return {
        id: v.id, plate: v.plate, brand: v.brand, model: v.model, version: v.version,
        year: v.modelYear ?? v.year, status: v.stockStatus, salePrice: num(v.salePrice),
        entryDate: v.entryDate, exitDate: v.exitDate, daysToSell: days,
      }
    })

    const withDays = data.filter((v) => v.daysToSell != null)
    const avgDaysToSell = withDays.length
      ? Math.round(withDays.reduce((s, v) => s + (v.daysToSell ?? 0), 0) / withDays.length)
      : 0

    return NextResponse.json({
      success: true,
      summary: {
        saidas: data.length,
        avgDaysToSell,
        totalSale: data.reduce((s, v) => s + v.salePrice, 0),
        maisRapido: withDays.length ? Math.min(...withDays.map((v) => v.daysToSell ?? 0)) : 0,
        maisLento: withDays.length ? Math.max(...withDays.map((v) => v.daysToSell ?? 0)) : 0,
      },
      data,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
