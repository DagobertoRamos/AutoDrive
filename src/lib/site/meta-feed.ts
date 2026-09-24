// Site da loja — monta o feed do catálogo Meta a partir do estoque visível.
import { listAllSiteVehicles } from './vehicles'
import { publicSiteRoot, type SiteConfig } from './config-core'
import { buildMetaFeed, cityStateFrom, type MetaFeedResult } from './meta-feed-core'

export async function generateMetaFeed(tenantId: string, config: SiteConfig, fallbackOrigin: string): Promise<MetaFeedResult & { root: string }> {
  const root = publicSiteRoot(config, process.env.SITE_BASE_DOMAIN, fallbackOrigin)
  const guess = cityStateFrom(config.contact.addressLine2 || config.contact.addressLine1)
  const vehicles = await listAllSiteVehicles(tenantId)
  const feed = buildMetaFeed(vehicles, {
    // Fotos do painel ficam em /api/site/assets (na raiz do domínio, fora de /s/<slug>)
    // e saem em JPEG: o catálogo da Meta não aceita WebP.
    abs: (p) => (/^\/api\/site\/assets\/[a-z0-9]+$/i.test(p) ? `${root.replace(/\/s\/[^/]+$/, '')}${p}?format=jpg` : `${root}${p}`),
    city: config.catalog.city || guess.city,
    state: config.catalog.state || guess.state,
  })
  return { ...feed, root }
}
