// =============================================================================
// /api/reports/stock/evaluations — Relatório de Avaliações (read-only)
// Avaliações de veículos (VehicleEvaluation): por resultado/intenção + lista.
// Multi-tenant.
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
    const where = tenantWhere(user.role, tenantId, { ...(unitId ? { unitId } : {}) })

    const [agg, byResultRaw, byIntentionRaw, items] = await Promise.all([
      prisma.vehicleEvaluation.aggregate({ where: where as never, _count: { _all: true }, _sum: { evaluatedValue: true } }),
      prisma.vehicleEvaluation.groupBy({ by: ['result'], where: where as never, _count: { _all: true } }),
      prisma.vehicleEvaluation.groupBy({ by: ['intention'], where: where as never, _count: { _all: true } }),
      prisma.vehicleEvaluation.findMany({
        where: where as never, orderBy: { createdAt: 'desc' }, take: 500,
        select: {
          id: true, plate: true, brand: true, model: true, version: true, modelYear: true,
          result: true, intention: true, fipeValue: true, evaluatedValue: true, suggestedSalePrice: true,
          ownerName: true, createdAt: true,
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      summary: { count: agg._count._all, totalEvaluated: num(agg._sum.evaluatedValue) },
      byResult: byResultRaw.map((g) => ({ result: g.result, count: g._count._all })),
      byIntention: byIntentionRaw.map((g) => ({ intention: g.intention, count: g._count._all })),
      data: items.map((e) => ({
        id: e.id, plate: e.plate, brand: e.brand, model: e.model, version: e.version, year: e.modelYear,
        result: e.result, intention: e.intention, ownerName: e.ownerName,
        fipeValue: num(e.fipeValue), evaluatedValue: num(e.evaluatedValue), suggestedSalePrice: num(e.suggestedSalePrice),
        createdAt: e.createdAt,
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
