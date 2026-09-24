// =============================================================================
// tenant-modules.ts — habilitação de funcionalidades por tenant (TenantModule).
// Default: SEM registro = HABILITADO (compatível com tenants existentes).
// `requireModule` é o gate único de API: checa o PAPEL (canAccessModule) E se a
// funcionalidade está habilitada para a loja. MASTER ignora o gate de tenant.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { forbiddenResponse, type SessionUser } from '@/lib/auth-guards'
import { canAccessModule, type Module } from '@/lib/permissions'
import { effectiveRolePermission, isCrmPermission, sanitizeRolePermissions, type RolePermissionOverrides } from '@/lib/crm/permissions-core'

/** Lista as chaves desabilitadas (active=false) do tenant. */
export async function getDisabledModules(tenantId: string): Promise<string[]> {
  try {
    const rows = await prisma.tenantModule.findMany({ where: { tenantId, active: false }, select: { module: true } })
    return rows.map((r) => r.module)
  } catch (err) {
    // Fail-open: se a consulta de entitlement falhar, não escondemos nada.
    console.error('[tenant-modules] getDisabledModules falhou:', err)
    return []
  }
}

/** Módulos LIBERADOS para todos os colaboradores do tenant (chavinha) — mesmo
 *  para quem o papel normalmente não teria. Guardado em SystemSetting. */
export async function getOpenModules(tenantId: string): Promise<string[]> {
  try {
    const row = await prisma.systemSetting.findFirst({ where: { key: `t:${tenantId}:open_modules` }, select: { value: true } })
    if (!row?.value) return []
    const arr = JSON.parse(row.value)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

/** Liga/desliga a chavinha "liberar para todos" de um módulo (merge no JSON). */
export async function setModuleOpenToAll(tenantId: string, moduleKey: string, open: boolean): Promise<void> {
  const key = `t:${tenantId}:open_modules`
  const current = await getOpenModules(tenantId)
  const next = open ? [...new Set([...current, moduleKey])] : current.filter((m) => m !== moduleKey)
  const value = JSON.stringify(next)
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key, value, group: 'modules' } })
}

/** Módulos REMOVIDOS de um colaborador (override allowed=false por usuário). */
export async function getUserDeniedModules(userId: string): Promise<string[]> {
  try {
    const rows = await prisma.userModule.findMany({ where: { userId, allowed: false }, select: { moduleKey: true } })
    return rows.map((r) => r.moduleKey)
  } catch (err) {
    console.error('[tenant-modules] getUserDeniedModules falhou:', err)
    return []
  }
}

/** Módulos LIBERADOS explicitamente para um colaborador (extra além do cargo). */
export async function getUserAllowedModules(userId: string): Promise<string[]> {
  try {
    const rows = await prisma.userModule.findMany({ where: { userId, allowed: true }, select: { moduleKey: true } })
    return rows.map((r) => r.moduleKey)
  } catch (err) {
    console.error('[tenant-modules] getUserAllowedModules falhou:', err)
    return []
  }
}

/** Permissão final do colaborador: cargo + extra individual - bloqueio individual. */
// Regras de permissão do CRM por LOJA (Configurações do CRM → Permissões).
// Cache curto por processo: cada request checa várias permissões.
const CRM_ROLE_TTL_MS = 30_000
const crmRoleCache = new Map<string, { at: number; value: RolePermissionOverrides }>()

async function crmRoleOverrides(tenantId: string): Promise<RolePermissionOverrides> {
  const hit = crmRoleCache.get(tenantId)
  if (hit && Date.now() - hit.at < CRM_ROLE_TTL_MS) return hit.value
  let value: RolePermissionOverrides = {}
  try {
    const row = await prisma.systemSetting.findFirst({ where: { key: `t:${tenantId}:crm_settings:v1` }, select: { value: true } })
    if (row) value = sanitizeRolePermissions((JSON.parse(row.value) as { rolePermissions?: unknown }).rolePermissions)
  } catch (err) {
    console.error('[tenant-modules] regras de permissão do CRM falharam:', err)
  }
  crmRoleCache.set(tenantId, { at: Date.now(), value })
  return value
}

