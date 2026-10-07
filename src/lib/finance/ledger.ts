// =============================================================================
// Razão do Centro Financeiro — PURO (testado em ledger.test.ts).
//   • saldo da conta = saldo inicial + Σ realizados (RECEBIDO/PAGO) a partir da
//     data do saldo inicial (sem data → conta tudo);
//   • extrato com saldo corrente; consolidado = contas ativas que entram no
//     total + lançamentos "Sem conta" (nada some);
//   • projeção diária e fluxo de caixa (realizado × previsto) por período.
// Todas as datas viram dia civil de São Paulo (YYYY-MM-DD) antes de comparar.
// =============================================================================

import { MoneySum, round2, toCents, fromCents } from './money'

export const SP_TZ = 'America/Sao_Paulo'

export type LedgerType = 'RECEITA' | 'DESPESA'
export type LedgerStatus = 'PREVISTO' | 'PAGO' | 'RECEBIDO' | 'CANCELADO'

export interface LedgerEntry {
  id: string
  type: LedgerType
  status: LedgerStatus
  amount: number
  paidDate: Date | null
  dueDate: Date | null
  competenceDate?: Date | null
  accountId: string | null
  transferGroupId?: string | null
}

export interface LedgerAccount {
  id: string
  name: string
  openingBalance: number
  openingDate: Date | null
  includeInTotal: boolean
  active: boolean
}

export const r2 = (n: number) => round2(n)

