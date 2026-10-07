// =============================================================================
// Resolve, para (loja, banco), o conector + contexto com a credencial DA LOJA
// (BYOC, decifrada só agora, nunca logada) e o estado de conexão.
// Credenciais não são compartilhadas entre lojas/filiais: sempre por tenantId.
// =============================================================================

import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { decryptSecretsStrict, isCryptoConfigured } from '../../crypto'
import { connectionState, currentFiEnvironment, getBankProvider, type ConnectionState } from './registry'
import type { BankContext, BankProvider } from './types'

export interface ResolvedBank {
  bankId: string
  bankName: string
  adapterKey: string | null
  provider: BankProvider | null
  ctx: BankContext
  state: ConnectionState
  /** Pode chamar a API agora? (estado CONECTADO) */
  live: boolean
  credentialId: string | null
  lastTestAt: Date | null
  lastTestStatus: string | null
}

function expiresAtOf(hints: unknown): Date | null {
  const v = hints && typeof hints === 'object' ? (hints as Record<string, unknown>).expiresAt : null
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function resolveBank(tenantId: string, bank: { id: string; name: string; adapterKey: string | null }, correlationId: string = randomUUID()): Promise<ResolvedBank> {
  const environment = currentFiEnvironment()
  const provider = getBankProvider(bank.adapterKey)
  const cred = await prisma.financeCredential.findFirst({
    where: { tenantId, bankId: bank.id, environment },
    orderBy: { updatedAt: 'desc' },
    include: { integration: { select: { storeCode: true, lastTestAt: true, lastTestStatus: true } } },
  })
  let credentials: Record<string, string> = {}
  let readable = true
  if (cred?.secretsEncrypted) {
    if (!isCryptoConfigured()) readable = false
    else {
      try { credentials = decryptSecretsStrict(cred.secretsEncrypted) } catch { readable = false }
    }
  }
  const ctx: BankContext = { tenantId, environment, credentials, storeCode: cred?.integration?.storeCode ?? null, correlationId }
  const integrated = !!provider && readable && provider.isIntegrated(ctx)
  const state = connectionState({
    adapterKey: bank.adapterKey, provider, hasCredential: !!cred, credentialReadable: readable,
    credentialExpiresAt: expiresAtOf(cred?.maskedHints), integrated,
  })
  return {
    bankId: bank.id, bankName: bank.name, adapterKey: bank.adapterKey, provider, ctx, state,
    live: state === 'CONECTADO' && !!provider, credentialId: cred?.id ?? null,
    lastTestAt: cred?.integration?.lastTestAt ?? null, lastTestStatus: cred?.integration?.lastTestStatus ?? null,
  }
}
