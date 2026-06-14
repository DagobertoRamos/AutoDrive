// =============================================================================
// finance/return-calc.ts — Cálculo do RETORNO FINANCEIRO (AutoDrive)
//
// Regra (spec):
//   returnGross = financedAmount * returnRatePercent / 100      (rate 0–6%)
//   ila         = returnGross   * ilaPercent / 100              (sobre o BRUTO)
//   iof         = returnGross   * iofPercent / 100              (sobre o BRUTO)
//   returnNet   = returnGross - ila - iof
//   comissão    = returnNet * commissionPercent / 100           (sobre o LÍQUIDO)
//
// Funções puras — sem acesso a banco. Dinheiro tratado em number aqui e
// convertido para Decimal na borda (Prisma). Nunca calcular comissão sobre o
// retorno bruto.
// =============================================================================

export const RETURN_RATE_MIN = 0
export const RETURN_RATE_MAX = 6

/** Aceita number ou Prisma.Decimal-like. */
function num(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber()
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

export interface ReturnInput {
  financedAmount:    unknown
  returnRatePercent: unknown
  ilaPercent:        unknown
  iofPercent:        unknown
}

export interface ReturnComputation {
  returnGrossValue: number
  ilaValue:         number
  iofValue:         number
  returnNetValue:   number
}

/** Calcula bruto, ILA, IOF e líquido do retorno (sem comissão). */
export function calculateReturn(input: ReturnInput): ReturnComputation {
  const financed = Math.max(0, num(input.financedAmount))
  const rate     = clamp(num(input.returnRatePercent), RETURN_RATE_MIN, RETURN_RATE_MAX)
  const ilaPct   = Math.max(0, num(input.ilaPercent))
  const iofPct   = Math.max(0, num(input.iofPercent))

  const returnGrossValue = round2((financed * rate) / 100)
  const ilaValue = round2((returnGrossValue * ilaPct) / 100)
  const iofValue = round2((returnGrossValue * iofPct) / 100)
  const returnNetValue = Math.max(0, round2(returnGrossValue - ilaValue - iofValue))

  return { returnGrossValue, ilaValue, iofValue, returnNetValue }
}

/** Comissão do retorno = retorno LÍQUIDO * percentual / 100. */
export function calculateReturnCommission(returnNetValue: unknown, commissionPercent: unknown): number {
  const net = Math.max(0, num(returnNetValue))
  const pct = Math.max(0, num(commissionPercent))
  return round2((net * pct) / 100)
}
