import type { Prisma } from '@prisma/client'
import { rank } from '@/lib/role-hierarchy'

export const DELETED_PENDENCY_REASON_PREFIX = '[EXCLUIDA]'

const MANAGER_ALIASES = new Set(['OWNER', 'SUPER_ADMIN', 'ADMIN'])
const GENERAL_MANAGER_ALIASES = new Set(['OWNER', 'SUPER_ADMIN', 'ADMIN'])

interface PendencyActor {
  id: string
  role: string
  tenantId?: string | null
  unitId?: string | null
}

interface PendencyScopeTarget {
  tenantId?: string | null
  unitId?: string | null
  assignedUserId?: string | null
  resolvedByUserId?: string | null
  responsible?: { userId?: string | null } | null
  manager?: { userId?: string | null } | null
}

export function isPendencyManagerPlus(role: string | null | undefined): boolean {
  if (!role) return false
  return MANAGER_ALIASES.has(role) || rank(role) >= rank('GERENTE')
}

export function isPendencyGeneralManagerPlus(role: string | null | undefined): boolean {
  if (!role) return false
  return GENERAL_MANAGER_ALIASES.has(role) || role === 'MASTER' || role === 'ADM' || rank(role) >= rank('GERENTE_GERAL')
}

export function deletedPendencyReason(reason: string): string {
  return `${DELETED_PENDENCY_REASON_PREFIX} ${reason.trim()}`
}

export function isDeletedPendencyReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && reason.startsWith(DELETED_PENDENCY_REASON_PREFIX)
}

export function notDeletedPendencyWhere(): Prisma.PendencyWhereInput {
  return {
    OR: [
      { cancelReason: null },
      { cancelReason: { not: { startsWith: DELETED_PENDENCY_REASON_PREFIX } } },
    ],
  }
}

export function canAccessPendencyScope(actor: PendencyActor, pendency: PendencyScopeTarget): boolean {
  if (actor.role === 'MASTER' || MANAGER_ALIASES.has(actor.role)) return true
  if (!actor.tenantId || pendency.tenantId !== actor.tenantId) return false

  if (actor.role === 'GERENTE') {
    if (!actor.unitId || pendency.unitId !== actor.unitId) return false
    return true
  }

  if (isPendencyManagerPlus(actor.role)) return true

  return (
    pendency.assignedUserId === actor.id ||
    pendency.resolvedByUserId === actor.id ||
    pendency.responsible?.userId === actor.id ||
    pendency.manager?.userId === actor.id
  )
}
