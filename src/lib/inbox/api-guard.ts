// Caixa de Entrada — guarda comum das rotas (sessão, módulo CRM, loja e escopo).
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { resolveCrmScope, type CrmScope } from '@/lib/crm/shared'
import type { InboxUser } from './conversations'

export type InboxGuard =
  | { ok: true; tenantId: string; scope: CrmScope; user: InboxUser }
  | { ok: false; response: Response }

export async function inboxGuard(req: Request): Promise<InboxGuard> {
  const user = await getSessionUser()
  if (!user) return { ok: false, response: unauthorizedResponse() }
  if (!await canAccessModuleForUser(user, 'crm')) return { ok: false, response: forbiddenResponse('Sem acesso ao CRM.') }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { ok: false, response: forbiddenResponse(actingTenantError(user)) }
  const scope = await resolveCrmScope(user)
  if (!scope) return { ok: false, response: forbiddenResponse('Sem acesso às conversas.') }
  return { ok: true, tenantId, scope, user: { id: user.id, name: user.name ?? null, unitId: user.unitId ?? null } }
}
