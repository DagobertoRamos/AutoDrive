import { describe, expect, it } from 'vitest'
import {
  canMoveService, inspectionReady, isOverdue, parseMoneyInput, receptionMissing, serviceCost, servicesDone, servicesSummary, vehicleResult,
} from './prep-core'

describe('serviços', () => {
  it('custo efetivo: real > previsto; negado/cancelado = 0', () => {
    expect(serviceCost({ status: 'CONCLUIDO', estimatedCost: 500, actualCost: 620 })).toBe(620)
    expect(serviceCost({ status: 'EM_SERVICO', estimatedCost: '500.00' })).toBe(500)
    expect(serviceCost({ status: 'NEGADO', estimatedCost: 500 })).toBe(0)
  })
  it('atraso só em serviço com previsão vencida', () => {
    const now = new Date('2026-09-27T12:00:00Z')
    expect(isOverdue({ status: 'EM_SERVICO', dueAt: '2026-09-26T12:00:00Z' }, now)).toBe(true)
    expect(isOverdue({ status: 'CONCLUIDO', dueAt: '2026-09-26T12:00:00Z' }, now)).toBe(false)
    expect(isOverdue({ status: 'EM_SERVICO', dueAt: '2026-09-28T12:00:00Z' }, now)).toBe(false)
  })
  it('etapa concluída quando todos encerrados', () => {
    expect(servicesDone([{ status: 'CONCLUIDO' }, { status: 'NEGADO' }])).toBe(true)
    expect(servicesDone([{ status: 'CONCLUIDO' }, { status: 'EM_SERVICO' }])).toBe(false)
    expect(servicesDone([])).toBe(false)
  })
  it('resumo com previsto × real × efetivo', () => {
    const s = servicesSummary([
      { status: 'CONCLUIDO', estimatedCost: 500, actualCost: 450 },
      { status: 'EM_SERVICO', estimatedCost: 300 },
      { status: 'NEGADO', estimatedCost: 800 },
    ])
    expect(s).toMatchObject({ total: 3, estimated: 800, actual: 450, effective: 750, done: false })
    expect(s.byStatus.NEGADO).toBe(1)
  })
  it('transições: encerrado só reabre', () => {
    expect(canMoveService('AGUARDANDO', 'EM_SERVICO')).toBe(true)
    expect(canMoveService('CONCLUIDO', 'NEGADO')).toBe(false)
    expect(canMoveService('CONCLUIDO', 'AGUARDANDO')).toBe(true)
    expect(canMoveService('EM_SERVICO', 'XYZ')).toBe(false)
  })
})

describe('recebimento', () => {
  it('cada item exige foto ou "não possui" justificado', () => {
    const miss = receptionMissing([{ key: 'estepe', status: 'NAO_POSSUI', note: '' }, { key: 'macaco', status: 'NAO_POSSUI', note: 'Veio sem' }], { manual: 1 })
    expect(miss).toContain('Estepe: justifique por que não possui')
    expect(miss).toContain('Chave reserva: foto')
    expect(miss.some((m) => m.startsWith('Macaco'))).toBe(false)
    expect(miss.some((m) => m.startsWith('Manual'))).toBe(false)
  })
  it('completo não falta nada', () => {
    const photos = { manual: 1, revisoes: 2, chave_reserva: 1, macaco: 1, chave_roda: 1, triangulo: 1, estepe: 1 }
    expect(receptionMissing([], photos)).toEqual([])
  })
})

describe('perícia', () => {
  it('exige status e laudo', () => {
    expect(inspectionReady('PENDENTE', 1).ok).toBe(true)
    expect(inspectionReady('PENDENTE', 0).missing).toEqual(['laudo anexado (PDF ou imagem)'])
    expect(inspectionReady('SEM_CAUTELAR', 2).ok).toBe(false)
  })
})

describe('extrato', () => {
  it('lucro, margem, a pagar; cancelado não conta', () => {
    const r = vehicleResult([
      { type: 'RECEITA', category: 'VENDA_VEICULO', amount: 100000, status: 'RECEBIDO' },
      { type: 'DESPESA', category: 'COMPRA_VEICULO', amount: 80000, status: 'PAGO' },
      { type: 'DESPESA', category: 'SERVICO', amount: 2500, status: 'PREVISTO' },
      { type: 'DESPESA', category: 'COMISSAO', amount: 1000, status: 'PREVISTO' },
      { type: 'DESPESA', category: 'MULTA', amount: 300, status: 'CANCELADO' },
    ])
    expect(r).toMatchObject({ revenue: 100000, cost: 83500, profit: 16500, margin: 16.5, toPay: 3500, toReceive: 0 })
    expect(r.byCategory.SERVICO).toBe(-2500)
  })
})

describe('valor digitado', () => {
  it('aceita formatos brasileiro e com ponto decimal', () => {
    expect(parseMoneyInput('1.500,50')).toBe(1500.5)
    expect(parseMoneyInput('1500,50')).toBe(1500.5)
    expect(parseMoneyInput('1500.50')).toBe(1500.5)
    expect(parseMoneyInput('1.500')).toBe(1500)
    expect(parseMoneyInput('250')).toBe(250)
    expect(parseMoneyInput('')).toBeNull()
  })
})
