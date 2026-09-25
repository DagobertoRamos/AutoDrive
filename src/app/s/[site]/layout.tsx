// =============================================================================
// Layout do site público da loja. Acessado pelo subdomínio/domínio da loja (o
// proxy reescreve para /s/<key>) ou direto em /s/<slug> para testes.
// Tema do site dagobertoeasycar escopado em .autodrive-site; cores da loja via
// variáveis CSS.
// =============================================================================

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { permanentRedirect } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SitePreviewBar } from '@/components/site/SitePreviewBar'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteTracking } from '@/components/site/SiteTracking'
import { cleanGoogleTagId, tagBootstrapScript } from '@/lib/site/tracking-core'
import { CONSENT_COOKIE } from '@/lib/site/tracking-cookie'
import { SiteAnalytics } from '@/components/site/SiteAnalytics'
import { siteBrandLandings } from '@/lib/site/vehicles'
import { Suspense } from 'react'
import { darken, getSiteContext } from '@/lib/site/context'
import { primaryDomain } from '@/lib/site/domains-core'
import { normalizeHost, SITE_HOST_HEADER, SITE_PATH_HEADER } from '@/lib/site/host'
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
    icons: identity.faviconUrl || identity.logoUrl ? { icon: identity.faviconUrl || identity.logoUrl } : undefined,
    openGraph: { title: seo.title, description: seo.description, siteName: identity.name, type: 'website' },
  }
}

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  const { identity, contact } = ctx.config
  // Domínio próprio que não é o principal (ex.: sem www) → redireciona 308.
  const h = await headers()
  const primary = primaryDomain(ctx.config.domains)
  const host = normalizeHost(h.get('host'))
  if (h.get(SITE_HOST_HEADER) === '1' && (primary?.status === 'CONNECTED' || primary?.status === 'DNS_OK') && host !== primary.host && ctx.config.domains.some((d) => d.host === host)) {
    const path = h.get(SITE_PATH_HEADER) ?? '/'
    permanentRedirect(`https://${primary.host}${path.startsWith('/') ? path : '/'}`)
  }
  const wa = ctx.whatsapp()
  // Links para as páginas por marca e cidade (ajudam o Google a achá-las).
  const seoLinks = ctx.on('seoLandings')
    ? [
        ...(await siteBrandLandings(ctx.tenantId).catch(() => [])).slice(0, 8).map((b) => ({ label: `${b.name} seminovos`, href: ctx.href(`/carros/${b.slug}`) })),
        ...ctx.config.seoCities.map((c) => ({ label: `Carros em ${c.name}`, href: ctx.href(`/carros-em/${c.slug}`) })),
      ]
    : []
  const vars = {
    '--brand': identity.primaryColor, '--brand-hover': darken(identity.primaryColor), '--brand-bright': identity.primaryColor,
    '--blue': darken(identity.primaryColor, 0.2), '--blue-dark': identity.darkColor,
  } as React.CSSProperties

  const tagBoot = tagBootstrapScript(ctx.config.tracking.metaPixelId, ctx.config.tracking.googleTagId, CONSENT_COOKIE)
  const googleTag = cleanGoogleTagId(ctx.config.tracking.googleTagId)

  return (
    <div className="autodrive-site" style={vars}>
      {/* Marca a página como site público: o vigia de sessão do painel não age aqui. */}
      <script dangerouslySetInnerHTML={{ __html: 'window.__AUTODRIVE_PUBLIC_SITE__=true' }} />
      {/* Pixel da Meta / tag do Google DA LOJA no HTML (detectáveis pela Meta e pelo Google),
          em modo de consentimento: nada é coletado antes do "Aceitar" dos cookies. */}
      {tagBoot && <script dangerouslySetInnerHTML={{ __html: tagBoot }} />}
      {googleTag && <script async src={`https://www.googletagmanager.com/gtag/js?id=${googleTag}`} />}
      {ctx.preview && <SitePreviewBar />}
      <SiteHeader homeHref={ctx.href('/')} name={identity.name} logoUrl={identity.logoUrl} nav={ctx.nav} whatsappHref={wa} phone={contact.phone} />
      <main>{children}</main>
      <SiteFooter config={ctx.config} nav={ctx.nav} whatsappHref={wa} seoLinks={seoLinks}
        legalLinks={[{ label: 'Política de privacidade', href: ctx.href('/privacidade') }, { label: 'Termos de uso', href: ctx.href('/termos') }, { label: 'Política de cookies', href: ctx.href('/cookies') }]} />
      {/* useSearchParams exige Suspense */}
      <Suspense fallback={null}><SiteAnalytics trackUrl={`/api/site/${encodeURIComponent(ctx.key)}/track`} /></Suspense>
      <SiteTracking pixelId={ctx.config.tracking.metaPixelId} googleTagId={ctx.config.tracking.googleTagId} privacyHref={ctx.href('/privacidade')} />
      {wa && <a className="whatsapp-float" href={wa} target="_blank" rel="noreferrer" aria-label="Falar pelo WhatsApp" title="Falar pelo WhatsApp"><MessageCircle size={24} aria-hidden="true" /></a>}
    </div>
  )
}
