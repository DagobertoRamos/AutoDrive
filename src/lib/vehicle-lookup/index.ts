// =============================================================================
// Orquestrador de consulta veicular por placa
// Tenta os provedores na seguinte ordem:
//   1. Cache interno (banco de dados)
//   2. Provedor externo autorizado (se configurado)
//   3. Fallback — retorna not-found com instrução de preenchimento manual
//
// NUNCA lança exceção para o chamador.
// NUNCA expõe tokens ou dados sensíveis do provedor no retorno ao cliente.
// =============================================================================

import { InternalCacheProvider } from './providers/internal-cache.provider'
import { AuthorizedProvider }    from './providers/authorized.provider'
import type { VehicleLookupResult } from './types'

const cacheProvider      = new InternalCacheProvider()
const authorizedProvider = new AuthorizedProvider()

/** TTL padrão do cache em dias */
const CACHE_TTL_DAYS = Number(process.env.VEHICLE_LOOKUP_CACHE_TTL_DAYS ?? 30)

/**
 * Ponto de entrada único para consulta por placa.
 *
 * @param plate - Placa normalizada (sem hífen, maiúsculo)
 * @param forceRefresh - Se true, ignora cache e consulta o provedor externo
 */
export async function lookupVehicleByPlate(
  plate:        string,
  forceRefresh = false,
): Promise<VehicleLookupResult> {

  // ── 1. Cache interno ────────────────────────────────────────────────────────
  if (!forceRefresh) {
    const cached = await cacheProvider.lookupByPlate(plate)
    if (cached.success && cached.found) {
      return cached
    }
  }

  // ── 2. Provedor externo autorizado ─────────────────────────────────────────
  const externalResult = await authorizedProvider.lookupByPlate(plate)

  // Persiste no cache independente do resultado (found ou not-found) para
  // evitar requisições repetidas em caso de placa genuinamente não encontrada
  await InternalCacheProvider.saveToCache(plate, externalResult, CACHE_TTL_DAYS)

  if (externalResult.success && externalResult.found) {
    // Remove campo raw antes de retornar (nunca expor ao cliente)
    const safe = { ...externalResult }
    if (safe.data) {
      const { raw: _, ...dataWithoutRaw } = safe.data
      safe.data = dataWithoutRaw
    }
    return safe
  }

  // ── 3. Fallback manual ─────────────────────────────────────────────────────
  return {
    success: true,
    found:   false,
    message: 'Não foi possível localizar os dados automaticamente. Preencha manualmente.',
  }
}
