// =============================================================================
// Registry de adapters — resolve o adapter pelo FinanceProvider.kind.
// MANUAL/OUTRO → ManualAdapter (seguro, sem automação).
// CREDERE      → CredereAdapter (preparado, não configurado).
// BANCO_DIRETO/INTEGRADOR → GenericBankAdapter (molde de API oficial).
// =============================================================================

import type { FinanceProviderKind } from '@prisma/client'
import type { FinancingProviderAdapter } from './types'
import { ManualAdapter } from './manual'
import { CredereAdapter } from './credere'
import { GenericBankAdapter } from './generic-bank'

// Singletons (adapters são sem estado).
const manual = new ManualAdapter()
const credere = new CredereAdapter()
const bancoDireto = new GenericBankAdapter('BANCO_DIRETO')
const integrador = new GenericBankAdapter('INTEGRADOR')

/** Retorna o adapter para um kind de provedor. Default seguro: ManualAdapter. */
export function getAdapter(kind: FinanceProviderKind): FinancingProviderAdapter {
  switch (kind) {
    case 'CREDERE': return credere
    case 'BANCO_DIRETO': return bancoDireto
    case 'INTEGRADOR': return integrador
    case 'MANUAL':
    case 'OUTRO':
    default: return manual
  }
}

/** Resolve a partir de um provider (objeto com `kind`). */
export function resolveAdapterForProvider(provider: { kind: FinanceProviderKind }): FinancingProviderAdapter {
  return getAdapter(provider.kind)
}
