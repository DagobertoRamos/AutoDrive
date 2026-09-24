// GET /sitemap.xml do site da loja: páginas, carros publicados e (com o serviço
// ligado) páginas por marca e cidade, com o endereço público da loja.
import { resolveSite } from '@/lib/site/config'
import { publicSiteRoot, SITE_SERVICES, serviceOn, type SiteServiceKey } from '@/lib/site/config-core'
import { listAllSiteVehicles, siteBrandLandings } from '@/lib/site/vehicles'
import { sitemapXml } from '@/lib/site/seo-core'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const r = await resolveSite(site)
  if (!r) return new Response('Não encontrado', { status: 404 })
  const root = publicSiteRoot(r.config, process.env.SITE_BASE_DOMAIN, new URL(req.url).origin)
  const on = (k: SiteServiceKey) => serviceOn(r.config, k)
  const [cars, brands] = await Promise.all([
    listAllSiteVehicles(r.tenantId).catch(() => []),
    on('seoLandings') ? siteBrandLandings(r.tenantId).catch(() => []) : Promise.resolve([]),
  ])
  const xml = sitemapXml([
    { url: root, priority: 1 },
    ...SITE_SERVICES.filter((s) => s.path && on(s.key)).map((s) => ({ url: `${root}${s.path}`, priority: s.key === 'estoque' ? 0.9 : 0.6 })),
    ...cars.filter((c) => c.state === 'PUBLICADO').map((c) => ({ url: `${root}/veiculos/${c.slug}`, priority: 0.8 })),
    ...brands.map((b) => ({ url: `${root}/carros/${b.slug}`, priority: 0.7 })),
    ...(on('seoLandings') ? r.config.seoCities.map((c) => ({ url: `${root}/carros-em/${c.slug}`, priority: 0.7 })) : []),
  ])
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
