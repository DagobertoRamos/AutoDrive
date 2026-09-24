// GET /api/site-admin/meta-feed — relatório do catálogo Meta (o que entra, o
// que fica de fora e por quê) + URL do feed. ?download=1 baixa o CSV. Gate: site.
import { NextResponse } from 'next/server'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadSiteConfig, publicSiteRoot } from '@/lib/site/config'
import { generateMetaFeed } from '@/lib/site/meta-feed'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site')) return forbiddenResponse('Sem acesso ao site da loja.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const url = new URL(req.url)
  const config = await loadSiteConfig(tenantId)
  const feed = await generateMetaFeed(tenantId, config, url.origin)
  if (url.searchParams.get('download')) {
    return new Response(feed.csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="catalogo-meta-${config.slug}.csv"` } })
  }
  // A URL do feed usa o endereço público quando existe (é a Meta quem busca).
  const root = publicSiteRoot(config, process.env.SITE_BASE_DOMAIN, url.origin)
  const feedUrl = root.includes('/s/') ? `${url.origin}/api/site/${config.slug}/catalogo-meta` : `${root}/api/site/${config.slug}/catalogo-meta`
  return NextResponse.json({
    success: true,
    data: {
      enabled: config.catalog.enabled, siteEnabled: config.enabled, catalog: config.catalog, feedUrl,
      total: feed.total, exported: feed.exported, ignored: feed.ignored, issues: feed.issues,
      items: feed.items.slice(0, 200).map((i) => ({ id: i.id, title: i.title, price: i.price, sale_price: i.sale_price, image_link: i.image_link, link: i.link })),
    },
  })
}
