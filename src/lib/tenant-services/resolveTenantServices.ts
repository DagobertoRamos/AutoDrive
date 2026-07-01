import type { SessionUser } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { getDisabledModules, getOpenModules, getUserDeniedModules } from '@/lib/tenant-modules'
import {
  TENANT_SERVICE_DEFINITIONS,
  createTenantServiceFlags,
  type TenantServiceFlags,
} from '@/lib/tenant-services/types'

export interface EvaluateTenantServicesInput {
  role: string
  disabledModules?: string[]
  deniedModules?: string[]
  openModules?: string[]
  ignoreRoleGate?: boolean
}

export interface TenantServicesResult {
  flags: TenantServiceFlags
  disabledModules: string[]
  deniedModules: string[]
  openModules: string[]
}

function isModuleBlocked(module: string, disabled: Set<string>): boolean {
  let current = module
  while (current) {
    if (disabled.has(current)) return true
    const parentSeparator = current.lastIndexOf('.')
    if (parentSeparator === -1) return false
    current = current.slice(0, parentSeparator)
  }
  return false
}

export function evaluateTenantServices({
  role,
  disabledModules = [],
  deniedModules = [],
  openModules = [],
  ignoreRoleGate = false,
}: EvaluateTenantServicesInput): TenantServiceFlags {
  const flags = createTenantServiceFlags(false)
  const disabled = new Set([...disabledModules, ...deniedModules])
  const open = new Set(openModules)

  for (const service of TENANT_SERVICE_DEFINITIONS) {
    flags[service.key] = service.modules.some((module) => {
      if (isModuleBlocked(module, disabled)) return false
      if (ignoreRoleGate) return true
      return canAccessModule(role, module) || open.has(module)
    })
  }

  return flags
}

export async function getTenantServicesForUser(user: SessionUser): Promise<TenantServicesResult> {
  if (user.role === 'MASTER' || !user.tenantId) {
    return {
      flags: evaluateTenantServices({ role: user.role, ignoreRoleGate: true }),
      disabledModules: [],
      deniedModules: [],
      openModules: [],
    }
  }

  const [disabledModules, deniedModules, openModules] = await Promise.all([
    getDisabledModules(user.tenantId),
    getUserDeniedModules(user.id),
    getOpenModules(user.tenantId),
  ])

  return {
    flags: evaluateTenantServices({
      role: user.role,
      disabledModules,
      deniedModules,
      openModules,
    }),
    disabledModules,
    deniedModules,
    openModules,
  }
}
