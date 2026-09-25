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

describe('colar o código inteiro do Pixel / tag do Google', () => {
  const META = `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){};}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1324364829627249');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1324364829627249&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->`

  it('extrai o ID do Pixel do código da Meta (com ou sem quebras de linha)', () => {
    expect(cleanMetaPixelId(META)).toBe('1324364829627249')
    expect(cleanMetaPixelId(META.replace(/\n/g, ''))).toBe('1324364829627249')
    expect(cleanMetaPixelId('<noscript><img src="https://www.facebook.com/tr?id=1324364829627249&ev=PageView"/></noscript>')).toBe('1324364829627249')
    expect(cleanMetaPixelId('1324364829627249')).toBe('1324364829627249')
    expect(cleanMetaPixelId('<script>alert(1)</script>')).toBe('')
  })

  it('extrai o ID do código do Google', () => {
    const G = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script><script>gtag('config', 'G-ABC123XYZ');</script>`
    expect(cleanGoogleTagId(G)).toBe('G-ABC123XYZ')
    expect(cleanGoogleTagId("gtag('config','AW-123456789')")).toBe('AW-123456789')
  })
})

