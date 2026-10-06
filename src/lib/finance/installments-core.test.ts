import { describe, expect, it } from 'vitest'
import { addMonthsYmd, buildInstallmentPlan, splitInstallments } from './installments-core'

describe('splitInstallments', () => {
  it('divide igual e ajusta centavos na última', () => {
    expect(splitInstallments(100, 3)).toEqual([33.33, 33.33, 33.34])
    expect(splitInstallments(1000, 4)).toEqual([250, 250, 250, 250])
    const parts = splitInstallments(1234.57, 7)
    expect(Math.round(parts.reduce((s, v) => s + v, 0) * 100)).toBe(123457)
  })
  it('n=1 devolve o total', () => {
    expect(splitInstallments(99.9, 1)).toEqual([99.9])
    expect(splitInstallments(10, 0)).toEqual([10])
  })
})

describe('addMonthsYmd', () => {
  it('soma meses e prende o dia ao fim do mês', () => {
    expect(addMonthsYmd('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsYmd('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsYmd('2026-11-15', 3)).toBe('2027-02-15')
    expect(addMonthsYmd('2026-02-28', 1, 31)).toBe('2026-03-31')
  })
})

describe('buildInstallmentPlan', () => {
  it('gera descrição k/N e vencimentos mensais no mesmo dia', () => {
    const p = buildInstallmentPlan({ description: 'Notebook', total: 100, count: 3, firstDueDate: '2026-01-31' })
    expect(p.map((x) => x.description)).toEqual(['Notebook (1/3)', 'Notebook (2/3)', 'Notebook (3/3)'])
    expect(p.map((x) => x.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(p[2].amount).toBe(33.34)
  })
})
