import { describe, expect, it } from 'vitest'
import {
  buildFiUpdate, computeFiNet, fiFromAutoconf, fiPatchSchema, fillFiNulls, normalizeAddOnKind,
  matchFinancings, parseAddOns, stripFiFromNotes, summarizeFiContract, FI_MAX_ADDONS,
} from './fi-receipt-core'

describe('computeFiNet', () => {
  it('bruto − ILA − IOF − IRRF', () => {
    expect(computeFiNet(1000, 100, 30, 15)).toBe(855)
    expect(computeFiNet(1000.1, 0.05, null, undefined)).toBe(1000.05)
  })
  it('sem bruto → null', () => {
    expect(computeFiNet(null, 10)).toBeNull()
  })
})

describe('fiPatchSchema + buildFiUpdate', () => {
  it('calcula o líquido quando não informado e arredonda', () => {
    const p = fiPatchSchema.parse({ action: 'FI', returnGrossValue: '1200.555', ilaValue: 100, iofValue: 20, irrfValue: 10, plusValue: 300, contractNumber: ' 123 ', addOns: [] })
    const u = buildFiUpdate(p)
    expect(u.returnGrossValue).toBe(1200.56)
    expect(u.returnNetValue).toBe(1070.56)
    expect(u.contractNumber).toBe('123')
    expect(u.addOns).toBeNull()
    expect('returnPct' in u).toBe(false)
  })
  it('respeita o líquido informado', () => {
    const u = buildFiUpdate(fiPatchSchema.parse({ action: 'FI', returnGrossValue: 1000, ilaValue: 100, returnNetValue: 950 }))
    expect(u.returnNetValue).toBe(950)
  })
  it('rejeita negativos, beneficiário inválido e excesso de agregados', () => {
    expect(fiPatchSchema.safeParse({ action: 'FI', ilaValue: -1 }).success).toBe(false)
    expect(fiPatchSchema.safeParse({ action: 'FI', addOns: [{ name: 'Seguro', amount: 10, beneficiary: 'BANCO' }] }).success).toBe(false)
    expect(fiPatchSchema.safeParse({ action: 'FI', addOns: [{ name: 'Seguro', amount: -10, beneficiary: 'LOJA' }] }).success).toBe(false)
    const many = Array.from({ length: FI_MAX_ADDONS + 1 }, (_, i) => ({ name: `A${i}`, amount: 1, beneficiary: 'LOJA' }))
    expect(fiPatchSchema.safeParse({ action: 'FI', addOns: many }).success).toBe(false)
  })
  it('normaliza agregados (tipo e receita da loja)', () => {
    const u = buildFiUpdate(fiPatchSchema.parse({ action: 'FI', addOns: [
      { name: 'Seguro prestamista', kind: 'seguro', amount: 1500, beneficiary: 'TERCEIRO', storeRevenue: 450 },
      { name: 'Película', kind: 'xyz', amount: 300, beneficiary: 'LOJA' },
    ] }))
    expect(u.addOns).toEqual([
      { name: 'Seguro prestamista', kind: 'SEGURO', amount: 1500, beneficiary: 'TERCEIRO', storeRevenue: 450 },
      { name: 'Película', kind: 'OUTRO', amount: 300, beneficiary: 'LOJA' },
    ])
  })
})

describe('summarizeFiContract', () => {
  it('valor a receber do banco e receitas da loja', () => {
    const s = summarizeFiContract({
      financedAmount: 50000, returnNetValue: 1800, plusValue: 250,
      addOns: [
        { name: 'Seguro', kind: 'SEGURO', amount: 2000, beneficiary: 'TERCEIRO', storeRevenue: 600 },
        { name: 'Rastreador', kind: 'RASTREADOR', amount: 900, beneficiary: 'TERCEIRO' },
        { name: 'Garantia', kind: 'GARANTIA', amount: 1200, beneficiary: 'LOJA', storeRevenue: 1200 },
      ],
    })
    expect(s.thirdPartyTotal).toBe(2900)
    expect(s.storeAddOnsTotal).toBe(1200)
    expect(s.addOnsTotal).toBe(4100)
    expect(s.bankReceivable).toBe(47100)
    expect(s.storeRevenueTotal).toBe(1800)
    expect(s.storeIncome).toBe(3850)
  })
  it('vazio', () => {
    expect(summarizeFiContract({ financedAmount: null })).toMatchObject({ bankReceivable: 0, storeIncome: 0 })
  })
})

