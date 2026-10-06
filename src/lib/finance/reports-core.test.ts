import { describe, expect, it } from 'vitest'
import { buildDre } from './dre-core'
import {
  addMonths, agingBucket, agingSummary, aggregateProfit, allocateEntries, budgetVsActual, buildCategoryTree,
  daysBetweenSP, drillDown, monthKeySP, monthsBetween, previousRange, resolveRange, rollupByCategory, saleDateOf,
  sumByPeriod, toCsv, vehicleProfit, verticalAnalysis, type CatNode, type RawEntry,
} from './reports-core'

const base: RawEntry = {
  id: 'x', type: 'DESPESA', status: 'PREVISTO', amount: 100, dueDate: null, paidDate: null, competenceDate: null,
  categoryId: null, costCenterId: null, vehicleId: null, dealId: null, supplierId: null, counterparty: null, source: null,
  employeeUserId: null, unitId: null, sellerId: null, transferGroupId: null,
}
const e = (o: Partial<RawEntry>): RawEntry => ({ ...base, ...o })
// Meio-dia UTC = mesmo dia em SP.
const d = (ymd: string) => new Date(`${ymd}T12:00:00.000Z`)
const groupBy = (map: Record<string, string>) => (x: RawEntry) => map[x.id] ?? (x.type === 'RECEITA' ? 'REC_OUTRAS' : 'DESP_ADMIN')

describe('períodos', () => {
  it('meses e intervalos', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(previousRange('2026-01', '2026-03')).toEqual({ from: '2025-10', to: '2025-12' })
    expect(resolveRange(null, null, d('2026-10-06')).periods).toHaveLength(7)
    expect(resolveRange('2026-01', '2026-03', d('2026-10-06')).periods).toEqual(['2026-01', '2026-02', '2026-03'])
  })
  it('mês e dia no fuso de SP', () => {
    // 01/11 01:00 UTC = 31/10 22:00 em SP
    expect(monthKeySP(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10')
    expect(daysBetweenSP(new Date('2026-10-01T02:00:00Z'), d('2026-10-01'))).toBe(1)
  })
})

describe('allocateEntries — custo do veículo no mês da venda', () => {
  const periods = ['2026-03', '2026-04', '2026-05']
  const groups = { buy: 'CMV_AQUISICAO', prep: 'CMV_PREPARACAO', stock: 'CMV_DOCUMENTACAO', old: 'CMV_AQUISICAO', rent: 'DESP_OCUPACAO', sale: 'REC_VEICULOS', later: 'CMV_PREPARACAO' }
  const raw = [
    e({ id: 'buy', vehicleId: 'v1', competenceDate: d('2026-01-10'), amount: 50000 }),     // comprado antes do período
    e({ id: 'prep', vehicleId: 'v1', dueDate: d('2026-03-15'), amount: 2000 }),
    e({ id: 'stock', vehicleId: 'v2', competenceDate: d('2026-04-02'), amount: 800 }),     // carro não vendido
    e({ id: 'later', vehicleId: 'v3', competenceDate: d('2026-05-02'), amount: 300 }),     // vendido depois do período
    e({ id: 'old', vehicleId: 'v4', competenceDate: d('2026-01-02'), amount: 40000 }),     // vendido antes do período
    e({ id: 'rent', competenceDate: d('2026-04-05'), amount: 3000 }),
    e({ id: 'sale', type: 'RECEITA', status: 'RECEBIDO', vehicleId: 'v1', competenceDate: d('2026-04-20'), paidDate: d('2026-05-02'), amount: 70000 }),
    e({ id: 'tr', transferGroupId: 'g1', competenceDate: d('2026-04-01'), amount: 999 }),
    e({ id: 'cx', status: 'CANCELADO', competenceDate: d('2026-04-01'), amount: 999 }),
  ]
  const sales = new Map([['v1', d('2026-04-20')], ['v3', d('2026-06-10')], ['v4', d('2026-02-01')]])

  it('competência: realoca, separa estoque e ignora transferência/cancelado', () => {
    const r = allocateEntries(raw, { regime: 'competencia', periods, groupOf: groupBy(groups), saleDateByVehicle: sales })
    const by = Object.fromEntries(r.entries.map((x) => [x.id, x]))
    expect(by.buy.period).toBe('2026-04')
    expect(by.buy.reallocated).toBe(true)
    expect(by.prep.period).toBe('2026-04')
    expect(by.rent.period).toBe('2026-04')
    expect(by.sale.period).toBe('2026-04')
    expect(by.old).toBeUndefined()
    expect(by.tr).toBeUndefined()
    expect(by.cx).toBeUndefined()
    expect(r.stock.total).toBe(1100)
    expect(r.stock.vehicles).toBe(2)
    const dre = buildDre(r.entries.map((x) => ({ type: x.type, group: x.group, amount: x.amount, period: x.period })), periods)
    expect(dre.find((l) => l.key === 'MARGEM_BRUTA')?.values['2026-04']).toBe(18000)
  })

  it('caixa: só realizados pela data do pagamento, sem realocação', () => {
    const r = allocateEntries(raw, { regime: 'caixa', periods, groupOf: groupBy(groups), saleDateByVehicle: sales })
    expect(r.entries.map((x) => [x.id, x.period])).toEqual([['sale', '2026-05']])
    expect(r.stock.total).toBe(0)
  })

  it('data da venda mais recente', () => {
    expect(saleDateOf([{ finalizedAt: d('2026-01-01'), createdAt: d('2025-12-01') }, { approvedAt: d('2026-03-01') }])).toEqual(d('2026-03-01'))
    expect(saleDateOf([])).toBeNull()
  })
})

describe('análise vertical e detalhamento', () => {
  it('% sobre a receita líquida', () => {
    const lines = buildDre([
      { type: 'RECEITA', group: 'REC_VEICULOS', amount: 1000, period: 'p' },
      { type: 'DESPESA', group: 'DED_IMPOSTOS', amount: 200, period: 'p' },
      { type: 'DESPESA', group: 'DESP_ADMIN', amount: 400, period: 'p' },
    ], ['p'])
    const av = verticalAnalysis(lines, ['p'])
    expect(av.find((l) => l.key === 'RECEITA_LIQUIDA')?.av.p).toBe(100)
    expect(av.find((l) => l.key === 'DESP_ADMIN')?.avTotal).toBe(-50)
    expect(verticalAnalysis(buildDre([], ['p']), ['p'])[0].av.p).toBeNull()
  })
  it('drill-down por categoria com sinal da DRE e "Outras"', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ ...e({ id: String(i), categoryId: `c${i}`, amount: (i + 1) * 10 }), group: 'DESP_ADMIN', period: 'p', reallocated: false }))
    const dd = drillDown(entries, ['p'], (id) => id.toUpperCase(), 3)
    expect(dd.DESP_ADMIN.map((r) => r.label)).toEqual(['C4', 'C3', 'Outras (3)'])
    expect(dd.DESP_ADMIN[2].total).toBe(-60)
    expect(sumByPeriod(entries, ['p'])[0]).toEqual({ period: 'p', receitas: 0, despesas: 150, resultado: -150 })
  })
})

