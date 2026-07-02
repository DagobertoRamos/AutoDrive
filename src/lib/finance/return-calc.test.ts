import { describe, it, expect } from 'vitest'
import { calculateReturn, calculateReturnCommission, validateReturnPercent } from '@/lib/finance/return-calc'

describe('return-calc (retorno financeiro)', () => {
  it('spec 1.3: financiado 100k @6%, ILA 25%, IOF 0 → bruto 6000 / ILA 1500 / líquido 4500', () => {
    expect(calculateReturn({ financedAmount: 100000, returnRatePercent: 6, ilaPercent: 25, iofPercent: 0 }))
      .toEqual({ returnGrossValue: 6000, ilaValue: 1500, iofValue: 0, returnNetValue: 4500, commissionBaseValue: 4500 })
  })

  it('ILA e IOF incidem sobre o BRUTO; líquido subtrai ambos', () => {
    const r = calculateReturn({ financedAmount: 100000, returnRatePercent: 6, ilaPercent: 25, iofPercent: 10 })
    expect(r.returnGrossValue).toBe(6000)
    expect(r.ilaValue).toBe(1500)
    expect(r.iofValue).toBe(600)
    expect(r.returnNetValue).toBe(3900)
  })

  it('comissão calculada sobre o LÍQUIDO (spec 1.4): 4000 @10% = 400', () => {
    expect(calculateReturnCommission(4000, 10)).toBe(400)
  })

  it('calcula o exemplo comercial 100k @3,60%, ILA 10%, IOF 5%', () => {
    expect(calculateReturn({ financedAmount: 100000, returnRatePercent: 3.6, ilaPercent: 10, iofPercent: 5, minReturnPercent: 0.01, maxReturnPercent: 20 }))
      .toEqual({ returnGrossValue: 3600, ilaValue: 360, iofValue: 180, returnNetValue: 3060, commissionBaseValue: 3060 })
  })

  it('não mascara retorno fora da faixa; a validação deve bloquear antes de salvar', () => {
    expect(calculateReturn({ financedAmount: 100000, returnRatePercent: 20.01, ilaPercent: 0, iofPercent: 0, minReturnPercent: 0.01, maxReturnPercent: 20 }).returnGrossValue).toBe(0)
  })

  it('valores negativos são tratados como zero', () => {
    const r = calculateReturn({ financedAmount: -5, returnRatePercent: -1, ilaPercent: -2, iofPercent: -3 })
    expect(r.returnGrossValue).toBe(0)
    expect(r.returnNetValue).toBe(0)
    expect(calculateReturnCommission(-100, -5)).toBe(0)
  })

  it('financiado nulo → tudo zero', () => {
    expect(calculateReturn({ financedAmount: null, returnRatePercent: 6, ilaPercent: 25, iofPercent: 0 }).returnNetValue).toBe(0)
  })

  it('calcula com configuração mensal de ILA/IOF por valor fixo sobre o bruto', () => {
    expect(calculateReturn({
      financedAmount: 100000,
      returnRatePercent: 3.6,
      ilaPercent: 0,
      iofPercent: 0,
      ilaType: 'FIXO',
      ilaValue: 500,
      iofType: 'FIXO',
      iofValue: 300,
    })).toEqual({ returnGrossValue: 3600, ilaValue: 500, iofValue: 300, returnNetValue: 2800, commissionBaseValue: 2800 })
  })

  it('registra líquido negativo e zera somente a base comissionável', () => {
    expect(calculateReturn({
      financedAmount: 100000,
      returnRatePercent: 1,
      ilaType: 'FIXO',
      ilaValue: 900,
      iofType: 'FIXO',
      iofValue: 300,
      ilaPercent: 0,
      iofPercent: 0,
      minReturnPercent: 0.01,
      maxReturnPercent: 20,
    })).toEqual({ returnGrossValue: 1000, ilaValue: 900, iofValue: 300, returnNetValue: -200, commissionBaseValue: 0 })
  })

  it('valida faixa configurada do tenant', () => {
    expect(validateReturnPercent(3.6, 0.01, 20)).toEqual({ ok: true, value: 3.6 })
    expect(validateReturnPercent(0, 0.01, 20).ok).toBe(false)
    expect(validateReturnPercent(20.01, 0.01, 20).ok).toBe(false)
  })
})
