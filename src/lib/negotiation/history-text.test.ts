import { describe, expect, it } from 'vitest'
import { describeAudit, describeStatus, extraHistory, formatValue } from './history-text'

const at = '2026-10-03T20:26:24.000Z'

describe('histórico da negociação em português', () => {
  it('valor de venda vira frase com moeda', () => {
    const h = describeAudit({ action: 'EDITAR', field: 'saleAmount', oldValue: '55890', newValue: '58890', userName: 'Dagoberto Ramos', createdAt: at })
    expect(h.title).toBe('Valor de venda alterado')
    expect(h.text).toBe('Dagoberto Ramos alterou o valor de venda de R$ 55.890,00 para R$ 58.890,00.')
    expect(h.restricted).toBe(true)
  })
  it('sinal e data de entrega', () => {
    expect(describeAudit({ action: 'EDITAR', field: 'signalAmount', oldValue: '5000', newValue: '500', userName: 'Ana', createdAt: at }).text).toBe('Ana alterou o sinal de R$ 5.000,00 para R$ 500,00.')
    const d = describeAudit({ action: 'EDITAR', field: 'deliveryDate', oldValue: null, newValue: 'Fri Oct 10 2026 12:00:00 GMT-0300', userName: 'Ana', createdAt: at })
    expect(d.text).toBe('Ana informou a data de entrega: 10/10/2026.')
    expect(d.restricted).toBe(false)
  })
  it('vendedor por nome (refs) e nunca o id', () => {
    const h = describeAudit({ action: 'EDITAR', field: 'sellerId', oldValue: 's1', newValue: 's2', userName: 'Ana', createdAt: at }, { s1: 'João', s2: 'Maria' })
    expect(h.text).toBe('Ana alterou o vendedor de João para Maria.')
  })
  it('pagamento incluído/removido', () => {
    expect(describeAudit({ action: 'EDITAR', field: 'pagamento', oldValue: null, newValue: 'Sinal PIX R$ 500,00', userName: 'Ana', createdAt: at }).text).toBe('Ana incluiu o pagamento Sinal PIX R$ 500,00.')
    expect(describeAudit({ action: 'EDITAR', field: 'débito', oldValue: 'IPVA R$ 900,00', newValue: null, userName: 'Ana', createdAt: at }).title).toBe('Débito removido')
  })
  it('status com motivo', () => {
    expect(describeStatus({ newStatus: 'APROVADA', createdAt: at }, 'Carlos').text).toBe('Carlos aprovou a negociação.')
    expect(describeStatus({ newStatus: 'CANCELADA', reason: 'Cliente desistiu', createdAt: at }, null).text).toBe('O sistema cancelou a negociação. Motivo: Cliente desistiu.')
  })
  it('valores em formato BR também', () => {
    expect(formatValue('money', '1.500,50')).toBe('R$ 1.500,50')
    expect(formatValue('money', null)).toBe('—')
  })
})

describe('histórico completo — eventos sem linha no log', () => {
  const base = { audit: [], payments: [], debts: [], attachments: [], documents: [], discounts: [], changes: [], reopens: [], releases: [], imported: [] }
  it('pagamentos lançados e confirmados, débitos e anexos entram', () => {
    const items = extraHistory({
      ...base,
      payments: [{ type: 'SINAL', method: 'PIX', value: '500', status: 'CONFIRMADO', createdAt: '2026-10-03T01:08:44Z', paidAt: '2026-10-02T12:00:00Z' }],
      debts: [{ type: 'DOCUMENTACAO', value: 1500, responsavel: 'COMPRADOR', createdAt: '2026-10-03T01:08:43Z' }],
      attachments: [{ category: 'COMPROVANTE_PAGAMENTO', fileName: 'pix.jpg', uploadedByName: 'Ana', uploadedAt: '2026-10-03T02:00:00Z' }],
    })
    expect(items.map((i) => i.title)).toEqual(['Pagamento lançado', 'Pagamento confirmado', 'Débito lançado', 'Arquivo anexado'])
    expect(items[0].text).toBe('Pagamento lançado: Sinal (PIX) de R$ 500,00.')
    expect(items[0].restricted).toBe(true)
    expect(items[3].restricted).toBeUndefined()
  })
  it('não repete o que já tem linha própria no log', () => {
    const at = '2026-10-03T10:00:00Z'
    const items = extraHistory({ ...base, audit: [{ field: 'pagamento', newValue: 'Incluído: PIX R$ 10,00', createdAt: '2026-10-03T10:00:03Z' }], payments: [{ type: 'PIX', value: 10, status: 'PENDENTE', createdAt: at }] })
    expect(items).toEqual([])
  })
})

describe('data sem hora', () => {
  it('meia-noite UTC mostra o dia informado (não o anterior)', () => {
    expect(formatValue('date', 'Wed Oct 07 2026 00:00:00 GMT+0000 (Coordinated Universal Time)')).toBe('07/10/2026')
    expect(formatValue('date', '2026-10-07')).toBe('07/10/2026')
  })
})
