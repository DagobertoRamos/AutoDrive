// =============================================================================
// /api/reports/stock/preparation — Custo de Preparação (read-only)
// Serviços de preparação dos veículos (EvaluationService): estimado vs realizado,
// por tipo e por status. Multi-tenant.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const num = (v: unknown): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')
  { const gate = await assertModuleEnabled(user, 'logs'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const where = tenantWhere(user.role, tenantId, {})

    const [agg, byTypeRaw, byStatusRaw, items] = await Promise.all([
      prisma.evaluationService.aggregate({
        where: where as never,
        _count: { _all: true },
        _sum: { estimatedCost: true, actualCost: true },
      }),
      prisma.evaluationService.groupBy({
        by: ['serviceType'], where: where as never,
        _count: { _all: true }, _sum: { estimatedCost: true, actualCost: true },
      }),
      prisma.evaluationService.groupBy({
        by: ['status'], where: where as never, _count: { _all: true }, _sum: { actualCost: true },
      }),
      prisma.evaluationService.findMany({
        where: where as never, orderBy: { createdAt: 'desc' }, take: 500,
        select: { id: true, description: true, serviceType: true, status: true, estimatedCost: true, actualCost: true, createdAt: true },
      }),
    ])

    return NextResponse.json({
      success: true,
      summary: {
        count: agg._count._all,
        totalEstimated: num(agg._sum.estimatedCost),
        totalActual: num(agg._sum.actualCost),
      },
      byType: byTypeRaw.map((g) => ({ type: g.serviceType, count: g._count._all, estimated: num(g._sum.estimatedCost), actual: num(g._sum.actualCost) })).sort((a, b) => b.actual - a.actual),
      byStatus: byStatusRaw.map((g) => ({ status: g.status, count: g._count._all, actual: num(g._sum.actualCost) })),
      data: items.map((s) => ({ id: s.id, description: s.description, type: s.serviceType, status: s.status, estimated: num(s.estimatedCost), actual: num(s.actualCost), createdAt: s.createdAt })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
