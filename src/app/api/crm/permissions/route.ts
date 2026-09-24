// =============================================================================
// CRM — matriz de permissões por perfil da loja (aba Permissões).
//   GET : catálogo, perfis, padrão do sistema, regras da loja e se o usuário
//         atual pode gerenciar. Gate: crm. (Salvar = PUT /api/crm/settings
//         com { rolePermissions }, gate crm.settings.manage.)
// =============================================================================

import { NextResponse } from 'next/server'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { loadCrmSettings } from '@/lib/crm/settings'
import { CRM_PERMISSIONS, CRM_ROLES, isLocked, systemDefault } from '@/lib/crm/permissions-core'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const settings = await loadCrmSettings(tenantId)
  return NextResponse.json({
    success: true,
    data: {
      roles: CRM_ROLES,
      permissions: CRM_PERMISSIONS.map((p) => ({
        ...p,
        defaults: Object.fromEntries(CRM_ROLES.map((r) => [r.value, systemDefault(r.value, p.key)])),
        locked: CRM_ROLES.filter((r) => isLocked(r.value, p.key)).map((r) => r.value),
      })),
      overrides: settings.rolePermissions,
      canManage: await canAccessModuleForUser(user, 'crm.settings.manage'),
    },
  })
}
