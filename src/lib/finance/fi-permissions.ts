// =============================================================================
// finance/fi-permissions.ts — Permissões F&I da loja (adicionais ao RBAC base).
//
// A config `permissions` (FinanceTenantSetting) define, por capacidade, quais
// papéis podem agir. MASTER nunca é restringido aqui.
//
// Compatibilidade: configs antigas (sem `_v: 2`) tratam lista vazia das 3
// capacidades originais como "sem restrição". Capacidades novas sem
// configuração usam o padrão seguro abaixo (retorno, comissão e logs técnicos
// NÃO ficam abertos ao vendedor por padrão). Com `_v: 2`, a lista salva é
// exatamente quem pode (vazia = ninguém além do MASTER).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { permissionsSchema } from './settings'
import { decideFi, FI_CAPABILITIES, type FiCapability } from './fi-permissions-core'

export { decideFi, effectiveMatrix, FI_CAPABILITIES, roleAllowedByList, type FiCapability } from './fi-permissions-core'

async function loadConfig(tenantId: string): Promise<Record<string, unknown>> {
  const row = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: 'permissions' } } })
  const parsed = permissionsSchema.safeParse(row?.value ?? {})
  return parsed.success ? (parsed.data as Record<string, unknown>) : {}
}

/** Carrega a config de permissões da loja e decide a capacidade para o papel. */
export async function isFiAllowed(tenantId: string | null | undefined, capability: FiCapability, role: string): Promise<boolean> {
  if (role === 'MASTER') return true
  if (!tenantId) return false
  return decideFi(await loadConfig(tenantId), capability, role)
}

/** Todas as capacidades de uma vez (para a interface esconder o que não pode). */
export async function fiPermissionsFor(tenantId: string | null | undefined, role: string): Promise<Record<FiCapability, boolean>> {
  const cfg = role === 'MASTER' || !tenantId ? null : await loadConfig(tenantId)
  return Object.fromEntries(FI_CAPABILITIES.map((c) => [c.key, role === 'MASTER' ? true : !tenantId ? false : decideFi(cfg, c.key, role)])) as Record<FiCapability, boolean>
}

