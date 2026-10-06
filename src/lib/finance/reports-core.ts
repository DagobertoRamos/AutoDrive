// =============================================================================
// Centro Financeiro — núcleo PURO da DRE gerencial e dos relatórios (testado).
//   • períodos (meses em America/Sao_Paulo);
//   • alocação dos lançamentos por regime (competência × caixa), com o custo do
//     veículo indo para o CMV no mês da VENDA do carro (competência);
//   • análise vertical, detalhamento por categoria, lucratividade, aging,
//     árvore de categorias, orçado × realizado e CSV.
// Sem Prisma/Next: recebe dados prontos e devolve números.
// =============================================================================

import { DRE_GROUP_BY_KEY, VEHICLE_COST_GROUPS, type DreLine } from './dre-core'

export type Regime = 'competencia' | 'caixa'
export type EntryType = 'RECEITA' | 'DESPESA'

const TZ = 'America/Sao_Paulo'
const ymFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' })
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const DAY_MS = 86_400_000

export const r2 = (n: number) => Math.round(n * 100) / 100

// ── Períodos ────────────────────────────────────────────────────────────────
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
export const isMonthKey = (s: string | null | undefined): s is string => !!s && MONTH_RE.test(s)

/** Chave `YYYY-MM` do mês civil em São Paulo. */
export function monthKeySP(d: Date): string {
  const p = Object.fromEntries(ymFmt.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}`
}

/** Chave `YYYY-MM-DD` do dia civil em São Paulo. */
export function dayKeySP(d: Date): string {
  const p = Object.fromEntries(ymdFmt.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

const dayKeyUtc = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))

/** Dias civis (SP) entre duas datas: b − a. */
export function daysBetweenSP(a: Date, b: Date): number {
  return Math.round((dayKeyUtc(dayKeySP(b)) - dayKeyUtc(dayKeySP(a))) / DAY_MS)
}

export function addMonths(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12
  return `${yy}-${String(mm + 1).padStart(2, '0')}`
}

/** Meses de `from` a `to` (inclusive), limitado a `max` meses (corta o início). */
export function monthsBetween(from: string, to: string, max = 36): string[] {
  if (from > to) [from, to] = [to, from]
  const out: string[] = []
  for (let k = from; k <= to && out.length < 600; k = addMonths(k, 1)) out.push(k)
  return out.slice(-max)
}

/** Período anterior de mesmo tamanho (ex.: jan–mar → out–dez). */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const n = monthsBetween(from, to, 600).length
  return { from: addMonths(from, -n), to: addMonths(from, -1) }
}

/** Resolve `from`/`to` da query com padrão (últimos `defaultBack` meses + o atual). */
export function resolveRange(from: string | null, to: string | null, now: Date, defaultBack = 6, max = 36): { from: string; to: string; periods: string[] } {
  const cur = monthKeySP(now)
  const t = isMonthKey(to) ? to : cur
  const f = isMonthKey(from) ? from : addMonths(t, -defaultBack)
  const periods = monthsBetween(f, t, max)
  return { from: periods[0], to: periods[periods.length - 1], periods }
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const monthLabel = (ym: string) => `${MONTHS_PT[Number(ym.slice(5, 7)) - 1] ?? ym}/${ym.slice(2, 4)}`

// ── Alocação dos lançamentos ────────────────────────────────────────────────
export interface RawEntry {
  id: string
  type: EntryType
  status: string
  amount: number
  dueDate: Date | null
  paidDate: Date | null
  competenceDate: Date | null
  categoryId: string | null
  costCenterId: string | null
  vehicleId: string | null
  dealId: string | null
  supplierId: string | null
  counterparty: string | null
  source: string | null
  employeeUserId: string | null
  unitId: string | null
  sellerId: string | null
  transferGroupId: string | null
  /** Juros/multa e desconto da baixa (o amount pago já os inclui). */
  interestAmount?: number | null
  discountAmount?: number | null
  description?: string | null
  commissionCalculationId?: string | null
  /** Grupo da DRE já decidido (parte do recebimento rateado, custo de serviço vendido). */
  groupOverride?: string | null
  /** Centro efetivo (id): o escolhido no lançamento ou o derivado da origem. */
  centerId?: string | null
  /** Parte do recebimento rateado: VEICULO | DOCUMENTACAO | SERV_<dealServiceId>. */
  part?: string | null
}

export interface AllocatedEntry extends RawEntry {
  group: string
  period: string
  /** Lançado no mês da venda do veículo (e não no mês do próprio custo). */
  reallocated: boolean
}

export interface StockCost { total: number; vehicles: number; byGroup: Record<string, number> }

export interface AllocationResult { entries: AllocatedEntry[]; stock: StockCost }

const REALIZED = new Set(['PAGO', 'RECEBIDO'])

/**
 * Separa juros e desconto da baixa: a categoria fica com o valor original e a
 * diferença vai para o resultado financeiro (juros pagos/recebidos, desconto
 * obtido) ou dedução (desconto concedido).
 */
export function splitSettlement(e: AllocatedEntry): AllocatedEntry[] {
  const interest = Math.max(0, Number(e.interestAmount ?? 0))
  const discount = Math.max(0, Number(e.discountAmount ?? 0))
  if (!interest && !discount) return [e]
  const out: AllocatedEntry[] = [{ ...e, amount: r2(e.amount - interest + discount) }]
  const isExpense = e.type === 'DESPESA'
  if (interest) out.push({ ...e, amount: interest, group: isExpense ? 'FIN_DESPESAS' : 'FIN_RECEITAS' })
  if (discount) out.push({ ...e, type: isExpense ? 'RECEITA' : 'DESPESA', amount: discount, group: isExpense ? 'FIN_RECEITAS' : 'DED_DEVOLUCOES' })
  return out
}

/** Data que posiciona o lançamento no regime (null = fora do regime). */
export function entryDate(e: Pick<RawEntry, 'status' | 'competenceDate' | 'dueDate' | 'paidDate'>, regime: Regime): Date | null {
  if (e.status === 'CANCELADO') return null
  if (regime === 'caixa') return REALIZED.has(e.status) ? e.paidDate : null
  return e.competenceDate ?? e.dueDate ?? e.paidDate
}

/**
 * Distribui os lançamentos nos meses do relatório.
 *   competência: data = competência → vencimento → pagamento; previstos entram.
 *     Custos do veículo (aquisição, preparação, documentação) com vehicleId vão
 *     para o mês da venda do carro; carro vendido antes do período fica de fora;
 *     carro não vendido até o fim do período vira "custo em estoque".
 *   caixa: só pagos/recebidos, pela data do pagamento; sem realocação.
 * Transferências e cancelados nunca entram.
 */
export function allocateEntries(
  raw: RawEntry[],
  opts: { regime: Regime; periods: string[]; groupOf: (e: RawEntry) => string; saleDateByVehicle: Map<string, Date> },
): AllocationResult {
  const periods = new Set(opts.periods)
  const last = opts.periods[opts.periods.length - 1] ?? ''
  const out: AllocatedEntry[] = []
  const stock: StockCost = { total: 0, vehicles: 0, byGroup: {} }
  const stockVehicles = new Set<string>()
  for (const e of raw) {
    if (e.transferGroupId || e.status === 'CANCELADO') continue
    const d = entryDate(e, opts.regime)
    const group = e.groupOverride ?? opts.groupOf(e)
    if (opts.regime === 'competencia' && e.vehicleId && VEHICLE_COST_GROUPS.has(group)) {
      const sale = opts.saleDateByVehicle.get(e.vehicleId)
      const saleKey = sale ? monthKeySP(sale) : null
      if (saleKey && saleKey <= last) {
        if (periods.has(saleKey)) out.push(...splitSettlement({ ...e, group, period: saleKey, reallocated: true }))
        continue // vendido antes do período: custo já foi para a DRE daquele mês
      }
      if (d && monthKeySP(d) <= last) {
        const signed = e.type === 'DESPESA' ? e.amount : -e.amount
        stock.total += signed
        stock.byGroup[group] = r2((stock.byGroup[group] ?? 0) + signed)
        stockVehicles.add(e.vehicleId)
      }
      continue
    }
    if (!d) continue
    const key = monthKeySP(d)
    if (periods.has(key)) out.push(...splitSettlement({ ...e, group, period: key, reallocated: false }))
  }
  stock.total = r2(stock.total)
  stock.vehicles = stockVehicles.size
  return { entries: out, stock }
}

/** Data da venda (mesma precedência da comissão) — a mais recente quando o carro foi vendido mais de uma vez. */
export function saleDateOf(deals: { approvedAt?: Date | null; releasedAt?: Date | null; finalizedAt?: Date | null; saleDate?: Date | null; createdAt?: Date | null }[]): Date | null {
  let best: Date | null = null
  for (const d of deals) {
    const ref = d.approvedAt ?? d.releasedAt ?? d.finalizedAt ?? d.saleDate ?? d.createdAt ?? null
    if (ref && (!best || ref > best)) best = ref
  }
  return best
}

// ── Análise vertical e detalhamento ─────────────────────────────────────────
export interface DreLineAv extends DreLine { av: Record<string, number | null>; avTotal: number | null }

const pct = (v: number, base: number): number | null => (base ? r2((v / base) * 100) : null)

/** % de cada linha sobre a receita líquida do mesmo período. */
export function verticalAnalysis(lines: DreLine[], periods: string[]): DreLineAv[] {
  const rl = lines.find((l) => l.key === 'RECEITA_LIQUIDA')
  return lines.map((l) => ({
    ...l,
    av: Object.fromEntries(periods.map((p) => [p, pct(l.values[p] ?? 0, rl?.values[p] ?? 0)])),
    avTotal: pct(l.total, rl?.total ?? 0),
  }))
}

export interface DrillRow { categoryId: string | null; label: string; values: Record<string, number>; total: number }

/** Categorias de cada linha da DRE (valores com o sinal da DRE), as maiores primeiro. */
export function drillDown(entries: AllocatedEntry[], periods: string[], catName: (id: string) => string, limit = 10): Record<string, DrillRow[]> {
  const acc = new Map<string, Map<string, Record<string, number>>>()
  for (const e of entries) {
    if (!DRE_GROUP_BY_KEY[e.group]) continue
    const g = acc.get(e.group) ?? new Map<string, Record<string, number>>()
    acc.set(e.group, g)
    const k = e.categoryId ?? ''
    const row = g.get(k) ?? {}
    g.set(k, row)
    row[e.period] = (row[e.period] ?? 0) + (e.type === 'RECEITA' ? e.amount : -e.amount)
  }
  const out: Record<string, DrillRow[]> = {}
  for (const [group, cats] of acc) {
    const rows: DrillRow[] = [...cats].map(([id, vals]) => {
      const values = Object.fromEntries(periods.map((p) => [p, r2(vals[p] ?? 0)]))
      return { categoryId: id || null, label: id ? catName(id) : 'Sem categoria', values, total: r2(periods.reduce((s, p) => s + values[p], 0)) }
    }).filter((r) => r.total !== 0 || periods.some((p) => r.values[p] !== 0))
    rows.sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    if (rows.length > limit) {
      const rest = rows.splice(limit - 1)
      const values = Object.fromEntries(periods.map((p) => [p, r2(rest.reduce((s, r) => s + r.values[p], 0))]))
      rows.push({ categoryId: null, label: `Outras (${rest.length})`, values, total: r2(rest.reduce((s, r) => s + r.total, 0)) })
    }
    out[group] = rows
  }
  return out
}

/** Receitas e despesas da DRE (fora: não operacional) somadas por período. */
export function sumByPeriod(entries: AllocatedEntry[], periods: string[]): { period: string; receitas: number; despesas: number; resultado: number }[] {
  const rec: Record<string, number> = {}, des: Record<string, number> = {}
  for (const e of entries) {
    const g = DRE_GROUP_BY_KEY[e.group]
    if (!g || g.section === 'FORA_DRE') continue
    if (e.type === 'RECEITA') rec[e.period] = (rec[e.period] ?? 0) + e.amount
    else des[e.period] = (des[e.period] ?? 0) + e.amount
  }
  return periods.map((p) => ({ period: p, receitas: r2(rec[p] ?? 0), despesas: r2(des[p] ?? 0), resultado: r2((rec[p] ?? 0) - (des[p] ?? 0)) }))
}

// ── Lucratividade ───────────────────────────────────────────────────────────
export interface VehicleProfitInput {
  saleValue: number
  acquisition: number
  preparation: number
  documentation: number
  commissions: number
  fiReturn: number
}
export interface VehicleProfitMath extends VehicleProfitInput { totalCost: number; profit: number; margin: number | null }

/** Lucro do carro = venda + retorno F&I − (aquisição + preparação + documentação + comissões). */
export function vehicleProfit(i: VehicleProfitInput): VehicleProfitMath {
  const totalCost = r2(i.acquisition + i.preparation + i.documentation + i.commissions)
  const profit = r2(i.saleValue + i.fiReturn - totalCost)
  return { ...i, totalCost, profit, margin: i.saleValue > 0 ? r2((profit / i.saleValue) * 100) : null }
}

export interface ProfitAggregate extends VehicleProfitMath { key: string; label: string; count: number; avgProfit: number; avgDays: number | null }

export function aggregateProfit<T extends VehicleProfitMath & { daysInStock: number | null }>(
  rows: T[], keyOf: (r: T) => string, labelOf: (key: string) => string,
): ProfitAggregate[] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = keyOf(r)
    map.set(k, [...(map.get(k) ?? []), r])
  }
  const out = [...map].map(([key, list]) => {
    const s = (f: (r: T) => number) => r2(list.reduce((a, r) => a + f(r), 0))
    const base = vehicleProfit({
      saleValue: s((r) => r.saleValue), acquisition: s((r) => r.acquisition), preparation: s((r) => r.preparation),
      documentation: s((r) => r.documentation), commissions: s((r) => r.commissions), fiReturn: s((r) => r.fiReturn),
    })
    const days = list.filter((r) => r.daysInStock != null)
    return {
      ...base, key, label: labelOf(key), count: list.length,
      avgProfit: r2(base.profit / list.length),
      avgDays: days.length ? Math.round(days.reduce((a, r) => a + (r.daysInStock ?? 0), 0) / days.length) : null,
    }
  })
  return out.sort((a, b) => b.profit - a.profit)
}

// ── Aging ───────────────────────────────────────────────────────────────────
export type AgingBucket = 'A_VENCER' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90'
export const AGING_BUCKETS: { key: AgingBucket; label: string }[] = [
  { key: 'A_VENCER', label: 'A vencer' },
  { key: 'D1_30', label: '1 a 30 dias' },
  { key: 'D31_60', label: '31 a 60 dias' },
  { key: 'D61_90', label: '61 a 90 dias' },
  { key: 'D90', label: 'Mais de 90 dias' },
]

/** Faixa pelo atraso em dias civis (SP). Sem vencimento ou vence hoje = a vencer. */
export function agingBucket(due: Date | null, today: Date): { bucket: AgingBucket; daysOverdue: number } {
  if (!due) return { bucket: 'A_VENCER', daysOverdue: 0 }
  const days = daysBetweenSP(due, today)
  if (days <= 0) return { bucket: 'A_VENCER', daysOverdue: days }
  if (days <= 30) return { bucket: 'D1_30', daysOverdue: days }
  if (days <= 60) return { bucket: 'D31_60', daysOverdue: days }
  if (days <= 90) return { bucket: 'D61_90', daysOverdue: days }
  return { bucket: 'D90', daysOverdue: days }
}

export type AgingTotals = Record<AgingBucket, { total: number; count: number }>
const emptyAging = (): AgingTotals => Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, { total: 0, count: 0 }])) as AgingTotals

export function agingSummary(entries: { type: EntryType; amount: number; dueDate: Date | null }[], today: Date): { pagar: AgingTotals; receber: AgingTotals } {
  const pagar = emptyAging(), receber = emptyAging()
  for (const e of entries) {
    const t = (e.type === 'DESPESA' ? pagar : receber)[agingBucket(e.dueDate, today).bucket]
    t.total = r2(t.total + e.amount)
    t.count++
  }
  return { pagar, receber }
}

// ── Árvore de categorias e orçado × realizado ───────────────────────────────
export interface CatNode { id: string; name: string; parentId: string | null; code: string | null; sortOrder: number; kind: EntryType }

/** Soma de cada categoria incluindo as descendentes. */
export function rollupByCategory(own: Map<string, number>, cats: CatNode[]): Map<string, number> {
  const byId = new Map(cats.map((c) => [c.id, c]))
  const out = new Map<string, number>()
  for (const [id, v] of own) {
    let c = byId.get(id)
    const seen = new Set<string>()
    if (!c) { out.set(id, r2((out.get(id) ?? 0) + v)); continue }
    while (c && !seen.has(c.id)) {
      seen.add(c.id)
      out.set(c.id, r2((out.get(c.id) ?? 0) + v))
      c = c.parentId ? byId.get(c.parentId) : undefined
    }
  }
  return out
}

const codeKey = (code: string | null) => (code ?? '').split('.').map((p) => p.padStart(4, '0')).join('.')

export interface TreeRow { id: string; name: string; code: string | null; depth: number; current: number; previous: number; share: number | null; variation: number | null; hasChildren: boolean }

/** Árvore (pai → filhos) com valor atual, anterior, % do total e variação. */
export function buildCategoryTree(cats: CatNode[], current: Map<string, number>, previous: Map<string, number>, total: number): TreeRow[] {
  const cur = rollupByCategory(current, cats), prev = rollupByCategory(previous, cats)
  const children = new Map<string | null, CatNode[]>()
  const ids = new Set(cats.map((c) => c.id))
  for (const c of cats) {
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null
    children.set(parent, [...(children.get(parent) ?? []), c])
  }
  const sort = (l: CatNode[]) => [...l].sort((a, b) => codeKey(a.code).localeCompare(codeKey(b.code)) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const rows: TreeRow[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const c of sort(children.get(parent) ?? [])) {
      const v = cur.get(c.id) ?? 0, p = prev.get(c.id) ?? 0
      if (!v && !p) continue
      const kids = (children.get(c.id) ?? []).some((k) => (cur.get(k.id) ?? 0) || (prev.get(k.id) ?? 0))
      rows.push({ id: c.id, name: c.name, code: c.code, depth, current: r2(v), previous: r2(p), share: pct(v, total), variation: p ? r2(((v - p) / Math.abs(p)) * 100) : null, hasChildren: kids })
      if (depth < 4) walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

export interface BudgetRow { categoryId: string; name: string; code: string | null; kind: EntryType; budget: number; actual: number; deviation: number; deviationPct: number | null; topLevel: boolean }

/**
 * Orçado × realizado por categoria orçada (realizado inclui as subcategorias).
 * Desvio = realizado − orçado (despesa positiva = estourou; receita positiva = superou).
 * `topLevel` = nenhuma categoria ancestral também está orçada (entra no total).
 */
export function budgetVsActual(budgets: { categoryId: string; amount: number }[], actualOwn: Map<string, number>, cats: CatNode[]): BudgetRow[] {
  const byId = new Map(cats.map((c) => [c.id, c]))
  const actual = rollupByCategory(actualOwn, cats)
  const budget = new Map<string, number>()
  for (const b of budgets) budget.set(b.categoryId, r2((budget.get(b.categoryId) ?? 0) + b.amount))
  const rows: BudgetRow[] = []
  for (const [id, amount] of budget) {
    const c = byId.get(id)
    let topLevel = true
    for (let p = c?.parentId ? byId.get(c.parentId) : undefined, i = 0; p && i < 6; p = p.parentId ? byId.get(p.parentId) : undefined, i++) {
      if (budget.has(p.id)) { topLevel = false; break }
    }
    const a = actual.get(id) ?? 0
    rows.push({ categoryId: id, name: c?.name ?? 'Categoria removida', code: c?.code ?? null, kind: c?.kind ?? 'DESPESA', budget: amount, actual: r2(a), deviation: r2(a - amount), deviationPct: amount ? r2(((a - amount) / amount) * 100) : null, topLevel })
  }
  return rows.sort((a, b) => (a.kind === b.kind ? codeKey(a.code).localeCompare(codeKey(b.code)) : a.kind === 'RECEITA' ? -1 : 1))
}

// ── CSV (Excel pt-BR: ';' e vírgula decimal) ────────────────────────────────
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return ''
    if (typeof v === 'number') return Number.isFinite(v) ? String(r2(v)).replace('.', ',') : ''
    const s = String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
}
