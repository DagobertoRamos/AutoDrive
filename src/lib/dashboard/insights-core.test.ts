import { describe, expect, it } from 'vitest'
import { biggestBottleneck, buildInsight, formatInsightValue } from '@/lib/dashboard/insights-core'
import { coachingSignals } from '@/lib/dashboard/team-core'

describe('insights-core — gargalos só com dado real', () => {
  it('amostra pequena = dados insuficientes (não inventa média)', () => {
    const i = buildInsight({ id: 'x', label: 'Tempo', unit: 'min', current: [10, 20], previous: [], href: '/' })
    expect(i.value).toBeNull()
    expect(i.message).toBe('Ainda não há dados suficientes.')
  })

  it('compara com o período anterior e marca piora', () => {
    const i = buildInsight({ id: 'prep', label: 'Preparação média', unit: 'dias', current: [4, 4, 4, 4.4, 4.1], previous: [2.8, 2.8, 2.8, 2.8, 2.8], href: '/' })
    expect(i.worsened).toBe(true)
    expect(i.message).toBe('Preparação média aumentou de 2,8 dias para 4,1 dias.')
    expect(biggestBottleneck([i])?.id).toBe('prep')
  })

  it('para % de comparecimento, queda é piora', () => {
    const i = buildInsight({ id: 'v', label: 'Comparecimento', unit: '%', current: [0, 0, 0, 100, 100], previous: [100, 100, 100, 100, 0], href: '/', higherIsBetter: true })
    expect(i.worsened).toBe(true)
  })

  it('sem piora, não aponta gargalo', () => {
    const i = buildInsight({ id: 'ok', label: 'X', unit: 'min', current: [5, 5, 5, 5, 5], previous: [5, 5, 5, 5, 5], href: '/' })
    expect(biggestBottleneck([i])).toBeNull()
  })

  it('formata unidades em português', () => {
    expect(formatInsightValue(24, 'min')).toBe('24 min')
    expect(formatInsightValue(150, 'min')).toBe('2,5 h')
    expect(formatInsightValue(3.25, 'dias')).toBe('3,3 dias')
  })
})

describe('team-core — sinais de coaching', () => {
  it('descreve fatos, sem rótulo pejorativo', () => {
    const s = coachingSignals({ openLeads: 12, leadsWithoutContact: 4, avgResponseMin: 28 + 10, responseSample: 6, visits30d: 0, salesMonth: 0 })
    expect(s).toEqual([
      '4 leads ainda sem contato',
      'primeiro contato leva 38 min em média',
      '12 leads ativos e nenhuma visita em 30 dias',
    ])
  })

  it('sem sinal relevante, ninguém aparece', () => {
    expect(coachingSignals({ openLeads: 2, leadsWithoutContact: 0, avgResponseMin: 5, responseSample: 10, visits30d: 3, salesMonth: 1 })).toEqual([])
  })
})
