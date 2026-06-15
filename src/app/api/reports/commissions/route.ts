// =============================================================================
// /api/reports/commissions?view=geral|garantias|retornos|vendedor — read-only
// Relatórios de comissão sobre CommissionCalculation (motor grava VENDA/RETORNO/
// GARANTIA). Multi-tenant via tenantWhere; gated por canAccessModule('logs').
//  - geral/garantias/retornos: lista + totais por tipo/status.
//  - vendedor: agregado por vendedor (total + quebra por tipo).
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

const VIEWS = ['geral', 'garantias', 'retornos', 'vendedor'] as const
type View = (typeof VIEWS)[number]

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const viewParam = (searchParams.get('view') ?? 'geral') as View
    const view: View = VIEWS.includes(viewParam) ? viewParam : 'geral'

    const extra: Record<string, unknown> = {}
    if (view === 'garantias') extra.ruleType = 'GARANTIA'
    if (view === 'retornos') extra.ruleType = 'RETORNO'
    const where = tenantWhere(user.role, tenantId, extra)

    // ---- Vendedor: agregado por vendedor + tipo --------------------------
    if (view === 'vendedor') {
      const grouped = await prisma.commissionCalculation.groupBy({
        by: ['sellerId', 'ruleType'],
        where: where as never,
        _sum: { commissionValue: true },
        _count: { _all: true },
      })
      const sellerIds = [...new Set(grouped.map((g) => g.sellerId).filter(Boolean))] as string[]
      const sellers = sellerIds.length
        ? await prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, fullName: true, shortName: true } })
        : []
      const nameMap = Object.fromEntries(sellers.map((s) => [s.id, s.shortName || s.fullName]))

      const bySellerMap = new Map<string, { seller: string; total: number; count: number; byType: Record<string, number> }>()
      for (const g of grouped) {
        const key = g.sellerId ?? '__sem__'
        const entry = bySellerMap.get(key) ?? { seller: g.sellerId ? (nameMap[g.sellerId] ?? '—') : 'Sem vendedor', total: 0, count: 0, byType: {} }
        const val = num(g._sum.commissionValue)
        entry.total += val
        entry.count += g._count._all
        entry.byType[g.ruleType] = (entry.byType[g.ruleType] ?? 0) + val
        bySellerMap.set(key, entry)
      }
      const bySeller = [...bySellerMap.values()].sort((a, b) => b.total - a.total)
      return NextResponse.json({
        success: true,
        view,
        summary: { sellers: bySeller.length, total: bySeller.reduce((s, x) => s + x.total, 0), count: bySeller.reduce((s, x) => s + x.count, 0) },
        bySeller,
      })
    }

    // ---- Ledger views (geral/garantias/retornos) -------------------------
    const [rows, byType, byStatus] = await Promise.all([
      prisma.commissionCalculation.findMany({
        where,
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
        take: 500,
        select: {
          id: true, ruleType: true, description: true, baseValue: true, commissionValue: true,
          status: true, period: true, sellerId: true, managerId: true, createdAt: true,
        },
      }),
      prisma.commissionCalculation.groupBy({ by: ['ruleType'], where: where as never, _sum: { commissionValue: true }, _count: { _all: true } }),
      prisma.commissionCalculation.groupBy({ by: ['status'], where: where as never, _sum: { commissionValue: true }, _count: { _all: true } }),
    ])

    const sellerIds = [...new Set(rows.map((r) => r.sellerId).filter(Boolean))] as string[]
    const managerIds = [...new Set(rows.map((r) => r.managerId).filter(Boolean))] as string[]
    const [sellers, managers] = await Promise.all([
      sellerIds.length ? prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, fullName: true, shortName: true } }) : [],
      managerIds.length ? prisma.user.findMany({ where: { id: { in: managerIds } }, select: { id: true, name: true } }) : [],
    ])
    const sellerMap = Object.fromEntries(sellers.map((s) => [s.id, s.shortName || s.fullName]))
    const userMap = Object.fromEntries(managers.map((m) => [m.id, m.name]))

    const data = rows.map((r) => ({
      id: r.id, ruleType: r.ruleType, description: r.description,
      baseValue: num(r.baseValue), commissionValue: num(r.commissionValue),
      status: r.status, period: r.period, createdAt: r.createdAt,
      responsavel: r.sellerId ? (sellerMap[r.sellerId] ?? '—') : r.managerId ? (userMap[r.managerId] ?? '—') : '—',
    }))

    const totalsByType = byType.map((g) => ({ ruleType: g.ruleType, total: num(g._sum.commissionValue), count: g._count._all })).sort((a, b) => b.total - a.total)
    const totalsByStatus = byStatus.map((g) => ({ status: g.status, total: num(g._sum.commissionValue), count: g._count._all })).sort((a, b) => b.total - a.total)
    const grandTotal = totalsByType.reduce((s, t) => s + t.total, 0)

    return NextResponse.json({ success: true, view, summary: { count: data.length, grandTotal }, totalsByType, totalsByStatus, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