describe('lucratividade', () => {
  it('lucro e margem do veículo', () => {
    const p = vehicleProfit({ saleValue: 80000, acquisition: 60000, preparation: 3000, documentation: 1000, commissions: 1500, fiReturn: 2500 })
    expect(p.totalCost).toBe(65500)
    expect(p.profit).toBe(17000)
    expect(p.margin).toBe(21.25)
    expect(vehicleProfit({ saleValue: 0, acquisition: 10, preparation: 0, documentation: 0, commissions: 0, fiReturn: 0 }).margin).toBeNull()
  })
  it('agrega por vendedor', () => {
    const rows = [
      { ...vehicleProfit({ saleValue: 100, acquisition: 50, preparation: 0, documentation: 0, commissions: 0, fiReturn: 0 }), s: 'a', daysInStock: 10 },
      { ...vehicleProfit({ saleValue: 100, acquisition: 90, preparation: 0, documentation: 0, commissions: 0, fiReturn: 0 }), s: 'a', daysInStock: 30 },
      { ...vehicleProfit({ saleValue: 50, acquisition: 60, preparation: 0, documentation: 0, commissions: 0, fiReturn: 0 }), s: 'b', daysInStock: null },
    ]
    const agg = aggregateProfit(rows, (r) => r.s, (k) => k.toUpperCase())
    expect(agg[0]).toMatchObject({ key: 'a', label: 'A', count: 2, profit: 60, margin: 30, avgProfit: 30, avgDays: 20 })
    expect(agg[1]).toMatchObject({ key: 'b', profit: -10, avgDays: null })
  })
})

