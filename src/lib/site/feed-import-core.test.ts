import { describe, expect, it } from 'vitest'
import { feedTitle, isPlaceholderPhoto, normalizeFuel, normalizeTransmission, parseCsv, parseFeed, parseKm, parsePrice, planFeedSync } from './feed-import-core'

const HEAD = '"id","title","description","availability","condition","price","link","image_link","additional_image_link","brand","model","version","year","mileage","transmission","fuel_type","body_style","color","city","state"'
const row = (o: Partial<Record<string, string>>) => {
  const d: Record<string, string> = {
    id: 'EC-1', title: 'Fiat Palio', description: 'desc', availability: 'in stock', condition: 'used', price: '14900.00 BRL',
    link: 'https://x/v', image_link: 'https://www.appautodrive.com.br/em-breve.jpg', additional_image_link: '',
    brand: 'Fiat', model: 'Palio', version: 'Palio EX 1.0', year: '2001', mileage: '0 km', transmission: 'Manual',
    fuel_type: 'Gasolina', body_style: 'Hatch', color: 'Cinza', city: 'Osasco', state: 'SP', ...o,
  }
  return HEAD.split(',').map((h) => `"${(d[h.replace(/"/g, '')] ?? '').replace(/"/g, '""')}"`).join(',')
}

describe('parseCsv', () => {
  it('aspas, vírgula e quebra de linha dentro do campo', () => {
    expect(parseCsv('﻿a,b\n"x, y","linha1\nlinha2 ""q"""\n')).toEqual([['a', 'b'], ['x, y', 'linha1\nlinha2 "q"']])
  })
})

describe('normalizações', () => {
  it('preço, km, combustível e câmbio', () => {
    expect(parsePrice('14900.00 BRL')).toBe(14900)
    expect(parsePrice('0.00 BRL')).toBeNull()
    expect(parseKm('36000 km')).toBe(36000)
    expect(parseKm('')).toBeNull()
    expect(normalizeFuel('Alcool')).toBe('ETANOL')
    expect(normalizeFuel('Gasolina e Elétrico')).toBe('HIBRIDO')
    expect(normalizeFuel('')).toBeNull()
    expect(normalizeTransmission('Semi-automática')).toBe('SEMI_AUTOMATICO')
    expect(normalizeTransmission('Automática')).toBe('AUTOMATICO')
  })
  it('título não repete o modelo', () => {
    expect(feedTitle('Fiat', 'Palio', 'Palio EX 1.0')).toBe('Fiat Palio EX 1.0')
    expect(feedTitle('Honda', 'Civic', 'EXL 2.0')).toBe('Honda Civic EXL 2.0')
    expect(feedTitle('Ford', 'Fiesta', 'Ford Fiesta sedan 1.0')).toBe('Ford Fiesta sedan 1.0')
  })
  it('foto "em breve" não conta', () => {
    expect(isPlaceholderPhoto('https://www.appautodrive.com.br/em-breve.jpg')).toBe(true)
    expect(isPlaceholderPhoto('https://cdn/x.jpg')).toBe(false)
  })
})

describe('parseFeed', () => {
  it('sem foto real → sem fotos; moto pelo tipo de carroceria; duplicado ignorado', () => {
    const csv = [HEAD, row({}), row({ id: 'EC-2', body_style: 'Scooter', image_link: 'https://cdn/a.jpg', additional_image_link: 'https://cdn/b.jpg,https://cdn/a.jpg' }), row({})].join('\n')
    const [a, b, ...rest] = parseFeed(csv)
    expect(rest).toHaveLength(0)
    expect(a).toMatchObject({ extId: 'EC-1', photos: [], vehicleType: 'CAR', modelYear: 2001, km: 0, price: 14900, fuel: 'GASOLINA', transmission: 'MANUAL' })
    expect(b).toMatchObject({ extId: 'EC-2', vehicleType: 'MOTORCYCLE', photos: ['https://cdn/a.jpg', 'https://cdn/b.jpg'] })
  })
  it('fora de estoque não entra', () => {
    expect(parseFeed([HEAD, row({ availability: 'out of stock' })].join('\n'))).toEqual([])
  })
})

describe('planFeedSync', () => {
  const item = (extId: string) => parseFeed([HEAD, row({ id: extId })].join('\n'))[0]
  it('cria, atualiza e tira do site o que sumiu', () => {
    const p = planFeedSync([item('A'), item('B')], { A: 'v1', C: 'v3' }, new Set(['v1', 'v3']))
    expect(p.aborted).toBeNull()
    expect(p.create.map((x) => x.extId)).toEqual(['B'])
    expect(p.update).toEqual([{ vehicleId: 'v1', item: item('A') }])
    expect(p.remove).toEqual(['v3'])
  })
  it('já inativo não é removido de novo', () => {
    expect(planFeedSync([item('A')], { A: 'v1', C: 'v3' }, new Set(['v1'])).remove).toEqual([])
  })
  it('trava com feed vazio ou encolhido de repente', () => {
    const map = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`X${i}`, `v${i}`]))
    const active = new Set(Object.values(map))
    expect(planFeedSync([], map, active).aborted).toBeTruthy()
    expect(planFeedSync([item('X1')], map, active).aborted).toBeTruthy()
    expect(planFeedSync(Array.from({ length: 30 }, (_, i) => item(`X${i}`)), map, active).aborted).toBeNull()
  })
})
