// =============================================================================
// Gateway de Entrada — regras PURAS (testadas).
// Todo evento externo (lead, mensagem, e-mail) é GRAVADO antes de processar:
//   receber → validar → gravar bruto (único por provedor+evento) → processar →
//   em falha: nova tentativa com espera crescente → esgotou: DEAD (aparece na
//   Saúde das integrações para reprocessar).
// =============================================================================

import { createHash } from 'crypto'

export type InboxKind = 'LEAD' | 'MESSAGE' | 'EMAIL' | 'WEBHOOK'
export type InboxStatus = 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'IGNORED' | 'DEAD'

export const MAX_ATTEMPTS = 8
/** Esperas entre tentativas (min): 1, 2, 5, 10, 30, 60, 180. */
const BACKOFF_MIN = [1, 2, 5, 10, 30, 60, 180]
/** Processamento "PROCESSING" parado há mais que isto é considerado travado. */
export const STUCK_AFTER_MS = 5 * 60_000
/** Corpo original guardado por este tempo (LGPD: retenção mínima necessária). */
export const PAYLOAD_RETENTION_DAYS = 30

/** Próxima tentativa depois de `attempts` falhas (null = esgotou). */
export function nextAttemptAt(attempts: number, now = new Date()): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null
  const min = BACKOFF_MIN[Math.min(Math.max(attempts - 1, 0), BACKOFF_MIN.length - 1)]
  return new Date(now.getTime() + min * 60_000)
}

/** Serialização estável (chaves ordenadas) — o mesmo corpo gera o mesmo hash. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

export const payloadHash = (payload: unknown) => sha256(stableStringify(payload))

/**
 * Chave de idempotência do evento: o id do provedor quando existe (lead_id,
 * wamid...), senão o hash do corpo. Sempre prefixada pelo escopo (loja/canal),
 * para o mesmo id em lojas diferentes nunca colidir.
 */
export function eventKey(scope: string, providerEventId: string | null | undefined, payload: unknown): string {
  const id = (providerEventId ?? '').toString().trim()
  return `${scope}:${id ? `id:${id.slice(0, 200)}` : `h:${payloadHash(payload)}`}`.slice(0, 400)
}

/** Identificador legível do evento para rastrear origem → lead → vendedor. */
export function correlationId(inboxId: string, receivedAt: Date): string {
  return `EVT-${receivedAt.getUTCFullYear()}-${inboxId.slice(-8).toUpperCase()}`
}

const SENSITIVE = /(pass(word)?|senha|secret|token|authorization|api[_-]?key|cpf|cnpj|card|cartao|cvv)/i

/** Cópia do corpo com segredos/documentos mascarados — para telas técnicas. */
export function maskPayload(v: unknown, depth = 0): unknown {
  if (depth > 6) return '…'
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => maskPayload(x, depth + 1))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) && val != null && typeof val !== 'object' ? '••••••' : maskPayload(val, depth + 1)
    }
    return out
  }
  if (typeof v === 'string' && v.length > 2000) return `${v.slice(0, 2000)}…`
  return v
}

/** Erro que NÃO adianta repetir (conteúdo inválido): vira IGNORED, sem novas tentativas. */
export class PermanentInboxError extends Error {
  constructor(message: string) { super(message); this.name = 'PermanentInboxError' }
}

/** Tira do corpo as chaves de autenticação (não precisam ser guardadas para reprocessar). */
export function stripAuthKeys(payload: unknown, keys: string[] = ['google_key', 'secret', 'token', 'api_key', 'apikey', 'password', 'senha']): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  const drop = new Set(keys.map((k) => k.toLowerCase()))
  return Object.fromEntries(Object.entries(payload as Record<string, unknown>).filter(([k]) => !drop.has(k.toLowerCase())))
}
