// =============================================================================
// Site da loja — descobre, pelo endereço acessado, se a requisição é do SaaS
// (painel) ou do site público de uma loja. PURO (roda no proxy, sem banco).
//   • <slug>.<SITE_BASE_DOMAIN>  → site da loja pelo slug
//   • host do painel (APP_HOSTS, localhost, *.vercel.app) → SaaS
//   • qualquer outro host         → domínio próprio de uma loja (resolvido no
//     layout do site, que consulta o banco) — SÓ quando APP_HOSTS estiver
//     configurado. Sem ele, todo host desconhecido é tratado como painel: um
//     domínio novo do painel nunca vira "site" por engano.
// =============================================================================

/** Header que o proxy põe na requisição reescrita (links do site sem /s/<key>). */
export const SITE_HOST_HEADER = 'x-autodrive-site-host'

export type SiteHostMatch =
  | { kind: 'app' }
  | { kind: 'site'; key: string } // key = slug (sem ponto) ou host completo (com ponto)

export interface SiteHostEnv {
  appHosts?: string          // lista separada por vírgula (hosts do painel)
  siteBaseDomain?: string    // ex.: "lojas.autodrive.app"
  appUrl?: string            // NEXTAUTH_URL — o host dele é sempre painel
}

const ALWAYS_APP = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]']

export function normalizeHost(host: string | null | undefined): string {
  return String(host ?? '').trim().toLowerCase().replace(/\.$/, '').replace(/:\d+$/, '').replace(/\.$/, '')
}

export function resolveSiteHost(rawHost: string | null | undefined, env: SiteHostEnv): SiteHostMatch {
  const host = normalizeHost(rawHost)
  if (!host) return { kind: 'app' }

  const base = normalizeHost(env.siteBaseDomain)
  if (base) {
    if (host === base || host === `www.${base}`) return { kind: 'app' }
    if (host.endsWith(`.${base}`)) {
      const slug = host.slice(0, -(base.length + 1))
      // Só um nível (loja.base); "www.loja.base" também vale.
      const clean = slug.startsWith('www.') ? slug.slice(4) : slug
      if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(clean)) return { kind: 'site', key: clean }
      return { kind: 'app' }
    }
  }

  if (ALWAYS_APP.includes(host) || host.endsWith('.vercel.app') || host.endsWith('.localhost')) return { kind: 'app' }
  let appUrlHost = ''
  try { appUrlHost = env.appUrl ? normalizeHost(new URL(env.appUrl).host) : '' } catch { /* URL inválida */ }
  if (appUrlHost && host === appUrlHost) return { kind: 'app' }
  const appHosts = String(env.appHosts ?? '').split(',').map(normalizeHost).filter(Boolean)
  if (!appHosts.length || appHosts.includes(host)) return { kind: 'app' }

  return { kind: 'site', key: host }
}
