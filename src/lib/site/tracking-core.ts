// Site da loja — Pixel da Meta e tag do Google. Núcleo PURO (testado).
// Os IDs vêm do painel da loja; eventos só levam dados do carro (nunca nome,
// telefone, e-mail ou CPF do cliente).

export interface SiteTracking { metaPixelId: string; googleTagId: string }

/**
 * Aceita o ID puro OU o código inteiro que a Meta manda colar no site
 * (<script>… fbq('init', '123…') … <noscript>…tr?id=123…</noscript>).
 * O script em si nunca é gravado: o site monta o dele (com consentimento de cookies).
 */
export function cleanMetaPixelId(v: unknown): string {
  const raw = String(v ?? '')
  const s = raw.replace(/\s/g, '')
  if (/^\d{10,20}$/.test(s)) return s
  const m = raw.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/) ?? raw.match(/facebook\.com\/tr\?[^"'\s]*?\bid=(\d{10,20})/)
  return m ? m[1] : ''
}

/** G- (Analytics 4), AW- (Google Ads) ou GT- (tag do Google). Aceita também o código gtag.js inteiro. */
export function cleanGoogleTagId(v: unknown): string {
  const raw = String(v ?? '')
  const s = raw.trim().toUpperCase()
  if (/^(G|AW|GT)-[A-Z0-9]{4,20}$/.test(s)) return s
  const m = raw.match(/gtag\/js\?id=((?:G|AW|GT)-[A-Z0-9]{4,20})/i) ?? raw.match(/gtag\(\s*['"]config['"]\s*,\s*['"]((?:G|AW|GT)-[A-Z0-9]{4,20})['"]/i)
  return m ? m[1].toUpperCase() : ''
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

/**
 * Script inline que vai no HTML de TODA página do site da loja (renderizado no
 * servidor), para a Meta (Pixel Helper / Gerenciador de Eventos) e o Google
 * (Tag Assistant) DETECTAREM a instalação — antes, as tags só entravam depois
 * do "Aceitar" e nenhum verificador as encontrava.
 *
 * LGPD continua valendo pelo modo de consentimento:
 *   • Meta: fbq('consent','revoke') antes do init → nada é enviado até o grant;
 *   • Google: consent default "denied" + config sem page_view → nenhuma coleta;
 *   • quem já aceitou (cookie) começa com consentimento concedido.
 * O aceite no aviso de cookies chama grant/update (tracking-client.startTags).
 * IDs passam por cleanMetaPixelId/cleanGoogleTagId (só dígitos / G-, AW-, GT-).
 */
export function tagBootstrapScript(pixelId: string, googleTagId: string, consentCookie: string): string {
  const pixel = cleanMetaPixelId(pixelId)
  const google = cleanGoogleTagId(googleTagId)
  if (!pixel && !google) return ''
  // Sem regex de propósito (nada de barras invertidas dentro do script gerado).
  const cookie = JSON.stringify(`${consentCookie}=accepted`)
  const parts = [`var ok=document.cookie.split(';').some(function(c){return c.trim()===${cookie}});`]
  if (pixel) {
    parts.push(
      "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};" +
      "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;" +
      "s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');",
      "fbq('consent',ok?'grant':'revoke');",
      `fbq('init',${JSON.stringify(pixel)});`,
    )
  }
  if (google) {
    parts.push(
      'window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};',
      "var st=ok?'granted':'denied';",
      "gtag('consent','default',{ad_storage:st,analytics_storage:st,ad_user_data:st,ad_personalization:st});",
      "gtag('js',new Date());",
      `gtag('config',${JSON.stringify(google)},{send_page_view:false});`,
    )
  }
  return `(function(){${parts.join('')}})();`
}
