// =============================================================================
// DRE gerencial — carga dos dados (Prisma) + montagem com o núcleo puro.
// Também expõe a carga "alocada" que os relatórios gerenciais reutilizam, para
// que DRE e relatórios batam (mesmo regime, mesma realocação do custo do carro).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { spDayEnd, spDayStart } from '@/lib/dashboard/tz'
import { COMMISSION_ELIGIBLE_DEAL_STATUSES } from '@/lib/commission/status'
import { buildDre, categoryGroupResolver, resolveDreGroup } from './dre-core'
import {
  allocateEntries, drillDown, r2, saleDateOf, verticalAnalysis,
  type AllocatedEntry, type CatNode, type DreLineAv, type DrillRow, type RawEntry, type Regime, type StockCost,
} from './reports-core'

export const SALE_DEAL_TYPES = ['VENDA', 'TROCA'] as const

/** Início (00:00 SP) do mês e fim (23:59:59 SP) do último dia do mês. */
export function monthBounds(from: string, to: string): { start: Date; end: Date } {
  const y = Number(to.slice(0, 4)), m = Number(to.slice(5, 7))
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: spDayStart(`${from}-01`), end: spDayEnd(`${to}-${String(lastDay).padStart(2, '0')}`) }
}

export interface FinanceRefs {
  cats: (CatNode & { dreGroup: string | null })[]
  catName: (id: string) => string
  groupOf: (e: Pick<RawEntry, 'type' | 'source' | 'categoryId'>) => string
  costCenters: { id: string; name: string }[]
  units: { id: string; name: string }[]
}

export async function loadFinanceRefs(tenantId: string): Promise<FinanceRefs> {
  const [cats, costCenters, units] = await Promise.all([
    prisma.financialCategory.findMany({
      where: { tenantId },
      select: { id: true, name: true, parentId: true, code: true, sortOrder: true, kind: true, dreGroup: true },
    }),
    prisma.financialCostCenter.findMany({ where: { tenantId }, select: { id: true, name: true, active: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }] }),
    prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true, active: true }, orderBy: { name: 'asc' } }),
  ])
  const resolver = categoryGroupResolver(cats)
  const names = new Map(cats.map((c) => [c.id, c.code ? `${c.code} ${c.name}` : c.name]))
  return {
    cats: cats.map((c) => ({ ...c, kind: c.kind as 'RECEITA' | 'DESPESA' })),
    catName: (id) => names.get(id) ?? 'Categoria removida',
    groupOf: (e) => resolveDreGroup(e, resolver),
    costCenters: costCenters.map(({ id, name }) => ({ id, name })),
    units: units.map(({ id, name }) => ({ id, name })),
  }
}

const ENTRY_SELECT = {
  id: true, type: true, status: true, amount: true, dueDate: true, paidDate: true, competenceDate: true,
  categoryId: true, costCenterId: true, vehicleId: true, dealId: true, supplierId: true, counterparty: true,
  source: true, employeeUserId: true, unitId: true, sellerId: true, transferGroupId: true,
  interestAmount: true, discountAmount: true,
} as const

export interface EntryFilters { costCenterId?: string | null; unitId?: string | null }

const filterWhere = (f: EntryFilters) => ({
  ...(f.costCenterId ? { costCenterId: f.costCenterId === 'none' ? null : f.costCenterId } : {}),
  ...(f.unitId ? { unitId: f.unitId } : {}),
})

/** Data da venda de cada veículo (negociação VENDA/TROCA aprovada em diante, papel VENDIDO). */
export async function loadSaleDates(tenantId: string, vehicleIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>()
  const ids = [...new Set(vehicleIds)]
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000)
    const [dvs, vehicles] = await Promise.all([
      prisma.dealVehicle.findMany({
        where: {
          vehicleId: { in: chunk }, role: 'VENDIDO',
          deal: { tenantId, type: { in: [...SALE_DEAL_TYPES] }, status: { in: COMMISSION_ELIGIBLE_DEAL_STATUSES } },
        },
        select: { vehicleId: true, deal: { select: { approvedAt: true, releasedAt: true, finalizedAt: true, saleDate: true, createdAt: true } } },
      }),
      // Vendido fora do sistema (sem negociação): vale a saída do estoque.
      prisma.vehicle.findMany({ where: { id: { in: chunk }, tenantId, stockStatus: 'VENDIDO', exitDate: { not: null } }, select: { id: true, exitDate: true } }),
    ])
    const byVehicle = new Map<string, typeof dvs[number]['deal'][]>()
    for (const dv of dvs) if (dv.vehicleId) byVehicle.set(dv.vehicleId, [...(byVehicle.get(dv.vehicleId) ?? []), dv.deal])
    for (const [vid, deals] of byVehicle) {
      const d = saleDateOf(deals)
      if (d) out.set(vid, d)
    }
    for (const v of vehicles) if (!out.has(v.id) && v.exitDate) out.set(v.id, v.exitDate)
  }
  return out
}

