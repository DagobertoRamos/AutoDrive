import { describe, it, expect } from 'vitest'
import { contrastRatio, parseHex, rgbToHsl, type RGB } from './brand-core'
import { buildSiteTheme, logoTone, removeStrayElements, siteThemeVars, whitenNeutralDarks } from './theme-core'
import { defaultSiteConfig, seedSiteFromTenant } from './config-core'

const W: RGB = [255, 255, 255]
const c = (a: string, b: string) => contrastRatio(parseHex(a), parseHex(b))

describe('tema do site a partir da marca', () => {
  const marcas: [string, string | undefined][] = [
    ['#d92485', '#520e32'], // rosa Donna
    ['#d92485', '#061b29'], // rosa com a escura padrão (petróleo)
    ['#ffcc00', undefined], // amarelo claro
    ['#079ca6', '#061b29'], // padrão
    ['#222222', '#000000'], // marca sem cor
    ['#1d4ed8', undefined],
  ]
  it.each(marcas)('%s/%s: todos os pares com contraste AA', (p, d) => {
    const t = buildSiteTheme(p, d)
    expect(c('#ffffff', t.brand)).toBeGreaterThanOrEqual(4.5) // botão
    expect(c('#ffffff', t.brandHover)).toBeGreaterThanOrEqual(4.5)
    expect(c('#ffffff', t.dark)).toBeGreaterThanOrEqual(12) // rodapé/faixas
    expect(c(t.brandSoft, t.dark)).toBeGreaterThanOrEqual(4.5) // destaque no escuro
    expect(c(t.ink, t.tint2)).toBeGreaterThanOrEqual(7)
    expect(c(t.muted, t.tint2)).toBeGreaterThanOrEqual(4.5)
    expect(c(t.footerText, t.dark)).toBeGreaterThanOrEqual(7)
    expect(c(t.footerMuted, t.darkHover)).toBeGreaterThanOrEqual(4.5)
  })
  it('escura de outra família (petróleo numa marca rosa) vira um tom escuro da própria marca', () => {
    const t = buildSiteTheme('#d92485', '#061b29')
    const hue = rgbToHsl(parseHex(t.dark))[0]
    expect(Math.abs(hue - rgbToHsl(parseHex('#d92485'))[0])).toBeLessThan(15)
  })
  it('escura da mesma família é respeitada', () => {
    expect(buildSiteTheme('#d92485', '#520e32').dark).toBe('#520e32')
  })
  it('expõe as variáveis que o CSS usa', () => {
    const v = siteThemeVars(buildSiteTheme('#d92485', '#520e32'))
    for (const k of ['--brand', '--brand-soft', '--dark', '--tint', '--line', '--ink', '--muted', '--footer-text', '--footer-muted', '--blue', '--blue-dark', '--soft']) expect(v[k]).toMatch(/^#[0-9a-f]{6}$/)
  })
})

/** Imagem RGBA w×h; `paint` devolve a cor (ou null = transparente) de cada pixel. */
function img(w: number, h: number, paint: (x: number, y: number) => RGB | null) {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = paint(x, y)
    if (col) px.set([...col, 255], (y * w + x) * 4)
  }
  return px
}
const alphaAt = (px: Uint8ClampedArray, w: number, x: number, y: number) => px[(y * w + x) * 4 + 3]
const PINK: RGB = [217, 36, 133]

describe('logo: sobras de recorte', () => {
  // Logo 200×80: bloco central (a marca), três ícones redondos no canto
  // superior esquerdo encostados nela, e uma faixa diagonal cortada no canto
  // inferior direito (logo tirada de um banner).
  const w = 200, h = 80
  const circle = (cx: number, cy: number, r: number, x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  const banner = () => img(w, h, (x, y) => {
    if (x >= 34 && x <= 160 && y >= 2 && y <= 70) return PINK // marca
    if (circle(4, 4, 4, x, y) || circle(14, 4, 4, x, y) || circle(24, 4, 4, x, y)) return PINK // ícones
    if (x >= 180 && y >= 40 && (x - 180) * 2 >= 79 - y) return PINK // faixa cortada no canto
    return null
  })
  it('tira os ícones do canto e a faixa cortada, preserva a marca', () => {
    const px = banner()
    expect(removeStrayElements(px, w, h)).toBe(4)
    expect(alphaAt(px, w, 14, 4)).toBe(0)
    expect(alphaAt(px, w, 199, 79)).toBe(0)
    expect(alphaAt(px, w, 100, 40)).toBe(255)
  })
  it('logo com ícone + nome (sem sobras) fica intacta', () => {
    const px = img(w, h, (x, y) => {
      if (x < 60 && y < 70) return [20, 20, 20] // ícone grande à esquerda
      if (x >= 70 && y >= 25 && y <= 45 && x % 12 < 9) return [20, 20, 20] // letras
      return null
    })
    expect(removeStrayElements(px, w, h)).toBe(0)
  })
})

describe('logo: tom e versão para fundo escuro', () => {
  it('só o preto/cinza vira branco — o rosa fica', () => {
    const px = new Uint8ClampedArray([...PINK, 255, 20, 20, 20, 255, 120, 120, 120, 255])
    whitenNeutralDarks(px)
    expect([...px.slice(0, 3)]).toEqual(PINK)
    expect([...px.slice(4, 7)]).toEqual([255, 255, 255])
    expect([...px.slice(8, 11)]).toEqual([255, 255, 255])
  })
  it('logo branca é "clara" (cabeçalho escuro); rosa é "escura"', () => {
    expect(logoTone(new Uint8ClampedArray([...W, 255, ...W, 255]))).toBe('light')
    expect(logoTone(new Uint8ClampedArray([...PINK, 255]))).toBe('dark')
  })
})

describe('site novo herda o cadastro da loja', () => {
  const tenant = {
    primaryColor: '#d92485', secondaryColor: null, logoUrl: 'https://cdn.exemplo/logo.png', faviconUrl: null, slogan: 'Seu carro com carinho',
    phone: '(11) 3608-4651', email: 'loja@exemplo.com', address: null,
    logradouro: 'Av. dos Autonomistas', numero: '6878', complemento: 'Km 21', bairro: 'Vila Yara', city: 'Osasco', state: 'SP',
  }
  it('cores, logo, slogan e contato vêm do cadastro', () => {
    const s = seedSiteFromTenant(defaultSiteConfig('Donna'), tenant)
    expect(s.identity.primaryColor).toBe('#d92485')
    expect(rgbToHsl(parseHex(s.identity.darkColor))[0]).toBeGreaterThan(300) // escura da família rosa
    expect(s.identity.logoUrl).toBe(tenant.logoUrl)
    expect(s.identity.tagline).toBe('Seu carro com carinho')
    expect(s.contact.whatsapp).toBe('1136084651')
    expect(s.contact.addressLine1).toBe('Av. dos Autonomistas, 6878 - Km 21')
    expect(s.contact.addressLine2).toBe('Vila Yara - Osasco - SP')
  })
  it('nunca sobrescreve o que o lojista já ajustou no site', () => {
    const d = defaultSiteConfig('Donna')
    d.identity.primaryColor = '#123456'; d.contact.email = 'site@loja.com'
    const s = seedSiteFromTenant(d, tenant)
    expect(s.identity.primaryColor).toBe('#123456')
    expect(s.contact.email).toBe('site@loja.com')
  })
  it('cor padrão do cadastro (verde do schema) não conta como marca', () => {
    expect(seedSiteFromTenant(defaultSiteConfig('X'), { primaryColor: '#166534' }).identity.primaryColor).toBe('#079ca6')
  })
})
