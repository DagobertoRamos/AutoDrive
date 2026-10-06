import { describe, expect, it } from 'vitest'
import { dueInMonth, firstPendingMonth, horizonMonth, nextRecurrenceDue, recurrenceDueDates } from './recurrence-core'

describe('dueInMonth', () => {
  it('prende o dia ao tamanho do mês', () => {
    expect(dueInMonth('2026-02', 31)).toBe('2026-02-28')
    expect(dueInMonth('2028-02', 30)).toBe('2028-02-29')
    expect(dueInMonth('2026-04', 31)).toBe('2026-04-30')
    expect(dueInMonth('2026-05', 5)).toBe('2026-05-05')
  })
})

describe('recurrenceDueDates', () => {
  it('pula o mês de início quando o dia já passou', () => {
    expect(recurrenceDueDates({ startDate: '2026-10-20', dayOfMonth: 5 }, '2026-10', '2027-01'))
      .toEqual(['2026-11-05', '2026-12-05', '2027-01-05'])
  })
  it('inclui o mês de início quando o dia ainda vem', () => {
    expect(recurrenceDueDates({ startDate: '2026-10-01', dayOfMonth: 31 }, '2026-10', '2026-12'))
      .toEqual(['2026-10-31', '2026-11-30', '2026-12-31'])
  })
  it('respeita a data final', () => {
    expect(recurrenceDueDates({ startDate: '2026-01-01', endDate: '2026-03-10', dayOfMonth: 10 }, '2026-01', '2026-12'))
      .toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
  })
  it('não volta antes do início mesmo se pedido', () => {
    expect(recurrenceDueDates({ startDate: '2026-06-01', dayOfMonth: 1 }, '2026-01', '2026-07'))
      .toEqual(['2026-06-01', '2026-07-01'])
  })
})

describe('janela', () => {
  it('firstPendingMonth segue generatedUntil', () => {
    expect(firstPendingMonth({ startDate: '2026-01-15', dayOfMonth: 15 })).toBe('2026-01')
    expect(firstPendingMonth({ startDate: '2026-01-15', dayOfMonth: 15, generatedUntil: '2026-12-01' })).toBe('2027-01')
  })
  it('horizonMonth soma meses', () => {
    expect(horizonMonth('2026-10-06', 3)).toBe('2027-01')
  })
  it('nextRecurrenceDue', () => {
    expect(nextRecurrenceDue({ startDate: '2026-01-01', dayOfMonth: 10 }, '2026-10-06')).toBe('2026-10-10')
    expect(nextRecurrenceDue({ startDate: '2026-01-01', dayOfMonth: 5 }, '2026-10-06')).toBe('2026-11-05')
    expect(nextRecurrenceDue({ startDate: '2026-01-01', endDate: '2026-09-30', dayOfMonth: 5 }, '2026-10-06')).toBeNull()
  })
})
