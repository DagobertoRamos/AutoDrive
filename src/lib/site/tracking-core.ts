// Site da loja — Pixel da Meta e tag do Google. Núcleo PURO (testado).
// Os IDs vêm do painel da loja; eventos só levam dados do carro (nunca nome,
// telefone, e-mail ou CPF do cliente).

export interface SiteTracking { metaPixelId: string; googleTagId: string }

export function cleanMetaPixelId(v: unknown): string {
  const s = String(v ?? '').replace(/\s/g, '')
  return /^\d{10,20}$/.test(s) ? s : ''
}

/** G- (Analytics 4), AW- (Google Ads) ou GT- (tag do Google). */
export function cleanGoogleTagId(v: unknown): string {
  const s = String(v ?? '').trim().toUpperCase()
  return /^(G|AW|GT)-[A-Z0-9]{4,20}$/.test(s) ? s : ''
}

export function sanitizeTracking(v: unknown): SiteTracking {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { metaPixelId: cleanMetaPixelId(o.metaPixelId), googleTagId: cleanGoogleTagId(o.googleTagId) }
}

const CAMPAIGN_PARAMS = /^(utm_[a-z]+|gclid|gbraid|wbraid|fbclid|msclkid)$/i

/** URL para o page_view: só os parâmetros de campanha (nada que possa ser dado do cliente). */
export function safePageUrl(href: string): string {
  try {
    const u = new URL(href)
    for (const k of [...u.searchParams.keys()]) if (!CAMPAIGN_PARAMS.test(k)) u.searchParams.delete(k)
    u.hash = ''
    return u.toString()
  } catch { return '' }
}

export type SiteEvent = 'Lead' | 'ViewContent' | 'Contact'
export interface SiteEventParams { content_ids?: string[]; content_name?: string; content_type?: string; value?: number; currency?: string; lead_type?: string }

/** Evento da Meta → evento recomendado do Google. */
export const GOOGLE_EVENT: Record<SiteEvent, string> = { Lead: 'generate_lead', ViewContent: 'view_item', Contact: 'contact' }

const ALLOWED = new Set(['content_ids', 'content_name', 'content_type', 'value', 'currency', 'lead_type'])

/** Só chaves conhecidas, sem nada que pareça dado pessoal. */
export function sanitizeEventParams(p: Record<string, unknown> = {}): SiteEventParams {
  const out: Record<string, unknown> = {}
  for (const [k, raw] of Object.entries(p)) {
    if (!ALLOWED.has(k) || raw == null) continue
    if (k === 'content_ids') {
      const ids = (Array.isArray(raw) ? raw : [raw]).map(String).filter((x) => /^[\w-]{4,40}$/.test(x))
      if (ids.length) out.content_ids = [...new Set(ids)]
    } else if (k === 'value') {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0) out.value = Math.round(n * 100) / 100
    } else {
      const s = String(raw).trim().slice(0, 120)
      if (s && !/@|\d{8,}/.test(s)) out[k] = s
    }
  }
  return out as SiteEventParams
}
