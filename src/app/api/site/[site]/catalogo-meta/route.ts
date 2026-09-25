// GET /api/site/[site]/catalogo-meta — feed CSV do catálogo Meta da loja
// (Facebook/Instagram/WhatsApp). Público: só dados que já estão no site.
// A loja cadastra esta URL como "feed programado" no Gerenciador de Commerce.
// Proteção (lib/publications/feed-guard-core): a Meta trata item ausente como
// "remover". Falha interna ou queda brusca → serve o último feed bom (até
// 24 h) ou 503 para a Meta tentar depois — nunca um feed vazio por erro.
import { prisma } from '@/lib/prisma'
import { resolveSite } from '@/lib/site/config'
import { generateMetaFeed } from '@/lib/site/meta-feed'
import { SITE_VISIBLE_STOCK } from '@/lib/site/listing-core'
import { decideFeed } from '@/lib/publications/feed-guard-core'

export const dynamic = 'force-dynamic'

const snapKey = (tenantId: string) => `t:${tenantId}:site:metafeed:lastgood`

export async function GET(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const resolved = await resolveSite(site)
  if (!resolved || !resolved.config.catalog.enabled) return new Response('Catálogo não disponível.', { status: 404 })
  const tenantId = resolved.tenantId

  let csv = ''; let generated: { ok: true; exported: number } | { ok: false; error: string }
  try {
    const feed = await generateMetaFeed(tenantId, resolved.config, new URL(req.url).origin)
    csv = feed.csv; generated = { ok: true, exported: feed.exported }
  } catch (e) {
    generated = { ok: false, error: (e as Error).message?.slice(0, 200) ?? 'erro' }
  }
  const snapRow = await prisma.systemSetting.findFirst({ where: { key: snapKey(tenantId) }, select: { value: true } }).catch(() => null)
  let snap: { csv: string; exported: number; at: string } | null = null
  try { snap = snapRow ? JSON.parse(snapRow.value) : null } catch { snap = null }
  const visibleStock = await prisma.vehicle.count({ where: { tenantId, active: true, stockStatus: { in: [...SITE_VISIBLE_STOCK] } } }).catch(() => null)
  const decision = decideFeed({ generated, lastGood: snap ? { exported: snap.exported, at: new Date(snap.at) } : null, visibleStock })

  const headers = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `inline; filename="catalogo-${resolved.config.slug}.csv"`,
    'Cache-Control': 'public, max-age=900',
    'X-Robots-Tag': 'noindex',
    'X-Feed-Decision': decision.serve,
  }
  if (decision.serve === 'UNAVAILABLE') {
    console.error('[catalogo-meta] feed retido', tenantId, decision.reason)
    return new Response('Feed temporariamente indisponível.', { status: 503, headers: { 'Retry-After': '900', 'Cache-Control': 'no-store' } })
  }
  if (decision.serve === 'LAST_GOOD' && snap) {
    console.warn('[catalogo-meta] servindo último feed bom', tenantId, decision.reason)
    return new Response(snap.csv, { headers })
  }
  if (generated.ok && generated.exported > 0) {
    const value = JSON.stringify({ csv, exported: generated.exported, at: new Date().toISOString() })
    await prisma.systemSetting.upsert({ where: { key: snapKey(tenantId) }, create: { key: snapKey(tenantId), tenantId, value, group: 'site' }, update: { value } }).catch(() => undefined)
  }
  return new Response(csv, { headers })
}
