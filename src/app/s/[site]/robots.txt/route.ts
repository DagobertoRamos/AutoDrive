// GET /robots.txt do site da loja: libera o site e aponta o sitemap.
import { resolveSite } from '@/lib/site/config'
import { publicSiteRoot } from '@/lib/site/config-core'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const r = await resolveSite(site)
  const text = !r
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${publicSiteRoot(r.config, process.env.SITE_BASE_DOMAIN, new URL(req.url).origin)}/sitemap.xml\n`
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
