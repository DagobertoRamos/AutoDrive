// =============================================================================
// Site da loja — páginas de entrada do Google (porta do seo-landings do
// dagobertoeasycar): uma por marca com carro no estoque e uma por cidade que a
// loja atende; sitemap.xml. PURO (testado).
// =============================================================================

import { slugify } from './config-core'

export interface SeoCity { name: string; slug: string; text: string }
export interface BrandLanding { slug: string; name: string; total: number; minPrice: number | null; maxPrice: number | null }

export const MAX_SEO_CITIES = 12

export function sanitizeSeoCities(v: unknown): SeoCity[] {
  if (!Array.isArray(v)) return []
  const out: SeoCity[] = []
  for (const x of v) {
    const o = (x && typeof x === 'object' ? x : { name: x }) as Record<string, unknown>
    const name = String(o.name ?? '').trim().slice(0, 60)
    const slug = slugify(name, 60)
    if (!name || !slug || out.some((c) => c.slug === slug)) continue
    out.push({ name, slug, text: String(o.text ?? '').trim().slice(0, 400) })
    if (out.length >= MAX_SEO_CITIES) break
  }
  return out
}

/** Marcas com carro visível no site, da que tem mais para a que tem menos. */
export function brandLandings(vehicles: { brand: string; price: number | null }[]): BrandLanding[] {
  const map = new Map<string, BrandLanding>()
  for (const v of vehicles) {
    const name = v.brand.trim()
    const slug = slugify(name)
    if (!slug) continue
    const b = map.get(slug) ?? { slug, name, total: 0, minPrice: null, maxPrice: null }
    b.total++
    if (v.price != null && v.price > 0) {
      b.minPrice = b.minPrice == null ? v.price : Math.min(b.minPrice, v.price)
      b.maxPrice = b.maxPrice == null ? v.price : Math.max(b.maxPrice, v.price)
    }
    map.set(slug, b)
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function sitemapXml(entries: { url: string; lastModified?: Date; priority?: number }[]): string {
  const rows = entries.map((e) => `  <url><loc>${xmlEsc(e.url)}</loc>${e.lastModified ? `<lastmod>${e.lastModified.toISOString().slice(0, 10)}</lastmod>` : ''}${e.priority != null ? `<priority>${e.priority.toFixed(1)}</priority>` : ''}</url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`
}
