// =============================================================================
// finance/resolve-adapter.ts — wiring do PASS-THROUGH / BYOC.
// Resolve, para um (tenant, banco), o adapter a usar e o AdapterContext com as
// credenciais DO TENANT (decifradas em runtime). É o ponto único onde a
// credencial da loja entra no fluxo de integração — NUNCA uma credencial
// global/compartilhada. Enquanto o adapter real não estiver pronto (sem doc/
// credencial oficial homologada), faz fallback seguro para o ManualAdapter.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { FinanceEnvironment } from '@prisma/client'
import { getAdapter, type FinancingProviderAdapter, type AdapterContext } from './adapters'
import { decryptSecrets, isCryptoConfigured } from './crypto'

export interface ResolvedAdapter {
  adapter: FinancingProviderAdapter
  ctx: AdapterContext
  provider: { id: string; name: string; kind: string } | null
  source: 'INTEGRATION' | 'MANUAL'
  reason?: string
}

/**
 * Decide o adapter + contexto para enviar/simular no banco indicado, usando a
 * credencial do PRÓPRIO tenant. Fallback para Manual quando não há integração
 * configurada ou o adapter real ainda não está pronto.
 */
export async function resolveAdapterForTenantBank(
  tenantId: string,
  bankId: string | null,
  environment: FinanceEnvironment = 'HOMOLOGACAO',
): Promise<ResolvedAdapter> {
  const manual = (reason: string, provider: ResolvedAdapter['provider'] = null): ResolvedAdapter => ({
    adapter: getAdapter('MANUAL'),
    ctx: { tenantId, environment },
    provider,
    source: 'MANUAL',
    reason,
  })

  if (!bankId) return manual('Sem banco informado.')

  // BYOC: credencial DO TENANT para este banco (com integração → provedor).
  const cred = await prisma.financeCredential.findFirst({
    where: { tenantId, bankId },
    orderBy: { updatedAt: 'desc' },
    include: { integration: { include: { provider: true } } },
  })
  const provider = cred?.integration?.provider ?? null
  if (!cred || !provider) return manual('Sem integração/credencial do tenant para o banco — registro manual.')

  const env = cred.environment ?? environment
  const adapter = getAdapter(provider.kind)
  const ctx: AdapterContext = {
    tenantId,
    environment: env,
    baseUrl: env === 'PRODUCAO' ? provider.baseUrlProd : provider.baseUrlHomolog,
    apiVersion: provider.apiVersion,
    // Segredos da LOJA, decifrados só agora; nunca logados.
    credentials: isCryptoConfigured() ? decryptSecrets(cred.secretsEncrypted) : {},
    storeCode: cred.integration?.storeCode ?? null,
  }
  const provInfo = { id: provider.id, name: provider.name, kind: provider.kind }
  // Só usa o adapter real se ele de fato estiver pronto (doc/credencial homologada).
  if (!adapter.isReady(ctx)) return manual(`Adapter ${provider.kind} não está pronto — registro manual.`, provInfo)
  return { adapter, ctx, provider: provInfo, source: 'INTEGRATION' }
}
