// =============================================================================
// crypto.ts — Criptografia AES-256-GCM para segredos sensíveis
//
// Uso: encrypt(plaintext) → string armazenável no banco
//      decrypt(ciphertext) → plaintext original
//      isEncrypted(val)    → true se o valor parece ser um ciphertext nosso
//
// A chave mestre vem de MASTER_ENCRYPTION_KEY no env (hex 64 chars = 32 bytes).
// Se não existir, gera uma chave de sessão efêmera (⚠️ apenas dev/test).
//
// Formato do ciphertext:  enc:v1:<ivHex>:<authTagHex>:<dataHex>
// =============================================================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const PREFIX    = 'enc:v1:'

function getMasterKey(): Buffer {
  const hex = process.env.MASTER_ENCRYPTION_KEY
  if (hex && hex.length === 64) {
    return Buffer.from(hex, 'hex')
  }
  // Fallback de desenvolvimento — não usar em produção
  if (process.env.NODE_ENV !== 'production') {
    return Buffer.from('0'.repeat(64), 'hex')
  }
  throw new Error('MASTER_ENCRYPTION_KEY não configurada. Configure 32 bytes hex (64 chars) no .env')
}

/**
 * Criptografa um valor sensível com AES-256-GCM.
 * Retorna string prefixada `enc:v1:…` para armazenamento seguro no banco.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext
  // Não re-criptografar o que já está criptografado
  if (isEncrypted(plaintext)) return plaintext

  const key     = getMasterKey()
  const iv      = randomBytes(12)               // 96-bit IV (recomendado para GCM)
  const cipher  = createCipheriv(ALGORITHM, key, iv)
  const data    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${data.toString('hex')}`
}

/**
 * Descriptografa um valor previamente criptografado com `encrypt()`.
 * Se o valor não estiver no formato esperado, retorna o valor original intacto.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext
  if (!isEncrypted(ciphertext)) return ciphertext

  try {
    const parts = ciphertext.slice(PREFIX.length).split(':')
    if (parts.length !== 3) throw new Error('Formato inválido')

    const [ivHex, authTagHex, dataHex] = parts
    const key      = getMasterKey()
    const iv       = Buffer.from(ivHex,       'hex')
    const authTag  = Buffer.from(authTagHex,  'hex')
    const data     = Buffer.from(dataHex,     'hex')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    // Se falhar (chave errada, dado corrompido), retorna string vazia — nunca expõe
    return ''
  }
}

/**
 * Verifica se a string é um ciphertext gerado por encrypt().
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX)
}

/**
 * Máscara para exibição no frontend.
 * Nunca retorna o valor real — apenas indica que está configurado.
 */
export const MASKED = '••••••••' as const

/**
 * Retorna true se o valor enviado pelo frontend é a máscara
 * (não deve sobrescrever o segredo existente).
 */
export function isMasked(value: string): boolean {
  return value === MASKED
}