/** Permissões do CRM que a loja mudou para um perfil (p/ o menu). */
export async function getCrmRoleDiff(tenantId: string, role: string): Promise<{ allow: string[]; deny: string[] }> {
  const overrides = await crmRoleOverrides(tenantId)
  const allow: string[] = [], deny: string[] = []
  for (const [key, roles] of Object.entries(overrides)) {
    const v = roles[role]
    if (v === true) allow.push(key)
    else if (v === false) deny.push(key)
  }
  return { allow, deny }
}

/** Chamar após salvar as permissões do CRM (vale no processo atual; outros em até 30s). */
export function invalidateCrmRoleCache(tenantId: string): void {
  crmRoleCache.delete(tenantId)
}

export async function canAccessModuleForUser(user: { id?: string; role?: string | null; tenantId?: string | null }, module: Module | string): Promise<boolean> {
  let base = canAccessModule(user.role ?? undefined, module as Module)
  // Camada da loja (só CRM; MASTER nunca é afetado).
  if (user.tenantId && user.role && user.role !== 'MASTER' && isCrmPermission(module)) {
    base = effectiveRolePermission(user.role, module, await crmRoleOverrides(user.tenantId))
  }
  if (!user.id) return base
  try {
    const row = await prisma.userModule.findUnique({ where: { userId_moduleKey: { userId: user.id, moduleKey: module } }, select: { allowed: true } })
    if (row) return row.allowed
  } catch (err) {
    console.error('[tenant-modules] canAccessModuleForUser falhou:', err)
  }
  return base
}

/** true se o módulo foi explicitamente removido para o colaborador. */
export async function isModuleDeniedForUser(userId: string, module: string): Promise<boolean> {
  try {
    const row = await prisma.userModule.findUnique({ where: { userId_moduleKey: { userId, moduleKey: module } }, select: { allowed: true } })
    return row ? !row.allowed : false
  } catch (err) {
    console.error('[tenant-modules] isModuleDeniedForUser falhou:', err)
    return false // fail-open
  }
}

/**
 * true se a funcionalidade está habilitada p/ o tenant (default = true).
 * Fail-open: erro na consulta => habilitado (não trava a loja por falha do gate).
 */
export async function isModuleEnabled(tenantId: string, module: string): Promise<boolean> {
  try {
    const row = await prisma.tenantModule.findUnique({ where: { tenantId_module: { tenantId, module } }, select: { active: true } })
    return row ? row.active : true
  } catch (err) {
    console.error('[tenant-modules] isModuleEnabled falhou:', err)
    return true
  }
}

/**
 * Gate de API: retorna NextResponse(403) se o papel não permite OU se a loja
 * não tem a funcionalidade habilitada; caso contrário, null (segue). MASTER
 * (plataforma) não é barrado pelo gate de tenant.
 */
export async function requireModule(user: SessionUser, module: Module) {
  if (!canAccessModule(user.role, module)) return forbiddenResponse('Acesso não permitido.')
  if (user.role !== 'MASTER' && user.tenantId) {
    const ok = await isModuleEnabled(user.tenantId, module)
    if (!ok) return forbiddenResponse('Este recurso não está habilitado para a sua loja. Fale com o suporte.')
  }
  return null
}

/**
 * Gate APENAS de tenant (NÃO checa papel) — para usar EM ADIÇÃO aos gates de
 * papel já existentes na rota, sem perturbá-los. Retorna NextResponse(403) se a
 * loja não tem a funcionalidade habilitada; senão null. MASTER nunca é barrado.
 * `module` aqui é a chave RAIZ da área no modules-catalog (ex.: 'negotiations',
 * 'stock.view') — desligá-la bloqueia a área inteira para a loja.
 */
export async function assertModuleEnabled(user: { id?: string; role: string; tenantId?: string | null }, module: string) {
  if (user.role === 'MASTER') return null
  if (user.tenantId) {
    const ok = await isModuleEnabled(user.tenantId, module)
    if (!ok) return forbiddenResponse('Este recurso não está habilitado para a sua loja. Fale com o suporte.')
  }
  // Override por colaborador: módulo removido por um superior (ADM/gestão).
  if (user.id) {
    const denied = await isModuleDeniedForUser(user.id, module)
    if (denied) return forbiddenResponse('Você não tem acesso a este recurso. Fale com o gestor.')
  }
  return null
}
