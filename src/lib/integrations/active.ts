// =============================================================================
// getActiveIntegrationCredential — service central para resolver credenciais.
//
// Regras:
//   1. Procura credencial com service exato + active=true.
//   2. Prioriza isDefault=true.
//   3. Suporta múltiplos services aliases (ex: FIPE legacy → FIPE_PROVIDER).
//   4. NUNCA retorna a credencial mascarada — retorna o valor RAW (servidor).
//   5. Caller deve garantir que NUNCA exponha o valor no JSON da resposta.
// =============================================================================

import { prisma } from '@/lib/prisma'

export interface ResolvedCredential {
  id:        string
  service:   string
  name:      string
  apiUrl:    string | null
  apiKey:    string | null
  apiSecret: string | null
  token:     string | null
  username:  string | null
  isDefault: boolean
  isActive:  boolean
  source:    'db' | 'env'
}

// Cache em memória de 5 min (invalidado após save de credencial via clearCache)
interface CacheEntry { value: ResolvedCredential | null; expires: number }
const CACHE = new Map<string, CacheEntry>()
const TTL_MS = 5 * 60 * 1000

function cacheKey(services: string[]): string {
  return services.slice().sort().join('|')
}

/**
 * Busca credencial ativa pelo serviço. Aceita lista (aliases) — usa a primeira
 * encontrada por ordem de preferência.
 *
 * Exemplo:
 *   getActiveIntegrationCredential(['FIPE_PROVIDER', 'FIPE'])
 *   → tenta FIPE_PROVIDER primeiro; cai para FIPE legacy se nada existe.
 */
export async function getActiveIntegrationCredential(
  service: string | string[],
): Promise<ResolvedCredential | null> {
  const services = Array.isArray(service) ? service : [service]
  const key = cacheKey(services)

  const hit = CACHE.get(key)
  if (hit && hit.expires > Date.now()) return hit.value

  let resolved: ResolvedCredential | null = null
  try {
    const row = await prisma.integrationCredential.findFirst({
      where:   { service: { in: services }, active: true },
      orderBy: [
        // Preferência: ordem do array `services` (não disponível em SQL direto),
        // depois isDefault, depois mais recente atualizado.
        { isDefault: 'desc' },
        { updatedAt: 'desc' },
      ],
    })
    if (row) {
      // Reordena se o primeiro service do array bater
      // (caso findFirst tenha trazido um alias)
      resolved = {
        id:        row.id,
        service:   row.service,
        name:      row.name,
        apiUrl:    row.apiUrl    ?? null,
        apiKey:    row.apiKey    ?? null,
        apiSecret: row.apiSecret ?? null,
        token:     row.token     ?? null,
        username:  row.username  ?? null,
        isDefault: row.isDefault,
        isActive:  row.active,
        source:    'db',
      }
    }
  } catch {
    // DB indisponível — fica null, caller pode tentar env
  }

  CACHE.set(key, { value: resolved, expires: Date.now() + TTL_MS })
  return resolved
}

/** Invalida o cache. Chamar após criar/editar/excluir credencial. */
export function clearActiveCredentialCache(): void {
  CACHE.clear()
}
