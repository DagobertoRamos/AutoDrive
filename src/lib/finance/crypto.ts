// =============================================================================
// Criptografia de segredos do F&I (credenciais de banco).
// AES-256-GCM com chave derivada de FINANCE_ENCRYPTION_KEY (SHA-256 → 32 bytes).
// Segredos NUNCA são gravados/retornados em texto puro. Se a chave não existir,
// lança erro claro (a API deve falhar com segurança, sem expor segredo).
// =============================================================================

import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.FINANCE_ENCRYPTION_KEY
  if (!raw || raw.trim().length < 16) {
    throw new Error('FINANCE_ENCRYPTION_KEY ausente ou fraca — defina uma chave de ≥16 caracteres no ambiente para usar credenciais do F&I.')
  }
  return crypto.createHash('sha256').update(raw).digest()
}

export function isCryptoConfigured(): boolean {
  const raw = process.env.FINANCE_ENCRYPTION_KEY
  return !!raw && raw.trim().length >= 16
}

/** Cifra um texto. Saída: base64(iv[12] + tag[16] + ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/** Decifra um blob gerado por encryptSecret. */
export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

/** Máscara para exibição (mostra só os últimos 4). Nunca expõe o valor inteiro. */
export function maskSecret(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  if (v.length <= 4) return '••••'
  return `••••••••${v.slice(-4)}`
}

/** Cifra um objeto de segredos como um único blob JSON. */
export function encryptSecrets(obj: Record<string, string | undefined>): string {
  return encryptSecret(JSON.stringify(obj))
}

/** Decifra para objeto (uso interno do servidor; nunca enviar ao front). */
export function decryptSecrets(blob: string | null | undefined): Record<string, string> {
  if (!blob) return {}
  try { return JSON.parse(decryptSecret(blob)) as Record<string, string> } catch { return {} }
}
