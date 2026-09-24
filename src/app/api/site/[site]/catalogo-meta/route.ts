// GET /api/site/[site]/catalogo-meta — feed CSV do catálogo Meta da loja
// (Facebook/Instagram/WhatsApp). Público: só dados que já estão no site.
// A loja cadastra esta URL como "feed programado" no Gerenciador de Commerce.
import { resolveSite } from '@/lib/site/config'
import { generateMetaFeed } from '@/lib/site/meta-feed'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const resolved = await resolveSite(site)
  if (!resolved || !resolved.config.catalog.enabled) return new Response('Catálogo não disponível.', { status: 404 })
  const feed = await generateMetaFeed(resolved.tenantId, resolved.config, new URL(req.url).origin)
  return new Response(feed.csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `inline; filename="catalogo-${resolved.config.slug}.csv"`,
      'Cache-Control': 'public, max-age=900',
      'X-Robots-Tag': 'noindex',
    },
  })
}
