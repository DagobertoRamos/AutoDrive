// =============================================================================
// Acesso ao Centro Financeiro — fonte única para APIs e páginas.
// Por padrão só MASTER, ADM (dono) e FINANCEIRO; qualquer outro colaborador só
// entra se o administrador liberar (UserModule allowed=true), e quem tem o papel
// pode ser bloqueado individualmente (allowed=false). Sem liberação o menu nem
// aparece (Sidebar usa /api/me/modules) e as rotas respondem 403/404.
//   finance          → ver o centro financeiro e relatórios
//   finance.manage   → lançar, baixar, transferir, configurar contas/plano
//   finance.payroll  → folha: salários, adiantamentos e pagamento de comissões
//   finas (financeCan): settle, reverse, reconcile (herdam de manage); balances,
//   profit, export (herdam de finance); period (só ADM/MASTER ou liberação).
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, type SessionUser } from '@/lib/auth-guards'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { prisma } from '@/lib/prisma'
import { canAccessModule, type Module } from '@/lib/permissions'

export type FinancePermission = 'finance' | 'finance.manage' | 'finance.payroll'
/** Permissões finas: sem liberação/bloqueio individual, valem as do pai. */
export type FinanceFinePermission = 'finance.settle' | 'finance.reverse' | 'finance.reconcile' | 'finance.balances' | 'finance.profit' | 'finance.export' | 'finance.period'
const FINE_PARENT: Record<FinanceFinePermission, FinancePermission | null> = {
  'finance.settle': 'finance.manage', 'finance.reverse': 'finance.manage', 'finance.reconcile': 'finance.manage',
  'finance.balances': 'finance', 'finance.profit': 'finance', 'finance.export': 'finance', 'finance.period': null,
}

/** O usuário pode usar a permissão financeira (papel + liberação/bloqueio individual + loja). */
export async function hasFinanceAccess(user: Pick<SessionUser, 'id' | 'role' | 'tenantId'>, perm: FinancePermission = 'finance'): Promise<boolean> {
  if (!(await canAccessModuleForUser(user, 'finance'))) return false
  if (perm !== 'finance' && !(await canAccessModuleForUser(user, perm))) return false
  return (await assertModuleEnabled(user as SessionUser, 'finance')) === null
}

/**
 * Permissão fina do financeiro: liberação/bloqueio individual (UserModule) vale;
 * sem ela, o padrão do cargo OU a permissão-pai (quem já lançava continua baixando).
 */
export async function financeCan(user: Pick<SessionUser, 'id' | 'role' | 'tenantId'>, perm: FinanceFinePermission): Promise<boolean> {
  const row = user.id ? await prisma.userModule.findUnique({ where: { userId_moduleKey: { userId: user.id, moduleKey: perm } }, select: { allowed: true } }).catch(() => null) : null
  if (row) return row.allowed && (perm === 'finance.profit' || await hasFinanceAccess(user))
  // Lucro: a gestão vê o resultado da venda mesmo sem o centro financeiro.
  if (perm === 'finance.profit' && ['MASTER', 'ADM', 'GERENTE_GERAL'].includes(user.role)) return true
  if (canAccessModule(user.role, perm as Module)) return hasFinanceAccess(user)
  const parent = FINE_PARENT[perm]
  return parent ? hasFinanceAccess(user, parent) : false
}

/** Resposta 403 pronta quando falta a permissão fina. */
export async function requireFinance(user: Pick<SessionUser, 'id' | 'role' | 'tenantId'>, perm: FinanceFinePermission): Promise<NextResponse | null> {
  return (await financeCan(user, perm)) ? null : NextResponse.json({ success: false, error: 'Sem permissão para esta ação no financeiro.' }, { status: 403 })
}

/**
 * Guarda das rotas /api/finance/*. Retorna o usuário e a loja efetiva (MASTER
 * opera na loja escolhida no seletor do topo) ou a resposta de erro pronta.
 * Com `req`, a loja é obrigatória (centro financeiro é sempre de uma loja).
 */
export async function financeGuard(perm: FinancePermission = 'finance', req?: Request):
  Promise<{ user: SessionUser; tenantId: string; error?: undefined } | { error: NextResponse; user?: undefined; tenantId?: undefined }> {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  if (!(await canAccessModuleForUser(user, 'finance'))) return { error: forbiddenResponse('Sem acesso ao financeiro.') }
  if (perm !== 'finance' && !(await canAccessModuleForUser(user, perm))) {
    return { error: forbiddenResponse(perm === 'finance.payroll' ? 'Sem acesso à folha.' : 'Sem permissão para alterar o financeiro.') }
  }
  const gate = await assertModuleEnabled(user, 'finance')
  if (gate) return { error: gate }
  const tenantId = req ? await resolveActingTenant(user, req) : user.tenantId
  if (!tenantId) return { error: NextResponse.json({ success: false, error: actingTenantError(user) }, { status: 400 }) }
  return { user, tenantId }
}
