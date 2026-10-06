import { describe, it, expect } from 'vitest'
import {
  classifyPayrollEntry, computeEmployeeMonth, discountedMonth, isMonth, monthRange, planAdvanceDiscount,
  removeDiscountTag, shiftMonth, withDiscountTag, type CommissionIn, type PayrollEntryIn,
} from './payroll-core'

const e = (p: Partial<PayrollEntryIn>): PayrollEntryIn => ({ id: 'x', kind: 'SALARIO', description: '', amount: 0, status: 'PREVISTO', date: '2026-10-05', ...p })
const c = (p: Partial<CommissionIn>): CommissionIn => ({ id: 'c', ruleType: 'VENDA', description: '', value: 0, status: 'APROVADO', ...p })

describe('mês', () => {
  it('valida e calcula intervalo', () => {
    expect(isMonth('2026-10')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    const r = monthRange('2026-12')
    expect(r.start.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(r.end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('marcação de desconto', () => {
  it('adiciona, lê e remove', () => {
    const n = withDiscountTag('Vale', '2026-10', 'folha')
    expect(discountedMonth(n)).toBe('2026-10')
    expect(removeDiscountTag(n)).toBe('Vale')
    expect(discountedMonth(withDiscountTag(n, '2026-11'))).toBe('2026-11')
  })
})

describe('classificação', () => {
  it('pelo código', () => {
    expect(classifyPayrollEntry('12.5')).toBe('ADIANTAMENTO')
    expect(classifyPayrollEntry('12.3')).toBe('BENEFICIO')
    expect(classifyPayrollEntry('12.1')).toBe('SALARIO')
    expect(classifyPayrollEntry(null)).toBe('SALARIO')
  })
})

describe('computeEmployeeMonth', () => {
  it('soma salário + comissões − adiantamentos', () => {
    const r = computeEmployeeMonth('2026-10', [
      e({ id: 's', amount: 3000 }),
      e({ id: 'a1', kind: 'ADIANTAMENTO', amount: 500, status: 'PAGO' }),
      e({ id: 'a2', kind: 'ADIANTAMENTO', amount: 200, status: 'PREVISTO' }),
      e({ id: 'x', amount: 999, status: 'CANCELADO' }),
    ], [
      c({ id: 'c1', value: 800, ruleType: 'VENDA' }),
      c({ id: 'c2', value: 200, ruleType: 'VENDA', status: 'PREVISTO' }),
      c({ id: 'c3', value: 150, ruleType: 'RETORNO', status: 'PAGO' }),
      c({ id: 'c4', value: 999, status: 'CANCELADO' }),
    ])
    expect(r.salary.total).toBe(3000)
    expect(r.commissions.total).toBe(1150)
    expect(r.commissions.pending).toBe(1000)
    expect(r.commissions.byType[0]).toMatchObject({ ruleType: 'VENDA', count: 2, total: 1000 })
    expect(r.advances).toMatchObject({ toDiscount: 500, scheduled: 200 })
    expect(r.gross).toBe(4150)
    expect(r.deductions).toBe(500)
    expect(r.net).toBe(3500)
    expect(r.status).toBe('PARCIAL')
  })

  it('adiantamento já descontado não desconta de novo; tudo pago → PAGO', () => {
    const r = computeEmployeeMonth('2026-10', [
      e({ id: 's', amount: 2500, status: 'PAGO' }),
      e({ id: 'a', kind: 'ADIANTAMENTO', amount: 500, status: 'PAGO', notes: '[descontado:2026-10]' }),
    ], [c({ value: 100, entryStatus: 'PAGO', status: 'APROVADO' })])
    expect(r.deductions).toBe(0)
    expect(r.advances.discountedHere).toBe(500)
    expect(r.net).toBe(0)
    expect(r.status).toBe('PAGO')
  })

  it('desconto limitado ao salário pendente', () => {
    const r = computeEmployeeMonth('2026-10', [
      e({ amount: 300 }),
      e({ id: 'a', kind: 'ADIANTAMENTO', amount: 1000, status: 'PAGO' }),
    ], [c({ value: 500 })])
    expect(r.deductions).toBe(300)
    expect(r.net).toBe(500)
  })

  it('salário pago com desconto mostra o bruto', () => {
    const r = computeEmployeeMonth('2026-10', [e({ amount: 2500, grossAmount: 3000, status: 'PAGO' })], [])
    expect(r.salary).toEqual({ total: 3000, paid: 3000, pending: 0 })
    expect(r.status).toBe('PAGO')
  })

  it('sem valores', () => {
    expect(computeEmployeeMonth('2026-10', [], []).status).toBe('SEM_VALORES')
  })
})

describe('planAdvanceDiscount', () => {
  it('desconta adiantamentos inteiros que cabem, mais antigos primeiro', () => {
    const p = planAdvanceDiscount([{ id: 's1', amount: 1000 }, { id: 's2', amount: 200 }], [
      { id: 'a2', amount: 900, date: '2026-10-10' },
      { id: 'a1', amount: 400, date: '2026-10-01' },
      { id: 'a3', amount: 700, date: '2026-10-15' },
    ])
    expect(p.advanceIds).toEqual(['a1', 'a3'])
    expect(p.total).toBe(1100)
    expect(p.salary).toEqual([{ id: 's1', original: 1000, amount: 0 }, { id: 's2', original: 200, amount: 100 }])
  })

  it('pode zerar salário e passar para o próximo lançamento', () => {
    const p = planAdvanceDiscount([{ id: 's1', amount: 500 }, { id: 's2', amount: 300 }], [{ id: 'a', amount: 700, date: null }])
    expect(p.salary).toEqual([{ id: 's1', original: 500, amount: 0 }, { id: 's2', original: 300, amount: 100 }])
  })
})
