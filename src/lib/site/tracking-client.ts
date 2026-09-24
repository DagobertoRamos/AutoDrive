// Site da loja — Pixel da Meta e tag do Google no navegador. Nada carrega
// antes do visitante aceitar os cookies (LGPD). siteTrack() é seguro de chamar
// sempre: sem consentimento ou sem IDs configurados, não faz nada.
import { GOOGLE_EVENT, safePageUrl, sanitizeEventParams, type SiteEvent } from './tracking-core'

type Fn = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[][]; loaded?: boolean; version?: string; push?: unknown }
declare global {
  interface Window { fbq?: Fn; _fbq?: Fn; dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; __siteTracking?: { pixel: string; google: string } }
}

export const CONSENT_COOKIE = 'site_analytics_consent'
export type Consent = 'unknown' | 'accepted' | 'rejected'

export function readConsent(): Consent {
  if (typeof document === 'undefined') return 'unknown'
  const v = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.split('=')[1]
  return v === 'accepted' || v === 'rejected' ? v : 'unknown'
}

export function writeConsent(v: Exclude<Consent, 'unknown'>) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=${v}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`
}

function addScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return
  const s = document.createElement('script'); s.async = true; s.src = src
  document.head.appendChild(s)
}

export const TRACKING_READY_EVENT = 'site-tracking-ready'

/** Carrega e inicia as tags configuradas (chamar só com consentimento). */
export function startTags(pixel: string, google: string) {
  const first = !window.__siteTracking
  window.__siteTracking = { pixel, google }
  if (pixel && !window.fbq) {
    const fbq: Fn = (...args) => { if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue?.push(args) }
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = []
    window.fbq = fbq; window._fbq = fbq
    addScript('https://connect.facebook.net/en_US/fbevents.js')
    fbq('init', pixel)
  }
  if (google && !window.gtag) {
    window.dataLayer = window.dataLayer || []
    // gtag precisa empurrar o objeto `arguments` (não um array) no dataLayer.
    window.gtag = function gtag() { // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments)
    }
    window.gtag('js', new Date())
    window.gtag('config', google, { send_page_view: false })
    addScript(`https://www.googletagmanager.com/gtag/js?id=${google}`)
  }
  // Avisa quem esperava o aceite (ex.: carro aberto antes de aceitar os cookies).
  if (first) window.dispatchEvent(new Event(TRACKING_READY_EVENT))
}

export function trackPageView() {
  if (readConsent() !== 'accepted' || !window.__siteTracking) return
  window.fbq?.('track', 'PageView')
  window.gtag?.('event', 'page_view', { page_location: safePageUrl(location.href), page_title: document.title })
}

const recent = new Map<string, number>()

export function siteTrack(event: SiteEvent, params: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || readConsent() !== 'accepted' || !window.__siteTracking) return
  const p = sanitizeEventParams(params)
  const sig = `${event}:${JSON.stringify(p)}`
  if (Date.now() - (recent.get(sig) ?? 0) < 1500) return
  recent.set(sig, Date.now())
  window.fbq?.('track', event, p)
  if (window.gtag) {
    const g: Record<string, unknown> = { ...p }
    if (p.content_ids) g.items = p.content_ids.map((id) => ({ item_id: id, item_name: p.content_name }))
    window.gtag('event', GOOGLE_EVENT[event], g)
  }
}
