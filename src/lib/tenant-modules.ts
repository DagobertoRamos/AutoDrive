// =============================================================================
// tenant-modules.ts — habilitação de funcionalidades por tenant (TenantModule).
// Default: SEM registro = HABILITADO (compatível com tenants existentes).
// `requireModule` é o gate único de API: checa o PAPEL (canAccessModule) E se a
// funcionalidade está habilitada para a loja. MASTER ignora o gate de tenant.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { forbiddenResponse, type SessionUser } from '@/lib/auth-guards'
import { canAccessModule, type Module } from '@/lib/permissions'

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
