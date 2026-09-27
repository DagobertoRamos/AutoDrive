import { describe, expect, it } from 'vitest'
import { brandCounts, brandLogo, brandVariants, canonicalBrand } from './brands-core'

describe('canonicalBrand', () => {
  it.each([
    ['VW - VolksWagen', 'volkswagen', 'Volkswagen'], ['VOLKSWAGEN', 'volkswagen', 'Volkswagen'],
    ['GM - Chevrolet', 'chevrolet', 'Chevrolet'], ['CHERY', 'chery', 'Caoa Chery'], ['Caoa Chery', 'chery', 'Caoa Chery'],
    ['Citroen', 'citroen', 'Citroën'], ['Citroën', 'citroen', 'Citroën'], ['Kia Motors', 'kia', 'Kia'],
    ['Mercedes', 'mercedes-benz', 'Mercedes-Benz'], ['LAND ROVER', 'land-rover', 'Land Rover'], ['GWM', 'gwm', 'GWM'],
    ['YAMANHA FAZER 250 PANTERA NEGRA', 'yamaha', 'Yamaha'], ['ROYAL ENFIELD', 'royal-enfield', 'Royal Enfield'],
    ['smart', 'smart', 'Smart'], ['RAM', 'ram', 'RAM'],
  ])('%s → %s', (raw, slug, label) => expect(canonicalBrand(raw)).toEqual({ slug, label }))
  it('não é marca', () => { expect(canonicalBrand('MOTO')).toBeNull(); expect(canonicalBrand('')).toBeNull() })
  it('desconhecida mantém o nome arrumado', () => expect(canonicalBrand('SHINERAY')).toEqual({ slug: 'shineray', label: 'Shineray' }))
})

describe('agrupamento e filtro', () => {
  const raw = ['Volkswagen', 'VW - VolksWagen', 'CHERY', 'Caoa Chery', 'Citroen', 'Citroën', 'MOTO', 'YAMAHA']
  it('conta por marca canônica, em ordem alfabética', () => {
    expect(brandCounts(raw).map((b) => `${b.label}:${b.total}`)).toEqual(['Caoa Chery:2', 'Citroën:2', 'Volkswagen:2', 'Yamaha:1'])
  })
  it('filtro pega todas as grafias', () => {
    expect(brandVariants('volkswagen', raw).sort()).toEqual(['VW - VolksWagen', 'Volkswagen'])
    expect(brandVariants('Volkswagen', raw).length).toBe(2)
  })
  it('logo só quando existe', () => {
    expect(brandLogo('volkswagen')).toBe('/site/brands/volkswagen.webp')
    expect(brandLogo('gwm')).toBe('/site/brands/haval.webp')
    expect(brandLogo('yamaha')).toBeNull()
  })
})
