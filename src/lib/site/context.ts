// Contexto do site por requisição (memoizado com React `cache`): loja, base dos
// links, menu conforme os serviços ligados e link do WhatsApp.
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { resolveSite } from './config'
import { serviceOn, whatsappLink, type SiteConfig, type SiteServiceKey } from './config-core'
import { siteBase, siteHref } from './base'

export interface SiteContext {
  key: string
  tenantId: string
  config: SiteConfig
  base: string
  href: (path: string) => string
  apiUrl: string
  nav: { label: string; href: string }[]
  whatsapp: (text?: string) => string
  on: (s: SiteServiceKey) => boolean
}

const NAV: { service: SiteServiceKey | null; label: string; path: string }[] = [
  { service: null, label: 'Início', path: '/' },
  { service: 'estoque', label: 'Estoque', path: '/veiculos' },
  { service: 'sobre', label: 'Quem somos', path: '/sobre' },
  { service: 'financiamento', label: 'Financiamento', path: '/financiamento' },
  { service: 'vendaSeuCarro', label: 'Venda seu carro', path: '/venda-seu-carro' },
  { service: 'encontreSeuCarro', label: 'Encontre seu carro', path: '/encontre-seu-carro' },
  { service: 'contato', label: 'Contato', path: '/contato' },
]

export const getSiteContext = cache(async (key: string): Promise<SiteContext> => {
  const site = await resolveSite(key)
  if (!site) notFound()
  const base = await siteBase(key)
  const { config } = site
  const on = (s: SiteServiceKey) => serviceOn(config, s)
  return {
    key, tenantId: site.tenantId, config, base,
    href: (p: string) => siteHref(base, p),
    apiUrl: `/api/site/${encodeURIComponent(key)}/leads`,
    nav: NAV.filter((n) => !n.service || on(n.service)).map((n) => ({ label: n.label, href: siteHref(base, n.path) })),
    whatsapp: (text?: string) => whatsappLink(config, text ?? `Olá! Vim pelo site da ${config.identity.name} e gostaria de atendimento.`),
    on,
  }
})

/** Escurece uma cor #rrggbb (para o hover dos botões). */
export function darken(hex: string, amount = 0.14): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.round(c * (1 - amount))).toString(16).padStart(2, '0')
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`
}
