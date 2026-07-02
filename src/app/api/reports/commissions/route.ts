// =============================================================================
// /api/reports/commissions?view=geral|garantias|retornos|vendedor — read-only
// Relatórios de comissão sobre CommissionCalculation (motor grava VENDA/RETORNO/
// GARANTIA). Multi-tenant via tenantWhere; gated por canAccessModule('logs').
//  - geral/garantias/retornos: lista + totais por tipo/status.
//  - vendedor: agregado por vendedor (total + quebra por tipo).
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildCommissionAccessWhere } from '@/lib/negotiation-access'

const num = (v: unknown): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

const employeeUserIdFrom = (details: unknown): string | null => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null
  const value = (details as { employeeUserId?: unknown }).employeeUserId
  return typeof value === 'string' && value ? value : null
}

const detailsOf = (details: unknown): Record<string, unknown> =>
  details && typeof details === 'object' && !Array.isArray(details) ? details as Record<string, unknown> : {}

const scopeLabel = (scope: string | null, ruleType: string): string => {
  if (scope === 'SELLER_MAIN_COMMISSION') return 'Vendedor'
  if (scope === 'UNIT_MANAGER_COMMISSION') return 'Gerente da unidade'
  if (scope === 'GENERAL_MANAGER_COMMISSION') return 'Gerente geral'
  if (scope === 'WARRANTY_COMMISSION') return 'Garantia'
  if (scope === 'RETURN_COMMISSION') return 'Retorno'
  if (scope === 'SERVICE_COMMISSION') return 'Serviço'
  if (scope === 'DOCUMENT_COMMISSION') return 'Documento'
  if (scope === 'BONUS_COMMISSION') return 'Bônus'
  if (ruleType === 'VENDA' || ruleType === 'TROCA' || ruleType === 'COMPRA') return 'Principal'
  return ruleType
}

