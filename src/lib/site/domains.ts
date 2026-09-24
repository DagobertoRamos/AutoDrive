// =============================================================================
// Site da loja — domínios próprios: consulta de DNS público e integração
// OPCIONAL com a Vercel (a hospedagem emite o SSL e passa a responder pelo
// domínio). A integração só age com as variáveis configuradas:
//   VERCEL_API_TOKEN, VERCEL_PROJECT_ID (e VERCEL_TEAM_ID se o projeto for de time)
// Sem elas (ex.: desenvolvimento local), só consultamos o DNS — nada é criado
// fora do sistema.
// =============================================================================

import { lookup as osLookup, resolve4, resolveCname, Resolver } from 'node:dns/promises'
import { DEFAULT_DNS_TARGETS, evaluateDns, expectedRecords, primaryDomain, type DnsLookup, type DnsRecord, type DnsTargets, type DomainStatus, type SiteDomain } from './domains-core'
import { saveSiteConfig, type SiteConfig } from './config'

const LOOKUP_TIMEOUT_MS = 4000

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), LOOKUP_TIMEOUT_MS))])
}

// Respostas definitivas ("não existe") vs. falha de rede (tentar o próximo).
const DEFINITIVE = new Set(['ENODATA', 'ENOTFOUND', 'NXDOMAIN'])
const publicResolver = (() => { const r = new Resolver({ timeout: 2500, tries: 2 }); r.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1']); return r })()

type Res = { ok: true; list: string[] } | { ok: false; definitive: boolean }
async function query(fn: () => Promise<string[]>): Promise<Res> {
  try { return { ok: true, list: await withTimeout(fn()) } } catch (e) { return { ok: false, definitive: DEFINITIVE.has(String((e as NodeJS.ErrnoException).code)) } }
}
/** Tenta cada resolvedor até ter resposta (lista ou "não existe"). */
async function chain(...fns: (() => Promise<string[]>)[]): Promise<string[]> {
  for (const fn of fns) {
    const r = await query(fn)
    if (r.ok) return r.list
    if (r.definitive) return []
  }
  return []
}

/**
 * Consulta A e CNAME do host, cada um com sua cadeia: resolvedor padrão →
 * DNS público (1.1.1.1/8.8.8.8) → resolvedor do sistema (só A). Algumas redes
 * bloqueiam DNS direto e só o resolvedor do sistema responde.
 */
export async function lookupDns(host: string): Promise<DnsLookup> {
  const [aList, cList] = await Promise.all([
    chain(() => resolve4(host), () => publicResolver.resolve4(host), async () => (await osLookup(host, { all: true, family: 4 })).map((x) => x.address)),
    chain(() => resolveCname(host), () => publicResolver.resolveCname(host)),
  ])
  const notFound = !aList.length && !cList.length
  return { a: aList, cname: cList, ...(notFound ? { error: 'NOT_FOUND' } : {}) }
}

export function dnsTargetsFromEnv(): DnsTargets {
  return { a: process.env.SITE_DNS_A || DEFAULT_DNS_TARGETS.a, cname: process.env.SITE_DNS_CNAME || DEFAULT_DNS_TARGETS.cname }
}

// ── Vercel (opcional) ────────────────────────────────────────────────────────

interface VercelCfg { token: string; project: string; team?: string }

export function vercelConfig(): VercelCfg | null {
  const token = process.env.VERCEL_API_TOKEN, project = process.env.VERCEL_PROJECT_ID
  return token && project ? { token, project, team: process.env.VERCEL_TEAM_ID || undefined } : null
}

async function vercel<T>(cfg: VercelCfg, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const url = new URL(`https://api.vercel.com${path}`)
  if (cfg.team) url.searchParams.set('teamId', cfg.team)
  const res = await fetch(url, {
    method, headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
  })
  const data = await res.json().catch(() => ({})) as T
  return { ok: res.ok, status: res.status, data }
}

interface VercelProjectDomain { name: string; verified: boolean; verification?: { type: string; domain: string; value: string; reason: string }[]; error?: { code?: string; message?: string } }
interface VercelDomainConfig { misconfigured: boolean; configuredBy: string | null; recommendedIPv4?: { rank: number; value: string[] }[]; recommendedCNAME?: { rank: number; value: string }[] }

export interface HostingResult {
  used: boolean                 // a integração está ativa?
  error?: string
  verified?: boolean
  txt?: DnsRecord               // desafio de posse (quando o domínio já existe em outra conta)
  targets?: DnsTargets          // valores recomendados para ESTE projeto
  misconfigured?: boolean
}

/** Registra (se preciso) o domínio no projeto e lê a configuração recomendada. */
export async function syncHostingDomain(host: string, redirectTo: string | null): Promise<HostingResult> {
  const cfg = vercelConfig()
  if (!cfg) return { used: false }
  try {
    let pd = await vercel<VercelProjectDomain>(cfg, 'GET', `/v9/projects/${cfg.project}/domains/${host}`)
    if (pd.status === 404) {
      pd = await vercel<VercelProjectDomain>(cfg, 'POST', `/v10/projects/${cfg.project}/domains`, { name: host, ...(redirectTo ? { redirect: redirectTo, redirectStatusCode: 308 } : {}) })
      if (!pd.ok) return { used: true, error: pd.data.error?.message || `A hospedagem recusou o domínio (${pd.status}).` }
    }
    if (pd.ok && !pd.data.verified) {
      const v = await vercel<VercelProjectDomain>(cfg, 'POST', `/v9/projects/${cfg.project}/domains/${host}/verify`)
      if (v.ok) pd = v
    }
    const conf = await vercel<VercelDomainConfig>(cfg, 'GET', `/v6/domains/${host}/config?projectIdOrName=${encodeURIComponent(cfg.project)}`)
    const rankedA = conf.data.recommendedIPv4?.sort((a, b) => a.rank - b.rank)[0]?.value?.[0]
    const rankedC = conf.data.recommendedCNAME?.sort((a, b) => a.rank - b.rank)[0]?.value
    const txt = pd.data.verification?.find((x) => x.type === 'TXT')
    return {
      used: true,
      verified: pd.data.verified,
      misconfigured: conf.ok ? conf.data.misconfigured : undefined,
      targets: { a: rankedA || dnsTargetsFromEnv().a, cname: (rankedC || dnsTargetsFromEnv().cname).replace(/\.$/, '') },
      ...(txt ? { txt: { type: 'TXT', name: txt.domain, value: txt.value } } : {}),
    }
  } catch (e) {
    return { used: true, error: `Não foi possível falar com a hospedagem: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function removeHostingDomain(host: string): Promise<void> {
  const cfg = vercelConfig()
  if (!cfg) return
  await vercel(cfg, 'DELETE', `/v9/projects/${cfg.project}/domains/${host}`).catch(() => {})
}

/** Verificação completa de um domínio: hospedagem (se ativa) + DNS público. */
export async function checkDomain(host: string, redirectTo: string | null): Promise<{ status: DomainStatus; records: DnsRecord[]; found: string[]; message: string }> {
  const hosting = await syncHostingDomain(host, redirectTo)
  const targets = hosting.targets ?? dnsTargetsFromEnv()
  const records: DnsRecord[] = [...expectedRecords(host, targets), ...(hosting.txt ? [hosting.txt] : [])]
  const dns = evaluateDns(host, await lookupDns(host), targets)

  if (hosting.error) return { status: 'ERROR', records, found: dns.found, message: hosting.error }
  if (hosting.used && hosting.verified === false && hosting.txt) {
    return { status: 'PENDING_VERIFICATION', records, found: dns.found, message: 'Este domínio já está ligado a outra conta de hospedagem. Cadastre o registro TXT abaixo para provar que ele é seu.' }
  }
  if (dns.status === 'CONNECTED' && hosting.used && hosting.misconfigured) {
    return { status: 'PENDING_DNS', records, found: dns.found, message: 'DNS apontado; aguardando a emissão do certificado de segurança (SSL). Pode levar alguns minutos.' }
  }
  if (dns.status === 'CONNECTED') {
    return hosting.used
      ? { status: 'CONNECTED', records, found: dns.found, message: 'Conectado. Certificado de segurança (SSL) ativo.' }
      : { status: 'DNS_OK', records, found: dns.found, message: 'DNS configurado corretamente. O domínio passa a responder com SSL quando for ativado na hospedagem.' }
  }
  return { status: dns.status, records, found: dns.found, message: dns.message }
}

/** Ajusta o redirecionamento de um domínio para o principal (ou remove, se for o principal). */
export async function setHostingRedirect(host: string, redirectTo: string | null): Promise<void> {
  const cfg = vercelConfig()
  if (!cfg) return
  await vercel(cfg, 'PATCH', `/v9/projects/${cfg.project}/domains/${host}`, { redirect: redirectTo, redirectStatusCode: redirectTo ? 308 : null }).catch(() => {})
}

/** Verifica os domínios do site (todos ou só `only`) e grava o status. */
export async function refreshSiteDomains(tenantId: string, userId: string, cfg: SiteConfig, only?: string): Promise<SiteConfig> {
  const primary = primaryDomain(cfg.domains)?.host ?? null
  const domains: SiteDomain[] = []
  for (const d of cfg.domains) {
    if (only && d.host !== only) { domains.push(d); continue }
    const r = await checkDomain(d.host, d.host === primary ? null : primary)
    domains.push({ ...d, ...r, lastCheckedAt: new Date().toISOString() })
  }
  return saveSiteConfig(tenantId, { ...cfg, domains }, userId)
}
