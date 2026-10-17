// =============================================================================
// dashboard/access.ts — acesso EFETIVO do colaborador para o dashboard.
//
// O dashboard precisa mostrar exatamente o que está liberado para CADA
// colaborador, com a mesma regra do menu e dos gates de API:
//   1. funcionalidade desligada para a loja (TenantModule, inclusive ancestral) → bloqueia;
//   2. exceção individual do colaborador (UserModule allowed=true/false) → vence;
//   3. regra do CRM da loja por perfil (Configurações do CRM → Permissões);
//   4. papel (permissions.ts) OU "liberado para todos" (chavinha da loja).
// Tudo é carregado em UMA leva de consultas (sem N+1) e avaliado em memória.
// =============================================================================

import type { SessionUser } from '@/lib/auth-guards'
import { canAccessModule, type Module } from '@/lib/permissions'
import {
  getCrmRoleDiff,
  getDisabledModules,
  getOpenModules,
  getUserAllowedModules,
  getUserDeniedModules,
} from '@/lib/tenant-modules'

export interface ModuleAccessInput {
  role: string
  /** Desligados para a loja (TenantModule active=false). */
  disabledModules?: string[]
  /** Liberados para todos os colaboradores da loja (chavinha). */
  openModules?: string[]
  /** Exceções individuais do colaborador. */
  userAllowed?: string[]
  userDenied?: string[]
  /** Regras do CRM da loja para o perfil. */
  crmAllow?: string[]
  crmDeny?: string[]
}

export interface DashboardAccess {
  role: string
  can: (module: Module) => boolean
  /** true se QUALQUER um dos módulos estiver liberado (lista vazia = livre). */
  canAny: (modules: readonly Module[] | undefined) => boolean
}

function blockedByAncestor(module: string, disabled: Set<string>): boolean {
  let current = module
  while (current) {
    if (disabled.has(current)) return true
    const dot = current.lastIndexOf('.')
    if (dot === -1) return false
    current = current.slice(0, dot)
  }
  return false
}

/** Regra pura (testável) — espelha menu (/api/me/modules) e canAccessModuleForUser. */
export function evaluateModuleAccess(input: ModuleAccessInput, module: string): boolean {
  if (input.role === 'MASTER') return canAccessModule(input.role, module as Module)
  const disabled = new Set(input.disabledModules ?? [])
  if (blockedByAncestor(module, disabled)) return false
  if ((input.userDenied ?? []).includes(module)) return false
  if ((input.userAllowed ?? []).includes(module)) return true
  if ((input.crmDeny ?? []).includes(module)) return false
  if ((input.crmAllow ?? []).includes(module)) return true
  return canAccessModule(input.role, module as Module) || (input.openModules ?? []).includes(module)
}

export function createDashboardAccess(input: ModuleAccessInput): DashboardAccess {
  const cache = new Map<string, boolean>()
  const can = (module: Module) => {
    const hit = cache.get(module)
    if (hit !== undefined) return hit
    const value = evaluateModuleAccess(input, module)
    cache.set(module, value)
    return value
  }
  return {
    role: input.role,
    can,
    canAny: (modules) => !modules || modules.length === 0 || modules.some(can),
  }
}

export async function loadDashboardAccess(user: SessionUser): Promise<DashboardAccess> {
  if (user.role === 'MASTER' || !user.tenantId) return createDashboardAccess({ role: user.role })
  const [disabledModules, openModules, userAllowed, userDenied, crm] = await Promise.all([
    getDisabledModules(user.tenantId),
    getOpenModules(user.tenantId),
    getUserAllowedModules(user.id),
    getUserDeniedModules(user.id),
    getCrmRoleDiff(user.tenantId, user.role).catch(() => ({ allow: [] as string[], deny: [] as string[] })),
  ])
  return createDashboardAccess({
    role: user.role,
    disabledModules,
    openModules,
    userAllowed,
    userDenied,
    crmAllow: crm.allow,
    crmDeny: crm.deny,
  })
}
