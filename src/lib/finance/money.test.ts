import { describe, expect, it } from 'vitest'
import { MoneySum, round2, sumMoney, toCents } from './money'

describe('dinheiro em centavos', () => {
  it('arredonda meio para cima sem ruído binário', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.675)).toBe(2.68)
    expect(round2(-1.005)).toBe(-1)
    expect(toCents('1234.565')).toBe(123457)
  })
  it('soma sem erro acumulado', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    const many = Array.from({ length: 10_000 }, () => 0.01)
    expect(sumMoney(many)).toBe(100)
    expect(new MoneySum().add(1500.1).sub(0.1).add('99.99').value).toBe(1599.99)
  })
})