// ── Datas (dia civil em SP) ──────────────────────────────────────────────────
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Dia civil `YYYY-MM-DD` em São Paulo. */
export function spYmd(d: Date | string | null | undefined): string | null {
  if (d == null || d === '') return null
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return null
  const p = Object.fromEntries(ymdFmt.formatToParts(dt).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

export const isYmd = (s: string | null | undefined): s is string => !!s && YMD.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

/** `YYYY-MM` + n meses. */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

export const monthStart = (ym: string) => `${ym}-01`
export function monthEnd(ym: string): string {
  return addDays(monthStart(addMonths(ym, 1)), -1)
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_PT[m - 1]}/${String(y).slice(2)}`
}
export function dayLabel(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
}

// ── Lançamentos ──────────────────────────────────────────────────────────────
export const isRealized = (e: Pick<LedgerEntry, 'status'>) => e.status === 'PAGO' || e.status === 'RECEBIDO'
/** Valor com sinal: receita +, despesa −. */
export const signedAmount = (e: Pick<LedgerEntry, 'type' | 'amount'>) => (e.type === 'RECEITA' ? e.amount : -e.amount)
/** Dia em que o realizado mexe no saldo (pagamento; sem data de pagamento, o vencimento). */
export const realizedYmd = (e: Pick<LedgerEntry, 'paidDate' | 'dueDate'>) => spYmd(e.paidDate ?? e.dueDate)
/** Dia da competência (DRE/resultado): competência → vencimento → pagamento. */
export const competenceYmd = (e: Pick<LedgerEntry, 'competenceDate' | 'dueDate' | 'paidDate'>) => spYmd(e.competenceDate ?? e.dueDate ?? e.paidDate)

// ── Escopo (uma conta ou consolidado) ────────────────────────────────────────
export interface LedgerScope {
  /** Contas no escopo (as que entram no saldo). */
  accounts: LedgerAccount[]
  /** Lançamentos sem conta (ou com conta inexistente) entram? */
  includeNoAccount: boolean
  accountIds: Set<string>
  knownIds: Set<string>
  openingYmd: Map<string, string | null>
}

/** `accountId` = id da conta ou 'all' (consolidado: ativas que entram no total + "Sem conta"). */
export function makeScope(all: LedgerAccount[], accountId: string | null | undefined): LedgerScope {
  const single = accountId && accountId !== 'all' ? all.find((a) => a.id === accountId) : undefined
  const accounts = single ? [single] : accountId && accountId !== 'all' ? [] : all.filter((a) => a.active && a.includeInTotal)
  return {
    accounts,
    includeNoAccount: !accountId || accountId === 'all',
    accountIds: new Set(accounts.map((a) => a.id)),
    knownIds: new Set(all.map((a) => a.id)),
    openingYmd: new Map(accounts.map((a) => [a.id, spYmd(a.openingDate)])),
  }
}

export function inScope(e: Pick<LedgerEntry, 'accountId'>, s: LedgerScope): boolean {
  if (e.accountId && s.knownIds.has(e.accountId)) return s.accountIds.has(e.accountId)
  return s.includeNoAccount
}

/** Realizado que conta no saldo do escopo (respeita a data do saldo inicial da conta). */
export function countsInBalance(e: LedgerEntry, s: LedgerScope): boolean {
  if (!isRealized(e) || !inScope(e, s)) return false
  const opening = e.accountId ? s.openingYmd.get(e.accountId) : null
  if (!opening) return true
  const d = realizedYmd(e)
  return !d || d >= opening
}

/**
 * Saldo ao fim do dia `endYmd` (inclusive); `null` = saldo atual com tudo.
 * O saldo inicial de uma conta só vale a partir da sua data.
 */
export function balanceAsOf(entries: LedgerEntry[], s: LedgerScope, endYmd: string | null): number {
  const total = new MoneySum()
  for (const a of s.accounts) {
    const o = s.openingYmd.get(a.id)
    if (!endYmd || !o || o <= endYmd) total.add(a.openingBalance)
  }
  for (const e of entries) {
    if (!countsInBalance(e, s)) continue
    if (endYmd) {
      const d = realizedYmd(e)
      if (d && d > endYmd) continue
    }
    total.add(signedAmount(e))
  }
  return total.value
}

/** Saldo por conta (todas as contas informadas) + líquido dos realizados sem conta. */
export function balancesByAccount(entries: LedgerEntry[], accounts: LedgerAccount[], endYmd: string | null = null) {
  const byAccount = new Map<string, number>()
  for (const a of accounts) byAccount.set(a.id, balanceAsOf(entries, makeScope(accounts, a.id), endYmd))
  const known = new Set(accounts.map((a) => a.id))
  const noAccount = new MoneySum()
  for (const e of entries) {
    if (!isRealized(e) || (e.accountId && known.has(e.accountId))) continue
    const d = realizedYmd(e)
    if (endYmd && d && d > endYmd) continue
    noAccount.add(signedAmount(e))
  }
  return { byAccount, noAccount: noAccount.value }
}

/**
 * Remove transferências internas ao escopo: grupos cujas pernas presentes somam
 * zero (saída de uma conta + entrada na outra). Perna isolada (conta fora do
 * escopo) continua, porque mexe no saldo.
 */
export function dropInternalTransfers<T>(items: T[], groupOf: (t: T) => string | null | undefined, signedOf: (t: T) => number): T[] {
  const sums = new Map<string, number>()
  for (const t of items) {
    const g = groupOf(t)
    if (g) sums.set(g, (sums.get(g) ?? 0) + signedOf(t))
  }
  return items.filter((t) => {
    const g = groupOf(t)
    return !g || Math.abs(sums.get(g) ?? 0) > 0.005
  })
}

// ── Extrato com saldo corrente ───────────────────────────────────────────────
export interface RunningResult<T> {
  lines: (T & { balance: number })[]
  opening: number
  closing: number
  totalIn: number
  totalOut: number
}

/** `amount` já com sinal; as linhas devem vir ordenadas. */
export function runningBalance<T extends { amount: number }>(opening: number, lines: T[]): RunningResult<T> {
  let bal = toCents(opening)
  let totalIn = 0
  let totalOut = 0
  const out = lines.map((l) => {
    const c = toCents(l.amount)
    bal += c
    if (c >= 0) totalIn += c
    else totalOut -= c
    return { ...l, balance: fromCents(bal) }
  })
  return { lines: out, opening: round2(opening), closing: fromCents(bal), totalIn: fromCents(totalIn), totalOut: fromCents(totalOut) }
}

// ── Projeção diária do saldo ─────────────────────────────────────────────────
export interface DatedAmount { ymd: string; amount: number }
export interface ProjectionPoint { date: string; entradas: number; saidas: number; balance: number }

/**
 * Saldo projetado dia a dia de hoje até hoje+`days`: saldo atual + previstos a
 * receber − a pagar pelo vencimento. Vencidos entram no dia 0 (hoje).
 */
export function projectDailyBalance(startBalance: number, todayYmd: string, days: number, pending: DatedAmount[]): ProjectionPoint[] {
  const ins = new Map<string, number>()
  const outs = new Map<string, number>()
  const last = addDays(todayYmd, days)
  for (const p of pending) {
    const d = p.ymd < todayYmd ? todayYmd : p.ymd
    if (d > last) continue
    if (p.amount >= 0) ins.set(d, (ins.get(d) ?? 0) + p.amount)
    else outs.set(d, (outs.get(d) ?? 0) - p.amount)
  }
  const points: ProjectionPoint[] = []
  let bal = startBalance
  for (let i = 0; i <= days; i++) {
    const date = addDays(todayYmd, i)
    const e = r2(ins.get(date) ?? 0)
    const s = r2(outs.get(date) ?? 0)
    bal = r2(bal + e - s)
    points.push({ date, entradas: e, saidas: s, balance: bal })
  }
  return points
}

// ── Contas a receber / pagar por janela ──────────────────────────────────────
export interface DueWindow { count: number; total: number }
export interface DueSummary { overdue: DueWindow; today: DueWindow; next7: DueWindow; next30: DueWindow }

/** Janelas de vencimento: vencidos (< hoje), hoje, próximos 7 e 30 dias (incluindo hoje). Valores positivos. */
export function dueSummary(items: { ymd: string; amount: number }[], todayYmd: string): DueSummary {
  const z = (): DueWindow => ({ count: 0, total: 0 })
  const res: DueSummary = { overdue: z(), today: z(), next7: z(), next30: z() }
  const d7 = addDays(todayYmd, 6)
  const d30 = addDays(todayYmd, 29)
  const add = (w: DueWindow, v: number) => { w.count++; w.total = r2(w.total + v) }
  for (const it of items) {
    if (it.ymd < todayYmd) add(res.overdue, it.amount)
    else {
      if (it.ymd === todayYmd) add(res.today, it.amount)
      if (it.ymd <= d7) add(res.next7, it.amount)
      if (it.ymd <= d30) add(res.next30, it.amount)
    }
  }
  return res
}

// ── Fluxo de caixa ───────────────────────────────────────────────────────────
export type Granularity = 'day' | 'month'
export type BucketKind = 'realized' | 'projected' | 'mixed'

export interface FlowItem { ymd: string; amount: number; realized: boolean }

export interface CashflowBucket {
  key: string
  label: string
  start: string
  end: string
  kind: BucketKind
  realizedIn: number
  realizedOut: number
  projectedIn: number
  projectedOut: number
  entradas: number
  saidas: number
  saldo: number
  acumulado: number
}

export function listBuckets(from: string, to: string, g: Granularity): { key: string; label: string; start: string; end: string }[] {
  const out: { key: string; label: string; start: string; end: string }[] = []
  if (from > to) return out
  if (g === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ key: d, label: dayLabel(d), start: d, end: d })
    return out
  }
  const last = to.slice(0, 7)
  for (let m = from.slice(0, 7); m <= last; m = addMonths(m, 1)) {
    const s = monthStart(m) < from ? from : monthStart(m)
    const e = monthEnd(m) > to ? to : monthEnd(m)
    out.push({ key: m, label: monthLabel(m), start: s, end: e })
  }
  return out
}

export interface CashflowInput {
  from: string
  to: string
  today: string
  granularity: Granularity
  /** Realizados (data de pagamento) e previstos (vencimento; vencidos já levados para hoje pelo chamador). */
  items: FlowItem[]
  /** Saldo acumulado antes do primeiro bucket. */
  startBalance: number
  /** Saldo atual (fim de hoje, realizado). Quando informado, o acumulado é ancorado nele no bucket de hoje. */
  currentBalance: number | null
}

export function buildCashflow(inp: CashflowInput): CashflowBucket[] {
  const buckets = listBuckets(inp.from, inp.to, inp.granularity)
  const idx = new Map(buckets.map((b, i) => [b.key, i]))
  const keyOf = (ymd: string) => (inp.granularity === 'day' ? ymd : ymd.slice(0, 7))
  const acc = buckets.map(() => ({ ri: 0, ro: 0, pi: 0, po: 0, afterToday: 0 }))
  for (const it of inp.items) {
    if (it.ymd < inp.from || it.ymd > inp.to) continue
    const i = idx.get(keyOf(it.ymd))
    if (i == null) continue
    const a = acc[i]
    // Acumula em centavos (exato); converte para reais só na saída.
    const c = toCents(it.amount)
    if (it.realized) { if (c >= 0) a.ri += c; else a.ro -= c }
    else { if (c >= 0) a.pi += c; else a.po -= c }
    if (it.realized ? it.ymd > inp.today : true) a.afterToday += c
  }
  let running = toCents(inp.startBalance)
  return buckets.map((b, i) => {
    const a = acc[i]
    const kind: BucketKind = b.end < inp.today ? 'realized' : b.start > inp.today ? 'projected' : 'mixed'
    const saldoC = a.ri + a.pi - a.ro - a.po
    if (kind === 'mixed' && inp.currentBalance != null) running = toCents(inp.currentBalance) + a.afterToday
    else running += saldoC
    return {
      ...b, kind,
      realizedIn: fromCents(a.ri), realizedOut: fromCents(a.ro), projectedIn: fromCents(a.pi), projectedOut: fromCents(a.po),
      entradas: fromCents(a.ri + a.pi), saidas: fromCents(a.ro + a.po), saldo: fromCents(saldoC), acumulado: fromCents(running),
    }
  })
}

// ── CSV (extrato) ────────────────────────────────────────────────────────────
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v)
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(cell).join(';')).join('\r\n')
}
