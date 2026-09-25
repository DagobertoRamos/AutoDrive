import { describe, expect, it } from 'vitest'
import { feedTitle, isPlaceholderPhoto, normalizeFuel, normalizeTransmission, parseCsv, parseFeed, parseKm, parsePrice, planFeedSync, mergeLegacy, normalizePlate } from './feed-import-core'

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
  it('guarda o link antigo do anúncio', () => {
    expect(parseFeed([HEAD, row({ link: 'https://www.appautodrive.com.br/veiculos/Fiat-Palio-2001-815886' })].join('\n'))[0].legacySlug).toBe('fiat-palio-2001-815886')
    expect(parseFeed([HEAD, row({ link: 'nada' })].join('\n'))[0].legacySlug).toBeNull()
  })
  it('"Veículo periciado" na descrição vira selo', () => {
    expect(parseFeed([HEAD, row({ description: 'Palio · Cor Cinza · Veículo PERICIADO' })].join('\n'))[0].inspected).toBe(true)
    expect(parseFeed([HEAD, row({ description: 'Sem perícia' })].join('\n'))[0].inspected).toBe(false)
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

describe('mergeLegacy (banco do site de origem)', () => {
  const base = parseFeed(['id,title,description,availability,condition,price,link,image_link,additional_image_link,brand,model,version,year,mileage,transmission,fuel_type,body_style,color',
    'EC-000001,Fiat Toro,x,in stock,used,218900.00 BRL,https://s/veiculos/fiat-toro-1,https://s/em-breve.jpg,,Fiat,Toro,2.2 TURBO,2027,0 km,Automático,Diesel,Picape,Cinza'].join(String.fromCharCode(10)))[0]
  const lg = {
    catalog_item_id: 'EC-000001', plate: 'abc-1d23', year_make: 2026, year_model: 2027, mileage: 35200, doors: 4,
    color: 'Prata', options: ['Ar-condicionado', 'Ar-condicionado', ' Airbag '], video_url: 'https://youtu.be/x',
    internal_code: 'AD-PAR-000001', origin_type: 'PARTNER', store: 'Loja X', partner_name: 'Auto Parceira', partner_city: 'Osasco',
    partner_whatsapp: '11999990000', fuel: 'Diesel', transmission: 'Automático', body_type: 'Picape',
    price_cents: 21890000, old_price_cents: 22990000, promotion: true, origin_price_cents: 20000000, price_markup_cents: 1890000,
    source_url: 'https://parceira.com.br/carro/1', featured: true, stock_status: 'reserved', seo_title: 'Toro', seo_description: null,
  }

  it('sem cadastro no banco: mantém o feed e não inventa nada', () => {
    const m = mergeLegacy(base, undefined)
    expect(m.extras.plate).toBeNull()
    expect(m.extras.origin).toBeNull()
    expect(m.km).toBe(0)
  })

  it('traz o que o painel do site mostra', () => {
    const m = mergeLegacy(base, lg)
    expect(m.extras.plate).toBe('ABC1D23')
    expect(m.extras.year).toBe(2026)
    expect(m.modelYear).toBe(2027)
    expect(m.km).toBe(35200)
    expect(m.color).toBe('Prata')
    expect(m.extras.doors).toBe(4)
    expect(m.extras.options).toEqual(['Ar-condicionado', 'Airbag'])
    expect(m.extras.promo).toEqual({ from: 229900, to: 218900 })
    expect(m.extras.reserved).toBe(true)
    expect(m.extras.featured).toBe(true)
    expect(m.extras.consigned).toBe(true)
    expect(m.extras.origin).toMatchObject({
      internalCode: 'AD-PAR-000001', partnerName: 'Auto Parceira', partnerCity: 'Osasco',
      sourceUrl: 'https://parceira.com.br/carro/1', originPrice: 200000, markup: 18900,
    })
  })

  it('carro próprio não vira parceiro; placa e vídeo inválidos são ignorados; sem promoção sem preço "de"', () => {
    const m = mergeLegacy(base, { ...lg, plate: 'SEM PLACA', origin_type: 'OWN', video_url: 'http://inseguro', old_price_cents: null })
    expect(m.extras.plate).toBeNull()
    expect(m.extras.origin?.partnerName).toBeNull()
    expect(m.extras.consigned).toBe(false)
    expect(m.extras.videoUrl).toBeNull()
    expect(m.extras.promo).toBeNull()
    expect(normalizePlate('ABC1234')).toBe('ABC1234')
  })
})
