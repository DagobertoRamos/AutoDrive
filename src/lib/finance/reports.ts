// =============================================================================
// Relatórios gerenciais do Centro Financeiro — carga (Prisma) + núcleo puro.
// Todas as visões usam a mesma alocação da DRE (dre.ts → loadAllocated), salvo
// aging (posição de hoje) e lucratividade (por venda de veículo).
// Folha: lançamentos com colaborador (employeeUserId) só aparecem agregados
// como "Folha de pagamento", a não ser para quem tem 'finance.payroll'.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { commissionEligibleDealWindowWhere } from '@/lib/commission/status'
import { DRE_GROUP_BY_KEY } from './dre-core'
import { SALE_DEAL_TYPES, loadAllocated, loadFinanceRefs, monthBounds, type EntryFilters, type FinanceRefs } from './dre'
import {
  AGING_BUCKETS, addMonths, agingBucket, agingSummary, aggregateProfit, budgetVsActual, buildCategoryTree, daysBetweenSP,
  entryDate, monthsBetween, previousRange, r2, sumByPeriod, vehicleProfit,
  type AllocatedEntry, type AgingBucket, type CatNode, type ProfitAggregate, type Regime, type VehicleProfitMath,
} from './reports-core'

export const REPORT_VIEWS = [
  'despesas-categoria', 'centro-custo', 'fornecedores', 'lucratividade-veiculo', 'lucratividade-vendedor',
  'lucratividade-unidade', 'comparativo-mensal', 'orcado-realizado', 'aging',
] as const
export type ReportView = (typeof REPORT_VIEWS)[number]
export const isReportView = (v: string | null): v is ReportView => !!v && (REPORT_VIEWS as readonly string[]).includes(v)

export interface ReportParams extends EntryFilters {
  tenantId: string
  view: ReportView
  periods: string[]
  regime: Regime
  sellerId?: string | null
  canSeePayroll: boolean
  now: Date
}

const PAYROLL_LABEL = 'Folha de pagamento'
const inDre = (e: AllocatedEntry) => {
  const g = DRE_GROUP_BY_KEY[e.group]
  return !!g && g.section !== 'FORA_DRE'
}
const pct = (v: number, base: number) => (base ? r2((v / base) * 100) : null)
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

export async function getReport(p: ReportParams) {
  const refs = await loadFinanceRefs(p.tenantId)
  const base = {
    view: p.view, regime: p.regime, from: p.periods[0], to: p.periods[p.periods.length - 1], periods: p.periods,
    filters: { costCenters: refs.costCenters, units: refs.units, sellers: await loadSellers(p.tenantId) },
  }
  switch (p.view) {
    case 'despesas-categoria': return { ...base, ...(await expensesByCategory(p, refs)) }
    case 'centro-custo': return { ...base, ...(await byCostCenter(p, refs)) }
    case 'fornecedores': return { ...base, ...(await bySupplier(p, refs)) }
    case 'lucratividade-veiculo': return { ...base, ...(await vehicleProfitability(p, refs)) }
    case 'lucratividade-vendedor':
    case 'lucratividade-unidade': {
      const v = await vehicleProfitability(p, refs)
      const bySeller = p.view === 'lucratividade-vendedor'
      const rows = aggregateProfit(
        v.rows,
        (r) => (bySeller ? r.sellerId : r.unitId) ?? '',
        (k) => (k ? (bySeller ? v.rows.find((r) => r.sellerId === k)?.sellerName : v.rows.find((r) => r.unitId === k)?.unitName) ?? '—' : bySeller ? 'Sem vendedor' : 'Sem unidade'),
      )
      return { ...base, rows, totals: v.totals }
    }
    case 'comparativo-mensal': return { ...base, ...(await monthlyComparison(p, refs)) }
    case 'orcado-realizado': return { ...base, regime: 'competencia' as Regime, ...(await budgetReport(p, refs)) }
    case 'aging': return { ...base, ...(await aging(p)) }
  }
}

async function loadSellers(tenantId: string) {
  const rows = await prisma.seller.findMany({ where: { unit: { tenantId } }, select: { id: true, fullName: true, shortName: true }, orderBy: { fullName: 'asc' } })
  return rows.map((s) => ({ id: s.id, name: s.shortName || s.fullName }))
}

