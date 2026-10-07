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
import { parseAddOns, summarizeFiContract } from './fi-receipt-core'
import {
  FI_REVENUE_TYPES, SERVICE_KINDS, SERVICE_KIND_BY_KEY, aggregateByCenter, aggregateServiceLines,
  fiRevenueType, isChargedDocDebt, serviceKindOf, serviceProfit,
} from './result-centers-core'
import { loadDealRefundLines } from './deal-refunds'
import { costOf, loadDealCommissions, type CostEntry, type DealCommission } from './deal-costs'
import { dealResultsReport } from './deal-result'
import { SALE_DEAL_TYPES, loadAllocated, loadFinanceRefs, monthBounds, type EntryFilters, type FinanceRefs } from './dre'
import {
  AGING_BUCKETS, addMonths, agingBucket, agingSummary, aggregateProfit, budgetVsActual, buildCategoryTree, daysBetweenSP,
  entryDate, monthsBetween, previousRange, r2, sumByPeriod, vehicleProfit,
  type AllocatedEntry, type AgingBucket, type CatNode, type ProfitAggregate, type Regime, type VehicleProfitMath,
} from './reports-core'

export const REPORT_VIEWS = [
  'resultado-centros', 'servicos', 'receitas-fi',
  'despesas-categoria', 'centro-custo', 'fornecedores', 'lucratividade-veiculo', 'lucratividade-vendedor',
  'lucratividade-unidade', 'comparativo-mensal', 'orcado-realizado', 'aging', 'cancelamentos', 'resultado-negociacao',
] as const
export type ReportView = (typeof REPORT_VIEWS)[number]
export const isReportView = (v: string | null): v is ReportView => !!v && (REPORT_VIEWS as readonly string[]).includes(v)

