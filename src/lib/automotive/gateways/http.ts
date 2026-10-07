// HTTP dos adapters: timeout, idempotência e erro classificado.
//   rede/timeout/5xx/429 → ProviderError não-definitivo (vira UNKNOWN, consulta depois)
//   4xx                  → ProviderError definitivo (REJECTED) com o código do provedor
import { ProviderError } from '../external-core'

export interface HttpResult<T = any> { status: number; json: T; text: string; headers: Headers }

export async function http<T = any>(url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown; form?: Record<string, string>; timeoutMs?: number; raw?: boolean } = {}): Promise<HttpResult<T>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 25_000)
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers ?? {}) }
  let body: BodyInit | undefined
  if (init.form) { body = new URLSearchParams(init.form).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded' }
  else if (init.body !== undefined) { body = JSON.stringify(init.body); headers['Content-Type'] = 'application/json' }
  let res: Response
  try {
    res = await fetch(url, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, signal: ctrl.signal, cache: 'no-store' })
  } catch (err) {
    throw new ProviderError(err instanceof Error && err.name === 'AbortError' ? 'timeout' : `fetch failed: ${err instanceof Error ? err.message : String(err)}`, null, false, true)
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text().catch(() => '')
  let json: any = null
  if (!init.raw) { try { json = text ? JSON.parse(text) : null } catch { json = null } }
  if (res.status >= 500 || res.status === 429 || res.status === 408) throw new ProviderError(`HTTP ${res.status}`, String(res.status), false, true)
  if (res.status >= 400) {
    const msg = pickMessage(json) ?? text.slice(0, 300) ?? `HTTP ${res.status}`
    throw new ProviderError(msg, pickCode(json) ?? String(res.status), true, false)
  }
  return { status: res.status, json: json as T, text, headers: res.headers }
}

function pickMessage(j: any): string | null {
  if (!j || typeof j !== 'object') return null
  return j.mensagem ?? j.message ?? j.error?.message ?? j.error_description ?? (typeof j.error === 'string' ? j.error : null) ?? j.erros?.[0]?.mensagem ?? j.errors?.[0]?.message ?? j.detail ?? null
}
function pickCode(j: any): string | null {
  if (!j || typeof j !== 'object') return null
  const c = j.codigo ?? j.code ?? j.error?.code ?? j.status_sefaz ?? null
  return c == null ? null : String(c)
}

export function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
}

export function requireCred(c: Record<string, string> | null | undefined, key: string, label: string): string {
  const v = c?.[key]
  if (!v) throw new ProviderError(`Conexão sem ${label}.`, 'MISSING_CREDENTIAL', true, false)
  return v
}

/** Cache simples de token OAuth por conexão (vale enquanto o processo vive). */
const tokens = new Map<string, { token: string; until: number }>()
export async function cachedToken(key: string, fetcher: () => Promise<{ token: string; expiresIn: number }>): Promise<string> {
  const hit = tokens.get(key)
  if (hit && hit.until > Date.now() + 30_000) return hit.token
  const t = await fetcher()
  tokens.set(key, { token: t.token, until: Date.now() + Math.max(60, t.expiresIn) * 1000 })
  return t.token
}