// ── Despesas por categoria (árvore + comparação com o período anterior) ─────
async function expensesByCategory(p: ReportParams, refs: FinanceRefs) {
  const prev = previousRange(p.periods[0], p.periods[p.periods.length - 1])
  const prevPeriods = monthsBetween(prev.from, prev.to, 600)
  const { entries } = await loadAllocated({ ...p, periods: [...prevPeriods, ...p.periods], refs })
  const current = new Set(p.periods)
  const cur = new Map<string, number>(), old = new Map<string, number>()
  const pseudo = new Map<string, CatNode>()
  for (const e of entries) {
    if (e.type !== 'DESPESA' || !inDre(e)) continue
    let id = e.categoryId
    if (!id) {
      id = `sem:${e.group}`
      if (!pseudo.has(id)) pseudo.set(id, { id, name: `Sem categoria — ${DRE_GROUP_BY_KEY[e.group]?.label ?? e.group}`, parentId: null, code: '999', sortOrder: 0, kind: 'DESPESA' })
    }
    const m = current.has(e.period) ? cur : old
    m.set(id, (m.get(id) ?? 0) + e.amount)
  }
  const total = r2([...cur.values()].reduce((s, v) => s + v, 0))
  const previousTotal = r2([...old.values()].reduce((s, v) => s + v, 0))
  const rows = buildCategoryTree([...refs.cats, ...pseudo.values()], cur, old, total)
  return {
    previous: { from: prev.from, to: prev.to },
    total, previousTotal, variation: previousTotal ? r2(((total - previousTotal) / previousTotal) * 100) : null,
    rows,
    chart: rows.filter((r) => r.depth === 0).map((r) => ({ name: r.name, value: r.current, previous: r.previous })),
  }
}

// ── Centro de custo ─────────────────────────────────────────────────────────
async function byCostCenter(p: ReportParams, refs: FinanceRefs) {
  const { entries } = await loadAllocated({ ...p, refs })
  const names = new Map(refs.costCenters.map((c) => [c.id, c.name]))
  const acc = new Map<string, { receitas: number; despesas: number; count: number }>()
  for (const e of entries) {
    if (!inDre(e)) continue
    const k = e.costCenterId ?? ''
    const a = acc.get(k) ?? { receitas: 0, despesas: 0, count: 0 }
    if (e.type === 'RECEITA') a.receitas += e.amount
    else a.despesas += e.amount
    a.count++
    acc.set(k, a)
  }
  const totalDesp = [...acc.values()].reduce((s, a) => s + a.despesas, 0)
  const rows = [...acc].map(([id, a]) => ({
    id: id || null, name: id ? names.get(id) ?? 'Centro removido' : 'Sem centro de custo',
    receitas: r2(a.receitas), despesas: r2(a.despesas), resultado: r2(a.receitas - a.despesas), count: a.count, shareDespesas: pct(a.despesas, totalDesp),
  })).sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.despesas - a.despesas)
  const totals = rows.reduce((t, r) => ({ receitas: r2(t.receitas + r.receitas), despesas: r2(t.despesas + r.despesas), resultado: r2(t.resultado + r.resultado) }), { receitas: 0, despesas: 0, resultado: 0 })
  return { rows, totals }
}

