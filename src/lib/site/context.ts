// Contexto do site por requisição (memoizado com React `cache`): loja, base dos
// links, menu organizado pelo lojista e link do WhatsApp. Com o cookie de
// pré-visualização (aberto pelo painel), usa o rascunho em vez da config salva.
import { cache } from 'react'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { resolveSite } from './config'
import { serviceOn, whatsappLink, type SiteConfig, type SiteServiceKey } from './config-core'
import { visibleMenu, type HomeBlockType } from './layout-core'
import { loadPreview, PREVIEW_COOKIE } from './preview'
import { siteBase, siteHref } from './base'

export interface SiteContext {
  key: string
  tenantId: string
  config: SiteConfig
  base: string
  href: (path: string) => string
  apiUrl: string
  /** Menu do lojista: topo, menu do celular e rodapé. */
  nav: { label: string; href: string }[]
  whatsapp: (text?: string) => string
  on: (s: SiteServiceKey) => boolean
  /** Bloco da página inicial ligado. */
  blockOn: (t: HomeBlockType) => boolean
  /** Mostrando o rascunho (pré-visualização), não o site salvo. */
  preview: boolean
}

export const getSiteContext = cache(async (key: string): Promise<SiteContext> => {
  const site = await resolveSite(key, { includeDisabled: true })
  if (!site) notFound()
  const token = (await cookies()).get(PREVIEW_COOKIE)?.value
  const draft = token ? await loadPreview(site.tenantId, token) : null
  if (!draft && !site.config.enabled) notFound()
  const config: SiteConfig = draft ?? site.config
  const base = await siteBase(key)
  const on = (s: SiteServiceKey) => serviceOn(config, s)
  const blockOn = (t: HomeBlockType) => !!config.homeBlocks.find((b) => b.type === t)?.visible
  const link = (p: string) => (/^https?:\/\//i.test(p) ? p : siteHref(base, p))
  return {
    key, tenantId: site.tenantId, config, base,
    href: (p: string) => siteHref(base, p),
    apiUrl: `/api/site/${encodeURIComponent(key)}/leads`,
    nav: visibleMenu(config.menu, on, blockOn).map((n) => ({ label: n.label, href: link(n.path) })),
    whatsapp: (text?: string) => whatsappLink(config, text ?? `Olá! Vim pelo site da ${config.identity.name} e gostaria de atendimento.`),
    on,
    blockOn,
    preview: !!draft,
  }
})

/** Escurece uma cor #rrggbb (para o hover dos botões). */
export function darken(hex: string, amount = 0.14): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.round(c * (1 - amount))).toString(16).padStart(2, '0')
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`
}
