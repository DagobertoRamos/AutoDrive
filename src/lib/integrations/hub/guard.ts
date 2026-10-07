// Hub de Canais — guarda das rotas: administrador da loja (módulo settings).
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export async function hubGuard(req: Request): Promise<{ ok: true; tenantId: string } | { ok: false; response: Response }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, response: unauthorizedResponse() }
  if (!await canAccessModuleForUser(user, 'settings')) return { ok: false, response: forbiddenResponse('Sem acesso às integrações.') }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { ok: false, response: forbiddenResponse(actingTenantError(user)) }
  return { ok: true, tenantId }
}
