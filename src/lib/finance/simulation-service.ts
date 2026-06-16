// =============================================================================
// finance/simulation-service.ts — cálculo da SIMULAÇÃO comparativa de F&I.
// Funções puras (sem banco). A parcela usa a Tabela Price a partir de uma taxa
// mensal informada pelo operador (não inventamos taxa de banco). O retorno
// estimado vem das regras de retorno da loja (FinanceReturnRule).
// =============================================================================

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Valor financiado = valor do veículo − entrada (nunca negativo). */
export function financedAmount(vehicleValue: number, downPayment: number): number {
  return Math.max(0, round2((vehicleValue || 0) - (downPayment || 0)))
}

/**
 * Parcela pela Tabela Price. `monthlyRatePct` é a taxa mensal em %, informada
 * pelo operador. Taxa 0 → parcela linear (principal/n). Retorna 0 se inválido.
 */
export function priceInstallment(principal: number, monthlyRatePct: number, n: number): number {
  const P = Math.max(0, principal || 0)
  const r = Math.max(0, monthlyRatePct || 0) / 100
  const parcelas = Math.floor(n || 0)
  if (P <= 0 || parcelas <= 0) return 0
  if (r === 0) return round2(P / parcelas)
  const pmt = (P * r) / (1 - Math.pow(1 + r, -parcelas))
  return round2(pmt)
}

// ── Regras de retorno ──────────────────────────────────────────────────────────
export interface ReturnRuleLike {
  bankId: string | null
  percent: number | null
  fixedValue: number | null
  minInstallments: number | null
  maxInstallments: number | null
  active: boolean
}

/** Regra casa o banco (específica ou "todos") e a faixa de parcelas? */
function ruleMatches(rule: ReturnRuleLike, bankId: string | null, installments: number): boolean {
  if (!rule.active) return false
  if (rule.bankId && rule.bankId !== bankId) return false
  if (rule.minInstallments != null && installments < rule.minInstallments) return false
  if (rule.maxInstallments != null && installments > rule.maxInstallments) return false
  return true
}

/**
 * Escolhe a melhor regra: regra específica do banco tem prioridade sobre a
 * regra "todos os bancos"; entre as candidatas, a de faixa mais estreita.
 */
export function chooseReturnRule(rules: ReturnRuleLike[], bankId: string | null, installments: number): ReturnRuleLike | null {
  const matches = rules.filter((r) => ruleMatches(r, bankId, installments))
  if (matches.length === 0) return null
  const span = (r: ReturnRuleLike) => (r.maxInstallments ?? 999) - (r.minInstallments ?? 0)
  matches.sort((a, b) => {
    const aSpec = a.bankId ? 0 : 1
    const bSpec = b.bankId ? 0 : 1
    if (aSpec !== bSpec) return aSpec - bSpec       // banco específico primeiro
    return span(a) - span(b)                         // faixa mais estreita primeiro
  })
  return matches[0]
}

/** Retorno estimado = % do financiado + valor fixo (da regra escolhida). */
export function estimateReturn(financed: number, rule: ReturnRuleLike | null): number {
  if (!rule) return 0
  const pct = rule.percent ?? 0
  const fixed = rule.fixedValue ?? 0
  return round2((Math.max(0, financed) * pct) / 100 + fixed)
}

// ── Montagem de uma opção da simulação ────────────────────────────────────────
export interface SimulationOptionInput { bankId: string | null; rate: number | null }
export interface ComputedOption {
  bankId: string | null
  installments: number
  installmentValue: number
  rate: number | null
  estimatedReturn: number
}

/** Calcula uma opção (parcela + retorno estimado) para um banco. */
export function computeOption(
  financed: number,
  installments: number,
  opt: SimulationOptionInput,
  returnRules: ReturnRuleLike[],
): ComputedOption {
  const rule = chooseReturnRule(returnRules, opt.bankId, installments)
  return {
    bankId: opt.bankId,
    installments,
    installmentValue: priceInstallment(financed, opt.rate ?? 0, installments),
    rate: opt.rate ?? null,
    estimatedReturn: estimateReturn(financed, rule),
  }
}
