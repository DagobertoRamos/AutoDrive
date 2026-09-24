import { describe, it, expect } from 'vitest'
import { cleanGoogleTagId, cleanMetaPixelId, safePageUrl, sanitizeEventParams, sanitizeTracking } from './tracking-core'

describe('rastreamento do site', () => {
  it('IDs válidos passam, o resto vira vazio', () => {
    expect(cleanMetaPixelId(' 1234567890123456 ')).toBe('1234567890123456')
    expect(cleanMetaPixelId('abc')).toBe('')
    expect(cleanGoogleTagId('g-abc123XYZ')).toBe('G-ABC123XYZ')
    expect(cleanGoogleTagId('AW-18468438331')).toBe('AW-18468438331')
    expect(cleanGoogleTagId('<script>')).toBe('')
    expect(sanitizeTracking(null)).toEqual({ metaPixelId: '', googleTagId: '' })
  })
  it('page_view só leva parâmetros de campanha', () => {
    expect(safePageUrl('https://loja.com/contato?name=Ana&phone=11999&utm_source=meta&gclid=abc#x')).toBe('https://loja.com/contato?utm_source=meta&gclid=abc')
  })
  it('eventos não levam dado pessoal', () => {
    expect(sanitizeEventParams({ content_ids: ['cm123abc', 'x'], value: '99900.456', currency: 'BRL', email: 'a@b.com', content_name: 'fulano@x.com', lead_type: '11999998888' }))
      .toEqual({ content_ids: ['cm123abc'], value: 99900.46, currency: 'BRL' })
  })
})
