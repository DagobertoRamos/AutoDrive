// =============================================================================
// Site da loja — contador de visitas. Núcleo PURO (testado), porta do
// site-analytics do dagobertoeasycar: classifica página, origem e aparelho.
// =============================================================================

import { vehicleIdFromSlug } from './listing-core'

export const SECTION_LABELS: Record<string, string> = {
  home: 'Página inicial', estoque: 'Estoque (lista)', veiculo: 'Anúncio de veículo', financiamento: 'Financiamento',
  contato: 'Contato', sobre: 'Quem somos', privacidade: 'Privacidade', termos: 'Termos de uso', cookies: 'Cookies', 'venda-seu-carro': 'Venda seu carro', 'encontre-seu-carro': 'Encontre seu carro',
  'financia-facil': 'Financia Fácil', atacado: 'Atacado', marca: 'Páginas por marca', cidade: 'Páginas por cidade', outros: 'Outras páginas',
}

export const SOURCE_LABELS: Record<string, string> = {
  direto: 'Direto / digitado', google: 'Google (orgânico)', google_ads: 'Google Ads', meta: 'Instagram / Facebook', meta_ads: 'Meta Ads',
  whatsapp: 'WhatsApp', outros_buscadores: 'Outros buscadores', site_externo: 'Outros sites', interno: 'Navegação interna',
}

export const DEVICE_LABELS: Record<string, string> = { celular: 'Celular', computador: 'Computador', tablet: 'Tablet' }

/** Caminho relativo ao site: tira o prefixo /s/<chave> da rota de teste. */
export function sitePath(pathname: string, key: string): string {
  const p = pathname.split('?')[0] || '/'
  const prefix = `/s/${key}`
  if (p === prefix) return '/'
  return p.startsWith(`${prefix}/`) ? p.slice(prefix.length) : p
}

export function sectionOf(path: string): { section: string; vehicleId: string | null } {
  if (path === '/' || path === '') return { section: 'home', vehicleId: null }
  const v = /^\/veiculos\/([^/]+)\/?$/.exec(path)
  if (v) return { section: 'veiculo', vehicleId: vehicleIdFromSlug(decodeURIComponent(v[1])) }
  if (/^\/veiculos\/?$/.test(path)) return { section: 'estoque', vehicleId: null }
  const first = path.split('/')[1] ?? ''
  return { section: SECTION_LABELS[first] ? first : 'outros', vehicleId: null }
}

export function sourceOf(referrer: string, siteHost: string, params: URLSearchParams): string {
  const utmSource = (params.get('utm_source') ?? '').toLowerCase()
  const paid = /cpc|ppc|paid|ads/.test((params.get('utm_medium') ?? '').toLowerCase())
  if (params.has('gclid') || params.has('gbraid') || params.has('wbraid') || (/google/.test(utmSource) && paid)) return 'google_ads'
  if (params.has('fbclid') && paid) return 'meta_ads'
  if (/facebook|instagram|meta|^fb$|^ig$/.test(utmSource)) return paid ? 'meta_ads' : 'meta'
  if (/whats/.test(utmSource)) return 'whatsapp'
  if (utmSource === 'google') return 'google'
  let host = ''
  try { host = referrer ? new URL(referrer).hostname.replace(/^www\./, '') : '' } catch { /* referrer inválido */ }
  if (!host) return params.has('fbclid') ? 'meta' : 'direto'
  if (host === siteHost.replace(/^www\./, '')) return 'interno'
  if (/(^|\.)google\./.test(host)) return 'google'
  if (/facebook\.com|instagram\.com|fb\.com|l\.messenger/.test(host)) return 'meta'
  if (/whatsapp\.com|wa\.me/.test(host)) return 'whatsapp'
  if (/bing\.com|yahoo\.|duckduckgo|ecosia|yandex/.test(host)) return 'outros_buscadores'
  return 'site_externo'
}

export function deviceOf(ua: string): string {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'celular'
  return 'computador'
}

export function isBot(ua: string): boolean {
  return !ua || /bot|crawl|spider|slurp|facebookexternalhit|whatsapp\/|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|vercel/i.test(ua)
}

export const VISIT_ID_RE = /^[0-9a-f-]{16,64}$/i
