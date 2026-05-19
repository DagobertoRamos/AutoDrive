// =============================================================================
// Guard de refresh: somente MASTER/ADM podem forçar `?refresh=1`.
// Retorna { allowed, refresh } pronto para uso nos handlers FIPE.
// =============================================================================

import type { NextRequest } from 'next/server'

export interface RefreshDecision {
  allowed: boolean   // tem permissão para forçar refresh?
  refresh: boolean   // deve realmente forçar refresh (allowed && param=1)?
  forbidden403?: boolean   // pediu refresh mas não tem permissão
}

export function resolveRefresh(
  req: NextRequest,
  role: string | undefined,
): RefreshDecision {
  const asked   = req.nextUrl.searchParams.get('refresh') === '1'
  const allowed = ['MASTER', 'ADM'].includes(role ?? '')
  if (!asked) return { allowed, refresh: false }
  if (allowed) return { allowed, refresh: true }
  return { allowed: false, refresh: false, forbidden403: true }
}
