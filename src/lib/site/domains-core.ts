// =============================================================================
// Site da loja — domínios próprios. Núcleo PURO (testado), no padrão dos
// grandes (Shopify / Vercel / Wix):
//   1. o lojista digita "sualoja.com.br" → cadastramos o raiz E o www; o www é
//      o principal e o raiz redireciona para ele;
//   2. mostramos os registros DNS exatos (A no raiz, CNAME no www/subdomínio);
//   3. "Verificar agora" compara o DNS público com o esperado e explica o que
//      falta ("hoje aponta para X, precisa apontar para Y");
//   4. conectado → SSL emitido automaticamente pela hospedagem.
// =============================================================================

import { normalizeHost } from './host'

// DNS_OK = DNS certo, mas a hospedagem ainda não confirmou/emitiu o SSL.
export type DomainStatus = 'PENDING_DNS' | 'PENDING_VERIFICATION' | 'DNS_OK' | 'CONNECTED' | 'ERROR'

export interface DnsRecord { type: 'A' | 'CNAME' | 'TXT'; name: string; value: string }

export interface SiteDomain {
  host: string
  primary: boolean
  status: DomainStatus
  records: DnsRecord[]          // o que o lojista precisa cadastrar
  found?: string[]              // o que o DNS público mostra hoje
  message?: string              // explicação do status, em português
  lastCheckedAt?: string
}

export interface DnsTargets { a: string; cname: string }
/** Valores genéricos documentados pela Vercel; a integração troca pelos recomendados do projeto. */
export const DEFAULT_DNS_TARGETS: DnsTargets = { a: '76.76.21.21', cname: 'cname.vercel-dns.com' }
/** Faixas anycast da Vercel (projetos novos recebem IPs do pool, não só o 76.76.21.21). */
export const HOSTING_IP_PREFIXES = ['76.76.21.', '216.198.79.', '64.29.17.']
const isHostingIp = (ip: string, target: string) => ip === target || HOSTING_IP_PREFIXES.some((p) => ip.startsWith(p))

// Sufixos de 2 níveis comuns (raiz = 3 partes): registro.br e alguns internacionais.
const TWO_LEVEL_SUFFIXES = new Set([
  'com.br', 'net.br', 'org.br', 'ind.br', 'eco.br', 'adv.br', 'art.br', 'blog.br', 'app.br', 'dev.br', 'eti.br', 'inf.br',
  'log.br', 'emp.br', 'srv.br', 'tur.br', 'vet.br', 'imb.br', 'etc.br', 'rec.br', 'tv.br', 'wiki.br', 'agr.br', 'far.br',
  'co.uk', 'org.uk', 'com.ar', 'com.pt', 'com.mx', 'com.co', 'com.au', 'co.nz',
])

export const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/

/** Domínio registrado (raiz) de um host: www.loja.com.br → loja.com.br. */
export function apexOf(host: string): string {
  const parts = normalizeHost(host).split('.')
  const lastTwo = parts.slice(-2).join('.')
  const n = TWO_LEVEL_SUFFIXES.has(lastTwo) ? 3 : 2
  return parts.slice(-n).join('.')
}

export function isApex(host: string): boolean {
  return normalizeHost(host) === apexOf(host)
}

/** Limpa o que o lojista digitou ("https://WWW.Loja.com.br/estoque") → "www.loja.com.br". */
export function cleanDomainInput(raw: string): string {
  let s = String(raw ?? '').trim().toLowerCase()
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '')
  return normalizeHost(s)
}

/**
 * Hosts a cadastrar a partir do que foi digitado. Raiz ou www → os dois (www
 * principal). Outro subdomínio (loja.grupo.com.br) → só ele.
 */
export function suggestHosts(raw: string): { hosts: string[]; primary: string } | { error: string } {
  const host = cleanDomainInput(raw)
  if (!HOST_RE.test(host)) return { error: 'Digite um domínio válido, por exemplo: sualoja.com.br' }
  const apex = apexOf(host)
  if (host === apex || host === `www.${apex}`) return { hosts: [`www.${apex}`, apex], primary: `www.${apex}` }
  return { hosts: [host], primary: host }
}

/** Registro DNS esperado para um host. */
export function expectedRecords(host: string, targets: DnsTargets = DEFAULT_DNS_TARGETS): DnsRecord[] {
  const h = normalizeHost(host)
  const apex = apexOf(h)
  if (h === apex) return [{ type: 'A', name: '@', value: targets.a }]
  return [{ type: 'CNAME', name: h.slice(0, -(apex.length + 1)), value: targets.cname }]
}

