// =============================================================================
// marketing/acting-tenant.ts — "loja ativa" para o MASTER operar o Marketing.
// Marketing (Mesa SDR/Telefonia) é tenant-scoped (BYOC). Não-MASTER usa o
// próprio tenant. O MASTER, que não tem loja, escolhe uma "loja ativa" enviada
// via cookie `mkt_acting_tenant` (ou header `x-acting-tenant`); só é honrada
// para MASTER e a loja é VALIDADA. Isolamento entre lojas preservado.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { SessionUser } from '@/lib/auth-guards'

export const ACTING_TENANT_COOKIE = 'mkt_acting_tenant'

function readActing(req: Request): string | null {
  const h = req.headers.get('x-acting-tenant')
  if (h && h.trim()) return h.trim()
  const c = req.headers.get('cookie') ?? ''
  const m = c.match(/(?:^|;\s*)mkt_acting_tenant=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** Tenant efetivo da requisição (null se MASTER não escolheu loja válida). */
export async function resolveActingTenant(user: SessionUser, req: Request): Promise<string | null> {
  if (user.role !== 'MASTER') return user.tenantId ?? null
  const id = readActing(req)
  if (!id) return null
  const t = await prisma.tenant.findUnique({ where: { id }, select: { id: true } })
  return t?.id ?? null
}

export function actingTenantError(user: SessionUser): string {
  return user.role === 'MASTER'
    ? 'Selecione uma loja para operar — o Marketing é uma área da loja (use o seletor no topo).'
    : 'Esta área pertence à loja.'
}
