// =============================================================================
// CNPJ Lookup — Orquestrador de providers (Adapter Pattern)
//
// Ordem de consulta:
//   1. AuthorizedProvider (se configurado via env vars)
//   2. BrasilAPIProvider (fallback público, legal)
//
// O campo `raw` é removido antes de retornar ao chamador para evitar
// vazamento de dados brutos / tokens de API.
// =============================================================================

import { AuthorizedCNPJProvider } from './providers/authorized.provider'
import { BrasilAPIProvider }       from './providers/brasilapi.provider'
import type { CompanyLookupResult } from './types'

/**
 * Realiza lookup de CNPJ usando os providers configurados.
 * Sempre retorna um resultado válido — nunca lança exceção.
 *
 * @param cnpj CNPJ normalizado (14 dígitos)
 */
export async function lookupCNPJ(cnpj: string): Promise<CompanyLookupResult> {
  // Provider 1: autorizado (se configurado)
  const authResult = await AuthorizedCNPJProvider.lookupByCNPJ(cnpj)
  if (authResult.found && authResult.data) {
    return stripRaw(authResult)
  }

  // Provider 2: BrasilAPI (fallback)
  const brasilResult = await BrasilAPIProvider.lookupByCNPJ(cnpj)
  return stripRaw(brasilResult)
}

/**
 * Remove o campo `raw` do resultado para evitar vazamento de dados internos.
 */
function stripRaw(result: CompanyLookupResult): CompanyLookupResult {
  if (result.data) {
    const { raw: _raw, ...cleanData } = result.data
    void _raw
    return { ...result, data: cleanData }
  }
  return result
}
