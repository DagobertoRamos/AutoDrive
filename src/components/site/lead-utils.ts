// Utilitários dos formulários do site (máscaras, rastreio de campanha, envio).
import { siteTrack } from '@/lib/site/tracking-client'

export function phoneMask(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function moneyMask(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  return digits ? (Number(digits) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''
}

export function todayIso() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid'] as const
const FIRST_KEY = 'ad_first_touch'
const LAST_KEY = 'ad_last_touch'
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

function readStore(store: 'local' | 'session', key: string): Record<string, string> | null {
  try {
    const raw = (store === 'local' ? window.localStorage : window.sessionStorage).getItem(key)
    return raw ? JSON.parse(raw) as Record<string, string> : null
  } catch { return null }
}

/**
 * Guarda a campanha da página de entrada (só parâmetros de campanha, nada do
 * cliente): a primeira fica no navegador (primeiro toque), a da visita atual
 * na sessão (último toque). Chamado em toda página do site.
 */
export function rememberCampaign() {
  try {
    const url = new URL(window.location.href)
    const params: Record<string, string> = {}
    for (const k of CAMPAIGN_KEYS) { const v = url.searchParams.get(k); if (v) params[camel(k)] = v.slice(0, 300) }
    const external = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer.slice(0, 300) : ''
    if (!Object.keys(params).length && !external) return
    const touch = { ...params, landingPage: `${url.origin}${url.pathname}`.slice(0, 300), ...(external ? { referrer: external } : {}), at: new Date().toISOString() }
    window.sessionStorage.setItem(LAST_KEY, JSON.stringify(touch))
    if (!window.localStorage.getItem(FIRST_KEY)) window.localStorage.setItem(FIRST_KEY, JSON.stringify(touch))
  } catch { /* navegador sem armazenamento: segue sem atribuição */ }
}

function tracking() {
  const url = new URL(window.location.href)
  const last = readStore('session', LAST_KEY) ?? {}
  const first = readStore('local', FIRST_KEY)
  const pick = (k: string) => url.searchParams.get(k) ?? last[camel(k)] ?? ''
  return {
    pageUrl: url.href,
    ...Object.fromEntries(CAMPAIGN_KEYS.map((k) => [camel(k), pick(k)])),
    landingPage: last.landingPage ?? '',
    referrer: last.referrer ?? '',
    firstTouch: first ? JSON.stringify(first).slice(0, 500) : '',
  }
}

export type SubmitResult = { ok: true; protocol: string | null; uploadToken?: string; evaluationToken?: string } | { ok: false; error: string }

export async function submitSiteLead(apiUrl: string, payload: Record<string, unknown>): Promise<SubmitResult> {
  try {
    const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...tracking() }) })
    const j = await res.json().catch(() => ({})) as { error?: string; protocol?: string | null; uploadToken?: string; evaluationToken?: string }
    if (!res.ok) return { ok: false, error: j.error ?? 'Não foi possível enviar agora.' }
    // Conversão para Meta/Google (só com consentimento; sem dados do cliente).
    siteTrack('Lead', { lead_type: String(payload.kind ?? ''), content_ids: payload.vehicleId ? [String(payload.vehicleId)] : undefined, content_type: payload.vehicleId ? 'vehicle' : undefined })
    return { ok: true, protocol: j.protocol ?? null, uploadToken: j.uploadToken, evaluationToken: j.evaluationToken }
  } catch {
    return { ok: false, error: 'Sem conexão. Tente novamente ou fale pelo WhatsApp.' }
  }
}

/** Campo-isca: invisível para pessoas, robôs preenchem. */
export const HONEYPOT_STYLE = { position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' } as const
