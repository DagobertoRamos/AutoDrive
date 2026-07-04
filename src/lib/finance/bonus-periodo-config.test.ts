import { describe, expect, it } from 'vitest'
import { coerceBonusPeriodoConfig, DEFAULT_BONUS_PERIODO_CONFIG } from '@/lib/finance/bonus-periodo-config'

describe('coerceBonusPeriodoConfig', () => {
  it('default: tudo inativo, meta 250/500, dezena 1000', () => {
    const c = coerceBonusPeriodoConfig({})
    expect(c.producaoLoja.active).toBe(false)
    expect(c.metaLoja.vendedor).toBe(250)
    expect(c.metaLoja.gerente).toBe(500)
    expect(c.dezenaCombo.value).toBe(1000)
  })

  it('produção: descarta rate sem key válida (s:/m:), sanea negativos', () => {
    const c = coerceBonusPeriodoConfig({ producaoLoja: { active: true, rates: [
      { key: 's:abc', nome: 'Anderson', rate: 50 },
      { key: 'x:zzz', nome: 'Inválido', rate: 10 },
      { key: 'm:def', nome: 'Gerente', rate: -5 },
    ] } })
    expect(c.producaoLoja.active).toBe(true)
    expect(c.producaoLoja.rates.length).toBe(2) // descarta a chave inválida
    expect(c.producaoLoja.rates[0].rate).toBe(50)
    expect(c.producaoLoja.rates[1].rate).toBe(0) // negativo → 0
  })

  it('meta: alvo arredonda e não fica negativo', () => {
    const c = coerceBonusPeriodoConfig({ metaLoja: { active: true, targetUnitSales: 29.7, vendedor: 300, gerente: 600 } })
    expect(c.metaLoja.active).toBe(true)
    expect(c.metaLoja.targetUnitSales).toBe(30)
    expect(c.metaLoja.vendedor).toBe(300)
  })

  it('active só vira true com boolean true explícito', () => {
    expect(coerceBonusPeriodoConfig({ dezenaCombo: { active: 'sim', value: 500 } }).dezenaCombo.active).toBe(false)
    expect(coerceBonusPeriodoConfig({ dezenaCombo: { active: true, value: 500 } }).dezenaCombo.active).toBe(true)
  })

  it('DEFAULT export coerente', () => {
    expect(DEFAULT_BONUS_PERIODO_CONFIG.metaLoja.gerente).toBe(500)
  })
})
