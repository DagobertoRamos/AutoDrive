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

  it('aceita bônus dezenal como bônus por quantidade', () => {
    const data = validateCommissionRulePayload({
      name: 'Bônus primeira dezena',
      ruleType: 'BONUS_DEZENA',
      commissionType: 'BONUS_QTD',
      role: 'VENDEDOR',
      fixedValue: '500,00',
      fromQuantity: 4,
      notes: '__decendBonus__={"groupId":"g1","decend":"FIRST_DECEND"}',
    })

    expect(data.ruleType).toBe('BONUS_DEZENA')
    expect(data.commissionType).toBe('BONUS_QTD')
    expect(data.fixedValue).toBe(500)
    expect(data.fromQuantity).toBe(4)
    expect(data.percentage).toBeNull()
  })

  it('rejeita bônus dezenal com quantidade decimal', () => {
    expect(() => validateCommissionRulePayload({
      name: 'Bônus inválido',
      ruleType: 'BONUS_DEZENA',
      commissionType: 'BONUS_QTD',
      fixedValue: 500,
      fromQuantity: 4.5,
    })).toThrow(CommissionRuleValidationError)
  })
})
