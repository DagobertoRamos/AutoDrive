// =============================================================================
// OAuth dos canais (a LOJA autoriza a própria conta; o app é da plataforma).
// Segredos do SaaS (env) ≠ autorizações das lojas (cifradas por conexão).
//   Mercado Livre: ML_CLIENT_ID / ML_CLIENT_SECRET
//   OLX:           OLX_CLIENT_ID / OLX_CLIENT_SECRET (registro com suporteintegrador@olxbr.com)
//   Meta:          META_APP_ID / META_APP_SECRET (+ META_GRAPH_VERSION)
// `state` assinado (HMAC) com loja, usuário, canal e validade de 15 min; no
// retorno exigimos o MESMO usuário logado → sem CSRF nem troca de loja.
// =============================================================================

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ConnectorError } from './errors'
import { createHttpClient, throwForStatus, type HttpClient } from './connectors/http'
import { graphBase } from './connectors/meta'
import { logEvent, maskHint, releaseBlockedJobs, sealSecrets, type Actor } from './service'

export type OAuthChannel = 'MERCADO_LIVRE' | 'OLX' | 'META'

interface StateClaims { t: string; u: string; c: OAuthChannel; n: string; e: number }

function key(): string {
  const s = process.env.PUBLICATIONS_OAUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) { if (process.env.NODE_ENV === 'production') throw new Error('NEXTAUTH_SECRET ausente'); return 'dev-only-oauth-secret' }
  return s
}

export function signState(c: Omit<StateClaims, 'n' | 'e'>, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...c, n: randomBytes(8).toString('hex'), e: Math.floor(now / 1000) + 900 })).toString('base64url')
  return `${body}.${createHmac('sha256', key()).update(body).digest('base64url')}`
}

export function verifyState(state: string, now = Date.now()): StateClaims | null {
  const [body, sig] = String(state ?? '').split('.')
  if (!body || !sig) return null
  const exp = createHmac('sha256', key()).update(body).digest('base64url')
  if (sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StateClaims
    return c.e * 1000 >= now ? c : null
  } catch { return null }
}

export function redirectUri(channel: OAuthChannel): string {
  const base = (process.env.PUBLICATIONS_OAUTH_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}/api/publications/oauth/${channel.toLowerCase().replace('_', '-')}/callback`
}

export function oauthConfigured(channel: OAuthChannel): boolean {
  if (channel === 'MERCADO_LIVRE') return !!(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET)
  if (channel === 'OLX') return !!(process.env.OLX_CLIENT_ID && process.env.OLX_CLIENT_SECRET)
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET)
}

export const META_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish']

export function authorizeUrl(channel: OAuthChannel, state: string): string {
  const redirect = redirectUri(channel)
  if (channel === 'MERCADO_LIVRE') return `https://auth.mercadolivre.com.br/authorization?${new URLSearchParams({ response_type: 'code', client_id: process.env.ML_CLIENT_ID ?? '', redirect_uri: redirect, state })}`
  if (channel === 'OLX') return `https://auth.olx.com.br/oauth?${new URLSearchParams({ response_type: 'code', client_id: process.env.OLX_CLIENT_ID ?? '', redirect_uri: redirect, scope: 'autoupload basic_user_info', state })}`
  return `https://www.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/dialog/oauth?${new URLSearchParams({ client_id: process.env.META_APP_ID ?? '', redirect_uri: redirect, state, scope: META_SCOPES.join(','), response_type: 'code' })}`
}

async function upsertConnection(tenantId: string, channel: string, externalAccountId: string, label: string, secrets: Record<string, string>, hints: Record<string, string>, expiresAt: Date | null, actor: Actor) {
  const conn = await prisma.publicationConnection.upsert({
    where: { tenantId_channel_externalAccountId: { tenantId, channel, externalAccountId } },
    create: { tenantId, channel, externalAccountId, label, status: 'CONECTADO', secretsEncrypted: sealSecrets(secrets), maskedHints: hints, tokenExpiresAt: expiresAt, connectedById: actor.id, connectedAt: new Date() },
    update: { label, status: 'CONECTADO', secretsEncrypted: sealSecrets(secrets), maskedHints: hints, tokenExpiresAt: expiresAt, connectedById: actor.id, connectedAt: new Date(), disconnectedAt: null, lastError: null, throttledUntil: null },
  })
  await releaseBlockedJobs(tenantId, conn.id)
  await logEvent(prisma, { tenantId, channel, type: 'CONECTADA', message: `Conta ${label} conectada.`, actor })
  return conn
}

