// =============================================================================
// Site da loja — configuração por tenant. Núcleo PURO (client-safe, testado).
// Cada loja nasce com um site "zerado" (textos genéricos com o nome dela) e os
// serviços padrão ligados: Estoque, Quem somos, Contato e Financiamento. Os
// demais serviços são opcionais e ativados no painel do Site.
// =============================================================================

import { primaryDomain, sanitizeDomains, type SiteDomain } from './domains-core'
import { sanitizeTracking, type SiteTracking } from './tracking-core'
import { sanitizeEmailSettings, type SiteEmailSettings } from './lead-email-core'
import { sanitizeSeoCities, type SeoCity } from './seo-core'

export type { SiteDomain }

export const SITE_SERVICES = [
  { key: 'estoque', label: 'Estoque', path: '/veiculos', default: true, locked: true, available: true, hint: 'Vitrine com todos os carros disponíveis do estoque.' },
  { key: 'sobre', label: 'Quem somos', path: '/sobre', default: true, locked: false, available: true, hint: 'História e diferenciais da loja.' },
  { key: 'contato', label: 'Contato', path: '/contato', default: true, locked: false, available: true, hint: 'Formulário, WhatsApp, endereço e mapa.' },
  { key: 'financiamento', label: 'Financiamento', path: '/financiamento', default: true, locked: false, available: true, hint: 'Simulação para os carros do estoque.' },
  { key: 'vendaSeuCarro', label: 'Venda seu carro', path: '/venda-seu-carro', default: false, locked: false, available: true, hint: 'O cliente envia o carro dele para avaliação.' },
  { key: 'encontreSeuCarro', label: 'Encontre seu carro', path: '/encontre-seu-carro', default: false, locked: false, available: true, hint: 'O cliente pede um modelo que não está no estoque.' },
  { key: 'financiaFacil', label: 'Financia Fácil', path: '/financia-facil', default: false, locked: false, available: true, hint: 'Financiamento de carro comprado de particular.' },
  { key: 'atacado', label: 'Atacado / lojistas', path: '/atacado', default: false, locked: false, available: true, hint: 'Página para lojistas comprarem no atacado.' },
  { key: 'depoimentos', label: 'Depoimentos', path: '', default: false, locked: false, available: true, hint: 'Avaliações de clientes na página inicial.' },
  { key: 'banners', label: 'Banners na home', path: '', default: false, locked: false, available: true, hint: 'Carrossel de banners no topo da página inicial.' },
  { key: 'seoLandings', label: 'Páginas por marca e cidade', path: '', default: false, locked: false, available: true, hint: 'Páginas "carros Fiat", "carros em Osasco" para o Google.' },
] as const
export type SiteServiceKey = (typeof SITE_SERVICES)[number]['key']

export interface SiteBanner { id: string; title: string; imageUrl: string; linkUrl: string; newTab: boolean; active: boolean }
export interface SiteTestimonial { name: string; text: string; vehicle: string }
export const SITE_MAX_BANNERS = 10
export const SITE_MAX_TESTIMONIALS = 6

export interface SiteConfig {
  enabled: boolean
  slug: string
  domains: SiteDomain[]
  identity: { name: string; tagline: string; logoUrl: string; footerLogoUrl: string; faviconUrl: string; primaryColor: string; darkColor: string }
  contact: {
    whatsapp: string; phone: string; email: string
    addressLine1: string; addressLine2: string; mapsUrl: string; wazeUrl: string; mapsEmbedUrl: string; hours: string
  }
  home: {
    heroEyebrow: string; heroTitle: string; heroText: string; trust: string[]
    showcaseTitle: string; showcaseText: string
    benefits: { title: string; text: string }[]
    faq: { q: string; a: string }[]
  }
  about: { eyebrow: string; title: string; intro: string; sections: { title: string; text: string }[] }
  banners: { intervalSeconds: number; items: SiteBanner[] }
  testimonials: SiteTestimonial[]
  tracking: SiteTracking
  catalog: { enabled: boolean; city: string; state: string }
  emails: SiteEmailSettings
  /** Cidades atendidas: uma página "carros em <cidade>" para cada (serviço seoLandings). */
  seoCities: SeoCity[]
  legalNote: string
  seo: { title: string; description: string }
  services: Record<SiteServiceKey, boolean>
}

const HEX = /^#[0-9a-fA-F]{6}$/
const RESERVED_SLUGS = new Set(['www', 'app', 'api', 'admin', 'painel', 'mail', 'smtp', 'ftp', 'site', 'sites', 'static', 'cdn', 'autodrive'])
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

export function slugify(s: string, max = 40): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '')
}

export function isValidSiteSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug)
}

