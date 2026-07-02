// =============================================================================
// /api/commissions/calculations — Lançamentos de comissão (CommissionCalculation)
// View read-only das comissões geradas pelo motor (VENDA/RETORNO/GARANTIA/...),
// com totais por tipo. Multi-tenant; VENDEDOR vê apenas as próprias.
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
import { assertModuleEnabled } from '@/lib/tenant-modules'

const num = (v: unknown): number => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v) || 0
}

function detailsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function scopeLabel(scope: string | null, ruleType: string): string {
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

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'commissions')) {
    return forbiddenResponse('Sem acesso a comissões.')
  }
  { const gate = await assertModuleEnabled(user, 'commissions'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)

    const extra: Record<string, unknown> = {}
    const ruleType = searchParams.get('ruleType')
    const period   = searchParams.get('period')
    const status   = searchParams.get('status')
    const sellerId = searchParams.get('sellerId')
    if (ruleType) extra.ruleType = ruleType
    if (period)   extra.period = period
    if (status)   extra.status = status
    if (sellerId) extra.sellerId = sellerId

    // VENDEDOR / usuário comum: apenas as próprias comissões.
    if (['VENDEDOR', 'VENDEDOR_LIDER', 'USUARIO_LIDER', 'USUARIO', 'FINANCEIRO'].includes(user.role)) {
      const seller = await prisma.seller.findFirst({ where: { userId: user.id }, select: { id: true } })
      extra.sellerId = seller?.id ?? '__none__'
    }

    const where = tenantWhere(user.role, tenantId, extra)

    const [rows, byType] = await Promise.all([
      prisma.commissionCalculation.findMany({
        where,
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
        take: 500,
        select: {
          id: true, ruleType: true, description: true, baseValue: true, commissionValue: true,
          status: true, period: true, sellerId: true, managerId: true, ruleDetails: true, createdAt: true,
        },
      }),
      prisma.commissionCalculation.groupBy({
        by: ['ruleType'],
        where: where as never,
        _sum: { commissionValue: true },
        _count: { _all: true },
      }),
    ])

    // Resolve nomes (sellerId → Seller.fullName; managerId pode ser Manager.id
    // nas comissões novas ou User.id em registros antigos).
    const sellerIds = [...new Set(rows.map((r) => r.sellerId).filter(Boolean))] as string[]
    const managerIds = [...new Set(rows.map((r) => r.managerId).filter(Boolean))] as string[]
    const employeeUserIds = [...new Set(rows
      .map((r) => detailsOf(r.ruleDetails).employeeUserId)
      .filter(Boolean))] as string[]
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
        id: r.id,
        ruleType: r.ruleType,
        commissionScope,
        commissionScopeLabel: scopeLabel(commissionScope, r.ruleType),
        originalOperationType: typeof details.originalOperationType === 'string' ? details.originalOperationType : null,
        dealId: typeof details.dealId === 'string' ? details.dealId : null,
        description: r.description,
        baseValue: num(r.baseValue),
        commissionValue: num(r.commissionValue),
        status: r.status,
        period: r.period,
        createdAt: r.createdAt,
        responsavel: r.sellerId
        ? (sellerMap[r.sellerId] ?? '—')
        : r.managerId
          ? (managerMap[r.managerId] ?? userMap[r.managerId] ?? '—')
          : userMap[String(details.employeeUserId ?? '')] ?? '—',
      }
    })

    const totalsByType = byType.map((g) => ({
      ruleType: g.ruleType,
      total: num(g._sum.commissionValue),
      count: g._count._all,
    }))
    const grandTotal = totalsByType.reduce((s, t) => s + t.total, 0)

    return NextResponse.json({ success: true, data, totalsByType, grandTotal })
  } catch (err) {
    return handlePrismaError(err)
  }
}
