import { describe, it, expect } from 'vitest'
import { suggestSalePrice, normalizeMarginPct, DEFAULT_MARGIN_PCT } from './suggested-price'

describe('suggestSalePrice', () => {
  it('custo (avaliado + gastos) + margem, arredondado para a centena de cima', () => {
    const s = suggestSalePrice({ evaluatedValue: 39000, totalExpenses: 4630, marginPct: 15 })
    expect(s).toMatchObject({ cost: 43630, value: 50200, cappedByFipe: false })
  })
  it('limita pela FIPE', () => {
    const s = suggestSalePrice({ evaluatedValue: 39000, totalExpenses: 4630, fipeValue: 45000, marginPct: 15 })
    expect(s).toMatchObject({ value: 45000, cappedByFipe: true })
  })
  it('aceita Decimal-string do Prisma e usa a margem padrão', () => {
    const s = suggestSalePrice({ evaluatedValue: '10000', totalExpenses: '0' })
    expect(s?.marginPct).toBe(DEFAULT_MARGIN_PCT)
    expect(s?.value).toBe(11500)
  })
  it('sem valor avaliado não sugere', () => {
    expect(suggestSalePrice({ evaluatedValue: null, totalExpenses: 4000 })).toBeNull()
  })
  it('margem inválida cai no padrão', () => {
    expect(normalizeMarginPct('abc')).toBe(DEFAULT_MARGIN_PCT)
    expect(normalizeMarginPct(-1)).toBe(DEFAULT_MARGIN_PCT)
    expect(normalizeMarginPct('12,5')).toBe(12.5)
  })
})
