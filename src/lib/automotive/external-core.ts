// =============================================================================
// Regras das chamadas externas (puro): idempotência, timeout ≠ erro, consultar
// antes de repetir, espera crescente entre consultas.
// =============================================================================

export type ExternalState = 'PENDING' | 'SUBMITTED' | 'PROCESSING' | 'UNKNOWN' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED'

export const OPEN_STATES: ExternalState[] = ['PENDING', 'SUBMITTED', 'PROCESSING', 'UNKNOWN']

export type CallPlan =
  | 'SUBMIT'           // nunca enviado → enviar
  | 'RETURN_EXISTING'  // já concluído → devolver o que existe (clique duplo)
  | 'CHECK_STATUS'     // enviado sem resposta final → consultar o provedor, NÃO reenviar
  | 'RESUBMIT'         // recusado → pode enviar de novo (nova tentativa, nova chave)

export function planExternalCall(existing: { state: string; attempts: number } | null): CallPlan {
  if (!existing) return 'SUBMIT'
  switch (existing.state) {
    case 'CONFIRMED':
    case 'CANCELLED': return 'RETURN_EXISTING'
    case 'REJECTED': return 'RESUBMIT'
    case 'PENDING': return existing.attempts === 0 ? 'SUBMIT' : 'CHECK_STATUS'
    default: return 'CHECK_STATUS'
  }
}

/** Erro de provedor: `rejected` = resposta definitiva (com código); o resto é incerteza. */
export class ProviderError extends Error {
  constructor(message: string, public code: string | null = null, public rejected = false, public retryable = true) {
    super(message)
    this.name = 'ProviderError'
  }
}

/** Timeout/rede/5xx → UNKNOWN (pode ter sido processado); recusa explícita → REJECTED. */
export function stateFromError(err: unknown): ExternalState {
  if (err instanceof ProviderError && err.rejected) return 'REJECTED'
  return 'UNKNOWN'
}

const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000]
export function nextCheckDelayMs(attempts: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempts, 0), BACKOFF_MS.length - 1)]
}

/** Chave da tentativa: base na 1ª, base#2 na 2ª… (recusa → nova tentativa). */
export function attemptKey(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}#${attempt}`
}

/** Remove segredos antes de guardar request/response. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /(senha|password|secret|token|apikey|api_key|authorization|certificado|pfx|privatekey)/i.test(k) ? '[oculto]' : redact(v, depth + 1)
    }
    return out
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`
  return value
}