// ── Fornecedores (ranking de gastos) ────────────────────────────────────────
async function bySupplier(p: ReportParams, refs: FinanceRefs) {
  const { entries } = await loadAllocated({ ...p, refs })
  const desp = entries.filter((e) => e.type === 'DESPESA' && inDre(e))
  const supplierIds = [...new Set(desp.map((e) => e.supplierId).filter((x): x is string => !!x))]
  const suppliers = supplierIds.length
    ? await prisma.supplier.findMany({ where: { id: { in: supplierIds }, tenantId: p.tenantId }, select: { id: true, name: true, document: true } })
    : []
  const supName = new Map(suppliers.map((s) => [s.id, s.name]))
  const acc = new Map<string, { name: string; supplierId: string | null; total: number; count: number; last: Date | null; groups: Map<string, number> }>()
  for (const e of desp) {
    let key: string, name: string
    if (e.employeeUserId) { key = 'folha'; name = PAYROLL_LABEL }
    else if (e.supplierId) { key = `s:${e.supplierId}`; name = supName.get(e.supplierId) ?? e.counterparty ?? 'Fornecedor removido' }
    else if (e.counterparty?.trim()) { key = `c:${norm(e.counterparty)}`; name = e.counterparty.trim() }
    else { key = 'none'; name = 'Não informado' }
    const a = acc.get(key) ?? { name, supplierId: e.employeeUserId ? null : e.supplierId, total: 0, count: 0, last: null, groups: new Map() }
    a.total += e.amount
    a.count++
    a.groups.set(e.group, (a.groups.get(e.group) ?? 0) + e.amount)
    const d = entryDate(e, p.regime)
    if (d && (!a.last || d > a.last)) a.last = d
    acc.set(key, a)
  }
  const total = r2([...acc.values()].reduce((s, a) => s + a.total, 0))
  const all = [...acc].map(([key, a]) => {
    const mainGroup = [...a.groups].sort((x, y) => y[1] - x[1])[0]?.[0]
    return { key, name: a.name, supplierId: a.supplierId, total: r2(a.total), count: a.count, share: pct(a.total, total), lastDate: a.last, mainGroup: mainGroup ? DRE_GROUP_BY_KEY[mainGroup]?.label ?? mainGroup : null }
  }).sort((a, b) => b.total - a.total)
  return { total, suppliersCount: all.length, rows: all.slice(0, 200), chart: all.slice(0, 10).map((r) => ({ name: r.name, value: r.total })) }
}

// ── Lucratividade por veículo vendido ───────────────────────────────────────
export interface VehicleProfitRow extends VehicleProfitMath {
  id: string
  vehicleId: string | null
  dealId: string
  dealNumber: string | null
  plate: string | null
  description: string
  saleDate: Date
  sellerId: string | null
  sellerName: string | null
  unitId: string | null
  unitName: string | null
  daysInStock: number | null
  acquisitionSource: 'LANCAMENTOS' | 'TROCA' | 'CADASTRO' | null
}

