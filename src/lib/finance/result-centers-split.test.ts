import { describe, expect, it } from 'vitest'
import {
  aggregateByCenter, aggregateServiceLines, centerKeyByCategoryCode, dealRevenueComponents, fiRevenueType,
  isChargedDocDebt, serviceProfit, splitReceipt,
} from './result-centers-core'
import { allocateEntries, type RawEntry } from './reports-core'

describe('dealRevenueComponents — espelha o saldo da negociação', () => {
  it('veículo − desconto + débitos comuns; documentação = taxa + débitos de doc cobrados; serviços por tipo', () => {
    const c = dealRevenueComponents({
      saleAmount: 80000, documentationFee: 500, discountAmount: 1000,
      discountRequests: [{ status: 'APROVADO', approvedValue: 500 }, { status: 'PENDENTE', requestedValue: 9999 }],
      debts: [
        { id: 'd1', type: 'DESPACHANTE', value: 1500, responsavel: 'COMPRADOR' },
        { id: 'd2', type: 'IPVA', value: 2000, responsavel: 'COMPRADOR' },
        { id: 'd3', type: 'DOCUMENTACAO', value: 300, responsavel: 'LOJA' }, // cortesia: fica no veículo
      ],
      services: [
        { id: 's1', value: 1200, name: 'Polimento técnico' },
        { id: 's2', value: 0, name: 'Brinde' },
        { id: 's3', value: 900, kind: 'FUNILARIA', name: 'Martelinho' },
      ],
    })
    expect(c.map((x) => [x.key, x.center, x.revenueCode, x.amount])).toEqual([
      ['VEICULO', 'VENDAS', null, 80800], // 80000 − 1500 + 2000 + 300
      ['DOCUMENTACAO', 'DOCUMENTACAO', '4.2', 2000],
      ['SERV_s1', 'ESTETICA', '4.5', 1200],
      ['SERV_s3', 'FUNILARIA', '4.4', 900],
    ])
  })

  it('valor do veículo segue a precedência do saldo; sem nada → sem linhas', () => {
    expect(dealRevenueComponents({ saleAmount: null, vehicleValue: 50000, vehicles: [{ agreedValue: 1 }] })[0].amount).toBe(50000)
    expect(dealRevenueComponents({ vehicles: [{ agreedValue: 0 }, { agreedValue: 30000 }] })[0].amount).toBe(30000)
    expect(dealRevenueComponents({})).toEqual([])
  })

  it('documentação cobrada = tipo de doc + responsável comprador/cliente', () => {
    expect(isChargedDocDebt({ type: 'transferencia', responsavel: 'cliente' })).toBe(true)
    expect(isChargedDocDebt({ type: 'IPVA', responsavel: 'COMPRADOR' })).toBe(false)
    expect(isChargedDocDebt({ type: 'DESPACHANTE', responsavel: null })).toBe(false)
  })
})

describe('splitReceipt — rateio ao centavo', () => {
  const comps = [{ key: 'a', amount: 1 }, { key: 'b', amount: 1 }, { key: 'c', amount: 1 }]
  it('a soma bate e a sobra vai para a maior linha', () => {
    const r = splitReceipt(100, comps)
    expect(r.map((x) => x.amount)).toEqual([33.34, 33.33, 33.33])
    expect(r.reduce((s, x) => s + Math.round(x.amount * 100), 0)).toBe(10000)
    const r2 = splitReceipt(10000, [{ key: 'v', amount: 80800 }, { key: 'd', amount: 2000 }, { key: 's', amount: 1200 }])
    expect(r2.map((x) => x.amount)).toEqual([9619.04, 238.1, 142.86])
    expect(Math.round(r2.reduce((s, x) => s + x.amount, 0) * 100)).toBe(1000000)
  })
  it('valores quebrados e negativos (estorno)', () => {
    const r = splitReceipt(0.05, [{ key: 'x', amount: 2 }, { key: 'y', amount: 1 }])
    expect(r.map((x) => x.amount)).toEqual([0.03, 0.02])
    expect(splitReceipt(-90, [{ key: 'x', amount: 2 }, { key: 'y', amount: 1 }]).map((x) => x.amount)).toEqual([-60, -30])
  })
  it('sem linhas → vazio (recebimento fica inteiro no veículo)', () => {
    expect(splitReceipt(100, [])).toEqual([])
    expect(splitReceipt(100, [{ key: 'x', amount: 0 }])).toEqual([])
  })
})

