// =============================================================================
// Preço de venda sugerido da avaliação — regra simples e pura:
//   custo total (valor avaliado + gastos previstos) × (1 + margem%)
//   arredondado para a centena de cima e limitado pela FIPE (quando houver).
// A margem é configurável por loja (SystemSetting `evaluation:pricing:<tenant>`,
// ver pricing-settings.ts); padrão 15%.
// =============================================================================

export const DEFAULT_MARGIN_PCT = 15
export const MAX_MARGIN_PCT = 200

export interface SuggestedPrice {
  value:        number
  /** custo total usado como base (avaliado + gastos) */
  cost:         number
  marginPct:    number
  /** true quando o cálculo passou da FIPE e o valor foi travado nela */
  cappedByFipe: boolean
}

const num = (v: unknown): number => {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Margem válida (0–200%); qualquer outra coisa cai no padrão. */
export function normalizeMarginPct(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > MAX_MARGIN_PCT) return DEFAULT_MARGIN_PCT
  return Math.round(n * 100) / 100
}

/** null quando não há valor avaliado (sem base para sugerir). */
export function suggestSalePrice(input: {
  evaluatedValue: unknown
  totalExpenses:  unknown
  fipeValue?:     unknown
  marginPct?:     unknown
}): SuggestedPrice | null {
  const evaluated = num(input.evaluatedValue)
  if (evaluated <= 0) return null
  const cost = evaluated + Math.max(0, num(input.totalExpenses))
  const marginPct = input.marginPct == null ? DEFAULT_MARGIN_PCT : normalizeMarginPct(input.marginPct)
  let value = Math.ceil((cost * (1 + marginPct / 100)) / 100) * 100
  const fipe = num(input.fipeValue)
  let cappedByFipe = false
  if (fipe > 0 && value > fipe) { value = fipe; cappedByFipe = true }
  return { value, cost, marginPct, cappedByFipe }
}
