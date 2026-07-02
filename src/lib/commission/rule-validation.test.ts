import { describe, expect, it } from 'vitest'
import {
  CommissionRuleValidationError,
  validateCommissionRulePayload,
} from '@/lib/commission/rule-validation'

describe('validateCommissionRulePayload', () => {
  it('normaliza valor fixo legado para FIXO', () => {
    const data = validateCommissionRulePayload({
      name: 'Fixo vendedor',
      ruleType: 'VENDA',
      commissionType: 'VALOR_FIXO',
      fixedValue: 500,
      percentage: 2,
    })

    expect(data.commissionType).toBe('FIXO')
    expect(data.fixedValue).toBe(500)
    expect(data.percentage).toBeNull()
  })

  it('exige faixa para regra escalonada', () => {
    expect(() => validateCommissionRulePayload({
      name: 'Escalonada sem faixa',
      ruleType: 'VENDA',
      commissionType: 'ESCALONADA',
      percentage: 2,
    })).toThrow(CommissionRuleValidationError)
  })

  it('aceita bonus por quantidade com valor fixo e quantidade minima', () => {
    const data = validateCommissionRulePayload({
      name: 'Bonus dez vendas',
      ruleType: 'VENDA',
      commissionType: 'BONUS_QTD',
      fixedValue: '1.000,00',
      fromQuantity: 10,
    })

    expect(data.commissionType).toBe('BONUS_QTD')
    expect(data.fixedValue).toBe(1000)
    expect(data.fromQuantity).toBe(10)
    expect(data.percentage).toBeNull()
  })
})