async function vehicleProfitability(p: ReportParams, refs: FinanceRefs): Promise<{ rows: VehicleProfitRow[]; totals: ProfitAggregate | null }> {
  const { start, end } = monthBounds(p.periods[0], p.periods[p.periods.length - 1])
  const deals = await prisma.deal.findMany({
    where: {
      tenantId: p.tenantId, type: { in: [...SALE_DEAL_TYPES] },
      ...(p.unitId ? { unitId: p.unitId } : {}), ...(p.sellerId ? { sellerId: p.sellerId } : {}),
      ...commissionEligibleDealWindowWhere({ start, end }),
    },
    select: {
      id: true, dealNumber: true, sellerId: true, unitId: true, saleAmount: true, vehicleValue: true, returnNetValue: true,
      approvedAt: true, releasedAt: true, finalizedAt: true, saleDate: true, createdAt: true,
      seller: { select: { fullName: true, shortName: true } },
      vehicles: { where: { role: 'VENDIDO' }, select: { id: true, vehicleId: true, agreedValue: true, plate: true, brand: true, model: true, year: true } },
    },
  })
  const sold = deals.flatMap((d) => d.vehicles.map((v) => ({ deal: d, dv: v })))
  if (!sold.length) return { rows: [], totals: null }
  const dealIds = deals.map((d) => d.id)
  const vehicleIds = [...new Set(sold.map((s) => s.dv.vehicleId).filter((x): x is string => !!x))]

  const [vehicles, entries, calcs, trades] = await Promise.all([
    vehicleIds.length
      ? prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plate: true, brand: true, model: true, modelYear: true, year: true, purchasePrice: true, salePrice: true, entryDate: true, createdAt: true } })
      : [],
    prisma.financialEntry.findMany({
      where: {
        tenantId: p.tenantId, status: { not: 'CANCELADO' }, transferGroupId: null,
        OR: [...(vehicleIds.length ? [{ vehicleId: { in: vehicleIds } }] : []), { dealId: { in: dealIds } }],
      },
      select: { type: true, amount: true, source: true, categoryId: true, vehicleId: true, dealId: true },
    }),
    prisma.commissionCalculation.findMany({
      where: { tenantId: p.tenantId, status: { not: 'CANCELADO' }, contract: { dealId: { in: dealIds } } },
      select: { commissionValue: true, contract: { select: { dealId: true } } },
    }),
    vehicleIds.length
      ? prisma.dealVehicle.findMany({
          where: { vehicleId: { in: vehicleIds }, role: 'TROCA', deal: { tenantId: p.tenantId, status: { notIn: ['CANCELADA', 'DESAPROVADA', 'RECUSADA', 'RASCUNHO'] } } },
          select: { vehicleId: true, agreedValue: true, evaluatedValue: true },
        })
      : [],
  ])

  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const tradeValue = new Map<string, number>()
  for (const t of trades) if (t.vehicleId) tradeValue.set(t.vehicleId, Number(t.agreedValue ?? t.evaluatedValue ?? 0))
  const vehCost = new Map<string, { acq: number; prep: number; doc: number; hasAcq: boolean }>()
  const dealFi = new Map<string, number>(), dealComEntries = new Map<string, number>()
  const vehFi = new Map<string, number>()
  for (const e of entries) {
    const amount = Number(e.amount)
    const type = e.type as 'RECEITA' | 'DESPESA'
    const group = refs.groupOf({ type, source: e.source, categoryId: e.categoryId })
    const signedCost = type === 'DESPESA' ? amount : -amount
    if (e.vehicleId && vById.has(e.vehicleId) && (group === 'CMV_AQUISICAO' || group === 'CMV_PREPARACAO' || group === 'CMV_DOCUMENTACAO')) {
      const c = vehCost.get(e.vehicleId) ?? { acq: 0, prep: 0, doc: 0, hasAcq: false }
      if (group === 'CMV_AQUISICAO') { c.acq += signedCost; c.hasAcq = true }
      else if (group === 'CMV_PREPARACAO') c.prep += signedCost
      else c.doc += signedCost
      vehCost.set(e.vehicleId, c)
    } else if (group === 'REC_FI') {
      const v = type === 'RECEITA' ? amount : -amount
      if (e.dealId) dealFi.set(e.dealId, (dealFi.get(e.dealId) ?? 0) + v)
      else if (e.vehicleId) vehFi.set(e.vehicleId, (vehFi.get(e.vehicleId) ?? 0) + v)
    } else if (group === 'DESP_COMISSOES' && e.dealId) {
      dealComEntries.set(e.dealId, (dealComEntries.get(e.dealId) ?? 0) + signedCost)
    }
  }
  const dealCom = new Map<string, number>()
  for (const c of calcs) {
    const id = c.contract?.dealId
    if (id) dealCom.set(id, (dealCom.get(id) ?? 0) + Number(c.commissionValue))
  }

  const units = new Map(refs.units.map((u) => [u.id, u.name]))
  const rows: VehicleProfitRow[] = sold.map(({ deal, dv }) => {
    const v = dv.vehicleId ? vById.get(dv.vehicleId) : undefined
    const single = deal.vehicles.length === 1
    const saleValue = Number(dv.agreedValue ?? (single ? deal.vehicleValue ?? deal.saleAmount : null) ?? v?.salePrice ?? 0)
    // Comissão e retorno são da negociação: com vários carros, rateio pelo valor de venda.
    const dealSale = deal.vehicles.reduce((s, x) => s + Number(x.agreedValue ?? 0), 0)
    const share = single ? 1 : dealSale > 0 ? Number(dv.agreedValue ?? 0) / dealSale : 1 / deal.vehicles.length
    const cost = dv.vehicleId ? vehCost.get(dv.vehicleId) : undefined
    let acquisition = cost?.acq ?? 0
    let acquisitionSource: VehicleProfitRow['acquisitionSource'] = cost?.hasAcq ? 'LANCAMENTOS' : null
    if (!cost?.hasAcq && dv.vehicleId) {
      const t = tradeValue.get(dv.vehicleId)
      if (t) { acquisition = t; acquisitionSource = 'TROCA' }
      else if (v?.purchasePrice != null && Number(v.purchasePrice) > 0) { acquisition = Number(v.purchasePrice); acquisitionSource = 'CADASTRO' }
    }
    const commissions = (dealCom.has(deal.id) ? dealCom.get(deal.id)! : dealComEntries.get(deal.id) ?? 0) * share
    const fiFromEntries = (dealFi.get(deal.id) ?? 0) * share + (dv.vehicleId ? vehFi.get(dv.vehicleId) ?? 0 : 0)
    const fiReturn = dealFi.has(deal.id) || (dv.vehicleId && vehFi.has(dv.vehicleId)) ? fiFromEntries : Number(deal.returnNetValue ?? 0) * share
    const saleDate = deal.approvedAt ?? deal.releasedAt ?? deal.finalizedAt ?? deal.saleDate ?? deal.createdAt
    const entryAt = v?.entryDate ?? v?.createdAt ?? null
    const plate = dv.plate ?? v?.plate ?? null
    const desc = [dv.brand ?? v?.brand, dv.model ?? v?.model, dv.year ?? v?.modelYear ?? v?.year].filter(Boolean).join(' ')
    return {
      ...vehicleProfit({ saleValue: r2(saleValue), acquisition: r2(acquisition), preparation: r2(cost?.prep ?? 0), documentation: r2(cost?.doc ?? 0), commissions: r2(commissions), fiReturn: r2(fiReturn) }),
      id: dv.id, vehicleId: dv.vehicleId, dealId: deal.id, dealNumber: deal.dealNumber, plate, description: desc || 'Veículo',
      saleDate, sellerId: deal.sellerId, sellerName: deal.seller ? deal.seller.shortName || deal.seller.fullName : null,
      unitId: deal.unitId, unitName: deal.unitId ? units.get(deal.unitId) ?? null : null,
      daysInStock: entryAt ? Math.max(0, daysBetweenSP(entryAt, saleDate)) : null,
      acquisitionSource,
    }
  }).sort((a, b) => +b.saleDate - +a.saleDate)
  return { rows, totals: aggregateProfit(rows, () => 'total', () => 'Total')[0] ?? null }
}

