import { describe, expect, it } from 'vitest'
import { deriveCenterKey, guessServiceKind, legacyCenterKey } from './result-centers-core'

describe('result-centers-core', () => {
  it('adivinha o tipo do serviço pelo nome', () => {
    expect(guessServiceKind('Garantia: Excellence 150')).toBe('GARANTIA')
    expect(guessServiceKind('Polimento técnico')).toBe('ESTETICA')
    expect(guessServiceKind('Martelinho de ouro porta')).toBe('FUNILARIA')
    expect(guessServiceKind('Tapete + alarme')).toBe('ACESSORIO')
    expect(guessServiceKind('Transferência')).toBe('DOCUMENTACAO')
    expect(guessServiceKind('Qualquer coisa')).toBe('OUTRO')
  })

  it('classifica lançamentos automáticos no centro', () => {
    const ctx = {
      debtType: (id: string) => (id === 'd1' ? 'DESPACHANTE' : 'IPVA'),
      serviceKind: (id: string) => (id === 's1' ? 'FUNILARIA' : 'ESTETICA'),
      commission: (id: string) => (id === 'c1' ? { ruleType: 'DOCUMENTO' } : id === 'c2' ? { ruleType: 'SERVICO', serviceId: 's1' } : { ruleType: 'VENDA' }),
    }
    expect(deriveCenterKey({ source: 'NEG_DEBITO_d1', type: 'DESPESA' }, 'CMV_DOCUMENTACAO', ctx)).toBe('DOCUMENTACAO')
    expect(deriveCenterKey({ source: 'NEG_DEBITO_d2', type: 'DESPESA' }, 'CMV_DOCUMENTACAO', ctx)).toBe('VENDAS')
    expect(deriveCenterKey({ source: 'NEG_SERV_s1', type: 'DESPESA' }, 'CMV_SERVICOS', ctx)).toBe('FUNILARIA')
    expect(deriveCenterKey({ source: 'COMISSAO', type: 'DESPESA', commissionCalculationId: 'c1' }, 'DESP_COMISSOES', ctx)).toBe('DOCUMENTACAO')
    expect(deriveCenterKey({ source: 'COMISSAO', type: 'DESPESA', commissionCalculationId: 'c2' }, 'DESP_COMISSOES', ctx)).toBe('FUNILARIA')
    expect(deriveCenterKey({ source: 'NEG_RETORNO_p1', type: 'RECEITA' }, 'REC_FI', ctx)).toBe('FI')
    expect(deriveCenterKey({ source: 'VEICULO_SERVICO', type: 'DESPESA' }, 'CMV_PREPARACAO', ctx)).toBe('PREPARACAO')
    expect(deriveCenterKey({ source: 'MANUAL', type: 'DESPESA' }, 'DESP_MARKETING', ctx)).toBe('MARKETING')
    expect(deriveCenterKey({ source: 'MANUAL', type: 'DESPESA' }, 'DESP_OCUPACAO', ctx)).toBe('ADMINISTRATIVO')
  })

  it('reconhece os centros antigos pelo nome', () => {
    expect(legacyCenterKey('Preparação / Oficina')).toBe('PREPARACAO')
    expect(legacyCenterKey('F&I')).toBe('FI')
    expect(legacyCenterKey('Vendas')).toBe('VENDAS')
    expect(legacyCenterKey('Loja Centro')).toBeNull()
  })
})

describe('garantia como receita da área', () => {
  it('vendida por 2.350 entra como receita de Garantias; cortesia da loja não', async () => {
    const { dealRevenueComponents } = await import('./result-centers-core')
    const comps = dealRevenueComponents({ saleAmount: 50000, warrantyPaidBy: 'CLIENTE', warrantySales: [{ id: 'w1', finalPrice: 2350, status: 'ATIVA' }] })
    expect(comps.find((c) => c.key === 'GAR_w1')).toMatchObject({ center: 'GARANTIAS', amount: 2350, revenueCode: '4.1' })
    expect(dealRevenueComponents({ saleAmount: 50000, warrantyPaidBy: 'LOJA', warrantySales: [{ id: 'w1', finalPrice: 2350, status: 'ATIVA' }] }).some((c) => c.key === 'GAR_w1')).toBe(false)
  })
})
