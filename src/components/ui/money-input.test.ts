import { describe, expect, it } from 'vitest'
import { maskBRL, numberToBRLMask, parseBRL } from '@/lib/masks'
import { moneyToText, textToMoney } from './money-input'

// Mesmo caminho do onChange do MoneyInput.
const type = (raw: string) => parseBRL(maskBRL(raw))

describe('MoneyInput', () => {
  it('mostra no padrão R$ 49.900,00', () => expect(numberToBRLMask(49900)).toBe('49.900,00'))
  it('digitar 4990000 = 49.900,00 (nunca 49,9)', () => expect(type('4990000')).toBe(49900))
  it('colar "49.900,00" mantém o valor', () => expect(type('49.900,00')).toBe(49900))
  it('texto canônico ida e volta', () => {
    expect(textToMoney(moneyToText(49900.5))).toBe(49900.5)
    expect(textToMoney('49.900,00')).toBe(49900)
    expect(textToMoney('')).toBeNull()
  })
})