describe('aging', () => {
  const today = d('2026-10-06')
  it('faixas de atraso', () => {
    expect(agingBucket(d('2026-10-06'), today).bucket).toBe('A_VENCER')
    expect(agingBucket(d('2026-10-20'), today).bucket).toBe('A_VENCER')
    expect(agingBucket(null, today).bucket).toBe('A_VENCER')
    expect(agingBucket(d('2026-10-05'), today)).toEqual({ bucket: 'D1_30', daysOverdue: 1 })
    expect(agingBucket(d('2026-09-06'), today).bucket).toBe('D1_30')
    expect(agingBucket(d('2026-09-05'), today).bucket).toBe('D31_60')
    expect(agingBucket(d('2026-08-06'), today).bucket).toBe('D61_90')
    expect(agingBucket(d('2026-07-08'), today).bucket).toBe('D61_90')
    expect(agingBucket(d('2026-07-07'), today).bucket).toBe('D90')
  })
  it('resumo a pagar e a receber', () => {
    const s = agingSummary([
      { type: 'DESPESA', amount: 10, dueDate: d('2026-10-01') },
      { type: 'DESPESA', amount: 5.5, dueDate: d('2026-10-02') },
      { type: 'RECEITA', amount: 7, dueDate: d('2026-01-01') },
    ], today)
    expect(s.pagar.D1_30).toEqual({ total: 15.5, count: 2 })
    expect(s.receber.D90).toEqual({ total: 7, count: 1 })
    expect(s.receber.A_VENCER.count).toBe(0)
  })
})

describe('categorias e orçamento', () => {
  const cats: CatNode[] = [
    { id: 'p', name: 'Ocupação', parentId: null, code: '14', sortOrder: 0, kind: 'DESPESA' },
    { id: 'a', name: 'Aluguel', parentId: 'p', code: '14.1', sortOrder: 0, kind: 'DESPESA' },
    { id: 'b', name: 'Energia', parentId: 'p', code: '14.2', sortOrder: 1, kind: 'DESPESA' },
    { id: 'm', name: 'Marketing', parentId: null, code: '15', sortOrder: 0, kind: 'DESPESA' },
  ]
  it('rollup e árvore com variação', () => {
    const cur = new Map([['a', 1000], ['b', 200], ['p', 50]])
    expect(rollupByCategory(cur, cats).get('p')).toBe(1250)
    const tree = buildCategoryTree(cats, cur, new Map([['a', 800]]), 1250)
    expect(tree.map((r) => [r.name, r.depth, r.current])).toEqual([['Ocupação', 0, 1250], ['Aluguel', 1, 1000], ['Energia', 1, 200]])
    expect(tree[1].variation).toBe(25)
    expect(tree[0].share).toBe(100)
    expect(tree[2].variation).toBeNull()
  })
  it('orçado × realizado', () => {
    const rows = budgetVsActual([{ categoryId: 'p', amount: 1000 }, { categoryId: 'a', amount: 900 }, { categoryId: 'm', amount: 500 }], new Map([['a', 1000], ['b', 200]]), cats)
    const p = rows.find((r) => r.categoryId === 'p')!
    expect(p).toMatchObject({ actual: 1200, deviation: 200, deviationPct: 20, topLevel: true })
    expect(rows.find((r) => r.categoryId === 'a')?.topLevel).toBe(false)
    expect(rows.find((r) => r.categoryId === 'm')).toMatchObject({ actual: 0, deviation: -500, deviationPct: -100 })
  })
})

describe('csv', () => {
  it('separador ; e decimal com vírgula', () => {
    expect(toCsv(['A', 'B'], [['x;y', 1234.5], [null, 'ok']])).toBe('﻿A;B\r\n"x;y";1234,5\r\n;ok')
  })
})

describe('splitSettlement', () => {
  it('juros vão para despesas financeiras e desconto obtido para receitas financeiras', async () => {
    const { splitSettlement } = await import('./reports-core')
    const base = { id: 'e', type: 'DESPESA' as const, status: 'PAGO', amount: 1005, dueDate: null, paidDate: null, competenceDate: null, categoryId: null, costCenterId: null, vehicleId: null, dealId: null, supplierId: null, counterparty: null, source: null, employeeUserId: null, unitId: null, sellerId: null, transferGroupId: null, interestAmount: 10, discountAmount: 5, group: 'DESP_OCUPACAO', period: '2026-10', reallocated: false }
    const parts = splitSettlement(base)
    expect(parts.map((p) => [p.group, p.type, p.amount])).toEqual([['DESP_OCUPACAO', 'DESPESA', 1000], ['FIN_DESPESAS', 'DESPESA', 10], ['FIN_RECEITAS', 'RECEITA', 5]])
  })
})
