// =============================================================================
// GET /api/finance/center/overview/operations — indicadores operacionais do
// painel: financiamentos aguardando o banco, repasses a parceiros, comissões a
// pagar e capital investido no estoque próprio (custo lançado dos carros à venda;
// sem lançamento de compra, o preço de compra do cadastro).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { COMMISSION_ELIGIBLE_DEAL_STATUSES } from '@/lib/commission/status'
import { partnersReport } from '@/lib/finance/partners-report'

export const dynamic = 'force-dynamic'
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
const OUT_OF_STOCK = ['VENDIDO', 'DEVOLVIDO', 'CANCELADO']

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { tenantId } = g
  try {
    const [transit, commissions, partners, stock] = await Promise.all([
      prisma.dealPayment.aggregate({
        where: { type: 'FINANCIAMENTO', OR: [{ status: null }, { status: { notIn: ['CONFIRMADO', 'PAGO', 'CANCELADO', 'ESTORNADO', 'RECUSADO'] } }], deal: { tenantId, status: { in: COMMISSION_ELIGIBLE_DEAL_STATUSES } } },
        _count: true, _sum: { value: true },
      }),
      prisma.financialEntry.aggregate({ where: { tenantId, status: 'PREVISTO', commissionCalculationId: { not: null } }, _count: true, _sum: { amount: true } }),
      partnersReport({ tenantId }),
      prisma.vehicle.findMany({
        where: { tenantId, active: true, stockStatus: { notIn: OUT_OF_STOCK as never[] }, partnerStoreId: null, OR: [{ stockType: null }, { stockType: { not: 'CONSIGNADO' } }] },
        select: { id: true, purchasePrice: true },
      }),
    ])
    const ids = stock.map((v) => v.id)
    const costs = ids.length
      ? await prisma.financialEntry.groupBy({ by: ['vehicleId'], where: { tenantId, vehicleId: { in: ids }, type: 'DESPESA', status: { not: 'CANCELADO' }, commissionCalculationId: null }, _sum: { amount: true } })
      : []
    const acq = ids.length
      ? new Set((await prisma.financialEntry.findMany({ where: { tenantId, vehicleId: { in: ids }, source: { startsWith: 'VEICULO_COMPRA_VEICULO' }, status: { not: 'CANCELADO' } }, select: { vehicleId: true } })).map((e) => e.vehicleId))
      : new Set<string | null>()
    const costOf = new Map(costs.map((c) => [c.vehicleId, Number(c._sum.amount ?? 0)]))
    const capital = stock.reduce((s, v) => s + (costOf.get(v.id) ?? 0) + (acq.has(v.id) ? 0 : Number(v.purchasePrice ?? 0)), 0)
    return NextResponse.json({
      success: true,
      data: {
        transit: { count: transit._count, total: r2(Number(transit._sum.value ?? 0)) },
        commissions: { count: commissions._count, total: r2(Number(commissions._sum.amount ?? 0)) },
        partners: { toPay: partners.totals.toPay, count: partners.rows.reduce((s, r) => s + r.toPay.count, 0) },
        stock: { count: stock.length, capital: r2(capital) },
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
