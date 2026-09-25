import { describe, it, expect } from 'vitest'
import { cleanGoogleTagId, cleanMetaPixelId, safePageUrl, sanitizeEventParams, sanitizeTracking, tagBootstrapScript } from './tracking-core'

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


describe('tagBootstrapScript (tags no HTML, em modo de consentimento)', () => {
  const run = (code: string, cookie: string) => {
    const calls: unknown[][] = []
    const inserted: string[] = []
    const document = {
      cookie,
      createElement: () => ({} as { src?: string }),
      getElementsByTagName: () => [{ parentNode: { insertBefore: (t: { src: string }) => inserted.push(t.src) } }],
    }
    const window: Record<string, unknown> = {}
    // o script usa `window`, `document`, `fbq`, `gtag` e `dataLayer` globais
    new Function('window', 'document', `with (window) { ${code.replace(/\b(fbq|gtag)\(/g, 'window.$1(')} }`)(window, document)
    const fbq = window.fbq as { queue: ArrayLike<unknown>[] } | undefined
    if (fbq) calls.push(...fbq.queue.map((a) => Array.from(a)))
    const dl = (window.dataLayer ?? []) as IArguments[]
    return { fbq: calls, gtag: dl.map((a) => Array.from(a)), inserted }
  }

  it('sem IDs não gera nada', () => {
    expect(tagBootstrapScript('', '', 'c')).toBe('')
    expect(tagBootstrapScript('<script>', 'xx', 'c')).toBe('')
  })

  it('visitante novo: Pixel iniciado com consentimento REVOGADO e Google NEGADO', () => {
    const r = run(tagBootstrapScript('1324364829627249', 'AW-18468438331', 'site_analytics_consent'), '')
    expect(r.inserted).toEqual(['https://connect.facebook.net/en_US/fbevents.js'])
    expect(r.fbq).toEqual([['consent', 'revoke'], ['init', '1324364829627249']])
    expect(r.gtag[0]).toEqual(['consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }])
    expect(r.gtag[2]).toEqual(['config', 'AW-18468438331', { send_page_view: false }])
    // nenhum evento/PageView antes do aceite
    expect(r.fbq.some((c) => c[0] === 'track')).toBe(false)
  })

  it('quem já aceitou começa com consentimento concedido', () => {
    const r = run(tagBootstrapScript('1324364829627249', 'G-ABC123XYZ', 'site_analytics_consent'), 'x=1; site_analytics_consent=accepted')
    expect(r.fbq[0]).toEqual(['consent', 'grant'])
    expect((r.gtag[0][2] as Record<string, string>).ad_storage).toBe('granted')
  })
})
