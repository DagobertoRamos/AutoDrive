import { describe, it, expect } from 'vitest'
import { pickFipeYear, parseFipePrice, topFipeMatches, normalizeBrandName } from './fipe-match'

const years = [
  { code: '2014-5', name: '2014 Flex' },
  { code: '2013-1', name: '2013 Gasolina' },
  { code: '2013-5', name: '2013 Flex' },
  { code: '2012-5', name: '2012 Flex' },
]

describe('pickFipeYear', () => {
  it('ano único → escolhe direto', () => {
    expect(pickFipeYear(years, 2014).pick?.code).toBe('2014-5')
  })
  it('ano com 2 combustíveis → desempata pelo combustível', () => {
    expect(pickFipeYear(years, 2013, 'FLEX').pick?.code).toBe('2013-5')
    expect(pickFipeYear(years, 2013, 'Álcool/Gasolina').pick?.code).toBe('2013-5')
    expect(pickFipeYear(years, 2013, 'Gasolina').pick?.code).toBe('2013-1')
  })
  it('sem combustível → devolve as opções para o usuário escolher', () => {
    const r = pickFipeYear(years, 2013, null)
    expect(r.pick).toBeNull()
    expect(r.options.map((o) => o.code)).toEqual(['2013-1', '2013-5'])
  })
  it('ano inexistente → nada', () => {
    expect(pickFipeYear(years, 2005)).toEqual({ pick: null, options: [] })
  })
})

describe('helpers FIPE', () => {
  it('parseFipePrice', () => {
    expect(parseFipePrice('R$ 32.450,00')).toBe(32450)
    expect(parseFipePrice('')).toBeNull()
  })
  it('topFipeMatches devolve os empatados no melhor score', () => {
    const list = [
      { code: '1', name: 'TIIDA S 1.8/1.8 Flex 16V Aut.' },
      { code: '2', name: 'TIIDA S 1.8/1.8 Flex 16V Mec.' },
      { code: '3', name: 'MARCH 1.0' },
    ]
    expect(topFipeMatches(list, 'TIIDA 18SL FLEX').map((m) => m.code).sort()).toEqual(['1', '2'])
  })
  it('normalizeBrandName resolve apelidos', () => {
    expect(normalizeBrandName('VW - VolksWagen')).toBe('VOLKSWAGEN')
    expect(normalizeBrandName('NISSAN')).toBe(normalizeBrandName('Nissan'))
  })
})
