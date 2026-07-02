// =============================================================================
// finance/return-calc.ts — Cálculo do RETORNO FINANCEIRO (AutoDrive)
//
// Regra (spec):
//   returnGross = financedAmount * returnRatePercent / 100
//   ila         = returnGross   * ilaPercent / 100              (sobre o BRUTO)
//   iof         = returnGross   * iofPercent / 100              (sobre o BRUTO)
//   returnNet   = returnGross - ila - iof
//   comissão    = returnNet * commissionPercent / 100           (sobre o LÍQUIDO)
//
// Funções puras — sem acesso a banco. Dinheiro tratado em number aqui e
// convertido para Decimal na borda (Prisma). Nunca calcular comissão sobre o
// retorno bruto.
// =============================================================================

export const RETURN_RATE_MIN = 0.01
export const RETURN_RATE_MAX = 20
export type ReturnValueType = 'PERCENTUAL' | 'FIXO'
export type ReturnDeductionBase = 'GROSS_RETURN' | 'FINANCED_AMOUNT'

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

export interface ReturnInput {
  financedAmount:    unknown
  returnRatePercent: unknown
  ilaPercent:        unknown
  iofPercent:        unknown
  baseAmount?:       unknown
  returnPercent?:    unknown
  ilaValue?:         unknown
  ilaType?:          ReturnValueType
  iofValue?:         unknown
  iofType?:          ReturnValueType
  deductionBase?:    ReturnDeductionBase
  minReturnPercent?: unknown
  maxReturnPercent?: unknown
}

export interface ReturnComputation {
  returnGrossValue: number
  ilaValue:         number
  iofValue:         number
  returnNetValue:   number
  commissionBaseValue: number
}

function deductionAmount(base: number, value: unknown, type: ReturnValueType | undefined): number {
  const n = Math.max(0, num(value))
  if (type === 'FIXO') return round2(n)
  return round2((base * n) / 100)
}

/** Calcula bruto, ILA, IOF e líquido do retorno (sem comissão). */
export function calculateReturn(input: ReturnInput): ReturnComputation {
  const financed = Math.max(0, num(input.baseAmount ?? input.financedAmount))
  const minRate  = num(input.minReturnPercent ?? RETURN_RATE_MIN)
  const maxRate  = num(input.maxReturnPercent ?? RETURN_RATE_MAX)
  const rawRate  = num(input.returnPercent ?? input.returnRatePercent)
  const rate     = validateReturnPercent(rawRate, minRate, maxRate).ok ? rawRate : 0

  const returnGrossValue = round2((financed * rate) / 100)
  const deductionBase = input.deductionBase === 'FINANCED_AMOUNT' ? financed : returnGrossValue
  const ilaValue = input.ilaType
    ? deductionAmount(deductionBase, input.ilaValue, input.ilaType)
    : deductionAmount(returnGrossValue, input.ilaPercent, 'PERCENTUAL')
  const iofValue = input.iofType
    ? deductionAmount(deductionBase, input.iofValue, input.iofType)
    : deductionAmount(returnGrossValue, input.iofPercent, 'PERCENTUAL')
  const returnNetValue = round2(returnGrossValue - ilaValue - iofValue)
  const commissionBaseValue = Math.max(0, returnNetValue)

  return { returnGrossValue, ilaValue, iofValue, returnNetValue, commissionBaseValue }
}

export function validateReturnPercent(returnPercent: unknown, minPercent: unknown, maxPercent: unknown): { ok: true; value: number } | { ok: false; message: string } {
  const value = num(returnPercent)
  const min = num(minPercent)
  const max = num(maxPercent)
  if (!Number.isFinite(value) || value < min || value > max) {
    return { ok: false, message: `O retorno informado está fora da faixa permitida para este tenant. Faixa permitida: ${min.toLocaleString('pt-BR')}% a ${max.toLocaleString('pt-BR')}%.` }
  }
  return { ok: true, value }
}

/** Comissão do retorno = retorno LÍQUIDO * percentual / 100. */
export function calculateReturnCommission(returnNetValue: unknown, commissionPercent: unknown): number {
  const net = Math.max(0, num(returnNetValue))
  const pct = Math.max(0, num(commissionPercent))
  return round2((net * pct) / 100)
}
