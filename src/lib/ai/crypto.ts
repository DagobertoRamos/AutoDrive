// =============================================================================
// ai/crypto.ts — criptografia das chaves dos provedores de IA (AES-256-GCM).
// Chave derivada de AI_ENCRYPTION_KEY (fallback FINANCE_ENCRYPTION_KEY) via
// SHA-256. Segredos NUNCA gravados/retornados em texto puro. Falha clara se a
// chave não existir. Mesmo padrão de src/lib/finance/crypto.ts.
// =============================================================================

import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'

function rawKey(): string | undefined {
  return process.env.AI_ENCRYPTION_KEY || process.env.FINANCE_ENCRYPTION_KEY
}

function getKey(): Buffer {
  const raw = rawKey()
  if (!raw || raw.trim().length < 16) {
    throw new Error('AI_ENCRYPTION_KEY ausente ou fraca — defina uma chave de ≥16 caracteres para usar provedores de IA.')
  }
  return crypto.createHash('sha256').update(raw).digest()
}

export function isAiCryptoConfigured(): boolean {
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
