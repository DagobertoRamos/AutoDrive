import { describe, expect, it } from 'vitest'
import { formatKm, groupModels, modelBase, parseFipeYear } from './fipe-picker-core'

describe('modelBase', () => {
  it('usa a primeira palavra do nome FIPE', () => {
    expect(modelBase('ARGO DRIVE 1.3 8V Flex')).toBe('ARGO')
    expect(modelBase('Onix HATCH LT 1.0 8V FlexPower 5p Mec.')).toBe('Onix')
    expect(modelBase('HR-V EX 1.8 Flexone 16V 5p Aut.')).toBe('HR-V')
    expect(modelBase('T-Cross 200 TSI 1.0 Flex 12V 5p Aut.')).toBe('T-Cross')
  })
  it('junta duas palavras quando a primeira é prefixo', () => {
    expect(modelBase('Grand Siena ATTRACT. 1.4 EVO F.Flex 8V')).toBe('Grand Siena')
    expect(modelBase('Range Rover Evoque 2.0 Aut.')).toBe('Range Rover')
    expect(modelBase('Palio Weekend Adv. 1.8 Flex')).toBe('Palio Weekend')
    expect(modelBase('Palio 1.0 Fire Flex 8V 4p')).toBe('Palio')
    expect(modelBase('Palio ELX 1.4 Flex')).toBe('Palio')
  })
})

describe('groupModels', () => {
  it('agrupa versões do mesmo modelo, ignora maiúsculas e prefere a grafia com minúsculas', () => {
    const g = groupModels([
      { code: '1', name: 'COROLLA XEi 2.0 Flex 16V Aut.' },
      { code: '2', name: 'Corolla GLi 1.8 Flex 16V Aut.' },
      { code: '3', name: 'Etios HB X 1.3 Flex 16V 5p Mec.' },
    ])
    expect(g.map((x) => [x.label, x.versions.map((v) => v.code)])).toEqual([
      ['Corolla', ['2', '1']],
      ['Etios', ['3']],
    ])
  })
})

describe('parseFipeYear', () => {
  it('lê o ano e trata o zero km da FIPE', () => {
    expect(parseFipeYear('2021 Gasolina')).toEqual({ year: 2021, label: '2021 Gasolina' })
    expect(parseFipeYear('32000 Flex', new Date('2026-05-01'))).toEqual({ year: 2026, label: '0 km Flex' })
    expect(parseFipeYear('abc').year).toBeNull()
  })
})

describe('formatKm', () => {
  it('põe ponto de milhar', () => {
    expect(formatKm('190000')).toBe('190.000')
    expect(formatKm('50000')).toBe('50.000')
    expect(formatKm('1100')).toBe('1.100')
    expect(formatKm('900')).toBe('900')
    expect(formatKm('1234567')).toBe('1.234.567')
    expect(formatKm('12345678')).toBe('1.234.567')
    expect(formatKm('abc 01.100 km')).toBe('1.100')
    expect(formatKm('')).toBe('')
  })
})
