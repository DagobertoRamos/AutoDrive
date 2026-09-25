// =============================================================================
// tenant-lifecycle/access.ts — a loja do usuário está liberada?
//
// Usado no login (authorize) e a cada leitura de sessão (callback jwt do
// NextAuth). Cache curto em memória para não fazer 1 query por requisição;
// desativar a loja derruba as sessões abertas em até TTL segundos.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { isTenantBlocked } from './core'

const TTL_MS = 30_000
const cache = new Map<string, { at: number; status: string | null }>()

export async function getTenantStatus(tenantId: string): Promise<string | null> {
  const now = Date.now()
  const hit = cache.get(tenantId)
  if (hit && now - hit.at < TTL_MS) return hit.status
  try {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } })
    const status = t ? String(t.status) : 'INEXISTENTE'
    cache.set(tenantId, { at: now, status })
    return status
  } catch {
    // fail-open: uma falha de leitura NUNCA pode deslogar todas as lojas.
    return hit?.status ?? null
  }
}

/** true = a loja existe e está desativada/suspensa/cancelada (ou foi apagada). */
export async function isTenantAccessBlocked(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false
  const status = await getTenantStatus(tenantId)
  return status === 'INEXISTENTE' || isTenantBlocked(status)
}

/** Chamado ao mudar o status para valer na hora nesta instância. */
export function invalidateTenantStatus(tenantId: string): void {
  cache.delete(tenantId)
}