describe('parseAddOns', () => {
  it('ignora lixo', () => {
    expect(parseAddOns(null)).toEqual([])
    expect(parseAddOns([{ name: '', amount: 1 }, { name: 'X', amount: 'abc' }, 5, { name: 'Ok', amount: '10.5', beneficiary: 'TERCEIRO', kind: 'garantia' }]))
      .toEqual([{ name: 'Ok', kind: 'GARANTIA', amount: 10.5, beneficiary: 'TERCEIRO' }])
  })
  it('normalizeAddOnKind', () => {
    expect(normalizeAddOnKind('Proteção')).toBe('PROTECAO')
    expect(normalizeAddOnKind(undefined)).toBe('OUTRO')
  })
})

describe('AutoConf → colunas', () => {
  it('mapeia ila/irrf/valorRetorno e calcula o líquido', () => {
    // percentuais (≤ 30) viram R$ sobre o retorno bruto; acima disso já é valor
    expect(fiFromAutoconf({ ila: 5, irrf: 1.5, valorRetorno: 1000 })).toEqual({ returnGrossValue: 1000, ilaValue: 50, irrfValue: 15, returnNetValue: 935 })
    expect(fiFromAutoconf({ ila: 50, irrf: 7.5, valorRetorno: 1000 })).toEqual({ returnGrossValue: 1000, ilaValue: 50, irrfValue: 75, returnNetValue: 875 })
    expect(fiFromAutoconf({ ila: 0, irrf: null, valorRetorno: null })).toEqual({})
    expect(fiFromAutoconf(null)).toEqual({})
  })
  it('só preenche colunas vazias', () => {
    const inc = { returnGrossValue: 1000, ilaValue: 50, irrfValue: 7.5, returnNetValue: 942.5 }
    expect(fillFiNulls(null, inc)).toEqual(inc)
    expect(fillFiNulls({ returnGrossValue: 1100, ilaValue: null, irrfValue: null, returnNetValue: null }, inc)).toEqual({ ilaValue: 50, irrfValue: 7.5 })
    expect(fillFiNulls({ returnGrossValue: null, ilaValue: 40, irrfValue: 0, returnNetValue: 900 }, inc)).toEqual({ returnGrossValue: 1000 })
  })
  it('stripFiFromNotes', () => {
    expect(stripFiFromNotes('Limite reserva: 01/01 | ILA=50 | IRRF=7.5 | Retorno bruto=1000')).toBe('Limite reserva: 01/01')
    expect(stripFiFromNotes('ILA=50')).toBeNull()
    expect(stripFiFromNotes(null)).toBeNull()
  })
})

describe('matchFinancings', () => {
  it('casa por valor+banco, valor e ordem; ignora não-financiamento', () => {
    const inc = [
      { type: 'PIX', value: 1000 },
      { type: 'FINANCIAMENTO', value: 30000, bank: 'Itaú' },
      { type: 'FINANCIAMENTO', value: 20000, bank: 'BV' },
      { type: 'FINANCIAMENTO', value: 5000, bank: 'X' },
    ]
    const ex = [{ value: 20000, bank: 'Santander' }, { value: 30000, bank: 'ITAÚ' }, { value: 1, bank: null }]
    expect(matchFinancings(inc, ex)).toEqual([-1, 1, 0, 2])
    expect(matchFinancings(inc, [])).toEqual([-1, -1, -1, -1])
  })
})

describe('retorno — exemplo do dono', () => {
  it('100 mil a 6% com ILA 20% e IOF 1,5% → líquido 4.710 (comissões sobre o líquido)', async () => {
    const { calculateReturn } = await import('./return-calc')
    const r = calculateReturn({ financedAmount: 100000, returnRatePercent: 6, ilaPercent: 20, iofPercent: 1.5 })
    expect(r).toEqual({ returnGrossValue: 6000, ilaValue: 1200, iofValue: 90, returnNetValue: 4710, commissionBaseValue: 4710 })
    // vendedor 8% + gerente 5% + F&I 5% = 847,80 → sobram 3.862,20 de receita de retorno
    const comissoes = [8, 5, 5].reduce((s, p) => s + Math.round(r.returnNetValue * p) / 100, 0)
    expect(Math.round((r.returnNetValue - comissoes) * 100) / 100).toBe(3862.2)
  })
})
