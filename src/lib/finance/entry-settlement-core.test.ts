import { describe, expect, it } from 'vitest'
import { chargeResult, isChargedToCustomer, isPayoffDebt, itemsTotal, normalizeItems } from './entry-settlement-core'
import { DEFAULT_DOCUMENTO_CONFIG, computeDocumentoCommission, resolveDocumentationFee, type DocumentoConfig } from './documento-config'

describe('baixa detalhada — itens', () => {
  it('soma os itens e descarta vazios; tipo desconhecido vira OUTRO com descrição padrão', () => {
    const items = normalizeItems([
      { kind: 'LICENCIAMENTO', amount: 280 },
      { kind: 'PLACA', description: 'Par de placas Mercosul', amount: 100 },
      { kind: 'LAUDO_ECV', amount: 75 },
      { kind: 'HONORARIO', amount: 270 },
      { kind: 'XPTO', amount: 0 },
      { kind: 'XPTO', amount: 10.005 },
    ])
    expect(items.map((i) => i.kind)).toEqual(['LICENCIAMENTO', 'PLACA', 'LAUDO_ECV', 'HONORARIO', 'OUTRO'])
    expect(items[0].description).toBe('Licenciamento')
    expect(items[1].description).toBe('Par de placas Mercosul')
    expect(itemsTotal(items)).toBe(735.01)
  })
})

describe('cobrado × custo real × comissões', () => {
  it('documento cobrado 1.510, gasto 725, comissões 200+100+10+30 → lucro bruto 785 e líquido 445', () => {
    const r = chargeResult({ charged: 1510, cost: 725, commissions: [
      { amount: 200, status: 'PREVISTO' }, { amount: 100, status: 'APROVADO' }, { amount: 10, status: 'PAGO' }, { amount: 30, status: 'PREVISTO' },
      { amount: 999, status: 'CANCELADO' },
    ] })
    expect(r).toMatchObject({ charged: 1510, cost: 725, gross: 785, commissions: 340, net: 445 })
    expect(r.margin).toBe(29.5)
  })
  it('débito da loja (não cobrado) é só custo', () => {
    expect(chargeResult({ charged: 0, cost: 510, commissions: [] })).toMatchObject({ gross: -510, net: -510, margin: null })
  })
  it('quem paga e quitação', () => {
    expect(isChargedToCustomer('COMPRADOR')).toBe(true)
    expect(isChargedToCustomer('loja')).toBe(false)
    expect(isPayoffDebt({ type: 'FINANCIAMENTO' })).toBe(true)
    expect(isPayoffDebt({ type: 'OUTROS', description: 'Quitação' })).toBe(true)
    expect(isPayoffDebt({ type: 'DOCUMENTACAO' })).toBe(false)
  })
})

describe('comissão de documento — base e setor', () => {
  const config: DocumentoConfig = {
    ...DEFAULT_DOCUMENTO_CONFIG,
    tiers: [{ minFee: 1490, maxFee: null, gerente: 100, vendedor: 200, setor: 10, setorGerente: 30 }],
  }
  it('sem taxa própria, a base vem dos débitos de documentação cobrados do comprador', () => {
    expect(resolveDocumentationFee({ documentationFee: null, documentationPaidBy: null, debts: [
      { type: 'DOCUMENTACAO', value: '1500', responsavel: 'COMPRADOR' },
      { type: 'CAUTELAR', value: '510', responsavel: 'COMPRADOR' },
    ] })).toEqual({ fee: 1500, payer: 'CLIENTE' })
    expect(resolveDocumentationFee({ documentationFee: null, documentationPaidBy: null, debts: [{ type: 'DESPACHANTE', value: 900, responsavel: 'LOJA' }] }))
      .toEqual({ fee: 900, payer: 'LOJA' })
    expect(resolveDocumentationFee({ documentationFee: '1490', documentationPaidBy: 'CLIENTE', debts: [] })).toEqual({ fee: 1490, payer: 'CLIENTE' })
  })
  it('cada beneficiário recebe o valor da faixa', () => {
    const c = (beneficiary: 'VENDEDOR' | 'GERENTE' | 'SETOR' | 'SETOR_GERENTE') => computeDocumentoCommission({ config, fee: 1500, payer: 'CLIENTE', beneficiary })
    expect([c('VENDEDOR'), c('GERENTE'), c('SETOR'), c('SETOR_GERENTE')]).toEqual([200, 100, 10, 30])
    expect(computeDocumentoCommission({ config, fee: 1500, payer: 'CLIENTE', isManager: true })).toBe(100) // legado
    expect(computeDocumentoCommission({ config, fee: 1500, payer: 'LOJA', beneficiary: 'SETOR' })).toBe(0) // cortesia
  })
})
