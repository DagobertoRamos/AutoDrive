import { describe, it, expect } from 'vitest'
import { buildMetaFeed, cityStateFrom, plainText } from './meta-feed-core'
import type { SiteVehicle } from './vehicles'

const car = (p: Partial<SiteVehicle> = {}): SiteVehicle => ({
  id: 'v1', slug: 'vw-t-cross-2023--v1', title: 'VW T-Cross', brand: 'Volkswagen', model: 'T-Cross', version: '200 TSI',
  year: 2022, modelYear: 2023, km: 38500, fuel: 'FLEX', transmission: 'AUTOMATICO', color: 'Branco', doors: 4, bodyType: 'SUV', vehicleType: 'CARRO',
  price: 99900, oldPrice: null, state: 'PUBLICADO', featured: false, promo: false,
  photos: ['/api/site/assets/abc', 'https://cdn.x.com/2.jpg'], cover: '/api/site/assets/abc',
  description: '<p>Único dono</p>', options: ['Ar'], videoUrl: '', seoTitle: '', seoDescription: '', ...p,
})
const opts = { abs: (p: string) => `https://www.loja.com.br${p}`, city: 'Osasco', state: 'SP' }

describe('feed Meta', () => {
  it('carro publicado vira item completo, com URLs absolutas e texto puro', () => {
    const r = buildMetaFeed([car()], opts)
    expect(r.exported).toBe(1)
    const i = r.items[0]
    expect(i).toMatchObject({ price: '99900.00 BRL', sale_price: '', link: 'https://www.loja.com.br/veiculos/vw-t-cross-2023--v1', image_link: 'https://www.loja.com.br/api/site/assets/abc', additional_image_link: 'https://cdn.x.com/2.jpg', transmission: 'Automático', fuel_type: 'Flex', year: '2023' })
    expect(i.description).not.toMatch(/</)
    expect(i.description).toContain('Opcionais: Ar')
    expect(r.csv.split('\r\n')[0]).toContain('"sale_price"')
  })
  it('promoção vai como sale_price; sem foto ou sem preço fica de fora com motivo', () => {
    const r = buildMetaFeed([car({ price: 89900, oldPrice: 99900 }), car({ id: 'v2', state: 'EM_BREVE', photos: [] }), car({ id: 'v3', price: null })], opts)
    expect(r.items[0]).toMatchObject({ price: '99900.00 BRL', sale_price: '89900.00 BRL' })
    expect(r.issues.map((x) => x.code)).toEqual(['SEM_FOTO', 'SEM_PRECO'])
    expect(r.ignored).toBe(2)
  })
  it('avisa quando o site ainda não tem https', () => {
    const r = buildMetaFeed([car()], { ...opts, abs: (p) => `http://localhost:3000/s/loja${p}` })
    expect(r.exported).toBe(1)
    expect(r.issues[0].code).toBe('LINK_SEM_HTTPS')
  })
  it('utilitários', () => {
    expect(plainText('a<br>b&nbsp;&amp; c')).toBe('a\nb & c')
    expect(cityStateFrom('Centro - Osasco - SP')).toEqual({ city: 'Osasco', state: 'SP' })
    expect(cityStateFrom('Osasco/SP')).toEqual({ city: 'Osasco', state: 'SP' })
    expect(cityStateFrom('Rua sem cidade')).toEqual({ city: '', state: '' })
  })
})
