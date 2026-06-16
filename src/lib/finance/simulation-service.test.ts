// =============================================================================
// Testes do cálculo da simulação comparativa (Fase 6) — funções puras.
// =============================================================================

import { describe, it, expect } from 'vitest'
import { financedAmount, priceInstallment, chooseReturnRule, estimateReturn, computeOption, type ReturnRuleLike } from './simulation-service'

describe('financedAmount', () => {
  it('subtrai entrada e nunca fica negativo', () => {
    expect(financedAmount(50000, 10000)).toBe(40000)
    expect(financedAmount(10000, 15000)).toBe(0)
  })
})

describe('priceInstallment', () => {
  it('taxa 0 → parcela linear', () => {
    expect(priceInstallment(12000, 0, 12)).toBe(1000)
  })
  it('taxa positiva → Price (PMT)', () => {
    // 10000, 1% a.m., 12x ≈ 888,49
    expect(priceInstallment(10000, 1, 12)).toBeCloseTo(888.49, 1)
  })
  it('entradas inválidas → 0', () => {
    expect(priceInstallment(0, 2, 12)).toBe(0)
    expect(priceInstallment(10000, 2, 0)).toBe(0)
  })
})

describe('chooseReturnRule', () => {
  const rules: ReturnRuleLike[] = [
    { bankId: null, percent: 1, fixedValue: 0, minInstallments: null, maxInstallments: null, active: true },
    { bankId: 'b1', percent: 2, fixedValue: 0, minInstallments: 1, maxInstallments: 48, active: true },
    { bankId: 'b1', percent: 3, fixedValue: 0, minInstallments: 49, maxInstallments: 60, active: true },
    { bankId: 'b2', percent: 5, fixedValue: 0, minInstallments: null, maxInstallments: null, active: false },
  ]
  it('prefere regra específica do banco dentro da faixa', () => {
    expect(chooseReturnRule(rules, 'b1', 36)?.percent).toBe(2)
    expect(chooseReturnRule(rules, 'b1', 60)?.percent).toBe(3)
  })
  it('cai na regra "todos os bancos" quando não há específica', () => {
    expect(chooseReturnRule(rules, 'bX', 24)?.percent).toBe(1)
  })
  it('ignora regras inativas', () => {
    expect(chooseReturnRule(rules, 'b2', 24)?.percent).toBe(1) // b2 inativa → cai na global
  })
})

describe('estimateReturn', () => {
  it('percent do financiado + valor fixo', () => {
    expect(estimateReturn(40000, { bankId: null, percent: 2, fixedValue: 300, minInstallments: null, maxInstallments: null, active: true })).toBe(1100)
  })
  it('sem regra → 0', () => {
    expect(estimateReturn(40000, null)).toBe(0)
  })
})

describe('computeOption', () => {
  const rules: ReturnRuleLike[] = [{ bankId: 'b1', percent: 2, fixedValue: 0, minInstallments: null, maxInstallments: null, active: true }]
  it('monta parcela + retorno', () => {
    const o = computeOption(40000, 48, { bankId: 'b1', rate: 1.5 }, rules)
    expect(o.bankId).toBe('b1')
    expect(o.installments).toBe(48)
    expect(o.installmentValue).toBeGreaterThan(0)
    expect(o.estimatedReturn).toBe(800)
  })
})
