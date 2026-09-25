// =============================================================================
// Central de Publicações — erros dos conectores e política de retentativa.
// PURO (testado). Cada tipo tem tratamento próprio no worker:
//   AUTH        token expirado/revogado → conexão "Reconectar", tarefas travadas
//   VALIDATION  dado recusado pelo canal → "Rejeitado" (não repete sozinho)
//   QUOTA       cota/pacote esgotado → pendência; NUNCA compra pacote
//   RATE_LIMIT  429/limite → espera o tempo indicado e tenta de novo
//   UNAVAILABLE 5xx/rede → espera progressiva, tentativas limitadas
//   TIMEOUT     resposta perdida DEPOIS de enviar → reconsulta antes de repetir
//   NOT_FOUND   anúncio não existe mais no canal
//   UNSUPPORTED operação que o canal não oferece → pendência manual
// =============================================================================

export type ErrorKind = 'AUTH' | 'VALIDATION' | 'QUOTA' | 'RATE_LIMIT' | 'UNAVAILABLE' | 'TIMEOUT' | 'NOT_FOUND' | 'UNSUPPORTED' | 'CONFIG'

export class ConnectorError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly hint?: string,
    readonly opts: { retryAfterMs?: number; code?: string; details?: unknown } = {},
  ) { super(message) }
  get retryAfterMs() { return this.opts.retryAfterMs }
  get code() { return this.opts.code }
}

export function isConnectorError(e: unknown): e is ConnectorError { return e instanceof ConnectorError }

/** Quais tipos voltam para a fila automaticamente. */
export function isRetryable(kind: ErrorKind): boolean {
  return kind === 'RATE_LIMIT' || kind === 'UNAVAILABLE' || kind === 'TIMEOUT'
}

/**
 * Espera progressiva com teto e variação (evita todas as lojas baterem juntas).
 * attempt começa em 1. Base 30 s → 1 min → 2 min → 4 min → 8 min… teto 1 h.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = 30_000 * 2 ** Math.max(0, attempt - 1)
  const capped = Math.min(base, 60 * 60_000)
  const jitter = 0.8 + random() * 0.4 // ±20%
  return Math.round(capped * jitter)
}

/** Próxima execução após um erro (null = não repetir). */
export function nextRunAfterError(kind: ErrorKind, attempt: number, maxAttempts: number, now: Date, retryAfterMs?: number, random?: () => number): Date | null {
  if (!isRetryable(kind) || attempt >= maxAttempts) return null
  const wait = kind === 'RATE_LIMIT' && retryAfterMs ? Math.max(retryAfterMs, 1_000) : backoffMs(attempt, random)
  return new Date(now.getTime() + wait)
}

/** Lê Retry-After (segundos ou data HTTP). */
export function parseRetryAfter(value: string | null | undefined, now = new Date()): number | undefined {
  if (!value) return undefined
  const s = Number(value)
  if (Number.isFinite(s) && s >= 0) return Math.round(s * 1000)
  const d = Date.parse(value)
  return Number.isFinite(d) ? Math.max(0, d - now.getTime()) : undefined
}

/** Texto curto de "como resolver" por tipo, quando o conector não trouxe um. */
export const DEFAULT_HINT: Record<ErrorKind, string> = {
  AUTH: 'Reconecte a conta em Marketing › Canais conectados.',
  VALIDATION: 'Corrija o dado indicado no veículo ou no anúncio e envie de novo.',
  QUOTA: 'O plano do portal está sem espaço. Libere um anúncio ou amplie o plano no portal (o AutoDrive não compra pacotes).',
  RATE_LIMIT: 'O portal pediu para esperar. O envio será repetido automaticamente.',
  UNAVAILABLE: 'O portal está instável. O envio será repetido automaticamente.',
  TIMEOUT: 'O portal não respondeu a tempo. Vamos conferir no portal antes de reenviar.',
  NOT_FOUND: 'O anúncio não existe mais no portal. Publique de novo se ainda quiser anunciar.',
  UNSUPPORTED: 'Este canal não permite essa ação pela integração. Faça manualmente pelo link.',
  CONFIG: 'Complete a configuração da conta em Marketing › Canais conectados.',
}