const toRaw = (e: { amount: unknown; type: string; interestAmount?: unknown; discountAmount?: unknown } & Omit<RawEntry, 'amount' | 'type' | 'interestAmount' | 'discountAmount'>): RawEntry =>
  ({ ...e, type: e.type as RawEntry['type'], amount: Number(e.amount), interestAmount: e.interestAmount == null ? null : Number(e.interestAmount), discountAmount: e.discountAmount == null ? null : Number(e.discountAmount) })

/**
 * Lançamentos do período já posicionados por regime. Em competência traz também
 * todos os custos com veículo (de qualquer data), para levá-los ao mês da venda
 * e apurar o custo em estoque.
 */
export async function loadAllocated(params: { tenantId: string; periods: string[]; regime: Regime; refs: FinanceRefs } & EntryFilters): Promise<{ entries: AllocatedEntry[]; stock: StockCost }> {
  const { tenantId, periods, regime, refs } = params
  const { start, end } = monthBounds(periods[0], periods[periods.length - 1])
  const range = { gte: start, lte: end }
  const dateWhere = regime === 'caixa'
    ? { status: { in: ['PAGO', 'RECEBIDO'] as ('PAGO' | 'RECEBIDO')[] }, paidDate: range }
    : {
        OR: [
          { competenceDate: range },
          { competenceDate: null, dueDate: range },
          { competenceDate: null, dueDate: null, paidDate: range },
          { vehicleId: { not: null } },
        ],
      }
  const rows = await prisma.financialEntry.findMany({
    where: { tenantId, status: { not: 'CANCELADO' }, transferGroupId: null, ...filterWhere(params), ...dateWhere },
    select: ENTRY_SELECT,
  })
  const raw = rows.map(toRaw)
  const vehicleIds = regime === 'competencia' ? raw.filter((e) => e.vehicleId).map((e) => e.vehicleId as string) : []
  const saleDateByVehicle = vehicleIds.length ? await loadSaleDates(tenantId, vehicleIds) : new Map<string, Date>()
  return allocateEntries(raw, { regime, periods, groupOf: refs.groupOf, saleDateByVehicle })
}

export interface DreResult {
  regime: Regime
  from: string
  to: string
  periods: string[]
  lines: DreLineAv[]
  drill: Record<string, DrillRow[]>
  chart: { period: string; receitaLiquida: number; resultadoLiquido: number; margem: number | null }[]
  estoqueEmFormacao: StockCost
  filters: { costCenters: { id: string; name: string }[]; units: { id: string; name: string }[] }
}

export async function getDre(params: { tenantId: string; periods: string[]; regime: Regime } & EntryFilters): Promise<DreResult> {
  const refs = await loadFinanceRefs(params.tenantId)
  const { entries, stock } = await loadAllocated({ ...params, refs })
  const { periods } = params
  const lines = verticalAnalysis(buildDre(entries.map((e) => ({ type: e.type, group: e.group, amount: e.amount, period: e.period })), periods), periods)
  const rl = lines.find((l) => l.key === 'RECEITA_LIQUIDA')
  const res = lines.find((l) => l.key === 'RESULTADO_LIQUIDO')
  return {
    regime: params.regime,
    from: periods[0],
    to: periods[periods.length - 1],
    periods,
    lines,
    drill: drillDown(entries, periods, refs.catName),
    chart: periods.map((p) => {
      const r = rl?.values[p] ?? 0, n = res?.values[p] ?? 0
      return { period: p, receitaLiquida: r, resultadoLiquido: n, margem: r ? r2((n / r) * 100) : null }
    }),
    estoqueEmFormacao: params.regime === 'competencia' ? stock : { total: 0, vehicles: 0, byGroup: {} },
    filters: { costCenters: refs.costCenters, units: refs.units },
  }
}