export function defaultSiteConfig(storeName: string): SiteConfig {
  const name = storeName.trim() || 'Nossa loja'
  return {
    enabled: false,
    slug: slugify(name),
    domains: [],
    identity: { name, tagline: 'Seminovos com procedência e atendimento de verdade.', logoUrl: '', footerLogoUrl: '', faviconUrl: '', primaryColor: '#079ca6', darkColor: '#061b29' },
    contact: { whatsapp: '', phone: '', email: '', addressLine1: '', addressLine2: '', mapsUrl: '', wazeUrl: '', mapsEmbedUrl: '', hours: '' },
    home: {
      heroEyebrow: 'Seu próximo carro está aqui',
      heroTitle: 'Seminovos para todos os gostos.',
      heroText: `Veículos revisados, financiamento facilitado e atendimento rápido. Conheça o estoque da ${name}.`,
      trust: ['Atendimento humano e personalizado', 'Opções de financiamento', 'Aceitamos seu usado na troca'],
      showcaseTitle: 'Encontre o carro certo para o seu momento.',
      showcaseText: 'Confira as oportunidades do nosso estoque e fale com a equipe para consultar condições.',
      benefits: [
        { title: 'Procedência verificada', text: 'Veículos revisados antes da venda.' },
        { title: 'Financiamento facilitado', text: 'Com ou sem entrada. Consulte condições.' },
        { title: 'Troca com avaliação justa', text: 'Seu usado vale como parte do pagamento.' },
        { title: 'Atendimento rápido', text: 'Fale com a equipe pelo WhatsApp.' },
      ],
      faq: [
        { q: 'Vocês trabalham com financiamento?', a: 'Sim. Fazemos a simulação com as financeiras parceiras. Toda proposta está sujeita à análise de crédito.' },
        { q: 'Aceitam meu carro na troca?', a: 'Sim. Avaliamos o seu veículo e usamos o valor como parte do pagamento.' },
      ],
    },
    about: {
      eyebrow: name,
      title: 'Conheça a nossa loja.',
      intro: `A ${name} trabalha com veículos seminovos selecionados e atendimento próximo, do primeiro contato ao pós-venda.`,
      sections: [
        { title: 'Nossa história', text: 'Conte aqui como a loja começou, há quanto tempo está no mercado e o que a torna diferente.' },
        { title: 'Nosso compromisso', text: 'Transparência nas informações dos veículos, clareza nas condições e respeito ao cliente.' },
      ],
    },
    banners: { intervalSeconds: 6, items: [] },
    testimonials: [],
    tracking: { metaPixelId: '', googleTagId: '' },
    catalog: { enabled: false, city: '', state: '' },
    emails: { enabled: false, recipients: [], notifyCustomer: false },
    seoCities: [],
    legalNote: 'Crédito sujeito à análise e aprovação das instituições financeiras. Imagens meramente ilustrativas.',
    seo: { title: `${name} — Seminovos`, description: `Estoque de seminovos da ${name}. Financiamento, troca e atendimento pelo WhatsApp.` },
    services: Object.fromEntries(SITE_SERVICES.map((s) => [s.key, s.default])) as Record<SiteServiceKey, boolean>,
  }
}

const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)
const obj = (v: unknown) => (v && typeof v === 'object' ? v as Record<string, unknown> : {})
const url = (v: unknown) => { const s = str(v, 500); return /^(https?:\/\/|\/)/i.test(s) ? s : '' }
/** Mapa incorporável do Google: "Incorporar mapa" (/maps/embed?pb=...) ou /maps?q=...&output=embed. */
export const isMapsEmbed = (s: string) =>
  /^https:\/\/(www\.|maps\.)?google\.[a-z.]+\/maps\/embed/i.test(s) || (/^https:\/\/(www\.|maps\.)?google\.[a-z.]+\/maps\?/i.test(s) && /[?&]output=embed(&|$)/i.test(s))
const strList = (v: unknown, n: number, max = 120, fallback: string[] = []) =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : fallback

