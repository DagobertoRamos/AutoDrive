// =============================================================================
// Banco PAN — transporte: HTTPS + token da OpenAPI Veículos em cache.
//
// Token: POST /veiculos/v0/tokens com ApiKey, Basic base64(APIKEY:SECRETKEY) e o
// usuário/senha de integração DA LOJA no corpo. O PAN limita a 5 pedidos/min por
// usuário — por isso o token fica em cache por (ambiente, ApiKey, usuário) e
// pedidos simultâneos dividem a mesma emissão.
// Nada aqui é logado: credenciais e corpo ficam só em memória durante a chamada.
// =============================================================================

import { BankGatewayError, type BankContext } from './types'

export const PAN_SANDBOX_URL = 'https://sandbox-hml.bancopan.com.br'
export const PAN_PRODUCTION_URL = 'https://ap-gateway-web.bancopan.com.br'
const TOKEN_PATH = '/veiculos/v0/tokens'
const TIMEOUT_MS = 20_000
/** A documentação não diz a duração do token; sem "expires_in" legível, usamos 15 min. TODO homologação. */
const DEFAULT_TOKEN_TTL_MS = 15 * 60_000

export function panBaseUrl(ctx: BankContext): string {
  const custom = (ctx.credentials.urlBase || ctx.baseUrl || '').trim().replace(/\/+$/, '')
  if (custom) {
    if (!/^https:\/\//.test(custom)) throw new BankGatewayError('A URL da API do PAN precisa começar com https://.', 'CREDENCIAL')
    return custom
  }
  return ctx.environment === 'PRODUCAO' ? PAN_PRODUCTION_URL : PAN_SANDBOX_URL
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>
let fetchImpl: FetchLike = (url, init) => fetch(url, init)

export interface HttpResult { status: number; body: unknown }

async function send(url: string, init: RequestInit, idempotent: boolean): Promise<HttpResult> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { ...init, signal: ac.signal, cache: 'no-store' })
    const text = await res.text()
    let body: unknown = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }
    return { status: res.status, body }
  } catch (e) {
    const timeout = ac.signal.aborted || (e instanceof Error && e.name === 'AbortError')
    // fetch não diz se o corpo saiu; numa operação que cria algo, a dúvida vira "verificar".
    throw new BankGatewayError(timeout ? 'O PAN não respondeu a tempo.' : 'Não foi possível falar com o PAN agora.', timeout ? 'TEMPO_ESGOTADO' : 'INDISPONIVEL', idempotent ? 'NAO' : 'TALVEZ')
  } finally {
    clearTimeout(timer)
  }
}

/** Mensagem do PAN para o usuário (sem dados do cliente). Formato: { codigo, mensagem, origem, detalhes[] }. */
export function panErrorMessage(body: unknown): string | null {
  const b = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return null
  const det = Array.isArray(b.detalhes) ? (b.detalhes.filter((x) => typeof x === 'string' && x.trim()) as string[]) : []
  if (det.length) return det.slice(0, 3).join(' · ').slice(0, 280)
  for (const k of ['mensagem', 'message', 'detail']) if (typeof b[k] === 'string' && (b[k] as string).trim()) return (b[k] as string).slice(0, 280)
  return null
}

function creds(ctx: BankContext) {
  const { apiKey, secretKey, usuarioIntegracao, senhaIntegracao } = ctx.credentials
  if (!apiKey || !secretKey) throw new BankGatewayError('Faltam a ApiKey e a SecretKey do PAN na credencial.', 'CREDENCIAL')
  if (!usuarioIntegracao || !senhaIntegracao) throw new BankGatewayError('Faltam o usuário e a senha de integração do PAN na credencial.', 'CREDENCIAL')
  return { apiKey, secretKey, usuario: usuarioIntegracao, senha: senhaIntegracao }
}

/** "expires_in": data ISO em UTC (documentado) ou segundos. */
export function panTokenExpiry(expiresIn: unknown, now = Date.now()): number {
  if (typeof expiresIn === 'number' && expiresIn > 0) return now + expiresIn * 1000
  if (typeof expiresIn === 'string' && expiresIn.trim()) {
    if (/^\d+$/.test(expiresIn.trim())) return now + Number(expiresIn) * 1000
    const t = Date.parse(expiresIn)
    if (Number.isFinite(t) && t > now) return t
  }
  return now + DEFAULT_TOKEN_TTL_MS
}