export interface ReportParams extends EntryFilters {
  tenantId: string
  view: ReportView
  periods: string[]
  regime: Regime
  sellerId?: string | null
  /** resultado-centros: detalhe de um centro (id | 'none'). */
  center?: string | null
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
    case 'resultado-centros':
    case 'centro-custo': return { ...base, ...(await resultByCenter(p, refs)) } // centro-custo = nome antigo
    case 'servicos': return { ...base, ...(await servicesReport(p)) }
    case 'receitas-fi': return { ...base, ...(await fiRevenues(p, refs)) }
    case 'despesas-categoria': return { ...base, ...(await expensesByCategory(p, refs)) }
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
    case 'cancelamentos': return { ...base, ...(await cancellations(p)) }
    case 'resultado-negociacao': return { ...base, ...(await dealResultsReport(p, refs)) }
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

// ── Resultado por área (centros de resultado e de custo) ────────────────────
const PART_LABEL: Record<string, string> = { VEICULO: 'rateio: veículo', DOCUMENTACAO: 'rateio: documentação' }
const partLabel = (part: string | null | undefined) => (!part ? null : PART_LABEL[part] ?? (part.startsWith('SERV_') ? 'rateio: serviço' : part))

/** Receitas × custos por centro; com `center` traz o detalhe (categorias, lançamentos e serviços). */
async function resultByCenter(p: ReportParams, refs: FinanceRefs) {
  const { entries } = await loadAllocated({ ...p, refs })
  const dre = entries.filter(inDre)
  const { rows, totals } = aggregateByCenter(dre.map((e) => ({ type: e.type, amount: e.amount, centerId: e.centerId ?? null })), refs.centers)
  const chart = rows.filter((r) => r.receitas || r.despesas).map((r) => ({ id: r.id, name: r.name, resultado: r.resultado, receitas: r.receitas, despesas: r.despesas }))
  if (!p.center) return { rows, totals, chart, detail: null }
  return { rows, totals, chart, detail: await centerDetail(p, refs, dre, rows) }
}

async function centerDetail(p: ReportParams, refs: FinanceRefs, dre: AllocatedEntry[], rows: ReturnType<typeof aggregateByCenter>['rows']) {
  const known = new Set(refs.centers.map((c) => c.id))
  const none = p.center === 'none'
  const mine = dre.filter((e) => (none ? !(e.centerId && known.has(e.centerId)) : e.centerId === p.center))
  const meta = none ? null : refs.centers.find((c) => c.id === p.center) ?? null
  const row = rows.find((r) => (none ? r.id === null : r.id === p.center)) ?? null

  const cats = new Map<string, { categoryId: string | null; label: string; type: 'RECEITA' | 'DESPESA'; amount: number; count: number }>()
  const groups = new Map<string, { group: string; label: string; receitas: number; despesas: number }>()
  for (const e of mine) {
    const k = `${e.type}:${e.categoryId ?? `sem:${e.group}`}`
    const c = cats.get(k) ?? { categoryId: e.categoryId, label: e.categoryId ? refs.catName(e.categoryId) : `Sem categoria — ${DRE_GROUP_BY_KEY[e.group]?.label ?? e.group}`, type: e.type, amount: 0, count: 0 }
    c.amount += e.amount
    c.count++
    cats.set(k, c)
    const g = groups.get(e.group) ?? { group: e.group, label: DRE_GROUP_BY_KEY[e.group]?.label ?? e.group, receitas: 0, despesas: 0 }
    if (e.type === 'RECEITA') g.receitas += e.amount
    else g.despesas += e.amount
    groups.set(e.group, g)
  }
  const byCategory = [...cats.values()].map((c) => ({ ...c, amount: r2(c.amount) }))
    .sort((a, b) => (a.type === b.type ? b.amount - a.amount : a.type === 'RECEITA' ? -1 : 1))
  const byGroup = [...groups.values()].map((g) => ({ ...g, receitas: r2(g.receitas), despesas: r2(g.despesas), resultado: r2(g.receitas - g.despesas) }))
    .sort((a, b) => b.receitas + b.despesas - (a.receitas + a.despesas))

  const list = [...mine].sort((a, b) => b.amount - a.amount).slice(0, 300).map((e, i) => {
    const hide = !!e.employeeUserId && !p.canSeePayroll
    return {
      key: `${e.id}:${e.part ?? ''}:${e.group}:${i}`, entryId: e.id, period: e.period, date: entryDate(e, p.regime),
      type: e.type, status: e.status, amount: r2(e.amount),
      description: hide ? PAYROLL_LABEL : e.description ?? null, counterparty: hide ? null : e.counterparty,
      category: e.categoryId ? refs.catName(e.categoryId) : null, group: DRE_GROUP_BY_KEY[e.group]?.label ?? e.group,
      dealId: e.dealId, part: partLabel(e.part),
    }
  })

  // Centro de serviço: linhas de serviço vendidas no período (cobrado × custo × comissão).
  const kinds = SERVICE_KINDS.filter((k) => meta?.key && k.center === meta.key).map((k) => k.key)
  const services = kinds.length ? await servicesReport(p, new Set(kinds)) : null

  return {
    center: row ?? { id: meta?.id ?? null, key: meta?.key ?? null, name: meta?.name ?? 'Sem centro', kind: meta?.kind ?? null, receitas: 0, despesas: 0, resultado: 0, margem: null, count: 0 },
    isServiceCenter: !!services,
    byCategory, byGroup,
    entries: list, entriesTotal: mine.length,
    services: services ? { lines: services.lines, rows: services.rows, totals: services.totals } : null,
  }
}

// ── Serviços vendidos (cobrado × custo real × comissões) ────────────────────
type CostStatus = import('./deal-costs').CostStatus

export interface ServiceSaleRow {
  id: string
  origin: 'SERVICO' | 'DOCUMENTACAO' | 'GARANTIA'
  kind: string
  kindLabel: string
  center: string
  date: Date
  dealId: string
  dealNumber: string | null
  customer: string | null
  plate: string | null
  vehicle: string | null
  service: string
  supplier: string | null
  charged: number
  cost: number
  costItems: { description: string; amount: number }[]
  commissions: number
  profit: number
  margin: number | null
  status: CostStatus
  /** Garantia de catálogo (WarrantySale): o preço não entra no saldo da negociação nem no rateio da DRE. */
  outsideBalance: boolean
}

/**
 * Serviços vendidos nas negociações do período (data da negociação, mesma
 * janela da comissão): documentação, cada DealService e as garantias vendidas.
 */
async function servicesReport(p: ReportParams, onlyKinds?: Set<string>) {
  const { start, end } = monthBounds(p.periods[0], p.periods[p.periods.length - 1])
  const deals = await prisma.deal.findMany({
    where: {
      tenantId: p.tenantId, type: { in: [...SALE_DEAL_TYPES] },
      ...(p.unitId ? { unitId: p.unitId } : {}), ...(p.sellerId ? { sellerId: p.sellerId } : {}),
      ...commissionEligibleDealWindowWhere({ start, end }),
    },
    select: {
      id: true, dealNumber: true, documentationFee: true, warrantyPaidBy: true,
      approvedAt: true, releasedAt: true, finalizedAt: true, saleDate: true, createdAt: true,
      customer: { select: { name: true } },
      vehicles: { where: { role: 'VENDIDO' }, select: { plate: true, brand: true, model: true } },
      services: { select: { id: true, name: true, value: true, cost: true, supplier: true, supplierId: true, kind: true } },
      debts: { select: { id: true, type: true, value: true, responsavel: true, description: true } },
      warrantySales: { select: { id: true, finalPrice: true, costValue: true, status: true, warranty: { select: { name: true } } } },
    },
  })
  const rows: ServiceSaleRow[] = []
  const dealIds = deals.map((d) => d.id)
  const [entries, commissions] = dealIds.length
    ? await Promise.all([
        prisma.financialEntry.findMany({
          where: {
            tenantId: p.tenantId, dealId: { in: dealIds }, status: { not: 'CANCELADO' }, type: 'DESPESA',
            OR: [{ source: { startsWith: 'NEG_SERV_' } }, { source: { startsWith: 'NEG_GAR_' } }, { source: { startsWith: 'NEG_DEBITO_' } }],
          },
          select: { source: true, amount: true, status: true, supplierId: true, counterparty: true, items: { select: { description: true, amount: true }, orderBy: { sortOrder: 'asc' } } },
        }),
        loadDealCommissions(p.tenantId, dealIds),
      ])
    : [[], []] as const
  const supplierIds = [...new Set([...entries.map((e) => e.supplierId), ...deals.flatMap((d) => d.services.map((s) => s.supplierId))].filter((x): x is string => !!x))]
  const suppliers = supplierIds.length ? await prisma.supplier.findMany({ where: { id: { in: supplierIds }, tenantId: p.tenantId }, select: { id: true, name: true } }) : []
  const supName = new Map(suppliers.map((s) => [s.id, s.name]))
  const bySource = new Map<string, CostEntry[]>()
  for (const e of entries) {
    const k = e.source ?? ''
    bySource.set(k, [...(bySource.get(k) ?? []), {
      amount: Number(e.amount), status: e.status, supplier: (e.supplierId ? supName.get(e.supplierId) : null) ?? e.counterparty ?? null,
      items: e.items.map((i) => ({ description: i.description, amount: r2(Number(i.amount)) })),
    }])
  }
  const sumCom = (f: (c: DealCommission) => boolean) => r2(commissions.filter(f).reduce((s, c) => s + c.value, 0))

  for (const d of deals) {
    const date = d.approvedAt ?? d.releasedAt ?? d.finalizedAt ?? d.saleDate ?? d.createdAt
    const v = d.vehicles[0]
    const common = {
      date, dealId: d.id, dealNumber: d.dealNumber, customer: d.customer?.name ?? null,
      plate: v?.plate ?? null, vehicle: [v?.brand, v?.model].filter(Boolean).join(' ') || null,
    }
    const push = (r: Omit<ServiceSaleRow, 'kindLabel' | 'center' | 'profit' | 'margin' | keyof typeof common>) => {
      if (onlyKinds && !onlyKinds.has(r.kind)) return
      const def = SERVICE_KIND_BY_KEY[r.kind] ?? SERVICE_KIND_BY_KEY.OUTRO
      const pr = serviceProfit({ charged: r.charged, cost: r.cost, commissions: r.commissions })
      rows.push({ ...common, ...r, kindLabel: def.label, center: def.center, profit: pr.profit, margin: pr.margin })
    }

    // Documentação: taxa + débitos de documentação cobrados do cliente.
    const docDebts = d.debts.filter(isChargedDocDebt)
    const docCharged = Number(d.documentationFee ?? 0) + docDebts.reduce((s, x) => s + Number(x.value), 0)
    const docEntries = docDebts.flatMap((x) => bySource.get(`NEG_DEBITO_${x.id}`) ?? [])
    if (docCharged > 0 || docEntries.length) {
      const c = costOf(docEntries, 0)
      push({
        id: `doc:${d.id}`, origin: 'DOCUMENTACAO', kind: 'DOCUMENTACAO',
        service: ['Documentação', ...docDebts.map((x) => x.description?.trim()).filter(Boolean)].join(' · '),
        supplier: docEntries.find((e) => e.supplier)?.supplier ?? null,
        charged: r2(docCharged), cost: c.cost, costItems: c.items, status: c.status,
        commissions: sumCom((x) => x.ruleType === 'DOCUMENTO' && x.dealId === d.id), outsideBalance: false,
      })
    }
    for (const s of d.services) {
      const ents = bySource.get(`NEG_SERV_${s.id}`) ?? []
      const c = costOf(ents, Number(s.cost ?? 0))
      push({
        id: `serv:${s.id}`, origin: 'SERVICO', kind: serviceKindOf(s), service: s.name,
        supplier: (s.supplierId ? supName.get(s.supplierId) : null) ?? s.supplier ?? ents.find((e) => e.supplier)?.supplier ?? null,
        charged: r2(Number(s.value ?? 0)), cost: c.cost, costItems: c.items, status: c.status,
        commissions: sumCom((x) => x.serviceId === s.id), outsideBalance: false,
      })
    }
    for (const w of d.warrantySales) {
      if (w.status !== 'ATIVA') continue
      const ents = bySource.get(`NEG_GAR_${w.id}`) ?? []
      const c = costOf(ents, Number(w.costValue ?? 0))
      push({
        id: `gar:${w.id}`, origin: 'GARANTIA', kind: 'GARANTIA', service: `Garantia ${w.warranty?.name ?? ''}`.trim(),
        supplier: ents.find((e) => e.supplier)?.supplier ?? null,
        charged: d.warrantyPaidBy === 'LOJA' ? 0 : r2(Number(w.finalPrice ?? 0)), cost: c.cost, costItems: c.items, status: c.status,
        commissions: sumCom((x) => x.warrantySaleId === w.id), outsideBalance: true,
      })
    }
  }
  rows.sort((a, b) => +b.date - +a.date)
  const lines = aggregateServiceLines(rows)
  const t = rows.reduce((a, r) => ({ charged: a.charged + r.charged, cost: a.cost + r.cost, commissions: a.commissions + r.commissions }), { charged: 0, cost: 0, commissions: 0 })
  return {
    lines, rows: rows.slice(0, 1000),
    totals: { ...serviceProfit(t), count: rows.length },
    chart: lines.map((l) => ({ name: l.label, cobrado: l.charged, custo: l.cost, comissoes: l.commissions, lucro: l.profit })),
  }
}

// ── Receitas de F&I (por banco e por tipo; contratos) ───────────────────────
const FI_PREFIXES = ['NEG_RETORNO_', 'NEG_PLUS_', 'NEG_AGREG_']
const paymentIdOfFi = (s: string | null | undefined) => {
  const pre = FI_PREFIXES.find((x) => s?.startsWith(x))
  return pre && s ? s.slice(pre.length).split('_')[0] : null
}

async function fiRevenues(p: ReportParams, refs: FinanceRefs) {
  const { entries } = await loadAllocated({ ...p, refs })
  const fi = entries.filter((e) => inDre(e) && (e.group === 'REC_FI' || !!paymentIdOfFi(e.source) || e.source === 'VEICULO_RETORNO'))
  const paymentIds = [...new Set(fi.map((e) => paymentIdOfFi(e.source)).filter((x): x is string => !!x))]
  const payments = paymentIds.length ? await prisma.dealPayment.findMany({ where: { id: { in: paymentIds } }, select: { id: true, bank: true } }) : []
  const bankOfPayment = new Map(payments.map((x) => [x.id, x.bank]))

  const typeLabel = Object.fromEntries(FI_REVENUE_TYPES.map((t) => [t.key, t.label])) as Record<string, string>
  const banks = new Map<string, { bank: string; previsto: number; recebido: number; byType: Record<string, number> }>()
  const types = new Map<string, { type: string; label: string; previsto: number; recebido: number }>()
  const list: { key: string; entryId: string; date: Date | null; bank: string; type: string; typeLabel: string; description: string | null; status: string; amount: number; dealId: string | null }[] = []
  for (const [i, e] of fi.entries()) {
    const pid = paymentIdOfFi(e.source)
    // Parte de recebimento rateada para F&I = serviço do tipo SEGURO vendido na negociação.
    const soldInsurance = !!e.part?.startsWith('SERV_')
    const type = fiRevenueType(e.source, e.categoryId ? refs.catCode(e.categoryId) : null, soldInsurance ? 'SEGURO' : null)
    const bank = ((pid ? bankOfPayment.get(pid) : null) ?? (soldInsurance ? 'Seguro vendido na negociação' : e.counterparty) ?? '').trim() || 'Não informado'
    const amount = e.type === 'RECEITA' ? e.amount : -e.amount
    const received = e.status === 'RECEBIDO' || e.status === 'PAGO'
    const bk = norm(bank)
    const b = banks.get(bk) ?? { bank, previsto: 0, recebido: 0, byType: {} }
    if (received) b.recebido += amount
    else b.previsto += amount
    b.byType[type] = (b.byType[type] ?? 0) + amount
    banks.set(bk, b)
    const t = types.get(type) ?? { type, label: typeLabel[type] ?? type, previsto: 0, recebido: 0 }
    if (received) t.recebido += amount
    else t.previsto += amount
    types.set(type, t)
    list.push({ key: `${e.id}:${e.part ?? ''}:${i}`, entryId: e.id, date: entryDate(e, p.regime), bank, type, typeLabel: typeLabel[type] ?? type, description: e.description ?? null, status: e.status, amount: r2(amount), dealId: e.dealId })
  }
  const byBank = [...banks.values()].map((b) => ({
    bank: b.bank, previsto: r2(b.previsto), recebido: r2(b.recebido), total: r2(b.previsto + b.recebido),
    byType: Object.fromEntries(Object.entries(b.byType).map(([k, v]) => [k, r2(v)])),
  })).sort((a, b) => b.total - a.total)
  const byType = FI_REVENUE_TYPES.filter((t) => types.has(t.key)).map((t) => {
    const x = types.get(t.key)!
    return { type: x.type, label: x.label, previsto: r2(x.previsto), recebido: r2(x.recebido), total: r2(x.previsto + x.recebido) }
  })
  const totals = byBank.reduce((a, b) => ({ previsto: r2(a.previsto + b.previsto), recebido: r2(a.recebido + b.recebido), total: r2(a.total + b.total) }), { previsto: 0, recebido: 0, total: 0 })

  return {
    totals, byBank, byType, types: FI_REVENUE_TYPES,
    chart: byBank.slice(0, 12).map((b) => ({ name: b.bank, previsto: b.previsto, recebido: b.recebido })),
    entries: list.sort((a, b) => b.amount - a.amount).slice(0, 500),
    ...(await fiContracts(p)),
  }
}

/** Contratos de financiamento das negociações do período (ILA/IOF/IRRF só aqui — área do financeiro). */
async function fiContracts(p: ReportParams) {
  const { start, end } = monthBounds(p.periods[0], p.periods[p.periods.length - 1])
  const deals = await prisma.deal.findMany({
    where: {
      tenantId: p.tenantId, type: { in: [...SALE_DEAL_TYPES] },
      ...(p.unitId ? { unitId: p.unitId } : {}), ...(p.sellerId ? { sellerId: p.sellerId } : {}),
      ...commissionEligibleDealWindowWhere({ start, end }),
      payments: { some: { type: 'FINANCIAMENTO' } },
    },
    select: {
      id: true, dealNumber: true, approvedAt: true, releasedAt: true, finalizedAt: true, saleDate: true, createdAt: true,
      returnGrossValue: true, ilaValue: true, iofValue: true, returnNetValue: true,
      customer: { select: { name: true } },
      vehicles: { where: { role: 'VENDIDO' }, select: { plate: true } },
      payments: {
        where: { type: 'FINANCIAMENTO' },
        select: { id: true, status: true, bank: true, value: true, contractNumber: true, returnGrossValue: true, ilaValue: true, iofValue: true, irrfValue: true, returnNetValue: true, plusValue: true, addOns: true },
      },
    },
  })
  const alive = (x: { status: string | null }) => String(x.status ?? '').toUpperCase() !== 'CANCELADO'
  const live = deals.flatMap((d) => d.payments.filter(alive).map((x) => ({ d, x })))
  const sources = live.map(({ x }) => `NEG_RETORNO_${x.id}`)
  const retEntries = sources.length
    ? await prisma.financialEntry.findMany({ where: { tenantId: p.tenantId, source: { in: sources }, status: { not: 'CANCELADO' } }, select: { source: true, status: true } })
    : []
  const retStatus = new Map(retEntries.map((e) => [e.source ?? '', e.status]))
  const n = (v: unknown) => (v == null ? null : r2(Number(v)))
  const contracts = live.map(({ d, x }) => {
    // Sem valor no contrato, o da negociação vale só se houver UM financiamento.
    const single = d.payments.filter(alive).length === 1
    const pick = (own: unknown, deal: unknown) => (own != null ? n(own) : single ? n(deal) : null)
    const gross = pick(x.returnGrossValue, d.returnGrossValue)
    const ila = pick(x.ilaValue, d.ilaValue)
    const iof = pick(x.iofValue, d.iofValue)
    const irrf = n(x.irrfValue)
    const net = pick(x.returnNetValue, d.returnNetValue)
    const plus = n(x.plusValue)
    const fi = summarizeFiContract({ financedAmount: x.value, returnNetValue: net, plusValue: plus, addOns: parseAddOns(x.addOns) })
    const st = retStatus.get(`NEG_RETORNO_${x.id}`)
    return {
      id: x.id, dealId: d.id, dealNumber: d.dealNumber, date: d.approvedAt ?? d.releasedAt ?? d.finalizedAt ?? d.saleDate ?? d.createdAt,
      customer: d.customer?.name ?? null, plate: d.vehicles[0]?.plate ?? null,
      bank: x.bank?.trim() || 'Não informado', contractNumber: x.contractNumber ?? null,
      financed: r2(Number(x.value ?? 0)), gross, ila, iof, irrf, net, plus,
      addOnsStore: fi.storeRevenueTotal, storeIncome: fi.storeIncome,
      returnStatus: (st === 'RECEBIDO' ? 'RECEBIDO' : st ? 'PREVISTO' : 'SEM_LANCAMENTO') as 'RECEBIDO' | 'PREVISTO' | 'SEM_LANCAMENTO',
    }
  }).sort((a, b) => +b.date - +a.date)
  const s = (f: (c: (typeof contracts)[number]) => number | null) => r2(contracts.reduce((a, c) => a + (f(c) ?? 0), 0))
  return {
    contracts: contracts.slice(0, 1000),
    contractTotals: {
      count: contracts.length, financed: s((c) => c.financed), gross: s((c) => c.gross), ila: s((c) => c.ila), iof: s((c) => c.iof),
      irrf: s((c) => c.irrf), net: s((c) => c.net), plus: s((c) => c.plus), addOnsStore: s((c) => c.addOnsStore), storeIncome: s((c) => c.storeIncome),
    },
  }
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

// ── Cancelamentos e estornos ─────────────────────────────────────────────────
// Negociações canceladas no período (data do cancelamento) com o que entrou,
// o que já foi estornado e o que segue retido na conta da loja.
const DEAL_TYPE_LABEL: Record<string, string> = { VENDA: 'Venda', TROCA: 'Troca', COMPRA: 'Compra', CONSIGNACAO: 'Consignação' }

async function cancellations(p: ReportParams) {
  const { start, end } = monthBounds(p.periods[0], p.periods[p.periods.length - 1])
  const deals = await prisma.deal.findMany({
    where: {
      tenantId: p.tenantId, status: 'CANCELADA', cancelledAt: { gte: start, lte: end },
      ...(p.unitId ? { unitId: p.unitId } : {}), ...(p.sellerId ? { sellerId: p.sellerId } : {}),
    },
    select: {
      id: true, dealNumber: true, type: true, cancelledAt: true, cancelledReason: true,
      customer: { select: { name: true } }, person: { select: { nomeCompleto: true } },
      seller: { select: { fullName: true, shortName: true } }, cancelledById: true,
      vehicles: { select: { role: true, plate: true, brand: true, model: true } },
    },
    orderBy: { cancelledAt: 'desc' },
    take: 500,
  })
  const userIds = [...new Set(deals.map((d) => d.cancelledById).filter((x): x is string => !!x))]
  const userName = new Map((userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]))
  const rows = [] as Array<{
    dealId: string; dealNumber: string | null; type: string; cancelledAt: Date | null; reason: string | null; cancelledBy: string | null
    customer: string | null; seller: string | null; vehicle: string | null
    received: number; refunded: number; retained: number; ownerPaid: number; ownerReturned: number; lastRefundAt: string | null
  }>
  for (const d of deals) {
    const lines = await loadDealRefundLines(d.id)
    const sum = (kind: string, f: (l: (typeof lines)[number]) => number) => r2(lines.filter((l) => l.kind === kind).reduce((s, l) => s + f(l), 0))
    const v = d.vehicles.find((x) => x.role === 'VENDIDO') ?? d.vehicles[0]
    const dates = lines.map((l) => l.refund?.date).filter((x): x is string => !!x).sort()
    rows.push({
      dealId: d.id, dealNumber: d.dealNumber, type: DEAL_TYPE_LABEL[d.type] ?? d.type, cancelledAt: d.cancelledAt, reason: d.cancelledReason,
      cancelledBy: d.cancelledById ? userName.get(d.cancelledById) ?? null : null,
      customer: d.person?.nomeCompleto ?? d.customer?.name ?? null, seller: d.seller ? d.seller.shortName || d.seller.fullName : null,
      vehicle: v ? [v.plate, [v.brand, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : null,
      received: sum('ESTORNO_CLIENTE', (l) => l.moved), refunded: sum('ESTORNO_CLIENTE', (l) => l.refunded), retained: sum('ESTORNO_CLIENTE', (l) => l.pending),
      ownerPaid: sum('DEVOLUCAO_PROPRIETARIO', (l) => l.moved), ownerReturned: sum('DEVOLUCAO_PROPRIETARIO', (l) => l.refunded),
      lastRefundAt: dates[dates.length - 1] ?? null,
    })
  }
  const tot = (k: 'received' | 'refunded' | 'retained' | 'ownerPaid' | 'ownerReturned') => r2(rows.reduce((s, r) => s + r[k], 0))
  return {
    rows,
    totals: {
      count: rows.length, received: tot('received'), refunded: tot('refunded'), retained: tot('retained'),
      ownerPending: r2(tot('ownerPaid') - tot('ownerReturned')),
      withRetained: rows.filter((r) => r.retained > 0.009).length,
    },
  }
}