/** Troca o código pela autorização e grava a(s) conexão(ões) da loja. */
export async function completeOAuth(claims: StateClaims, code: string, actor: Actor, http: HttpClient = createHttpClient()): Promise<{ connected: string[] }> {
  const redirect = redirectUri(claims.c)
  if (claims.c === 'MERCADO_LIVRE') {
    const res = await http.request({ method: 'POST', url: 'https://api.mercadolibre.com/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: process.env.ML_CLIENT_ID ?? '', client_secret: process.env.ML_CLIENT_SECRET ?? '', code, redirect_uri: redirect }) })
    throwForStatus(res, 'Mercado Livre (autorização)')
    const j = res.json<{ access_token: string; refresh_token: string; expires_in: number; user_id: number }>()!
    const me = (await http.request({ url: 'https://api.mercadolibre.com/users/me', headers: { Authorization: `Bearer ${j.access_token}` } })).json<{ nickname?: string }>()
    const expiresAt = new Date(Date.now() + (j.expires_in ?? 21_600) * 1000)
    const c = await upsertConnection(claims.t, 'MERCADO_LIVRE', String(j.user_id), me?.nickname ? `ML ${me.nickname}` : `ML ${j.user_id}`, { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: String(expiresAt.getTime()), user_id: String(j.user_id) }, { conta: String(me?.nickname ?? j.user_id) }, expiresAt, actor)
    return { connected: [c.label] }
  }
  if (claims.c === 'OLX') {
    const res = await http.request({ method: 'POST', url: 'https://auth.olx.com.br/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.OLX_CLIENT_ID ?? '', client_secret: process.env.OLX_CLIENT_SECRET ?? '', redirect_uri: redirect, grant_type: 'authorization_code' }) })
    throwForStatus(res, 'OLX (autorização)')
    const token = res.json<{ access_token?: string }>()?.access_token
    if (!token) throw new ConnectorError('AUTH', 'A OLX não devolveu a chave de acesso.')
    const info = (await http.request({ method: 'POST', url: 'https://apps.olx.com.br/oauth_api/basic_user_info', headers: { 'Content-Type': 'application/json', 'User-Agent': 'AutoDrive/1.0' }, body: JSON.stringify({ access_token: token }) })).json<{ user_name?: string; user_email?: string }>() ?? {}
    const acct = info.user_email ?? info.user_name ?? 'olx'
    const c = await upsertConnection(claims.t, 'OLX', acct, `OLX ${info.user_name ?? maskHint(acct)}`, { access_token: token }, { conta: maskHint(acct) }, null, actor)
    return { connected: [c.label] }
  }
  // Meta: token de usuário → longo prazo → Páginas autorizadas (+ Instagram profissional vinculado).
  const base = graphBase()
  const short = await http.request({ url: `${base}/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID ?? '', client_secret: process.env.META_APP_SECRET ?? '', redirect_uri: redirect, code })}` })
  throwForStatus(short, 'Meta (autorização)')
  const st = short.json<{ access_token: string }>()!.access_token
  const long = await http.request({ url: `${base}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: process.env.META_APP_ID ?? '', client_secret: process.env.META_APP_SECRET ?? '', fb_exchange_token: st })}` })
  throwForStatus(long, 'Meta (token longo)')
  const lt = long.json<{ access_token: string }>()!.access_token
  const pages = await http.request({ url: `${base}/me/accounts?${new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: lt })}` })
  throwForStatus(pages, 'Meta (Páginas)')
  const list = pages.json<{ data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }> }>()?.data ?? []
  if (!list.length) throw new ConnectorError('CONFIG', 'Nenhuma Página foi autorizada.', 'Ao conectar, selecione a Página da loja e confirme as permissões.')
  const connected: string[] = []
  for (const p of list) {
    const c = await upsertConnection(claims.t, 'META_PAGE', p.id, p.name, { page_access_token: p.access_token }, { pagina: p.name }, null, actor)
    connected.push(c.label)
    if (p.instagram_business_account?.id) {
      const ig = p.instagram_business_account
      const ci = await upsertConnection(claims.t, 'INSTAGRAM', ig.id, ig.username ? `@${ig.username}` : `Instagram de ${p.name}`, { page_access_token: p.access_token, page_id: p.id }, { conta: ig.username ? `@${ig.username}` : ig.id, pagina: p.name }, null, actor)
      connected.push(ci.label)
    }
  }
  return { connected }
}