const tokens = new Map<string, { token: string; exp: number }>()
const inflight = new Map<string, Promise<string>>()
const tokenKey = (base: string, c: ReturnType<typeof creds>) => `${base}|${c.apiKey}|${c.usuario}`

async function issueToken(base: string, c: ReturnType<typeof creds>, key: string): Promise<string> {
  const r = await send(base + TOKEN_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json', ApiKey: c.apiKey,
      Authorization: `Basic ${Buffer.from(`${c.apiKey}:${c.secretKey}`, 'utf8').toString('base64')}`,
    },
    body: JSON.stringify({ username: c.usuario, password: c.senha, grant_type: 'client_credentials+password' }),
  }, true)
  if (r.status === 429) throw new BankGatewayError('O PAN limita o login da integração a 5 tentativas por minuto. Aguarde um minuto e tente de novo.', 'INDISPONIVEL')
  if (r.status >= 500) throw new BankGatewayError(panErrorMessage(r.body) ?? 'O PAN está fora do ar no momento.', 'INDISPONIVEL')
  const b = (r.body ?? {}) as { token?: string; access_token?: string; expires_in?: unknown }
  const token = b.token ?? b.access_token
  if (r.status >= 400 || !token) {
    const why = panErrorMessage(r.body)
    throw new BankGatewayError(`O PAN recusou o acesso da loja${why ? `: ${why}` : ' (ApiKey/SecretKey ou usuário/senha de integração).'}`, 'CREDENCIAL')
  }
  tokens.set(key, { token, exp: panTokenExpiry(b.expires_in) })
  return token
}

async function getToken(ctx: BankContext, base: string): Promise<string> {
  const c = creds(ctx)
  const key = tokenKey(base, c)
  const hit = tokens.get(key)
  if (hit && hit.exp > Date.now() + 60_000) return hit.token
  let p = inflight.get(key)
  if (!p) {
    p = issueToken(base, c, key).finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

export interface PanRequest {
  method: 'GET' | 'POST'
  path: string
  query?: Record<string, string>
  body?: unknown
  /** Repetir é inofensivo (consultas). Se false, falha após o envio vira "TALVEZ". */
  idempotent?: boolean
}

/** Chamada autenticada à OpenAPI Veículos. */
export async function panRequest<T = unknown>(ctx: BankContext, req: PanRequest): Promise<T> {
  const base = panBaseUrl(ctx)
  const idempotent = req.idempotent ?? req.method === 'GET'
  const qs = req.query ? `?${new URLSearchParams(req.query).toString()}` : ''
  const call = async () => {
    const token = await getToken(ctx, base)
    return send(base + req.path + qs, {
      method: req.method,
      headers: {
        Accept: 'application/json', ApiKey: ctx.credentials.apiKey, Authorization: `Bearer ${token}`, 'x-correlation-id': ctx.correlationId,
        ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
    }, idempotent)
  }
  let r = await call()
  if (r.status === 401) {
    // Token recusado pelo gateway (a chamada não foi processada): renova uma vez.
    tokens.delete(tokenKey(base, creds(ctx)))
    r = await call()
    if (r.status === 401) throw new BankGatewayError('O PAN recusou o acesso da loja. Confira a credencial.', 'CREDENCIAL')
  }
  if (r.status === 403) throw new BankGatewayError('O PAN não liberou este serviço para a loja. Confira o credenciamento OpenAPI no PAN.', 'CREDENCIAL')
  if (r.status === 429) throw new BankGatewayError('O PAN pediu para aguardar (limite de chamadas). Tente de novo em um minuto.', 'INDISPONIVEL')
  if (r.status >= 500) throw new BankGatewayError(panErrorMessage(r.body) ?? 'O PAN está fora do ar no momento.', 'INDISPONIVEL', idempotent ? 'NAO' : 'TALVEZ')
  if (r.status >= 400) throw new BankGatewayError(panErrorMessage(r.body) ?? `O PAN recusou os dados enviados (HTTP ${r.status}).`, 'REJEITADO', 'NAO')
  return r.body as T
}

/** Só valida o login da integração (sem dado de cliente). */
export async function panPing(ctx: BankContext): Promise<void> {
  const base = panBaseUrl(ctx)
  tokens.delete(tokenKey(base, creds(ctx)))
  await getToken(ctx, base)
}

/** SÓ testes. */
export function __setPanFetchForTests(f: FetchLike | null) { fetchImpl = f ?? ((url, init) => fetch(url, init)) }
export function __resetPanCachesForTests() { tokens.clear(); inflight.clear() }
