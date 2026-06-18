// =============================================================================
// telephony/recording-storage.ts — acesso a gravações por URL ASSINADA de curta
// duração (capability token), em vez de expor a URL bruta do provedor.
//
// - Assinatura: HMAC-SHA256(`${id}.${exp}`) com segredo do servidor
//   (TELEPHONY_RECORDING_SIGNING_SECRET → fallback TELEPHONY_ENCRYPTION_KEY →
//   MARKETING_ENCRYPTION_KEY). Validação timing-safe + expiração.
// - O endpoint /stream resolve a origem dos bytes via `resolveRecordingSource`:
//     redirect  → storage gerenciado/presigned (futuro)
//     proxy     → URL externa https, com GUARDA ANTI-SSRF (host público + allowlist)
//     unavailable → sem storage configurado / URL insegura
// Nenhuma chamada de saída acontece aqui; o /stream é quem busca, sob guarda.
// =============================================================================

import crypto from 'node:crypto'

export const DEFAULT_PLAY_TTL_SECONDS = 300 // 5 min

function signingSecret(): string | undefined {
  return process.env.TELEPHONY_RECORDING_SIGNING_SECRET
    || process.env.TELEPHONY_ENCRYPTION_KEY
    || process.env.MARKETING_ENCRYPTION_KEY
}

export function isRecordingSigningConfigured(): boolean {
  const s = signingSecret()
  return !!s && s.trim().length >= 16
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Token = base64url(HMAC-SHA256(`${id}.${exp}`, secret)). */
export function signPlayToken(id: string, exp: number): string {
  const secret = signingSecret()
  if (!secret) throw new Error('Assinatura de gravação não configurada.')
  return b64url(crypto.createHmac('sha256', secret).update(`${id}.${exp}`).digest())
}

export function verifyPlayToken(id: string, exp: number, sig: string, nowMs: number): boolean {
  if (!sig || !Number.isFinite(exp)) return false
  if (exp * 1000 < nowMs) return false // expirado
  let expected: string
  try { expected = signPlayToken(id, exp) } catch { return false }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Caminho relativo assinado para o player consumir. `nowMs` injetável p/ testes. */
export function buildSignedPlayPath(id: string, ttlSeconds = DEFAULT_PLAY_TTL_SECONDS, nowMs = Date.now()): { path: string; exp: number } {
  const exp = Math.floor(nowMs / 1000) + ttlSeconds
  const sig = signPlayToken(id, exp)
  const path = `/api/marketing/telephony/recordings/${id}/stream?exp=${exp}&sig=${sig}`
  return { path, exp }
}

// ── Guarda anti-SSRF para proxy de URL externa ──────────────────────────────
function allowedHosts(): string[] {
  return (process.env.TELEPHONY_RECORDING_ALLOWED_HOSTS || '')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
}

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[0-1])\./

export function isSafeExternalUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  if (PRIVATE_HOST.test(host) || PRIVATE_172.test(host)) return false
  const allow = allowedHosts()
  if (allow.length === 0) return false // sem allowlist explícita, não fazemos proxy (anti-SSRF)
  return allow.some((h) => host === h || host.endsWith(`.${h}`))
}

/** Storage gerenciado (S3/R2/Blob) — preparado; ativa quando configurado. */
export function isManagedStorageConfigured(): boolean {
  return !!(process.env.TELEPHONY_STORAGE_ENDPOINT && process.env.TELEPHONY_STORAGE_BUCKET)
}

export type RecordingSource =
  | { kind: 'redirect'; url: string }
  | { kind: 'proxy'; url: string }
  | { kind: 'unavailable'; reason: string }

/**
 * Decide como servir a gravação a partir da `storageUrl` registrada.
 * - storage gerenciado configurado → redirect (presign real entra na evolução).
 * - URL externa https em allowlist → proxy (bytes nunca expõem a URL ao cliente).
 * - caso contrário → unavailable (config de storage pendente).
 */
export function resolveRecordingSource(storageUrl: string | null | undefined): RecordingSource {
  if (!storageUrl) return { kind: 'unavailable', reason: 'Gravação sem arquivo associado.' }
  if (isManagedStorageConfigured()) return { kind: 'redirect', url: storageUrl }
  if (isSafeExternalUrl(storageUrl)) return { kind: 'proxy', url: storageUrl }
  return { kind: 'unavailable', reason: 'Armazenamento de gravação não configurado (defina TELEPHONY_STORAGE_* ou TELEPHONY_RECORDING_ALLOWED_HOSTS).' }
}
