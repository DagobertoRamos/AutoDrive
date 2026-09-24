import { describe, it, expect } from 'vitest'
import { activeBanners, defaultSiteConfig, sanitizeSiteConfig, isValidSiteSlug, serviceOn, whatsappLink, slugify } from './config-core'

describe('config do site', () => {
  it('padrão: zerado com o nome da loja e os 4 serviços padrão ligados', () => {
    const d = defaultSiteConfig('EasyCar Veículos')
    expect(d.enabled).toBe(false)
    expect(d.slug).toBe('easycar-veiculos')
    expect(d.home.heroText).toContain('EasyCar Veículos')
    expect(Object.entries(d.services).filter(([, v]) => v).map(([k]) => k)).toEqual(['estoque', 'sobre', 'contato', 'financiamento'])
  })

  it('sanitiza slug, domínios, cores, links e serviços', () => {
    const c = sanitizeSiteConfig({
      slug: 'Minha Loja!', domains: ['WWW.Loja.com.br', 'invalido', 'www.loja.com.br'],
      identity: { primaryColor: 'red', logoUrl: 'javascript:alert(1)' },
      contact: { whatsapp: '(11) 93471-8276', mapsEmbedUrl: 'https://evil.com/x' },
      services: { estoque: false, sobre: false, atacado: true },
    }, 'Loja')
    expect(c.slug).toBe('minha-loja')
    expect(c.domains.map((d) => d.host)).toEqual(['www.loja.com.br'])
    expect(c.identity.primaryColor).toBe('#079ca6')
    expect(c.identity.logoUrl).toBe('')
    expect(c.contact.whatsapp).toBe('11934718276')
    expect(c.contact.mapsEmbedUrl).toBe('')
    expect(c.services.estoque).toBe(true) // travado
    expect(c.services.sobre).toBe(false)
    expect(c.services.atacado).toBe(true)
    expect(serviceOn(c, 'atacado')).toBe(false) // ainda não disponível no produto
    expect(serviceOn(c, 'estoque')).toBe(true)
  })

  it('slug reservado ou curto cai no padrão', () => {
    expect(isValidSiteSlug('www')).toBe(false)
    expect(isValidSiteSlug('a')).toBe(false)
    expect(isValidSiteSlug('easycar')).toBe(true)
    expect(sanitizeSiteConfig({ slug: 'admin' }, 'Auto Center').slug).toBe('auto-center')
  })

  it('whatsapp com DDI automático', () => {
    const c = sanitizeSiteConfig({ contact: { whatsapp: '11934718276' } }, 'X')
    expect(whatsappLink(c, 'Olá')).toBe('https://wa.me/5511934718276?text=Ol%C3%A1')
    expect(whatsappLink(sanitizeSiteConfig({}, 'X'))).toBe('')
    expect(slugify('Açaí & Cia')).toBe('acai-cia')
  })

  it('banners: só com imagem, link seguro, tempo limitado; home mostra os ativos com o serviço ligado', () => {
    const c = sanitizeSiteConfig({
      services: { banners: true },
      banners: { intervalSeconds: 999, items: [
        { id: 'a', title: 'Feirão', imageUrl: '/api/site/assets/abc1234567', linkUrl: 'javascript:alert(1)' },
        { id: 'b', imageUrl: 'data:image/png;base64,xx' },
        { id: 'c', imageUrl: 'https://cdn.x.com/b.jpg', linkUrl: 'https://wa.me/5511', active: false, newTab: 1 },
      ] },
    }, 'X')
    expect(c.banners.intervalSeconds).toBe(30)
    expect(c.banners.items.map((b) => b.id)).toEqual(['a', 'c'])
    expect(c.banners.items[0].linkUrl).toBe('')
    expect(c.banners.items[1]).toMatchObject({ newTab: true, active: false })
    expect(activeBanners(c).map((b) => b.id)).toEqual(['a'])
    expect(activeBanners(sanitizeSiteConfig({ ...c, services: { banners: false } }, 'X'))).toEqual([])
  })

  it('depoimentos exigem nome e texto', () => {
    const c = sanitizeSiteConfig({ testimonials: [{ name: 'Ana', text: 'Ótimo atendimento' }, { name: 'Sem texto' }] }, 'X')
    expect(c.testimonials).toEqual([{ name: 'Ana', text: 'Ótimo atendimento', vehicle: '' }])
    expect(defaultSiteConfig('X').testimonials).toEqual([])
  })
})
