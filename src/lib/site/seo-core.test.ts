import { describe, it, expect } from 'vitest'
import { brandLandings, sanitizeSeoCities, sitemapXml } from './seo-core'

describe('páginas do Google', () => {
  it('cidades: nome, slug sem acento, sem repetição', () => {
    expect(sanitizeSeoCities(['Osasco', { name: 'São Paulo', text: 'Zona oeste' }, 'osasco', ''])).toEqual([
      { name: 'Osasco', slug: 'osasco', text: '' },
      { name: 'São Paulo', slug: 'sao-paulo', text: 'Zona oeste' },
    ])
    expect(sanitizeSeoCities(null)).toEqual([])
  })
  it('marcas com estoque, contagem e faixa de preço', () => {
    const r = brandLandings([{ brand: 'Fiat', price: 50000 }, { brand: 'Volkswagen', price: 90000 }, { brand: 'fiat ', price: 70000 }, { brand: 'Fiat', price: null }, { brand: '', price: 1 }])
    expect(r).toEqual([
      { slug: 'fiat', name: 'Fiat', total: 3, minPrice: 50000, maxPrice: 70000 },
      { slug: 'volkswagen', name: 'Volkswagen', total: 1, minPrice: 90000, maxPrice: 90000 },
    ])
  })
  it('sitemap escapa as URLs', () => {
    const x = sitemapXml([{ url: 'https://loja.com/carros?a=1&b=2', priority: 1 }])
    expect(x).toContain('<loc>https://loja.com/carros?a=1&amp;b=2</loc><priority>1.0</priority>')
  })
})
