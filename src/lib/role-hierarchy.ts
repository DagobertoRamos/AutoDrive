// =============================================================================
// role-hierarchy.ts — AutoDrive
// Helpers que respondem "posso agir sobre alguém abaixo de mim?"
// Complementa src/lib/permissions.ts (que cuida do "posso acessar X módulo?").
// =============================================================================

import type { UserRole } from '@prisma/client'

const ORDER: UserRole[] = [
  'USUARIO',
  'USUARIO_LIDER',
  'VENDEDOR',
  'VENDEDOR_LIDER',
  'GERENTE',
  'GERENTE_GERAL',
  'ADM',
  'MASTER',
]

export function rank(role: UserRole | string | null | undefined): number {
  if (!role) return -1
  return ORDER.indexOf(role as UserRole)
}

/**
 * Pode o `actor` agir sobre alguém com role `target`?
 *   - MASTER pode tudo
 *   - target null/undefined (não atribuído): liberado
 *   - actor precisa estar estritamente acima na hierarquia
 */
export function canActOn(
  actor: UserRole | string | null | undefined,
  target: UserRole | string | null | undefined,
): boolean {
  if (!actor) return false
  if (actor === 'MASTER') return true
  if (!target) return true
  return rank(actor) > rank(target)
}
