// =============================================================================
// Plate Lookup — Service Central
//
// Orquestra providers configuráveis via IntegrationCredential service=PLATE_LOOKUP.
// Hoje suporta apenas o AuthorizedProvider; arquitetura permite somar outros.
//
// Função principal:
//   lookupPlate(plate) → PlateLookupResult
//
// O retorno é sempre normalizado. Nunca lança exceção.
// =============================================================================

import { AuthorizedPlateProvider } from './providers/authorized.provider'
import type { PlateLookupResult } from './types'

const PROVIDERS = [AuthorizedPlateProvider]

export async function lookupPlate(plate: string): Promise<PlateLookupResult> {
  const normalized = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (normalized.length < 6) {
    return { ok: false, found: false, source: 'service', error: 'Placa inválida.' }
  }

  for (const p of PROVIDERS) {
    if (!(await p.isConfigured())) continue
    const r = await p.lookupByPlate(normalized)
    // Se o provedor respondeu de forma conclusiva (ok), retorna.
    // Se deu erro, tenta o próximo provedor.
    if (r.ok || r.found) return r
  }

  // Nenhum provedor configurado / disponível.
  return {
    ok:     false,
    found:  false,
    source: 'service',
    error:  'Nenhuma integração de placa configurada. Preencha os dados do veículo manualmente.',
  }
}

export async function isAnyPlateProviderConfigured(): Promise<boolean> {
  for (const p of PROVIDERS) {
    if (await p.isConfigured()) return true
  }
  return false
}

export { clearPlateProviderCache } from './providers/authorized.provider'
