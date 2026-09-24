import { describe, it, expect } from 'vitest'
import { siteVehicleState, vehicleSlug, vehicleIdFromSlug, effectivePrice, money, vehicleTitle, promoState, discountPct } from './listing-core'

describe('regra de publicação', () => {
  const on = { active: true, stockStatus: 'DISPONIVEL' }
  it('disponível sem fotos → Em breve', () => {
    expect(siteVehicleState(on, null, 0)).toBe('EM_BREVE')
    expect(siteVehicleState(on, { photosStatus: 'TRATADA', hidden: false }, 0)).toBe('EM_BREVE')
  })
  it('com fotos → Publicado', () => {
    expect(siteVehicleState(on, null, 3)).toBe('PUBLICADO')
    expect(siteVehicleState({ active: true, stockStatus: 'EM_PROMOCAO' }, { photosStatus: 'ORIGEM', hidden: false }, 1)).toBe('PUBLICADO')
  })
  it('fora do site: vendido, reservado, inativo, sem status ou escondido', () => {
    for (const s of ['VENDIDO', 'RESERVADO', 'BLOQUEADO', 'EM_NEGOCIACAO']) expect(siteVehicleState({ active: true, stockStatus: s }, null, 5)).toBe('HIDDEN')
    expect(siteVehicleState({ active: false, stockStatus: 'DISPONIVEL' }, null, 5)).toBe('HIDDEN')
    expect(siteVehicleState({ active: true, stockStatus: null }, null, 5)).toBe('HIDDEN')
    expect(siteVehicleState(on, { photosStatus: 'ORIGEM', hidden: true }, 5)).toBe('HIDDEN')
  })
})

describe('slug e título', () => {
  const v = { id: 'cmx1234567890abcdef', brand: 'Volkswagen', model: 'T-Cross', version: '1.0 TSI Comfortline', modelYear: 2022, year: 2021 }
  it('slug estável com id recuperável', () => {
    const s = vehicleSlug(v)
    expect(s).toBe('volkswagen-t-cross-1-0-tsi-comfortline-2022--cmx1234567890abcdef')
    expect(vehicleIdFromSlug(s)).toBe(v.id)
    expect(vehicleIdFromSlug('sem-id')).toBeNull()
    expect(vehicleIdFromSlug('x--<script>')).toBeNull()
  })
  it('título', () => {
    expect(vehicleTitle(v)).toBe('Volkswagen T-Cross 1.0 TSI Comfortline')
    expect(vehicleTitle({ ...v, brand: null, model: null, version: null })).toBe('Veículo')
  })
})

describe('preço', () => {
  const now = new Date('2026-09-24T12:00:00Z')
  const base = { salePrice: 100000, promoPrice: null, isPromo: false, promoStartsAt: null, promoEndsAt: null }
  it('sem promoção', () => {
    expect(effectivePrice(base, now)).toEqual({ price: 100000, oldPrice: null })
    expect(effectivePrice({ ...base, salePrice: null }, now)).toEqual({ price: null, oldPrice: null })
  })
  it('promoção vigente mostra "de" e "por"', () => {
    expect(effectivePrice({ ...base, isPromo: true, promoPrice: 92000 }, now)).toEqual({ price: 92000, oldPrice: 100000 })
  })
  it('promoção fora do período é ignorada', () => {
    expect(effectivePrice({ ...base, isPromo: true, promoPrice: 92000, promoEndsAt: new Date('2026-09-01') }, now).price).toBe(100000)
    expect(effectivePrice({ ...base, isPromo: true, promoPrice: 92000, promoStartsAt: new Date('2026-10-01') }, now).price).toBe(100000)
  })
  it('formatação', () => {
    expect(money(null)).toBe('Consulte')
    expect(money(89900).replace(/\s/g, ' ')).toBe('R$ 89.900')
  })

  it('situação da promoção e desconto', () => {
    const now = new Date('2026-09-24T12:00:00Z')
    const p = { salePrice: 100000, promoPrice: 90000, isPromo: true, promoStartsAt: null, promoEndsAt: null }
    expect(promoState(p, now)).toBe('ATIVA')
    expect(promoState({ ...p, promoStartsAt: new Date('2026-10-01') }, now)).toBe('AGENDADA')
    expect(promoState({ ...p, promoEndsAt: new Date('2026-09-01') }, now)).toBe('ENCERRADA')
    expect(promoState({ ...p, isPromo: false }, now)).toBe('NENHUMA')
    expect(promoState({ ...p, promoPrice: null }, now)).toBe('NENHUMA')
    expect(discountPct(100000, 90000)).toBe(10)
    expect(discountPct(100000, 100000)).toBeNull()
    expect(discountPct(null, 90000)).toBeNull()
  })
})
