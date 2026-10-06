// =============================================================================
// Folha e comissões — regras PURAS do fechamento do mês (testadas).
//   • classifica os lançamentos do colaborador (salário, benefício, adiantamento);
//   • agrupa as comissões do período por tipo de regra;
//   • calcula bruto, descontos (adiantamentos pagos e ainda não descontados) e
//     líquido a pagar;
//   • planeja o desconto dos adiantamentos no salário na hora do pagamento.
// I/O (Prisma) em payroll.ts.
// =============================================================================

export const PAYROLL_CODES = {
  SALARIO: '12.1',
  BENEFICIO: '12.3',
  PRO_LABORE: '12.4',
  ADIANTAMENTO: '12.5',
} as const

export type PayrollKind = 'SALARIO' | 'BENEFICIO' | 'ADIANTAMENTO'

export const COMMISSION_TYPE_LABEL: Record<string, string> = {
  VENDA: 'Venda', TROCA: 'Troca', COMPRA: 'Compra', CONSIGNACAO: 'Consignação', GARANTIA: 'Garantia',
  RETORNO: 'Retorno', SERVICO: 'Serviço', DOCUMENTO: 'Documento', BONUS_META: 'Bônus de meta',
  BONUS_DEZENA: 'Bônus por dezena', EXCECAO: 'Exceção',
}

const round = (n: number) => Math.round(n * 100) / 100