export function sanitizeSiteConfig(input: unknown, storeName: string): SiteConfig {
  const d = defaultSiteConfig(storeName)
  const b = obj(input)
  const id = obj(b.identity), ct = obj(b.contact), hm = obj(b.home), ab = obj(b.about), seo = obj(b.seo), sv = obj(b.services), bn = obj(b.banners)
  const slug = slugify(str(b.slug, 40))
  const pairs = <T>(v: unknown, n: number, map: (o: Record<string, unknown>) => T | null, fallback: T[]): T[] =>
    Array.isArray(v) ? v.map((x) => map(obj(x))).filter((x): x is T => !!x).slice(0, n) : fallback

  return {
    enabled: Boolean(b.enabled ?? d.enabled),
    slug: isValidSiteSlug(slug) ? slug : (isValidSiteSlug(d.slug) ? d.slug : ''),
    domains: sanitizeDomains(b.domains),
    identity: {
      name: str(id.name, 80) || d.identity.name,
      tagline: str(id.tagline, 160),
      logoUrl: url(id.logoUrl), footerLogoUrl: url(id.footerLogoUrl), faviconUrl: url(id.faviconUrl),
      primaryColor: HEX.test(str(id.primaryColor)) ? str(id.primaryColor) : d.identity.primaryColor,
      darkColor: HEX.test(str(id.darkColor)) ? str(id.darkColor) : d.identity.darkColor,
    },
    contact: {
      whatsapp: str(ct.whatsapp, 20).replace(/\D/g, ''),
      phone: str(ct.phone, 30), email: str(ct.email, 160),
      addressLine1: str(ct.addressLine1, 160), addressLine2: str(ct.addressLine2, 160),
      mapsUrl: url(ct.mapsUrl), wazeUrl: url(ct.wazeUrl), mapsEmbedUrl: isMapsEmbed(str(ct.mapsEmbedUrl, 1000)) ? str(ct.mapsEmbedUrl, 1000) : '',
      hours: str(ct.hours, 160),
    },
    home: {
      heroEyebrow: str(hm.heroEyebrow, 80) || d.home.heroEyebrow,
      heroTitle: str(hm.heroTitle, 120) || d.home.heroTitle,
      heroText: str(hm.heroText, 400) || d.home.heroText,
      trust: strList(hm.trust, 4, 80, d.home.trust),
      showcaseTitle: str(hm.showcaseTitle, 120) || d.home.showcaseTitle,
      showcaseText: str(hm.showcaseText, 300) || d.home.showcaseText,
      benefits: pairs(hm.benefits, 4, (o) => str(o.title, 60) ? { title: str(o.title, 60), text: str(o.text, 140) } : null, d.home.benefits),
      faq: pairs(hm.faq, 8, (o) => str(o.q, 160) && str(o.a, 600) ? { q: str(o.q, 160), a: str(o.a, 600) } : null, d.home.faq),
    },
    about: {
      eyebrow: str(ab.eyebrow, 80) || d.about.eyebrow,
      title: str(ab.title, 120) || d.about.title,
      intro: str(ab.intro, 500) || d.about.intro,
      sections: pairs(ab.sections, 8, (o) => str(o.title, 100) ? { title: str(o.title, 100), text: str(o.text, 1500) } : null, d.about.sections),
    },
    banners: {
      intervalSeconds: Math.min(30, Math.max(2, Math.round(Number(bn.intervalSeconds) || d.banners.intervalSeconds))),
      items: pairs(bn.items, SITE_MAX_BANNERS, (o) => {
        const imageUrl = url(o.imageUrl)
        if (!imageUrl) return null
        return { id: str(o.id, 40).replace(/[^\w-]/g, '') || imageUrl.slice(-24), title: str(o.title, 120), imageUrl, linkUrl: url(o.linkUrl), newTab: Boolean(o.newTab), active: o.active !== false }
      }, []),
    },
    testimonials: pairs(b.testimonials, SITE_MAX_TESTIMONIALS, (o) => str(o.name, 80) && str(o.text, 360) ? { name: str(o.name, 80), text: str(o.text, 360), vehicle: str(o.vehicle, 100) } : null, []),
    tracking: sanitizeTracking(b.tracking),
    emails: sanitizeEmailSettings(b.emails),
    seoCities: sanitizeSeoCities(b.seoCities),
    catalog: { enabled: Boolean(obj(b.catalog).enabled), city: str(obj(b.catalog).city, 80), state: str(obj(b.catalog).state, 2).toUpperCase().replace(/[^A-Z]/g, '') },
    legalNote: str(b.legalNote, 400),
    seo: { title: str(seo.title, 80) || d.seo.title, description: str(seo.description, 200) || d.seo.description },
    services: Object.fromEntries(SITE_SERVICES.map((s) => [s.key, s.locked ? true : (typeof sv[s.key] === 'boolean' ? sv[s.key] as boolean : s.default)])) as Record<SiteServiceKey, boolean>,
  }
}

/** Serviço ligado E já disponível no produto. */
export function serviceOn(cfg: SiteConfig, key: SiteServiceKey): boolean {
  const s = SITE_SERVICES.find((x) => x.key === key)
  return !!s && s.available && cfg.services[key]
}

export function whatsappLink(cfg: SiteConfig, text?: string): string {
  if (!cfg.contact.whatsapp) return ''
  const n = cfg.contact.whatsapp.length <= 11 ? `55${cfg.contact.whatsapp}` : cfg.contact.whatsapp
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/** Banners que aparecem na home (serviço ligado e banner ativo). */
export function activeBanners(cfg: SiteConfig): SiteBanner[] {
  return serviceOn(cfg, 'banners') ? cfg.banners.items.filter((b) => b.active) : []
}

/**
 * Endereço público do site (sem barra no fim), para links absolutos (feed,
 * compartilhamento): domínio próprio conectado → subdomínio da plataforma →
 * rota de teste /s/<slug> no endereço atual.
 */
export function publicSiteRoot(cfg: SiteConfig, baseDomain: string | null | undefined, fallbackOrigin: string): string {
  const p = primaryDomain(cfg.domains)
  if (p && (p.status === 'CONNECTED' || p.status === 'DNS_OK')) return `https://${p.host}`
  if (baseDomain) return `https://${cfg.slug}.${baseDomain}`
  return `${fallbackOrigin.replace(/\/+$/, '')}/s/${cfg.slug}`
}
