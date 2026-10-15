// =============================================================================
// Banco BV — transporte: HTTPS com mTLS (certificado .pfx DA LOJA) + token JWT
// OAuth2 client_credentials em cache por (ambiente, client_id).
// Nada aqui é logado: credenciais e corpo ficam só em memória durante a chamada.
// =============================================================================

import { request as httpsRequest, Agent } from 'node:https'
import { createHash } from 'node:crypto'
import { BankGatewayError, type BankContext } from './types'

export const BV_SANDBOX_URL = 'https://apige-uat-sbx.bancobv.com.br'
const TOKEN_PATH = '/auth/oauth/v2/token-jwt'
const TIMEOUT_MS = 20_000

export function bvBaseUrl(ctx: BankContext): string {
  const custom = (ctx.credentials.urlBase || ctx.baseUrl || '').trim().replace(/\/+$/, '')
  if (custom) {
    if (!/^https:\/\//.test(custom)) throw new BankGatewayError('A URL da API do BV precisa começar com https://.', 'CREDENCIAL')
    return custom
  }
  if (ctx.environment === 'PRODUCAO') throw new BankGatewayError('Informe a URL da API de produção enviada pelo BV na credencial da loja.', 'CREDENCIAL')
  return BV_SANDBOX_URL
}

// Um Agent por certificado (reaproveita conexões TLS entre chamadas da mesma loja).
const agents = new Map<string, Agent>()
function agentFor(ctx: BankContext): Agent {
  const pfxB64 = (ctx.credentials.certPfx || '').replace(/^data:[^,]*,/, '').trim()
  if (!pfxB64) throw new BankGatewayError('Falta o certificado mTLS (.pfx) na credencial do BV.', 'CREDENCIAL')
  const id = createHash('sha256').update(pfxB64).update('\0').update(ctx.credentials.certSenha || '').digest('hex')
  let a = agents.get(id)
  if (!a) {
    try {
      a = new Agent({ pfx: Buffer.from(pfxB64, 'base64'), passphrase: ctx.credentials.certSenha || undefined, keepAlive: true, maxSockets: 8 })
    } catch {
      throw new BankGatewayError('Não foi possível abrir o certificado do BV. Confira o arquivo .pfx e a senha.', 'CREDENCIAL')
    }
    agents.set(id, a)
  }
  return a
}

export interface HttpResult { status: number; body: unknown; text: string }

function send(url: string, agent: Agent, method: string, headers: Record<string, string>, body?: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    let sent = false
    const req = httpsRequest(url, { method, agent, headers: { Accept: 'application/json', ...headers, ...(body != null ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) }, timeout: TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed: unknown = null
        try { parsed = text ? JSON.parse(text) : null } catch { parsed = null }
        resolve({ status: res.statusCode ?? 0, body: parsed, text })
      })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (e: NodeJS.ErrnoException) => {
      const msg = e.message || ''
      if (/PKCS12|mac verify|bad decrypt|unsupported/i.test(msg)) return reject(new BankGatewayError('Certificado do BV inválido ou senha incorreta.', 'CREDENCIAL'))
      // Antes de o corpo sair, é seguro dizer que NÃO chegou; depois, talvez.
      reject(new BankGatewayError(msg === 'timeout' ? 'O BV não respondeu a tempo.' : 'Não foi possível falar com o BV agora.', msg === 'timeout' ? 'TEMPO_ESGOTADO' : 'INDISPONIVEL', sent ? 'TALVEZ' : 'NAO'))
    })
    req.on('finish', () => { sent = true })
    if (body != null) req.write(body)
    req.end()
  })
}

const tokens = new Map<string, { token: string; exp: number }>()

async function getToken(ctx: BankContext, base: string, agent: Agent): Promise<string> {
  const { clientId, clientSecret } = ctx.credentials
  if (!clientId || !clientSecret) throw new BankGatewayError('Faltam o Client ID e o Client Secret do BV na credencial.', 'CREDENCIAL')
  const key = `${base}|${clientId}`
  const hit = tokens.get(key)
  if (hit && hit.exp > Date.now() + 60_000) return hit.token
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString()
  const r = await send(base + TOKEN_PATH, agent, 'POST', { 'Content-Type': 'application/x-www-form-urlencoded' }, form)
  const b = (r.body ?? {}) as { access_token?: string; expires_in?: number }
  if (r.status === 400 || r.status === 401 || r.status === 403 || !b.access_token) {
    throw new BankGatewayError('O BV recusou o acesso da loja (Client ID/Secret ou certificado).', 'CREDENCIAL')
  }
  tokens.set(key, { token: b.access_token, exp: Date.now() + Math.max(60, Number(b.expires_in) || 3600) * 1000 })
  return b.access_token
}

/** Mensagem do BV para o usuário (sem dados do cliente). */
export function bvErrorMessage(body: unknown): string | null {
  const b = (body ?? {}) as Record<string, unknown>
  const list = (b.serviceResponseStatusList ?? b.returnMessageList ?? b.errors ?? b.messages) as unknown
  if (Array.isArray(list)) {
    const msgs = list.map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>).message ?? (x as Record<string, unknown>).description : null)).filter((x) => typeof x === 'string' && x.trim()) as string[]
    if (msgs.length) return msgs.slice(0, 3).join(' · ').slice(0, 280)
  }
  for (const k of ['message', 'mensagem', 'detail', 'error_description']) if (typeof b[k] === 'string' && (b[k] as string).trim()) return (b[k] as string).slice(0, 280)
  return null
}

/**
 * POST JSON autenticado. `idempotent` = repetir é inofensivo (consultas);
 * se false, falha de rede após o envio vira "TALVEZ" (orquestrador verifica).
 */
export async function bvPost<T = unknown>(ctx: BankContext, path: string, payload: unknown, opts: { idempotent?: boolean } = {}): Promise<T> {
  const base = bvBaseUrl(ctx)
  const agent = agentFor(ctx)
  const token = await getToken(ctx, base, agent)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-correlation-id': ctx.correlationId }
  let r: HttpResult
  try {
    r = await send(base + path, agent, 'POST', headers, JSON.stringify(payload))
  } catch (e) {
    if (e instanceof BankGatewayError && opts.idempotent && e.delivered === 'TALVEZ') throw new BankGatewayError(e.message, e.code, 'NAO')
    throw e
  }
  if (r.status === 401) { tokens.delete(`${base}|${ctx.credentials.clientId}`); throw new BankGatewayError('O acesso ao BV expirou. Tente de novo.', 'CREDENCIAL') }
  if (r.status === 403) throw new BankGatewayError('O BV não liberou este serviço para a loja. Confira o credenciamento no BV.', 'CREDENCIAL')
  if (r.status >= 500) throw new BankGatewayError(bvErrorMessage(r.body) ?? 'O BV está fora do ar no momento.', 'INDISPONIVEL', opts.idempotent ? 'NAO' : 'TALVEZ')
  if (r.status >= 400) throw new BankGatewayError(bvErrorMessage(r.body) ?? `O BV recusou os dados enviados (HTTP ${r.status}).`, 'REJEITADO', 'NAO')
  return r.body as T
}

/** Só valida token + certificado (sem dado de cliente). */
export async function bvPing(ctx: BankContext): Promise<void> {
  const base = bvBaseUrl(ctx)
  tokens.delete(`${base}|${ctx.credentials.clientId}`)
  await getToken(ctx, base, agentFor(ctx))
}

/** SÓ testes. */
export function __resetBvCachesForTests() { tokens.clear(); agents.clear() }