describe('classificação e agregação por centro', () => {
  it('centro pela categoria do plano', () => {
    expect(centerKeyByCategoryCode('4.2')).toBe('DOCUMENTACAO')
    expect(centerKeyByCategoryCode('21.2')).toBe('FUNILARIA')
    expect(centerKeyByCategoryCode('21.6')).toBeNull()
    expect(centerKeyByCategoryCode('2.3')).toBe('FI')
    expect(centerKeyByCategoryCode('15.1')).toBe('MARKETING')
    expect(centerKeyByCategoryCode('21.5')).toBe('GARANTIAS')
    expect(centerKeyByCategoryCode('14.1')).toBeNull()
    expect(centerKeyByCategoryCode(null)).toBeNull()
  })

  it('resultado por centro: RESULTADO antes de CUSTO, "Sem centro" no fim, centro removido vai para "Sem centro"', () => {
    const centers = [
      { id: 'mkt', name: 'Marketing', kind: 'CUSTO' as const, key: 'MARKETING' },
      { id: 'doc', name: 'Documentação', kind: 'RESULTADO' as const, key: 'DOCUMENTACAO' },
      { id: 'fi', name: 'F&I', kind: 'RESULTADO' as const, key: 'FI' },
      { id: 'loja', name: 'Loja Centro', kind: 'CUSTO' as const, key: null },
    ]
    const { rows, totals } = aggregateByCenter([
      { type: 'RECEITA', amount: 15000, centerId: 'doc' },
      { type: 'DESPESA', amount: 5000, centerId: 'doc' },
      { type: 'RECEITA', amount: 25000, centerId: 'fi' },
      { type: 'DESPESA', amount: 12000, centerId: 'mkt' },
      { type: 'DESPESA', amount: 100, centerId: 'removido' },
      { type: 'DESPESA', amount: 50, centerId: null },
    ], centers)
    expect(rows.map((r) => [r.name, r.resultado])).toEqual([
      ['Documentação', 10000], ['F&I', 25000], ['Marketing', -12000], ['Sem centro', -150],
    ])
    expect(rows[0].margem).toBe(66.67)
    expect(totals).toEqual({ receitas: 40000, despesas: 17150, resultado: 22850, margem: 57.13 })
  })

  it('tipo da receita de F&I', () => {
    expect(fiRevenueType('NEG_RETORNO_p1', null)).toBe('RETORNO')
    expect(fiRevenueType('NEG_PLUS_p1', '2.5')).toBe('PLUS')
    expect(fiRevenueType('NEG_AGREG_p1_0', '2.2')).toBe('AGREGADO')
    expect(fiRevenueType('MANUAL', '2.3')).toBe('BONIFICACAO')
    expect(fiRevenueType('MANUAL', '2.4.1')).toBe('ACORDO')
    expect(fiRevenueType('NEG_PGTO_x', '2.2', 'SEGURO')).toBe('SEGURO')
    expect(fiRevenueType('VEICULO_RETORNO', null)).toBe('RETORNO')
    expect(fiRevenueType('MANUAL', '2')).toBe('OUTRO')
  })
})

describe('lucro de serviço', () => {
  it('cobrado − custo − comissões, por linha', () => {
    expect(serviceProfit({ charged: 1500, cost: 725, commissions: 100 })).toEqual({ charged: 1500, cost: 725, commissions: 100, profit: 675, margin: 45 })
    expect(serviceProfit({ charged: 0, cost: 300, commissions: 0 }).margin).toBeNull()
    const lines = aggregateServiceLines([
      { kind: 'FUNILARIA', charged: 900, cost: 400, commissions: 50 },
      { kind: 'DOCUMENTACAO', charged: 1500, cost: 725, commissions: 100 },
      { kind: 'FUNILARIA', charged: 600, cost: 300, commissions: 0 },
    ])
    expect(lines.map((l) => [l.kind, l.count, l.charged, l.cost, l.commissions, l.profit])).toEqual([
      ['DOCUMENTACAO', 1, 1500, 725, 100, 675],
      ['FUNILARIA', 2, 1500, 700, 50, 750],
    ])
  })
})

describe('allocateEntries — grupo decidido (custo de serviço não é custo do carro)', () => {
  const base: RawEntry = {
    id: 'x', type: 'DESPESA', status: 'PREVISTO', amount: 100, dueDate: null, paidDate: null, competenceDate: null,
    categoryId: null, costCenterId: null, vehicleId: null, dealId: null, supplierId: null, counterparty: null, source: null,
    employeeUserId: null, unitId: null, sellerId: null, transferGroupId: null,
  }
  const d = (ymd: string) => new Date(`${ymd}T12:00:00.000Z`)
  it('CMV_SERVICOS com veículo fica na própria competência e fora do estoque', () => {
    const r = allocateEntries([
      { ...base, id: 'doc', vehicleId: 'v1', competenceDate: d('2026-03-10'), amount: 725, groupOverride: 'CMV_SERVICOS' },
      { ...base, id: 'ipva', vehicleId: 'v1', competenceDate: d('2026-03-10'), amount: 2000 },
    ], { regime: 'competencia', periods: ['2026-03'], groupOf: () => 'CMV_DOCUMENTACAO', saleDateByVehicle: new Map() })
    expect(r.entries.map((e) => [e.id, e.group, e.period])).toEqual([['doc', 'CMV_SERVICOS', '2026-03']])
    expect(r.stock.total).toBe(2000)
  })
})
