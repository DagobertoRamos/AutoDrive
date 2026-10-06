// =============================================================================
// Acesso ao Centro Financeiro — fonte única para APIs e páginas.
// Por padrão só MASTER, ADM (dono) e FINANCEIRO; qualquer outro colaborador só
// entra se o administrador liberar (UserModule allowed=true), e quem tem o papel
// pode ser bloqueado individualmente (allowed=false). Sem liberação o menu nem
// aparece (Sidebar usa /api/me/modules) e as rotas respondem 403/404.
//   finance          → ver o centro financeiro e relatórios
//   finance.manage   → lançar, baixar, transferir, configurar contas/plano
//   finance.payroll  → folha: salários, adiantamentos e pagamento de comissões
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, type SessionUser } from '@/lib/auth-guards'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'

export type FinancePermission = 'finance' | 'finance.manage' | 'finance.payroll'

/** O usuário pode usar a permissão financeira (papel + liberação/bloqueio individual + loja). */
export async function hasFinanceAccess(user: Pick<SessionUser, 'id' | 'role' | 'tenantId'>, perm: FinancePermission = 'finance'): Promise<boolean> {
  if (!(await canAccessModuleForUser(user, 'finance'))) return false
  if (perm !== 'finance' && !(await canAccessModuleForUser(user, perm))) return false
  return (await assertModuleEnabled(user as SessionUser, 'finance')) === null
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
