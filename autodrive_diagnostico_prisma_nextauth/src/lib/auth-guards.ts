// =============================================================================
// Guards de autenticação/tenant para rotas API.
// Objetivo: impedir gravações sem tenantId em usuários que não são MASTER.
// =============================================================================

type RoleLike = string | null | undefined

const MASTER_ROLES = new Set([
  'MASTER',
  'SUPER_ADMIN',
  'SUPERADMIN',
  'ADMIN_MASTER',
])

export function isMasterRole(role: RoleLike): boolean {
  return MASTER_ROLES.has(String(role ?? '').trim().toUpperCase())
}

/**
 * Garante tenantId para usuários comuns.
 * MASTER pode operar sem tenantId e retorna null.
 */
export function assertTenantId(
  tenantId: string | null | undefined,
  role: RoleLike,
): string | null {
  if (isMasterRole(role)) return null

  const normalizedTenantId = String(tenantId ?? '').trim()

  if (!normalizedTenantId) {
    throw new Error(
      `[auth] tenantId ausente na sessão para role=${String(role ?? 'NOT_PRESENT')}. ` +
      'Corrija os callbacks jwt/session do NextAuth antes de gravar no banco.',
    )
  }

  return normalizedTenantId
}

/**
 * Garante que a role atual esteja entre as roles permitidas.
 */
export function assertRole(
  currentRole: RoleLike,
  allowedRoles: string[],
): string {
  const normalizedRole = String(currentRole ?? '').trim().toUpperCase()
  const normalizedAllowed = allowedRoles.map((r) => r.trim().toUpperCase())

  if (!normalizedRole || !normalizedAllowed.includes(normalizedRole)) {
    throw new Error(
      `[auth] Sem permissão. Role atual=${normalizedRole || 'NOT_PRESENT'}, ` +
      `roles permitidas=${normalizedAllowed.join(', ')}`,
    )
  }

  return normalizedRole
}
