import { describe, expect, it } from 'vitest'
import { calculateNegotiationFinancialSummary, reconciliationOf, vehicleReleaseBlock } from '../negotiation-service'

const sum = (payments: Array<{ value: number; status: string }>, vehicleValue = 58890, debts = [{ value: 1500 }]) =>
  calculateNegotiationFinancialSummary({ vehicleValue, debts, payments: payments as never })

describe('conciliação financeira da negociação', () => {
  it('tudo lançado mas só o sinal conciliado: não está quitado e o carro não sai', () => {
    // Caso real NEG-2026-0003: sinal 500 confirmado, PIX 11.000 e financiamento 48.890 pendentes.
    const r = reconciliationOf(sum([{ value: 500, status: 'CONFIRMADO' }, { value: 11000, status: 'PENDENTE' }, { value: 48890, status: 'PENDENTE' }]))
    expect(r).toMatchObject({ total: 60390, conciliado: 500, aguardando: 59890, faltaLancar: 0, naoConciliado: 59890, situacao: 'AGUARDANDO_CONCILIACAO' })
    expect(vehicleReleaseBlock(r)).toBe('O veículo só é liberado com todo o valor conciliado pelo financeiro. Faltam R$ 59.890,00: R$ 59.890,00 aguardando conciliação do financeiro.')
  })
  it('parte sem lançar: falta receber', () => {
    const r = reconciliationOf(sum([{ value: 500, status: 'CONFIRMADO' }, { value: 40000, status: 'PENDENTE' }]))
    expect(r.situacao).toBe('FALTA_RECEBER')
    expect(r.faltaLancar).toBe(19890)
    expect(vehicleReleaseBlock(r)).toContain('R$ 19.890,00 ainda sem pagamento lançado')
  })
  it('tudo conciliado libera; cancelado não conta', () => {
    const r = reconciliationOf(sum([{ value: 60390, status: 'CONFIRMADO' }, { value: 999, status: 'CANCELADO' }]))
    expect(r.situacao).toBe('CONCILIADO')
    expect(vehicleReleaseBlock(r)).toBeNull()
  })
})
