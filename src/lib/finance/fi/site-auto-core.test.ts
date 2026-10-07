import { describe, expect, it } from 'vitest'
import { customerMessage, internalSummary, isStalled, pickQuote, readResult, statusOf, withHistory } from './site-auto-core'

const terms = { vehicleValue: 80000, downPayment: 20000, installments: 48 }
const base = { at: '2026-10-07T10:00:00Z', terms, quotes: [], pending: [] }

describe('F&I — simulação automática do site', () => {
  it('situação pela quantidade de respostas', () => {
    expect(statusOf(0, 3)).toBe('AGUARDANDO_ANALISE')
    expect(statusOf(1, 2)).toBe('PARCIAL')
    expect(statusOf(2, 0)).toBe('COTADO')
  })

  it('escolhe a cotação do prazo mais próximo do pedido', () => {
    const q = pickQuote([{ installments: 36, installmentValue: 2100 }, { installments: 48, installmentValue: 1800 }, { installments: 60, installmentValue: 1600 }], 48)
    expect(q?.installments).toBe(48)
    expect(pickQuote([{ installments: 60, installmentValue: 0 }], 48)).toBeNull()
  })

  it('histórico: nova condição soma; mesma condição só atualiza', () => {
    let r = withHistory(null, { ...base, status: 'AGUARDANDO_ANALISE' })
    r = withHistory(r, { ...base, at: '2026-10-07T11:00:00Z', status: 'PARCIAL', quotes: [{ bankId: 'b', bank: 'BV', installments: 48, installmentValue: 1800, rateMonthly: 1.9, cetMonthly: null }] })
    expect(r.history).toHaveLength(1)
    expect(r.history[0].bestInstallment).toBe(1800)
    r = withHistory(r, { ...base, at: '2026-10-07T12:00:00Z', terms: { ...terms, installments: 60 }, status: 'AGUARDANDO_ANALISE' })
    expect(r.history).toHaveLength(2)
    expect(readResult(r)?.history).toHaveLength(2)
    expect(readResult({ x: 1 })).toBeNull()
  })

  it('mensagens para o cliente e para a equipe', () => {
    const parcial = withHistory(null, { ...base, status: 'PARCIAL', quotes: [{ bankId: 'b', bank: 'BV', installments: 48, installmentValue: 1800, rateMonthly: 1.9, cetMonthly: null }], pending: [{ bankId: 'c', bank: 'PAN', reason: 'MANUAL' }] })
    expect(customerMessage(parcial).headline).toBe('1 banco já respondeu.')
    expect(customerMessage(parcial).detail).toContain('mais 1 banco')
    expect(internalSummary(parcial)).toContain('BV: 48x de')
    expect(internalSummary(parcial)).toContain('Aguardando análise manual: PAN')
    const espera = withHistory(null, { ...base, status: 'AGUARDANDO_ANALISE' })
    expect(customerMessage(espera).headline).toBe('Recebemos sua simulação.')
  })

  it('parada: só sem envio, depois de 30 min e sem aviso nas últimas 12 h', () => {
    const now = new Date('2026-10-07T12:00:00Z')
    const old = new Date('2026-10-07T11:00:00Z')
    expect(isStalled({ status: 'SIMULACAO', hasActiveSubmission: false, updatedAt: old, lastAlertAt: null }, now)).toBe(true)
    expect(isStalled({ status: 'SIMULACAO', hasActiveSubmission: true, updatedAt: old, lastAlertAt: null }, now)).toBe(false)
    expect(isStalled({ status: 'ENVIADA', hasActiveSubmission: false, updatedAt: old, lastAlertAt: null }, now)).toBe(false)
    expect(isStalled({ status: 'SIMULACAO', hasActiveSubmission: false, updatedAt: new Date('2026-10-07T11:50:00Z'), lastAlertAt: null }, now)).toBe(false)
    expect(isStalled({ status: 'PREENCHENDO', hasActiveSubmission: false, updatedAt: old, lastAlertAt: '2026-10-07T06:00:00Z' }, now)).toBe(false)
    expect(isStalled({ status: 'PREENCHENDO', hasActiveSubmission: false, updatedAt: old, lastAlertAt: '2026-10-06T20:00:00Z' }, now)).toBe(true)
  })
})
