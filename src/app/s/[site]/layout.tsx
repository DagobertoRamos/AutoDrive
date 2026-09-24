// =============================================================================
// Layout do site público da loja. Acessado pelo subdomínio/domínio da loja (o
// proxy reescreve para /s/<key>) ou direto em /s/<slug> para testes.
// Tema do site dagobertoeasycar escopado em .autodrive-site; cores da loja via
// variáveis CSS.
// =============================================================================

import type { Metadata } from 'next'
import { MessageCircle } from 'lucide-react'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteFooter } from '@/components/site/SiteFooter'
import { darken, getSiteContext } from '@/lib/site/context'
import './site.css'
import './site-extra.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> {
  const { site } = await params
  const ctx = await getSiteContext(site)
  const { seo, identity } = ctx.config
  return {
    // absolute: não herda o "| AutoDrive" do layout do painel.
    title: { absolute: seo.title, template: `%s | ${identity.name}` },
    description: seo.description,
    robots: { index: true, follow: true },
    icons: identity.logoUrl ? { icon: identity.logoUrl } : undefined,
    openGraph: { title: seo.title, description: seo.description, siteName: identity.name, type: 'website' },
  }
}

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  const { identity, contact } = ctx.config
  const wa = ctx.whatsapp()
  const vars = {
    '--brand': identity.primaryColor, '--brand-hover': darken(identity.primaryColor), '--brand-bright': identity.primaryColor,
    '--blue': darken(identity.primaryColor, 0.2), '--blue-dark': identity.darkColor,
  } as React.CSSProperties

  return (
    <div className="autodrive-site" style={vars}>
      {/* Marca a página como site público: o vigia de sessão do painel não age aqui. */}
      <script dangerouslySetInnerHTML={{ __html: 'window.__AUTODRIVE_PUBLIC_SITE__=true' }} />
      <SiteHeader homeHref={ctx.href('/')} name={identity.name} logoUrl={identity.logoUrl} nav={ctx.nav} whatsappHref={wa} phone={contact.phone} />
      <main>{children}</main>
      <SiteFooter config={ctx.config} nav={ctx.nav} whatsappHref={wa} />
      {wa && <a className="whatsapp-float" href={wa} target="_blank" rel="noreferrer" aria-label="Falar pelo WhatsApp" title="Falar pelo WhatsApp"><MessageCircle size={24} aria-hidden="true" /></a>}
    </div>
  )
}