// ── Comparativo mensal (12 meses + ano anterior) ────────────────────────────
async function monthlyComparison(p: ReportParams, refs: FinanceRefs) {
  const to = p.periods[p.periods.length - 1]
  const months = monthsBetween(addMonths(to, -11), to)
  const prior = months.map((m) => addMonths(m, -12))
  const { entries } = await loadAllocated({ ...p, periods: [...prior, ...months], refs })
  const sums = new Map(sumByPeriod(entries, [...prior, ...months]).map((s) => [s.period, s]))
  const hasPrior = prior.some((m) => (sums.get(m)?.receitas ?? 0) !== 0 || (sums.get(m)?.despesas ?? 0) !== 0)
  const rows = months.map((m, i) => {
    const s = sums.get(m)!, py = sums.get(prior[i])!
    return {
      period: m, receitas: s.receitas, despesas: s.despesas, resultado: s.resultado, margem: pct(s.resultado, s.receitas),
      prior: hasPrior ? { period: prior[i], receitas: py.receitas, despesas: py.despesas, resultado: py.resultado } : null,
      yoyReceitas: hasPrior && py.receitas ? r2(((s.receitas - py.receitas) / Math.abs(py.receitas)) * 100) : null,
      yoyResultado: hasPrior && py.resultado ? r2(((s.resultado - py.resultado) / Math.abs(py.resultado)) * 100) : null,
    }
  })
  const t = rows.reduce((a, r) => ({ receitas: a.receitas + r.receitas, despesas: a.despesas + r.despesas }), { receitas: 0, despesas: 0 })
  return {
    months, hasPrior, rows,
    totals: { receitas: r2(t.receitas), despesas: r2(t.despesas), resultado: r2(t.receitas - t.despesas), margem: pct(t.receitas - t.despesas, t.receitas) },
  }
}

