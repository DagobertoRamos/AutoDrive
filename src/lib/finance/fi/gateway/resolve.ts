// =============================================================================
// Resolve, para (loja, banco), o conector + contexto com a credencial DA LOJA
// (BYOC, decifrada só agora, nunca logada) e o estado de conexão.
// Credenciais não são compartilhadas entre lojas/filiais: sempre por tenantId.
//
// Reserva pela Credere: sem conexão DIRETA ativa com o banco, a ficha vai pela
// Credere da loja (quando conectada) para aquele banco (código Febraban).
// `via` força o canal de uma tentativa já enviada (consulta/cancelamento vão
// sempre pelo mesmo canal do envio).
// =============================================================================

import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { decryptSecretsStrict, isCryptoConfigured } from '../../crypto'
import { connectionState, currentFiEnvironment, getBankProvider, type ConnectionState } from './registry'
import { credereReady, findCredereConnection, patchCredereConnection } from './credere-connection'
import { febrabanFor } from './credere'
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
  /** Canal usado: direto com o banco ou pela Credere (reserva). */
  via: 'DIRETO' | 'CREDERE'
}

export type ResolveVia = 'AUTO' | 'DIRETO' | 'CREDERE'

/** Canal de uma tentativa já criada: a consulta segue o mesmo caminho do envio. */
export function viaOf(sub: { providerId?: string | null; mode?: string | null }): ResolveVia {
  if (sub.providerId === 'credere') return 'CREDERE'
  return sub.mode === 'API' ? 'DIRETO' : 'AUTO'
}

function expiresAtOf(hints: unknown): Date | null {
  const v = hints && typeof hints === 'object' ? (hints as Record<string, unknown>).expiresAt : null
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function resolveBank(
  tenantId: string, bank: { id: string; name: string; adapterKey: string | null; code?: string | null },
  correlationId: string = randomUUID(), via: ResolveVia = 'AUTO',
): Promise<ResolvedBank> {
  const direct = via === 'CREDERE' ? null : await resolveDirect(tenantId, bank, correlationId)
  if (direct && (direct.live || via === 'DIRETO' || direct.provider?.channel === 'TESTE')) return direct
  const viaCredere = await resolveViaCredere(tenantId, bank, correlationId)
  return viaCredere ?? direct ?? resolveDirect(tenantId, bank, correlationId)
}

async function resolveViaCredere(tenantId: string, bank: { id: string; name: string; adapterKey: string | null; code?: string | null }, correlationId: string): Promise<ResolvedBank | null> {
  const provider = getBankProvider('credere')
  if (!provider) return null
  const environment = currentFiEnvironment()
  const conn = await findCredereConnection(tenantId, environment)
  if (!credereReady(conn)) return null
  const code = bank.code !== undefined ? bank.code : (await prisma.financeBank.findUnique({ where: { id: bank.id }, select: { code: true } }))?.code ?? null
  const routedBankCode = febrabanFor({ adapterKey: bank.adapterKey, code, name: bank.name })
  if (!routedBankCode) return null
  const credentialId = conn!.credentialId
  const ctx: BankContext = {
    tenantId, environment, credentials: { ...conn!.credentials }, correlationId, routedBankCode,
    persistCredentials: (patch) => patchCredereConnection(credentialId, patch),
  }
  return {
    bankId: bank.id, bankName: bank.name, adapterKey: bank.adapterKey, provider, ctx, state: 'CONECTADO', live: true,
    credentialId, lastTestAt: null, lastTestStatus: null, via: 'CREDERE',
  }
}

async function resolveDirect(tenantId: string, bank: { id: string; name: string; adapterKey: string | null }, correlationId: string): Promise<ResolvedBank> {
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
    lastTestAt: cred?.integration?.lastTestAt ?? null, lastTestStatus: cred?.integration?.lastTestStatus ?? null, via: 'DIRETO',
  }
}
