// =============================================================================
// Cliente HTTP dos conectores: tempo limite, classificação de erro e
// distinção entre "falhou antes de enviar" e "enviou mas a resposta se perdeu"
// (este último = TIMEOUT: o worker reconsulta antes de repetir uma criação).
// Injetável: os testes passam um `fetch` simulado (identificado como simulação).
// Nunca registra corpo com segredo.
// =============================================================================

import { ConnectorError, parseRetryAfter } from '../errors'

export interface HttpRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers?: Record<string, string>
  body?: string | URLSearchParams
  timeoutMs?: number
  /** Operação cria algo no canal? Timeout vira TIMEOUT (resultado desconhecido). */
  creates?: boolean
}

export interface HttpResponse { status: number; headers: Headers; text: string; json<T = unknown>(): T | null }

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface HttpClient { request(r: HttpRequest): Promise<HttpResponse> }

export function createHttpClient(fetchImpl: FetchLike = (u, i) => fetch(u, i)): HttpClient {
  return {
    async request(r) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), r.timeoutMs ?? 30_000)
      let res: Response
      try {
        res = await fetchImpl(r.url, { method: r.method ?? 'GET', headers: r.headers, body: r.body, signal: ctrl.signal, redirect: 'follow' })
      } catch (e) {
        const aborted = (e as Error)?.name === 'AbortError'
        if (aborted && r.creates) throw new ConnectorError('TIMEOUT', 'O canal não respondeu a tempo depois do envio.', undefined, { code: 'TIMEOUT' })
        throw new ConnectorError('UNAVAILABLE', aborted ? 'O canal não respondeu a tempo.' : `Falha de rede: ${(e as Error)?.message ?? 'erro'}`)
      } finally {
        clearTimeout(timer)
      }
      const text = await res.text().catch(() => '')
      return {
        status: res.status, headers: res.headers, text,
        json<T>() { try { return JSON.parse(text) as T } catch { return null } },
      }
    },
  }
}

/** Converte status HTTP em erro tipado (quando o conector não tratou antes). */
export function throwForStatus(res: HttpResponse, what: string): void {
  if (res.status >= 200 && res.status < 300) return
  const body = res.text.slice(0, 400)
  if (res.status === 401 || res.status === 403) throw new ConnectorError('AUTH', `${what}: acesso negado (${res.status}).`, undefined, { code: String(res.status), details: body })
  if (res.status === 404) throw new ConnectorError('NOT_FOUND', `${what}: não encontrado.`, undefined, { code: '404' })
  if (res.status === 429) throw new ConnectorError('RATE_LIMIT', `${what}: limite de requisições.`, undefined, { retryAfterMs: parseRetryAfter(res.headers.get('retry-after')) ?? 60_000, code: '429' })
  if (res.status >= 500) throw new ConnectorError('UNAVAILABLE', `${what}: canal indisponível (${res.status}).`, undefined, { code: String(res.status) })
  throw new ConnectorError('VALIDATION', `${what}: recusado (${res.status}) ${body}`.trim(), undefined, { code: String(res.status), details: body })
}
