// =============================================================================
// Credere — conexão da loja por OAuth 2.0 (authorization_code).
// A loja entra na conta Credere DELA e autoriza o AutoDrive; guardamos o token
// (cifrado) na conexão da loja. client_id/secret = aplicativo AutoDrive na
// Credere (pedido em api@meucredere.com.br), em CREDERE_CLIENT_ID/SECRET.
// =============================================================================

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { CREDERE_API, credereAppCredentials, credereErrorMessage } from './credere'

export const CREDERE_SCOPE = 'simulator proposals'

export function credereRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/settings/financing/credere/callback`
}

function stateSecret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.FINANCE_ENCRYPTION_KEY
  if (!s) throw new Error('NEXTAUTH_SECRET ausente.')
  return s
}

/** state assinado: loja + usuário + validade (10 min). Evita CSRF e troca de loja. */
export function signState(tenantId: string, userId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ t: tenantId, u: userId, e: now + 10 * 60_000, n: randomBytes(8).toString('hex') })).toString('base64url')
  const sig = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyState(state: string | null, now = Date.now()): { tenantId: string; userId: string } | null {
  if (!state || !state.includes('.')) return null
  const [body, sig] = state.split('.')
  const expected = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  const a = Buffer.from(sig); const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { t?: string; u?: string; e?: number }
    if (!o.t || !o.u || !o.e || o.e < now) return null
    return { tenantId: o.t, userId: o.u }
  } catch { return null }
}

export function authorizeUrl(origin: string, state: string): string | null {
  const app = credereAppCredentials()
  if (!app) return null
  const q = new URLSearchParams({ response_type: 'code', scope: CREDERE_SCOPE, client_id: app.clientId, redirect_uri: credereRedirectUri(origin), state })
  return `${CREDERE_API}/v1/authorize?${q.toString()}`
}

export interface CredereTokenResult {
  accessToken: string; refreshToken: string; expiresAt: string
  user: { id: number | null; name: string; cpf: string }
}

export async function exchangeCode(origin: string, code: string): Promise<CredereTokenResult> {
  const app = credereAppCredentials()
  if (!app) throw new Error('Aplicativo Credere não configurado (CREDERE_CLIENT_ID/CREDERE_CLIENT_SECRET).')
  const res = await fetch(`${CREDERE_API}/v1/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code, grant_type: 'authorization_code', scope: CREDERE_SCOPE, redirect_uri: credereRedirectUri(origin), client_id: app.clientId, client_secret: app.clientSecret }),
    signal: AbortSignal.timeout(15_000),
  })
  const b = await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id?: number; name?: string; cpf?: string } }
  if (!res.ok || !b.access_token) throw new Error(credereErrorMessage(b) ?? `A Credere recusou a autorização (HTTP ${res.status}).`)
  return {
    accessToken: b.access_token, refreshToken: b.refresh_token ?? '',
    expiresAt: new Date(Date.now() + (Number(b.expires_in) || 15_552_000) * 1000).toISOString(),
    user: { id: b.user?.id ?? null, name: b.user?.name ?? '', cpf: (b.user?.cpf ?? '').replace(/\D/g, '') },
  }
}

export interface CredereStore { id: number; name: string; cnpj: string; uf: string; city: string }

export async function listStores(accessToken: string): Promise<CredereStore[]> {
  const res = await fetch(`${CREDERE_API}/v1/stores?per_page=20`, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return []
  const b = await res.json().catch(() => ({})) as { stores?: { id: number; name?: string; display_name?: string; cnpj?: string; uf?: string; city?: string }[] }
  return (b.stores ?? []).map((s) => ({ id: s.id, name: s.display_name || s.name || `Loja ${s.id}`, cnpj: (s.cnpj ?? '').replace(/\D/g, ''), uf: s.uf ?? '', city: s.city ?? '' }))
}

/** Loja da Credere que corresponde à loja do AutoDrive (CNPJ), senão a única/primeira. */
export function pickStore(stores: CredereStore[], tenantCnpj: string | null | undefined): CredereStore | null {
  const cnpj = (tenantCnpj ?? '').replace(/\D/g, '')
  return (cnpj && stores.find((s) => s.cnpj === cnpj)) || stores[0] || null
}
