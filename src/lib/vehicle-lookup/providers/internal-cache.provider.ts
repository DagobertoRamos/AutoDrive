// =============================================================================
// Provedor interno — verifica cache de consultas anteriores no banco de dados
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { VehicleLookupProvider, VehicleLookupResult } from '../types'

export class InternalCacheProvider implements VehicleLookupProvider {
  readonly name = 'internal_cache'

  async lookupByPlate(plate: string): Promise<VehicleLookupResult> {
    try {
      const cached = await prisma.vehicleLookupCache.findUnique({
        where: { plate },
      })

      if (!cached) {
        return { success: true, found: false, message: 'Sem registro em cache.' }
      }

      // Verifica TTL
      if (new Date() > cached.expiresAt) {
        // Cache expirado — apaga de forma não-bloqueante
        prisma.vehicleLookupCache.delete({ where: { plate } }).catch(() => {})
        return { success: true, found: false, message: 'Cache expirado.' }
      }

      if (!cached.found || !cached.data) {
        return { success: true, found: false, source: this.name }
      }

      return {
        success: true,
        found:   true,
        source:  this.name,
        data:    cached.data as never,
      }
    } catch (err) {
      // Cache indisponível não deve travar o fluxo
      console.warn('[InternalCacheProvider] Erro ao consultar cache:', err)
      return { success: false, found: false, error: 'Cache temporariamente indisponível.' }
    }
  }

  /** Persiste resultado no cache com TTL em dias */
  static async saveToCache(
    plate:    string,
    result:   VehicleLookupResult,
    ttlDays = 30,
  ): Promise<void> {
    try {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + ttlDays)

      await prisma.vehicleLookupCache.upsert({
        where:  { plate },
        create: {
          plate,
          found:     result.found,
          source:    result.source ?? null,
          data:      result.data as never ?? null,
          expiresAt,
        },
        update: {
          found:     result.found,
          source:    result.source ?? null,
          data:      result.data as never ?? null,
          expiresAt,
        },
      })
    } catch (err) {
      console.warn('[InternalCacheProvider] Erro ao salvar cache:', err)
    }
  }
}
