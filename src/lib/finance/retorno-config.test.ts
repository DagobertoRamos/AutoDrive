import { describe, expect, it } from 'vitest'
import { computeReturnFromAutoconf, DEFAULT_RETORNO_CONFIG, type RetornoConfig } from '@/lib/finance/retorno-config'

function cfg(patch: Partial<RetornoConfig> = {}): RetornoConfig {
  return { ...DEFAULT_RETORNO_CONFIG, active: true, ...patch }
}

describe('computeReturnFromAutoconf', () => {
  it('config inativa → null', () => {
    expect(computeReturnFromAutoconf({ config: cfg({ active: false }), retornoValue: 1391 })).toBeNull()
  })

  it('usa o valor do retorno do AutoConf como bruto e aplica ILA/IOF sobre o bruto', () => {
    // retorno 1391; ILA 10%; IOF 5% → ila=139,10 iof=69,55 net=1182,35
    const r = computeReturnFromAutoconf({ config: cfg({ ilaPercent: 10, iofPercent: 5 }), retornoValue: 1391 })
    expect(r).toEqual({ returnGrossValue: 1391, ilaValue: 139.1, iofValue: 69.55, returnNetValue: 1182.35 })
  })

  it('sem ILA/IOF → líquido = bruto', () => {
    const r = computeReturnFromAutoconf({ config: cfg(), retornoValue: 1391 })
    expect(r).toEqual({ returnGrossValue: 1391, ilaValue: 0, iofValue: 0, returnNetValue: 1391 })
  })

  it('sem valor do AutoConf, com financiado + % padrão → financiado × %', () => {
    // financiado 31823,10 × 6% = 1909,386 → 1909,39; ILA 10% = 190,94; net = 1718,45
    const r = computeReturnFromAutoconf({
      config: cfg({ ilaPercent: 10, defaultReturnPercent: 6 }),
      financedAmount: 31823.10,
    })
    expect(r?.returnGrossValue).toBe(1909.39)
    expect(r?.ilaValue).toBe(190.94)
    expect(r?.returnNetValue).toBe(1718.45)
  })

  it('% da própria negociação tem prioridade sobre o padrão do cadastro', () => {
    const r = computeReturnFromAutoconf({
      config: cfg({ defaultReturnPercent: 6 }),
      financedAmount: 10000,
      returnPercent: 4,
    })
    expect(r?.returnGrossValue).toBe(400) // 10000 × 4%
  })

  it('sem retorno e sem base → null', () => {
    expect(computeReturnFromAutoconf({ config: cfg({ defaultReturnPercent: 6 }) })).toBeNull()
    expect(computeReturnFromAutoconf({ config: cfg(), financedAmount: 10000 })).toBeNull() // sem % → sem bruto
  })

  it('nunca deixa líquido negativo (ILA+IOF > bruto → 0)', () => {
    const r = computeReturnFromAutoconf({ config: cfg({ ilaPercent: 80, iofPercent: 40 }), retornoValue: 1000 })
    expect(r?.returnNetValue).toBe(0)
  })
})