export interface DnsLookup { a: string[]; cname: string[]; error?: string }

const stripDot = (s: string) => s.toLowerCase().replace(/\.$/, '')

/**
 * Compara o DNS público com o esperado. `acceptedTargets` permite aceitar
 * variações (ex.: CNAME dinâmico do projeto e o genérico).
 */
export function evaluateDns(host: string, lookup: DnsLookup, targets: DnsTargets = DEFAULT_DNS_TARGETS): { status: DomainStatus; found: string[]; message: string } {
  const exp = expectedRecords(host, targets)[0]
  const found = [...lookup.cname.map((c) => `CNAME ${stripDot(c)}`), ...lookup.a.map((ip) => `A ${ip}`)]
  const cnameOk = lookup.cname.some((c) => {
    const v = stripDot(c)
    return v === stripDot(targets.cname) || v.endsWith('.vercel-dns.com') || /\.vercel-dns-\d+\.com$/.test(v)
  })
  const aOk = lookup.a.length > 0 && lookup.a.every((ip) => isHostingIp(ip, targets.a))

  if (exp.type === 'CNAME' && cnameOk) return { status: 'CONNECTED', found, message: 'DNS configurado corretamente.' }
  if (exp.type === 'A' && aOk) return { status: 'CONNECTED', found, message: 'DNS configurado corretamente.' }
  // Alguns provedores achatam CNAME em A (Cloudflare, ALIAS/ANAME).
  if (exp.type === 'CNAME' && aOk) return { status: 'CONNECTED', found, message: 'DNS configurado (via A/ALIAS).' }

  if (lookup.error === 'NOT_FOUND' || found.length === 0) {
    return { status: 'PENDING_DNS', found, message: `Nenhum registro encontrado para ${host}. Cadastre o registro ${exp.type} abaixo no painel do seu provedor de domínio.` }
  }
  const now = found.join(', ')
  return { status: 'PENDING_DNS', found, message: `Hoje ${host} aponta para ${now}. Troque para ${exp.type} ${exp.value}${lookup.a.length > 1 ? ' e apague os outros registros A antigos' : ''}.` }
}

/** Normaliza a lista gravada (aceita o formato antigo: array de strings). */
export function sanitizeDomains(input: unknown): SiteDomain[] {
  if (!Array.isArray(input)) return []
  const out: SiteDomain[] = []
  for (const raw of input.slice(0, 10)) {
    const o = typeof raw === 'string' ? { host: raw } : (raw && typeof raw === 'object' ? raw as Record<string, unknown> : null)
    if (!o) continue
    const host = cleanDomainInput(String(o.host ?? ''))
    if (!HOST_RE.test(host) || out.some((d) => d.host === host)) continue
    const status = ['PENDING_DNS', 'PENDING_VERIFICATION', 'DNS_OK', 'CONNECTED', 'ERROR'].includes(String(o.status)) ? o.status as DomainStatus : 'PENDING_DNS'
    const records = Array.isArray(o.records)
      ? (o.records as Record<string, unknown>[]).filter((r) => r && ['A', 'CNAME', 'TXT'].includes(String(r.type)))
          .map((r) => ({ type: r.type as DnsRecord['type'], name: String(r.name ?? '').slice(0, 253), value: String(r.value ?? '').slice(0, 500) }))
      : expectedRecords(host)
    out.push({
      host, primary: Boolean(o.primary), status, records,
      ...(Array.isArray(o.found) ? { found: (o.found as unknown[]).map(String).slice(0, 10) } : {}),
      ...(typeof o.message === 'string' ? { message: o.message.slice(0, 400) } : {}),
      ...(typeof o.lastCheckedAt === 'string' ? { lastCheckedAt: o.lastCheckedAt } : {}),
    })
  }
  // Exatamente um principal (o primeiro www, senão o primeiro).
  if (out.length && out.filter((d) => d.primary).length !== 1) {
    const idx = Math.max(0, out.findIndex((d) => d.host.startsWith('www.')))
    out.forEach((d, i) => { d.primary = i === idx })
  }
  return out
}

export function primaryDomain(domains: SiteDomain[]): SiteDomain | null {
  return domains.find((d) => d.primary) ?? domains[0] ?? null
}
