// =============================================================================
// finance/fi-permissions.ts — aplicação das Permissões F&I da loja (Fase 2b.3+).
// A config `permissions` (FinanceTenantSetting) define, por capacidade, quais
// papéis podem agir. Estas verificações são ADICIONAIS ao RBAC base.
// Padrão seguro: lista vazia / não configurada → sem restrição extra (não
// quebra lojas que ainda não configuraram). MASTER nunca é restringido aqui.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { permissionsSchema } from './settings'

export type FiCapability = 'enviarFicha' | 'aprovar' | 'alterarRetorno'

/** Decisão pura: o papel pode a capacidade dada a lista configurada? */
export function roleAllowedByList(list: string[] | null | undefined, role: string): boolean {
  if (role === 'MASTER') return true            // plataforma nunca é bloqueada aqui
  if (!list || list.length === 0) return true   // não configurado → sem restrição extra
  return list.includes(role)
}

/** Carrega a config de permissões da loja e decide a capacidade para o papel. */
export async function isFiAllowed(tenantId: string | null | undefined, capability: FiCapability, role: string): Promise<boolean> {
  if (role === 'MASTER') return true
  if (!tenantId) return true                     // sem loja vinculada → sem config a aplicar
  const row = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: 'permissions' } } })
  const parsed = permissionsSchema.safeParse(row?.value ?? {})
  const list = parsed.success ? parsed.data[capability] : []
  return roleAllowedByList(list, role)
}