const VIEWS = ['geral', 'garantias', 'retornos', 'vendedor'] as const
type View = (typeof VIEWS)[number]

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')
  { const gate = await assertModuleEnabled(user, 'logs'); if (gate) return gate }

  try {
    const { searchParams } = new URL(req.url)
    const viewParam = (searchParams.get('view') ?? 'geral') as View
    const view: View = VIEWS.includes(viewParam) ? viewParam : 'geral'

    const extra: Prisma.CommissionCalculationWhereInput = {}
    if (view === 'garantias') extra.ruleType = 'GARANTIA'
    if (view === 'retornos') extra.ruleType = 'RETORNO'
    // Visibilidade central (Parte 9): o relatório é liberado por `logs`
    // (MASTER/ADM/GERENTE_GERAL/GERENTE). GERENTE fica escopado à PRÓPRIA
    // unidade; os demais veem o tenant. Não basta o gate — o where filtra.
    const where = await buildCommissionAccessWhere(user, extra)

    // ---- Vendedor: agregado por vendedor + tipo --------------------------
    if (view === 'vendedor') {
      const rows = await prisma.commissionCalculation.findMany({
        where: where as never,
        take: 5000,
        select: {
          sellerId: true,
          managerId: true,
          ruleDetails: true,
          ruleType: true,
          commissionValue: true,
        },
      })

      const sellerIds = [...new Set(rows.map((r) => r.sellerId).filter(Boolean))] as string[]
      const managerIds = [...new Set(rows.map((r) => r.managerId).filter(Boolean))] as string[]
      const employeeUserIds = [...new Set(rows.map((r) => employeeUserIdFrom(r.ruleDetails)).filter(Boolean))] as string[]
      const userIds = [...new Set([...managerIds, ...employeeUserIds])]

      const [sellers, managers, users] = await Promise.all([
        sellerIds.length
          ? prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, fullName: true, shortName: true } })
          : [],
        managerIds.length
          ? prisma.manager.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true, user: { select: { name: true } } } })
          : [],
        userIds.length
          ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
          : [],
      ])

      const nameMap = Object.fromEntries(sellers.map((s) => [s.id, s.shortName || s.fullName]))
      const managerMap = Object.fromEntries(managers.map((m) => [m.id, m.fullName || m.user?.name || 'Gerente']))
      const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

      const bySellerMap = new Map<string, { seller: string; total: number; count: number; byType: Record<string, number> }>()
      for (const r of rows) {
        const employeeUserId = employeeUserIdFrom(r.ruleDetails)
        const key = r.sellerId
          ? `seller:${r.sellerId}`
          : r.managerId
            ? `manager:${r.managerId}`
            : employeeUserId
              ? `user:${employeeUserId}`
              : '__sem__'
        const seller = r.sellerId
          ? (nameMap[r.sellerId] ?? '—')
          : r.managerId
            ? (managerMap[r.managerId] ?? userMap[r.managerId] ?? '—')
            : employeeUserId
              ? (userMap[employeeUserId] ?? '—')
              : 'Sem responsável'
        const entry = bySellerMap.get(key) ?? { seller, total: 0, count: 0, byType: {} }
        const val = num(r.commissionValue)
        entry.total += val
        entry.count += 1
        entry.byType[r.ruleType] = (entry.byType[r.ruleType] ?? 0) + val
        bySellerMap.set(key, entry)
      }
      const bySeller = [...bySellerMap.values()].sort((a, b) => b.total - a.total)
      return NextResponse.json({
        success: true,
        view,
        summary: { sellers: bySeller.length, responsaveis: bySeller.length, total: bySeller.reduce((s, x) => s + x.total, 0), count: bySeller.reduce((s, x) => s + x.count, 0) },
        bySeller,
        byResponsible: bySeller,
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
          status: true, period: true, sellerId: true, managerId: true, ruleDetails: true, createdAt: true,
        },
      }),
      prisma.commissionCalculation.groupBy({ by: ['ruleType'], where: where as never, _sum: { commissionValue: true }, _count: { _all: true } }),
      prisma.commissionCalculation.groupBy({ by: ['status'], where: where as never, _sum: { commissionValue: true }, _count: { _all: true } }),
    ])

    const sellerIds = [...new Set(rows.map((r) => r.sellerId).filter(Boolean))] as string[]
    const managerIds = [...new Set(rows.map((r) => r.managerId).filter(Boolean))] as string[]
    const employeeUserIds = [...new Set(rows.map((r) => employeeUserIdFrom(r.ruleDetails)).filter(Boolean))] as string[]
    const userIds = [...new Set([...managerIds, ...employeeUserIds])]
    const [sellers, managers, users] = await Promise.all([
      sellerIds.length ? prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, fullName: true, shortName: true } }) : [],
      managerIds.length ? prisma.manager.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true, user: { select: { name: true } } } }) : [],
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    ])
    const sellerMap = Object.fromEntries(sellers.map((s) => [s.id, s.shortName || s.fullName]))
    const managerMap = Object.fromEntries(managers.map((m) => [m.id, m.fullName || m.user?.name || 'Gerente']))
    const userMap = Object.fromEntries(users.map((m) => [m.id, m.name]))

    const data = rows.map((r) => {
      const details = detailsOf(r.ruleDetails)
      const commissionScope = typeof details.commissionScope === 'string' ? details.commissionScope : null
      return {
        id: r.id, ruleType: r.ruleType,
        commissionScope,
        commissionScopeLabel: scopeLabel(commissionScope, r.ruleType),
        originalOperationType: typeof details.originalOperationType === 'string' ? details.originalOperationType : null,
        dealId: typeof details.dealId === 'string' ? details.dealId : null,
        description: r.description,
        baseValue: num(r.baseValue), commissionValue: num(r.commissionValue),
        status: r.status, period: r.period, createdAt: r.createdAt,
        responsavel: r.sellerId
        ? (sellerMap[r.sellerId] ?? '—')
        : r.managerId
          ? (managerMap[r.managerId] ?? userMap[r.managerId] ?? '—')
          : userMap[employeeUserIdFrom(r.ruleDetails) ?? ''] ?? '—',
      }
    })

    const totalsByType = byType.map((g) => ({ ruleType: g.ruleType, total: num(g._sum.commissionValue), count: g._count._all })).sort((a, b) => b.total - a.total)
    const totalsByStatus = byStatus.map((g) => ({ status: g.status, total: num(g._sum.commissionValue), count: g._count._all })).sort((a, b) => b.total - a.total)
    const grandTotal = totalsByType.reduce((s, t) => s + t.total, 0)

    return NextResponse.json({ success: true, view, summary: { count: data.length, grandTotal }, totalsByType, totalsByStatus, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
