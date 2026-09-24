// =============================================================================
// POST /api/site/[site]/track — contador de visitas do site da loja (porta do
// /api/track do dagobertoeasycar). Eventos anônimos: sem IP, sem dado pessoal;
// só cidade/estado aproximados do cabeçalho da hospedagem. Responde sempre 204;
// o que não for válido é ignorado. Robôs e a equipe logada no painel não contam.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveSite } from '@/lib/site/config'
import { deviceOf, isBot, sectionOf, sitePath, sourceOf, VISIT_ID_RE } from '@/lib/site/analytics-core'

export const runtime = 'nodejs'

const EVENTS: Record<string, string> = { pageview: 'PAGEVIEW', whatsapp_click: 'WHATSAPP_CLICK' }
const PANEL_COOKIES = ['next-auth.session-token', '__Secure-next-auth.session-token']

function header(req: NextRequest, name: string) {
  const v = req.headers.get(name)
  if (!v) return null
  try { return decodeURIComponent(v).slice(0, 80) } catch { return v.slice(0, 80) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ site: string }> }) {
  const done = new NextResponse(null, { status: 204 })
  const ua = req.headers.get('user-agent') ?? ''
  if (isBot(ua) || PANEL_COOKIES.some((c) => req.cookies.get(c)?.value)) return done
  if (Number(req.headers.get('content-length') ?? 0) > 4000) return done

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const event = EVENTS[String(body?.event ?? '')]
  if (!body || !event) return done
  const visitorId = String(body.visitorId ?? ''), sessionId = String(body.sessionId ?? '')
  if (!VISIT_ID_RE.test(visitorId) || !VISIT_ID_RE.test(sessionId)) return done

  const { site } = await params
  const resolved = await resolveSite(site).catch(() => null)
  if (!resolved) return done

  const path = sitePath(String(body.path ?? '/').slice(0, 300), decodeURIComponent(site))
  if (!path.startsWith('/')) return done
  const search = new URLSearchParams(String(body.search ?? '').slice(0, 1000))
  const referrer = String(body.referrer ?? '').slice(0, 500)
  let referrerHost: string | null = null
  try { referrerHost = referrer ? new URL(referrer).hostname.replace(/^www\./, '').slice(0, 120) : null } catch { /* ignora */ }
  const { section, vehicleId } = sectionOf(path)
  // Depois da primeira página da sessão, o resto é navegação interna.
  const source = body.landing === true ? sourceOf(referrer, req.nextUrl.hostname, search) : 'interno'

  await prisma.siteEvent.create({
    data: {
      tenantId: resolved.tenantId, event, visitorId, sessionId,
      isNewVisitor: body.isNew === true && event === 'PAGEVIEW',
      path, section, vehicleId,
      searchQuery: section === 'estoque' ? search.get('q')?.trim().toLowerCase().slice(0, 80) || null : null,
      referrerHost: source === 'interno' ? null : referrerHost, source,
      utmSource: search.get('utm_source')?.slice(0, 120) || null,
      utmMedium: search.get('utm_medium')?.slice(0, 120) || null,
      utmCampaign: search.get('utm_campaign')?.slice(0, 160) || null,
      city: header(req, 'x-vercel-ip-city'), region: header(req, 'x-vercel-ip-country-region'),
      device: deviceOf(ua),
    },
  }).catch((e) => console.error('[site-track]', e instanceof Error ? e.message : e))
  return done
}
