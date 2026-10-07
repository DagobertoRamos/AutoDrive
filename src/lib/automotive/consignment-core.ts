// =============================================================================
// Repasse do consignado (puro): quanto o proprietário recebe pela venda.
//   PERCENT    → venda − % da loja
//   FIXED      → venda − valor fixo da loja
//   DIFFERENCE → valor mínimo combinado (a loja fica com o que vender acima)
// Sem regra de comissão: valor mínimo, ou o valor de entrada do cadastro.
// =============================================================================

export interface PayoutInput {
  salePrice: number
  commissionType: string
  commissionValue: number | null
  minPrice: number | null
  fallback: number | null
}

export interface PayoutResult {
  payout: number
  storeShare: number
  /** Venda abaixo do mínimo combinado com o proprietário. */
  belowMinimum: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function computePayout(p: PayoutInput): PayoutResult {
  const sale = Math.max(0, p.salePrice || 0)
  let payout: number
  if (p.commissionType === 'PERCENT' && p.commissionValue != null) payout = sale * (1 - Math.min(100, Math.max(0, p.commissionValue)) / 100)
  else if (p.commissionType === 'FIXED' && p.commissionValue != null) payout = sale - Math.max(0, p.commissionValue)
  else if (p.commissionType === 'DIFFERENCE' && p.minPrice != null) payout = p.minPrice
  else payout = p.minPrice ?? p.fallback ?? 0
  payout = r2(Math.max(0, Math.min(payout, sale || payout)))
  return { payout, storeShare: r2(sale - payout), belowMinimum: p.minPrice != null && sale > 0 && sale + 0.009 < p.minPrice }
}

export function payoutDueDate(soldAt: Date, days: number | null | undefined): Date {
  const d = new Date(soldAt)
  d.setDate(d.getDate() + (days == null || days < 0 ? 5 : Math.min(days, 365)))
  return d
}

/** Situação do repasse a partir do lançamento financeiro (título + baixas parciais). */
export function payoutStatusFrom(entries: { status: string; amount: number; parentEntryId: string | null }[], expected: number): 'PENDING' | 'PARTIAL' | 'PAID' {
  const title = entries.find((e) => !e.parentEntryId)
  const partial = entries.filter((e) => e.parentEntryId).reduce((s, e) => s + e.amount, 0)
  if (title?.status === 'PAGO') return 'PAID'
  if (partial > 0.009) return partial + 0.009 >= expected ? 'PAID' : 'PARTIAL'
  return 'PENDING'
}