// ── Orçado × realizado (competência) ────────────────────────────────────────
async function budgetReport(p: ReportParams, refs: FinanceRefs) {
  const [budgets, { entries }] = await Promise.all([
    prisma.financialBudget.findMany({
      where: { tenantId: p.tenantId, month: { in: p.periods }, ...(p.costCenterId ? { costCenterId: p.costCenterId === 'none' ? null : p.costCenterId } : {}) },
      select: { categoryId: true, amount: true, month: true },
    }),
    loadAllocated({ ...p, regime: 'competencia', refs }),
  ])
  const kind = new Map(refs.cats.map((c) => [c.id, c.kind]))
  const own = new Map<string, number>()
  const ownByMonth = new Map<string, Map<string, number>>()
  for (const e of entries) {
    if (!e.categoryId || !inDre(e)) continue
    const k = kind.get(e.categoryId)
    const v = !k || k === e.type ? e.amount : -e.amount
    own.set(e.categoryId, (own.get(e.categoryId) ?? 0) + v)
    const m = ownByMonth.get(e.period) ?? new Map<string, number>()
    m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + v)
    ownByMonth.set(e.period, m)
  }
  const rows = budgetVsActual(budgets.map((b) => ({ categoryId: b.categoryId, amount: Number(b.amount) })), own, refs.cats)
  const sum = (kindOf: 'RECEITA' | 'DESPESA') => {
    const top = rows.filter((r) => r.topLevel && r.kind === kindOf)
    const budget = r2(top.reduce((s, r) => s + r.budget, 0)), actual = r2(top.reduce((s, r) => s + r.actual, 0))
    return { budget, actual, deviation: r2(actual - budget), deviationPct: budget ? r2(((actual - budget) / budget) * 100) : null }
  }
  const monthly = p.periods.map((m) => {
    const mb = budgets.filter((b) => b.month === m)
    const r = budgetVsActual(mb.map((b) => ({ categoryId: b.categoryId, amount: Number(b.amount) })), ownByMonth.get(m) ?? new Map(), refs.cats).filter((x) => x.topLevel && x.kind === 'DESPESA')
    return { period: m, budget: r2(r.reduce((s, x) => s + x.budget, 0)), actual: r2(r.reduce((s, x) => s + x.actual, 0)) }
  })
  return { rows, totals: { receitas: sum('RECEITA'), despesas: sum('DESPESA') }, monthly, hasBudget: budgets.length > 0 }
}

// ── Aging (contas a pagar e a receber em aberto, posição de hoje) ───────────
async function aging(p: ReportParams) {
  const open = await prisma.financialEntry.findMany({
    where: {
      tenantId: p.tenantId, status: 'PREVISTO', transferGroupId: null,
      ...(p.costCenterId ? { costCenterId: p.costCenterId === 'none' ? null : p.costCenterId } : {}),
      ...(p.unitId ? { unitId: p.unitId } : {}),
    },
    select: { id: true, type: true, amount: true, dueDate: true, description: true, counterparty: true, employeeUserId: true, supplierId: true },
  })
  const list = open.map((e) => ({ ...e, type: e.type as 'RECEITA' | 'DESPESA', amount: Number(e.amount) })).filter((e) => e.amount > 0)
  const summary = agingSummary(list, p.now)
  const overdue = list
    .map((e) => ({ ...e, ...agingBucket(e.dueDate, p.now) }))
    .filter((e) => e.bucket !== 'A_VENCER')
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
    .slice(0, 100)
    .map((e) => {
      const hide = !!e.employeeUserId && !p.canSeePayroll
      return {
        id: e.id, type: e.type, amount: r2(e.amount), dueDate: e.dueDate, daysOverdue: e.daysOverdue, bucket: e.bucket as AgingBucket,
        description: hide ? PAYROLL_LABEL : e.description, counterparty: hide ? null : e.counterparty,
      }
    })
  const total = (t: typeof summary.pagar) => {
    const all = Object.values(t)
    return { total: r2(all.reduce((s, x) => s + x.total, 0)), count: all.reduce((s, x) => s + x.count, 0), vencido: r2(all.reduce((s, x) => s + x.total, 0) - t.A_VENCER.total) }
  }
  return {
    buckets: AGING_BUCKETS,
    pagar: summary.pagar, receber: summary.receber,
    totals: { pagar: total(summary.pagar), receber: total(summary.receber) },
    overdue,
  }
}
