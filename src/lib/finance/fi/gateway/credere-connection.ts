// =============================================================================
// Conexão da LOJA com a Credere (BYOC): token OAuth da conta Credere da loja,
// cifrado em FinanceCredential (sem banco vinculado, marcado em maskedHints).
// Uma por (loja, ambiente). Nunca sai do servidor em texto puro.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { decryptSecretsStrict, encryptSecrets, isCryptoConfigured } from '../../crypto'
import type { BankEnvironment } from './types'

export const CREDERE_MARK = 'credere'

export interface CredereConnection {
  credentialId: string
  credentials: Record<string, string>
  readable: boolean
  hints: Record<string, string>
}

export async function findCredereConnection(tenantId: string, environment: BankEnvironment): Promise<CredereConnection | null> {
  const cred = await prisma.financeCredential.findFirst({
    where: { tenantId, bankId: null, environment, maskedHints: { path: ['provider'], equals: CREDERE_MARK } },
    orderBy: { updatedAt: 'desc' },
  })
  if (!cred) return null
  let credentials: Record<string, string> = {}
  let readable = !!cred.secretsEncrypted && isCryptoConfigured()
  if (readable) { try { credentials = decryptSecretsStrict(cred.secretsEncrypted!) } catch { readable = false } }
  return { credentialId: cred.id, credentials, readable, hints: (cred.maskedHints ?? {}) as Record<string, string> }
}

/** Hints visíveis na tela (sem token). */
export function credereHints(s: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { provider: CREDERE_MARK }
  for (const k of ['userName', 'storeId', 'storeName', 'sellerCpf', 'connectedAt'] as const) if (s[k]) h[k] = k === 'sellerCpf' ? `***.${s[k].replace(/\D/g, '').slice(3, 6)}.***-**` : s[k]
  return h
}

export async function saveCredereConnection(tenantId: string, environment: BankEnvironment, secrets: Record<string, string>, userId: string | null): Promise<string> {
  const existing = await findCredereConnection(tenantId, environment)
  const data = { secretsEncrypted: encryptSecrets(secrets), maskedHints: credereHints(secrets) as never, updatedById: userId }
  if (existing) {
    await prisma.financeCredential.update({ where: { id: existing.credentialId }, data })
    return existing.credentialId
  }
  const c = await prisma.financeCredential.create({ data: { tenantId, bankId: null, environment, label: 'Credere', createdById: userId, ...data } })
  return c.id
}

/** Junta valores renovados (ex.: token) aos segredos atuais e regrava cifrado. */
export async function patchCredereConnection(credentialId: string, patch: Record<string, string>): Promise<void> {
  const cred = await prisma.financeCredential.findUnique({ where: { id: credentialId } })
  if (!cred?.secretsEncrypted) return
  const merged = { ...decryptSecretsStrict(cred.secretsEncrypted), ...patch }
  await prisma.financeCredential.update({ where: { id: credentialId }, data: { secretsEncrypted: encryptSecrets(merged), maskedHints: credereHints(merged) as never } })
}

export async function deleteCredereConnection(tenantId: string, environment: BankEnvironment): Promise<boolean> {
  const existing = await findCredereConnection(tenantId, environment)
  if (!existing) return false
  await prisma.financeCredential.delete({ where: { id: existing.credentialId } })
  return true
}

/** A conexão tem o mínimo para enviar (token, loja e vendedor)? */
export const credereReady = (c: CredereConnection | null) =>
  !!c && c.readable && !!c.credentials.accessToken && !!c.credentials.storeId && !!c.credentials.sellerCpf && !!c.credentials.sellerId
