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
import { buildCommissionAccessWhere } from '@/lib/negotiation-access'

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
  if (scope === 'DECEND_QUANTITY_BONUS') return 'Bônus dezenal'
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

    const ruleType     = searchParams.get('ruleType') || ''
    const period       = searchParams.get('period') || ''
    const status       = searchParams.get('status') || ''
    const unitId       = searchParams.get('unitId') || ''
    const collaborator = searchParams.get('collaborator') || '' // "s:<id>" | "m:<id>" | "u:<id>"
    const includeCancelled = searchParams.get('includeCancelled') === '1'

    // Filtros de linha (tipo/período/status) vão no where; unidade e colaborador
    // são aplicados DEPOIS, para que as listas dos dropdowns fiquem completas.
    const extra: Record<string, unknown> = {}
    if (ruleType) extra.ruleType = ruleType
    if (period)   extra.period = period
    if (status)   extra.status = status

    const where = await buildCommissionAccessWhere(
      user,
      tenantWhere(user.role, tenantId, extra) as never,
    )

    const rows = await prisma.commissionCalculation.findMany({
      where,
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
      take: 20000,
      select: {
        id: true, ruleType: true, description: true, baseValue: true, commissionValue: true,
        status: true, period: true, sellerId: true, managerId: true, unitId: true, ruleDetails: true, createdAt: true,
      },
    })

    // Resolve nomes (vendedor/gerente/usuário-ganhador) + unidades.
    const sellerIds = [...new Set(rows.map((r) => r.sellerId).filter(Boolean))] as string[]
    const managerIds = [...new Set(rows.map((r) => r.managerId).filter(Boolean))] as string[]
    const employeeUserIds = [...new Set(rows.map((r) => detailsOf(r.ruleDetails).employeeUserId).filter(Boolean))] as string[]
    const unitIds = [...new Set(rows.map((r) => r.unitId).filter(Boolean))] as string[]
    const userIds = [...new Set([...managerIds, ...employeeUserIds])]
    const [sellers, managers, users, units] = await Promise.all([
      sellerIds.length ? prisma.seller.findMany({ where: { id: { in: sellerIds } }, select: { id: true, fullName: true, shortName: true } }) : [],
      managerIds.length ? prisma.manager.findMany({ where: { id: { in: managerIds } }, select: { id: true, fullName: true, user: { select: { name: true } } } }) : [],
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
      unitIds.length ? prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } }) : [],
    ])
    const sellerMap = Object.fromEntries(sellers.map((s) => [s.id, s.shortName || s.fullName]))
    const managerMap = Object.fromEntries(managers.map((m) => [m.id, m.fullName || m.user?.name || 'Gerente']))
    const userMap = Object.fromEntries(users.map((m) => [m.id, m.name]))
    const unitMap = Object.fromEntries(units.map((u) => [u.id, u.name]))

    // Chave e nome do colaborador (ganhador) de cada linha.
    const earnerOf = (r: typeof rows[number]): { key: string; nome: string } => {
      const details = detailsOf(r.ruleDetails)
      if (r.sellerId) return { key: `s:${r.sellerId}`, nome: sellerMap[r.sellerId] ?? '—' }
      if (r.managerId) return { key: `m:${r.managerId}`, nome: managerMap[r.managerId] ?? userMap[r.managerId] ?? '—' }
      const uid = String(details.employeeUserId ?? '')
      return { key: `u:${uid}`, nome: userMap[uid] ?? '—' }
    }

    // Listas para os dropdowns (completas dentro da visibilidade + filtros de tipo/período/status).
    const unidades = [...new Map(rows.filter((r) => r.unitId).map((r) => [r.unitId as string, unitMap[r.unitId as string] ?? r.unitId as string])).entries()]
      .map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
    const colaboradores = [...new Map(rows.map((r) => { const e = earnerOf(r); return [e.key, e.nome] })).entries()]
      .map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))

    // Aplica unidade + colaborador. Canceladas ficam fora por padrão (só entram
    // com ?includeCancelled=1 — usado pelo detalhe do extrato p/ mostrar riscado).
    const filtered = rows.filter((r) => {
      if (!includeCancelled && r.status === 'CANCELADO') return false
      if (unitId && r.unitId !== unitId) return false
      if (collaborator && earnerOf(r).key !== collaborator) return false
      return true
    })

    const data = filtered.slice(0, 1000).map((r) => {
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
        cancelReason: typeof details.cancelReason === 'string' ? details.cancelReason : null,
        manualKind: typeof details.manualKind === 'string' ? details.manualKind : null,
        period: r.period,
        createdAt: r.createdAt,
        responsavel: earnerOf(r).nome,
      }
    })

    // Totais por tipo (do conjunto FILTRADO, ignorando canceladas).
    const totalsMap = new Map<string, { total: number; count: number }>()
    for (const r of filtered) {
      if (r.status === 'CANCELADO') continue
      const t = totalsMap.get(r.ruleType) ?? { total: 0, count: 0 }
      t.total += num(r.commissionValue); t.count += 1
      totalsMap.set(r.ruleType, t)
    }
    const totalsByType = [...totalsMap.entries()].map(([rt, t]) => ({ ruleType: rt, total: t.total, count: t.count }))
    const grandTotal = totalsByType.reduce((s, t) => s + t.total, 0)

    return NextResponse.json({ success: true, data, totalsByType, grandTotal, unidades, colaboradores })
  } catch (err) {
    return handlePrismaError(err)
  }
}
