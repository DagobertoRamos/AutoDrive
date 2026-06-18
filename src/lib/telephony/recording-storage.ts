// =============================================================================
// telephony/recording-storage.ts — link ASSINADO de curta duração p/ gravações.
// Responsabilidade desta camada: ASSINATURA do acesso (capability token). A
// resolução de ONDE estão os bytes é da camada `./storage` (vários provedores:
// S3-compatível, URL externa, futuros). Re-exporta os helpers de storage p/
// compatibilidade.
//
// Assinatura: HMAC-SHA256(`${id}.${exp}`) com segredo do servidor
// (TELEPHONY_RECORDING_SIGNING_SECRET → TELEPHONY_ENCRYPTION_KEY →
// MARKETING_ENCRYPTION_KEY). Validação timing-safe + expiração.
// =============================================================================

import crypto from 'node:crypto'

export const DEFAULT_PLAY_TTL_SECONDS = 300 // 5 min

// Camada de storage (aberta a vários provedores).
export { resolveRecordingSource, getStorageProviderFor, listStorageProviders, isSafeExternalUrl } from './storage'
export type { PlaybackSource, RecordingStorageProvider } from './storage'

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
