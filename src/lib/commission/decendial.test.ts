import { describe, expect, it } from 'vitest'
import { getDecendPeriod } from '@/lib/commission/decendial'

describe('getDecendPeriod — janelas decendiais', () => {
  it('dia 05 → 1ª dezena (01–10)', () => {
    const d = getDecendPeriod(new Date(2026, 6, 5)) // 05/07/2026
    expect(d.index).toBe(1)
    expect(d.key).toBe('2026-07-D1')
    expect(d.start).toEqual(new Date(2026, 6, 1))
    expect(d.end).toEqual(new Date(2026, 6, 11))
    expect(d.label).toBe('1ª dezena de julho')
  })

  it('dia 15 → 2ª dezena (11–20)', () => {
    const d = getDecendPeriod(new Date(2026, 6, 15))
    expect(d.index).toBe(2)
    expect(d.key).toBe('2026-07-D2')
    expect(d.start).toEqual(new Date(2026, 6, 11))
    expect(d.end).toEqual(new Date(2026, 6, 21))
  })

  it('dia 25 → 3ª dezena vai até o 1º do mês seguinte (mês de 31 dias)', () => {
    const d = getDecendPeriod(new Date(2026, 6, 25))
    expect(d.index).toBe(3)
    expect(d.key).toBe('2026-07-D3')
    expect(d.start).toEqual(new Date(2026, 6, 21))
    expect(d.end).toEqual(new Date(2026, 7, 1)) // 01/08
  })

  it('fevereiro (28 dias): dia 27 → 3ª dezena termina em 01/03', () => {
    const d = getDecendPeriod(new Date(2026, 1, 27)) // 27/02/2026 (não bissexto)
    expect(d.index).toBe(3)
    expect(d.key).toBe('2026-02-D3')
    expect(d.start).toEqual(new Date(2026, 1, 21))
    expect(d.end).toEqual(new Date(2026, 2, 1))
  })

  it('bordas: dia 10 = D1, dia 11 = D2, dia 20 = D2, dia 21 = D3', () => {
    expect(getDecendPeriod(new Date(2026, 6, 10)).index).toBe(1)
    expect(getDecendPeriod(new Date(2026, 6, 11)).index).toBe(2)
    expect(getDecendPeriod(new Date(2026, 6, 20)).index).toBe(2)
    expect(getDecendPeriod(new Date(2026, 6, 21)).index).toBe(3)
  })

  it('dezembro → 3ª dezena termina em 01/01 do ano seguinte', () => {
    const d = getDecendPeriod(new Date(2026, 11, 31)) // 31/12/2026
    expect(d.key).toBe('2026-12-D3')
    expect(d.end).toEqual(new Date(2027, 0, 1))
    expect(d.label).toBe('3ª dezena de dezembro')
  })
})
