// =============================================================================
// Permissões granulares das operações veiculares. Padrão por cargo
// (permissions.ts) + liberação/bloqueio individual (UserModule), sempre
// conferido no backend.
// =============================================================================

import { canAccessModuleForUser } from '@/lib/tenant-modules'
import type { SessionUser } from '@/lib/auth-guards'

export const OPS_PERMISSIONS = [
  'ops.renave.view', 'ops.renave.operate',
  'ops.fiscal.view', 'ops.fiscal.issue', 'ops.fiscal.cancel',
  'ops.transfer.view', 'ops.transfer.start',
  'ops.documents.view', 'ops.compliance.manage', 'ops.store_transfer',
  'ops.settings', 'ops.costs.view', 'ops.margin.view', 'ops.logs.view',
] as const
export type OpsPermission = typeof OPS_PERMISSIONS[number]

type U = Pick<SessionUser, 'id' | 'role' | 'tenantId'>

export function opsCan(user: U, perm: OpsPermission): Promise<boolean> {
  return canAccessModuleForUser(user, perm)
}

export async function opsPermissions(user: U): Promise<Record<OpsPermission, boolean>> {
  const entries = await Promise.all(OPS_PERMISSIONS.map(async (p) => [p, await opsCan(user, p)] as const))
  return Object.fromEntries(entries) as Record<OpsPermission, boolean>
}
