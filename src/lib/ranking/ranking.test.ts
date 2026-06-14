import { describe, it, expect } from 'vitest'
import {
  pointsFor, qualityFor, sortRanking, resolvePeriodWindow,
  DEFAULT_RULE, DEFAULT_TIEBREAKERS,
  type RankingMetrics, type RankingEntry,
} from '@/lib/ranking/service'

const zero: RankingMetrics = {
  sales: 0, purchases: 0, returns: 0, documentations: 0, warranties: 0,
  services: 0, overduePendencies: 0, canceledSales: 0, lateDocuments: 0,
}
const metrics = (p: Partial<RankingMetrics>): RankingMetrics => ({ ...zero, ...p })

function entry(name: string, totalPoints: number, m: Partial<RankingMetrics>, qualityScore = 0): RankingEntry {
  return { userId: name, sellerId: name, name, unitId: null, metrics: metrics(m), totalPoints, qualityScore, rank: 0, notes: [] }
}

describe('ranking — pontuação e qualidade', () => {
  it('pointsFor aplica os pesos default', () => {
    expect(pointsFor(metrics({ sales: 10 }), DEFAULT_RULE)).toBe(1000)
    // penalizações reduzem: 10 vendas (1000) - 2 pendências vencidas (-15 cada)
    expect(pointsFor(metrics({ sales: 10, overduePendencies: 2 }), DEFAULT_RULE)).toBe(970)
    // mix: venda 100 + garantia 30 + serviço 20 + retorno 25 + doc 20
    expect(pointsFor(metrics({ sales: 1, warranties: 1, services: 1, returns: 1, documentations: 1 }), DEFAULT_RULE)).toBe(195)
  })

  it('qualityFor = aproveitamento agregado por venda', () => {
    expect(qualityFor(metrics({ sales: 10, documentations: 9, warranties: 3, returns: 6 }))).toBe(180)
    expect(qualityFor(metrics({ sales: 0, documentations: 5 }))).toBe(0)
  })
})

describe('ranking — desempate (tiebreakers)', () => {
  it('empate em pontos → vence quem tem mais vendas', () => {
    const a = entry('A', 1000, { sales: 10 })
    const b = entry('B', 1000, { sales: 8 })
    const sorted = sortRanking([b, a], [...DEFAULT_TIEBREAKERS])
    expect(sorted.map((e) => e.name)).toEqual(['A', 'B'])
  })

  it('empate em pontos e vendas → menos pendências vencidas vence', () => {
    const a = entry('A', 1000, { sales: 10, overduePendencies: 0 })
    const b = entry('B', 1000, { sales: 10, overduePendencies: 3 })
    const sorted = sortRanking([b, a], [...DEFAULT_TIEBREAKERS])
    expect(sorted.map((e) => e.name)).toEqual(['A', 'B'])
  })

  it('mais pontos sempre vem primeiro, independente do desempate', () => {
    const a = entry('A', 500, { sales: 20 })
    const b = entry('B', 1000, { sales: 1 })
    expect(sortRanking([a, b], [...DEFAULT_TIEBREAKERS]).map((e) => e.name)).toEqual(['B', 'A'])
  })
})

describe('ranking — janela de período', () => {
  it('MONTHLY: primeiro ao último dia do mês corrente', () => {
    const now = new Date(2026, 5, 15) // 15 jun 2026
    const w = resolvePeriodWindow('MONTHLY', now)
    expect(w.start.getMonth()).toBe(5)
    expect(w.start.getDate()).toBe(1)
    expect(w.end.getMonth()).toBe(5)
    expect(w.end.getDate()).toBe(30)
  })

  it('datas explícitas têm precedência', () => {
    const s = new Date(2026, 0, 1), e = new Date(2026, 0, 10)
    expect(resolvePeriodWindow('CUSTOM', new Date(2026, 5, 1), s, e)).toEqual({ start: s, end: e })
  })
})
