import { describe, expect, it } from 'vitest'
import {
  debtCenterSpec, fiDueDate, fiReturnAmount, isFiSource, isLiveWarrantySale, isSyncEditable, serviceCostSpec,
  serviceRefOfSource, storeAddOnRevenues,
} from './service-sync-core'

describe('service-sync-core — serviços e garantias', () => {
  it('conta de custo e centro pelo tipo; sem tipo, pelo nome', () => {
    expect(serviceCostSpec({ kind: 'FUNILARIA', name: 'x' })).toEqual({ kind: 'FUNILARIA', costCode: '21.2', centerKey: 'FUNILARIA' })
    expect(serviceCostSpec({ kind: null, name: 'Polimento técnico' })).toEqual({ kind: 'ESTETICA', costCode: '21.3', centerKey: 'ESTETICA' })
    expect(serviceCostSpec({ kind: 'XPTO', name: 'Tapete' })).toMatchObject({ kind: 'ACESSORIO', costCode: '21.4', centerKey: 'ACESSORIOS' })
    expect(serviceCostSpec({ name: 'Qualquer' })).toMatchObject({ kind: 'OUTRO', costCode: '21.6', centerKey: 'VENDAS' })
  })

  it('garantia cancelada/estornada não gera custo', () => {
    expect(isLiveWarrantySale('ATIVA')).toBe(true)
    expect(isLiveWarrantySale('CANCELADA')).toBe(false)
    expect(isLiveWarrantySale('ESTORNADA')).toBe(false)
  })

  it('sincronização só reescreve previsto sem itens de custo', () => {
    expect(isSyncEditable({ status: 'PREVISTO', itemCount: 0 })).toBe(true)
    expect(isSyncEditable({ status: 'PREVISTO', itemCount: 2 })).toBe(false)
    expect(isSyncEditable({ status: 'PAGO', itemCount: 0 })).toBe(false)
  })

  it('origem → serviço/garantia; F&I', () => {
    expect(serviceRefOfSource('NEG_SERV_abc')).toEqual({ kind: 'SERVICE', id: 'abc' })
    expect(serviceRefOfSource('NEG_GAR_w1')).toEqual({ kind: 'WARRANTY', id: 'w1' })
    expect(serviceRefOfSource('NEG_DEBITO_d1')).toBeNull()
    expect(isFiSource('NEG_RETORNO_p1')).toBe(true)
    expect(isFiSource('NEG_AGREG_p1_0')).toBe(true)
    expect(isFiSource('NEG_PGTO_p1')).toBe(false)
  })
})

describe('service-sync-core — débitos', () => {
  it('documentação cobrada do cliente → DOCUMENTACAO/21.1; o resto em VENDAS', () => {
    expect(debtCenterSpec({ type: 'DESPACHANTE', responsavel: 'COMPRADOR' })).toEqual({ centerKey: 'DOCUMENTACAO', costCode: '21.1' })
    expect(debtCenterSpec({ type: 'DOCUMENTACAO', responsavel: 'cliente' })).toEqual({ centerKey: 'DOCUMENTACAO', costCode: '21.1' })
    expect(debtCenterSpec({ type: 'DOCUMENTACAO', responsavel: 'LOJA' })).toEqual({ centerKey: 'VENDAS', costCode: null })
    expect(debtCenterSpec({ type: 'IPVA', responsavel: 'COMPRADOR' })).toEqual({ centerKey: 'VENDAS', costCode: null })
  })
})

describe('service-sync-core — F&I', () => {
  it('retorno: do pagamento; da negociação só com um financiamento; nulo/zero não lança', () => {
    expect(fiReturnAmount(850.456, 999, 2)).toBe(850.46)
    expect(fiReturnAmount(null, '1200', 1)).toBe(1200)
    expect(fiReturnAmount(null, 1200, 2)).toBeNull()
    expect(fiReturnAmount(0, 1200, 1)).toBeNull()
    expect(fiReturnAmount(null, null, 1)).toBeNull()
    expect(fiReturnAmount(-10, 1200, 1)).toBeNull()
  })

  it('vencimento: pagamento → pago em → aprovação + 30 dias', () => {
    const approved = new Date('2026-10-01T12:00:00Z')
    const due = new Date('2026-10-20T12:00:00Z')
    const paid = new Date('2026-10-10T12:00:00Z')
    expect(fiDueDate({ dueDate: due, paidAt: paid }, approved)).toBe(due)
    expect(fiDueDate({ dueDate: null, paidAt: paid }, approved)).toBe(paid)
    expect(fiDueDate({}, approved).toISOString()).toBe('2026-10-31T12:00:00.000Z')
  })

  it('agregados: todos com receita da loja (inclusive pagos a terceiro); seguro → 2.2/FI, rastreador → acessório', () => {
    const r = storeAddOnRevenues([
      { name: 'Prestamista', kind: 'SEGURO', amount: 1500, beneficiary: 'LOJA', storeRevenue: 300 },
      { name: 'Seguro auto', kind: 'SEGURO', amount: 2000, beneficiary: 'TERCEIRO', storeRevenue: 100 },
      { name: 'Rastreador', kind: 'RASTREADOR', amount: 900, beneficiary: 'LOJA', storeRevenue: 250.5 },
      { name: 'Garantia', kind: 'GARANTIA', amount: 1200, beneficiary: 'LOJA' },
      { name: 'Despachante', kind: 'DESPACHANTE', amount: 800, beneficiary: 'LOJA', storeRevenue: 200 },
      'lixo',
    ])
    expect(r).toEqual([
      { index: 0, name: 'Prestamista', kind: 'SEGURO', amount: 300, revenueCode: '2.2', centerKey: 'FI' },
      { index: 1, name: 'Seguro auto', kind: 'SEGURO', amount: 100, revenueCode: '2.2', centerKey: 'FI' },
      { index: 2, name: 'Rastreador', kind: 'ACESSORIO', amount: 250.5, revenueCode: '4.3', centerKey: 'ACESSORIOS' },
      { index: 4, name: 'Despachante', kind: 'DOCUMENTACAO', amount: 200, revenueCode: '4.2', centerKey: 'DOCUMENTACAO' },
    ])
    expect(storeAddOnRevenues(null)).toEqual([])
  })
})