/** Mês "YYYY-MM" válido. */
export function isMonth(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

/** Intervalo UTC [início, fim) do mês. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number)
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) }
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  return `${m}/${y}`
}

// ── Marcação de adiantamento descontado (fica nas observações do lançamento) ──

const DISCOUNT_RE = /\[descontado:(\d{4}-\d{2})\]/

export function discountTag(month: string): string {
  return `[descontado:${month}]`
}

/** Mês em que o adiantamento foi descontado na folha (ou null). */
export function discountedMonth(notes: string | null | undefined): string | null {
  const m = notes ? DISCOUNT_RE.exec(notes) : null
  return m ? m[1] : null
}

export function withDiscountTag(notes: string | null | undefined, month: string, note?: string | null): string {
  const base = removeDiscountTag(notes)
  const extra = note?.trim() ? ` ${note.trim()}` : ''
  return `${base ? `${base}\n` : ''}${discountTag(month)}${extra}`.slice(0, 2000)
}

export function removeDiscountTag(notes: string | null | undefined): string {
  if (!notes) return ''
  return notes.split('\n').filter((l) => !DISCOUNT_RE.test(l)).join('\n').trim()
}

// ── Classificação ────────────────────────────────────────────────────────────

/** Tipo do lançamento do colaborador pelo código da categoria (ou pela recorrência). */
export function classifyPayrollEntry(categoryCode: string | null | undefined): PayrollKind {
  if (categoryCode === PAYROLL_CODES.ADIANTAMENTO) return 'ADIANTAMENTO'
  if (categoryCode === PAYROLL_CODES.BENEFICIO) return 'BENEFICIO'
  return 'SALARIO'
}

// ── Fechamento ───────────────────────────────────────────────────────────────

export interface PayrollEntryIn {
  id: string
  kind: PayrollKind
  description: string
  amount: number
  /** Valor antes do desconto de adiantamentos (salário pago com desconto). */
  grossAmount?: number | null
  status: string // PREVISTO | PAGO | CANCELADO
  date: string | null
  paidDate?: string | null
  notes?: string | null
}

export interface CommissionIn {
  id: string
  ruleType: string
  description: string
  value: number
  status: string // PREVISTO | APROVADO | AJUSTADO | PAGO | CANCELADO
  entryId?: string | null
  entryStatus?: string | null
}

export interface EmployeeMonth {
  salary: { total: number; paid: number; pending: number }
  benefits: { total: number; paid: number; pending: number }
  commissions: {
    total: number; paid: number; pending: number
    byType: { ruleType: string; label: string; count: number; total: number; pending: number }[]
  }
  advances: { total: number; toDiscount: number; discountedHere: number; scheduled: number }
  gross: number
  deductions: number
  net: number
  status: 'SEM_VALORES' | 'ABERTO' | 'PARCIAL' | 'PAGO'
}

const isPaid = (s: string) => s === 'PAGO' || s === 'RECEBIDO'

/**
 * Comissão conta como paga quando o sistema de comissões ou o lançamento
 * financeiro dela está PAGO.
 */
export function commissionPaid(c: Pick<CommissionIn, 'status' | 'entryStatus'>): boolean {
  return c.status === 'PAGO' || c.entryStatus === 'PAGO'
}

export function computeEmployeeMonth(month: string, entries: PayrollEntryIn[], commissions: CommissionIn[]): EmployeeMonth {
  const live = entries.filter((e) => e.status !== 'CANCELADO')
  const sum = (arr: { amount: number }[]) => round(arr.reduce((s, e) => s + e.amount, 0))

  const sal = live.filter((e) => e.kind === 'SALARIO')
  const ben = live.filter((e) => e.kind === 'BENEFICIO')
  const adv = live.filter((e) => e.kind === 'ADIANTAMENTO')

  const salTotal = round(sal.reduce((s, e) => s + (e.grossAmount ?? e.amount), 0))
  const salPending = sum(sal.filter((e) => !isPaid(e.status)))
  const salary = { total: salTotal, paid: round(salTotal - salPending), pending: salPending }
  const benefits = { total: sum(ben), paid: sum(ben.filter((e) => isPaid(e.status))), pending: sum(ben.filter((e) => !isPaid(e.status))) }

  const com = commissions.filter((c) => c.status !== 'CANCELADO')
  const byTypeMap = new Map<string, { ruleType: string; label: string; count: number; total: number; pending: number }>()
  for (const c of com) {
    const row = byTypeMap.get(c.ruleType) ?? { ruleType: c.ruleType, label: COMMISSION_TYPE_LABEL[c.ruleType] ?? c.ruleType, count: 0, total: 0, pending: 0 }
    row.count += 1
    row.total = round(row.total + c.value)
    if (!commissionPaid(c)) row.pending = round(row.pending + c.value)
    byTypeMap.set(c.ruleType, row)
  }
  const comTotal = round(com.reduce((s, c) => s + c.value, 0))
  const comPending = round(com.filter((c) => !commissionPaid(c)).reduce((s, c) => s + c.value, 0))
  const commissions_ = {
    total: comTotal, paid: round(comTotal - comPending), pending: comPending,
    byType: [...byTypeMap.values()].sort((a, b) => b.total - a.total),
  }

  // Adiantamento PAGO e não descontado → desconta no líquido. Os já descontados
  // neste mês aparecem só como informação; os agendados (PREVISTO) ainda não saíram.
  const toDiscount = sum(adv.filter((e) => isPaid(e.status) && !discountedMonth(e.notes)))
  const discountedHere = sum(adv.filter((e) => discountedMonth(e.notes) === month))
  const scheduled = sum(adv.filter((e) => !isPaid(e.status)))
  const advances = { total: sum(adv), toDiscount, discountedHere, scheduled }

  const gross = round(salary.total + benefits.total + commissions_.total)
  const pendingGross = round(salary.pending + benefits.pending + commissions_.pending)
  // O desconto só abate do salário ainda não pago (comissão vem fechada do sistema de comissões).
  const deductions = round(Math.min(toDiscount, salary.pending))
  const net = round(Math.max(0, pendingGross - deductions))

  let status: EmployeeMonth['status']
  if (gross === 0 && advances.total === 0) status = 'SEM_VALORES'
  else if (pendingGross === 0) status = 'PAGO'
  else if (round(salary.paid + benefits.paid + commissions_.paid) > 0) status = 'PARCIAL'
  else status = 'ABERTO'

  return { salary, benefits, commissions: commissions_, advances, gross, deductions, net, status }
}

// ── Desconto dos adiantamentos no pagamento ──────────────────────────────────

export interface DiscountPlan {
  /** Adiantamentos que serão marcados como descontados. */
  advanceIds: string[]
  total: number
  /** Novo valor de cada lançamento de salário (amount 0 → quitado pelo adiantamento). */
  salary: { id: string; original: number; amount: number }[]
}

/**
 * Desconta adiantamentos inteiros (do mais antigo ao mais novo) enquanto
 * couberem no salário a pagar; abate primeiro do maior lançamento de salário.
 */
export function planAdvanceDiscount(
  salaryEntries: { id: string; amount: number }[],
  advances: { id: string; amount: number; date: string | null }[],
): DiscountPlan {
  const available = round(salaryEntries.reduce((s, e) => s + e.amount, 0))
  const ordered = [...advances].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const advanceIds: string[] = []
  let total = 0
  for (const a of ordered) {
    if (!(a.amount > 0)) continue
    if (round(total + a.amount) > available) continue
    advanceIds.push(a.id)
    total = round(total + a.amount)
  }
  let left = total
  const salary = [...salaryEntries]
    .sort((a, b) => b.amount - a.amount)
    .map((e) => {
      const cut = round(Math.min(e.amount, left))
      left = round(left - cut)
      return { id: e.id, original: e.amount, amount: round(e.amount - cut) }
    })
  return { advanceIds, total, salary }
}
