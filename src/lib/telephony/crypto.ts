// =============================================================================
// telephony/crypto.ts — criptografia das credenciais de telefonia (AES-256-GCM).
// Chave derivada de TELEPHONY_ENCRYPTION_KEY (fallback MARKETING_ENCRYPTION_KEY)
// via SHA-256. NUNCA reutiliza FINANCE_ENCRYPTION_KEY (regra do módulo). Segredos
// nunca gravados/retornados em texto puro; falha clara se a chave não existir.
// Mesmo padrão de src/lib/ai/crypto.ts e src/lib/finance/crypto.ts.
// =============================================================================

import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'

function rawKey(): string | undefined {
  return process.env.TELEPHONY_ENCRYPTION_KEY || process.env.MARKETING_ENCRYPTION_KEY
}

function getKey(): Buffer {
  const raw = rawKey()
  if (!raw || raw.trim().length < 16) {
    throw new Error('TELEPHONY_ENCRYPTION_KEY ausente ou fraca — defina uma chave de ≥16 caracteres para usar credenciais de telefonia.')
  }
  return crypto.createHash('sha256').update(raw).digest()
}

export function isTelephonyCryptoConfigured(): boolean {
  const raw = rawKey()
  return !!raw && raw.trim().length >= 16
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

export function maskSecret(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  if (v.length <= 4) return '••••'
  return `••••••••${v.slice(-4)}`
}

export function encryptSecrets(obj: Record<string, string | undefined>): string {
  return encryptSecret(JSON.stringify(obj))
}

export function decryptSecrets(blob: string | null | undefined): Record<string, string> {
  if (!blob) return {}
  try { return JSON.parse(decryptSecret(blob)) as Record<string, string> } catch { return {} }
}

/** Gera os hints mascarados ({ token: "••••8F2A" }) a partir dos segredos em claro. */
export function buildMaskedHints(obj: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v && v.trim()) out[k] = maskSecret(v)
  }
  return out
}
