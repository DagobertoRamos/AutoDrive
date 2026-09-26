import { describe, expect, it } from 'vitest'
import { effectiveOrigin, normalizeOrigin, originPublicTag, partnerRefFromName, stockTypeForOrigin, validateOriginInput } from './origin-core'

describe('origem do veículo', () => {
  it('normaliza valores do site antigo e do formulário', () => {
    expect(normalizeOrigin('partner')).toBe('PARTNER')
    expect(normalizeOrigin('Particular')).toBe('PRIVATE')
    expect(normalizeOrigin('OWN')).toBe('OWN')
    expect(normalizeOrigin('xyz')).toBeNull()
  })
  it('deduz a origem quando não informada', () => {
    expect(effectiveOrigin({ partnerStoreId: 'p1' })).toBe('PARTNER')
    expect(effectiveOrigin({ stockType: 'CONSIGNADO' })).toBe('PRIVATE')
    expect(effectiveOrigin({})).toBe('OWN')
    expect(effectiveOrigin({ originType: 'PRIVATE', partnerStoreId: 'p1' })).toBe('PRIVATE')
  })
  it('tipo de estoque segue a origem', () => {
    expect(stockTypeForOrigin('OWN')).toBe('PROPRIO')
    expect(stockTypeForOrigin('PARTNER')).toBe('CONSIGNADO')
  })
  it('tag pública', () => {
    expect(originPublicTag('OWN', 'AutoDrive')).toBe('Estoque AutoDrive')
    expect(originPublicTag('OWN')).toBe('Estoque próprio')
    expect(originPublicTag('PARTNER', 'AutoDrive')).toBe('Lojista parceiro')
    expect(originPublicTag('PRIVATE')).toBe('Particular intermediado')
  })
  it('valida formulário: parceira exige loja; outras limpam o parceiro', () => {
    expect(validateOriginInput({ originType: 'PARTNER' })).toMatchObject({ ok: false })
    expect(validateOriginInput({ originType: 'PARTNER', partnerStoreId: 'p1' })).toEqual({ ok: true, originType: 'PARTNER', partnerStoreId: 'p1' })
    expect(validateOriginInput({ originType: 'OWN', partnerStoreId: 'p1' })).toEqual({ ok: true, originType: 'OWN', partnerStoreId: null })
    expect(validateOriginInput({})).toMatchObject({ ok: false })
  })
  it('chave estável de parceiro pelo nome', () => {
    expect(partnerRefFromName('Pedrão Veículos ')).toBe('nome:pedrao-veiculos')
  })
})
