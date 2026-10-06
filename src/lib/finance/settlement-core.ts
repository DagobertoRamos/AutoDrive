// =============================================================================
// Baixas (total, parcial, em lote) — PURO (testado).
// O título mantém o valor original. Cada baixa parcial vira um lançamento
// PAGO/RECEBIDO "filho" (parentEntryId) com a data, a conta, os juros e o
// desconto daquela baixa; o título fica PREVISTO com o saldo em aberto. A
// baixa final é o próprio título (PAGO/RECEBIDO). Assim extrato, fluxo de
// caixa, DRE e saldos enxergam cada baixa no seu dia sem regra especial.
//   valor pago  = principal + juros/multa − desconto
//   saldo       = saldo anterior − principal
//   original    = principal do título + Σ principal das baixas parciais
// =============================================================================

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const TOL = 0.005

export interface SettlementInput {
  /** Saldo em aberto do título (valor atual do lançamento PREVISTO). */
  remaining: number
  /** Principal a abater; vazio = quitar o saldo inteiro. */
  principal?: number | null
  interest?: number | null
  discount?: number | null
  /** Pagou menos que o saldo e quer quitar: a diferença vira desconto. */
  settleRemainderAsDiscount?: boolean
}

export type SettlementPlan =
  | { ok: true; kind: 'FULL' | 'PARTIAL'; principal: number; interest: number; discount: number; paid: number; remainingAfter: number }
  | { ok: false; error: string }

export function planSettlement(i: SettlementInput): SettlementPlan {
  const remaining = r2(i.remaining)
  if (!(remaining > 0)) return { ok: false, error: 'Título sem saldo em aberto.' }
  const interest = r2(Math.max(0, Number(i.interest ?? 0)))
  let discount = r2(Math.max(0, Number(i.discount ?? 0)))
  let principal = i.principal == null ? remaining : r2(Number(i.principal))
  if (!(principal > 0)) return { ok: false, error: 'Informe o valor da baixa.' }
  if (principal - remaining > TOL) return { ok: false, error: 'Valor maior que o saldo em aberto.' }
  if (i.settleRemainderAsDiscount && remaining - principal > TOL) {
    discount = r2(discount + (remaining - principal))
    principal = remaining
  }
  const remainingAfter = r2(remaining - principal)
  const paid = r2(principal + interest - discount)
  if (paid < 0) return { ok: false, error: 'Desconto maior que o valor pago.' }
  return { ok: true, kind: Math.abs(remainingAfter) <= TOL ? 'FULL' : 'PARTIAL', principal, interest, discount, paid, remainingAfter: Math.abs(remainingAfter) <= TOL ? 0 : remainingAfter }
}

/** Principal de um lançamento baixado (o valor pago inclui juros − desconto). */
export const principalOf = (e: { amount: number; interestAmount?: number | null; discountAmount?: number | null }) =>
  r2(Number(e.amount) - Number(e.interestAmount ?? 0) + Number(e.discountAmount ?? 0))

export interface TitleSummary { original: number; settled: number; remaining: number; paidTotal: number; count: number; partial: boolean }

/** Situação do título a partir dele e das baixas parciais (filhos não estornados). */
export function titleSummary(
  title: { status: string; amount: number; interestAmount?: number | null; discountAmount?: number | null },
  partials: { amount: number; interestAmount?: number | null; discountAmount?: number | null }[],
): TitleSummary {
  const settledParts = partials.reduce((s, p) => s + principalOf(p), 0)
  const paidParts = partials.reduce((s, p) => s + Number(p.amount), 0)
  const open = title.status === 'PREVISTO'
  const titlePrincipal = open ? Number(title.amount) : principalOf(title)
  const original = r2(titlePrincipal + settledParts)
  const settled = r2(settledParts + (open || title.status === 'CANCELADO' ? 0 : titlePrincipal))
  const paidTotal = r2(paidParts + (open || title.status === 'CANCELADO' ? 0 : Number(title.amount)))
  const remaining = open ? r2(Number(title.amount)) : 0
  return { original, settled, remaining, paidTotal, count: partials.length + (open || title.status === 'CANCELADO' ? 0 : 1), partial: open && partials.length > 0 }
}

/** Origem das baixas parciais: `<origem do título>#P<n>`. */
export const PARTIAL_SOURCE_SEP = '#P'
export const partialSource = (titleSource: string | null | undefined, n: number) => `${titleSource || 'MANUAL'}${PARTIAL_SOURCE_SEP}${n}`
/** Origem "base" (sem o sufixo da baixa parcial) — usar antes de interpretar a origem. */
export const baseSource = <T extends string | null | undefined>(s: T): T => (s ? (s.split(PARTIAL_SOURCE_SEP)[0] as T) : s)

/** Origens que não aceitam baixa parcial (o status vem de outro módulo). */
export function partialBlockedReason(e: { source?: string | null; commissionCalculationId?: string | null; vehicleServiceId?: string | null; transferGroupId?: string | null }): string | null {
  if (e.transferGroupId) return 'Transferência não tem baixa.'
  if (e.commissionCalculationId) return 'Comissão: pague o valor inteiro (o valor vem do sistema de comissões).'
  if (e.vehicleServiceId) return 'Custo de serviço do veículo: baixe o valor inteiro.'
  const s = e.source ?? ''
  if (s.startsWith('NEG_PGTO_') || s.startsWith('NEG_TROCA_') || s === 'VENDA') return 'Recebimento de venda: confirme em Recebimentos de vendas.'
  if (s === 'TRANSFER') return 'Transferência não tem baixa.'
  return null
}
