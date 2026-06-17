'use client'

// =============================================================================
// useFiPermissions — capacidades F&I efetivas do usuário (para a UI).
// Consome /api/financing/my-permissions. O bloqueio real é no servidor; isto
// só melhora a UX ocultando/desabilitando ações. Default otimista (true) até
// carregar, para não esconder ações legítimas no flash inicial.
// =============================================================================

import { useState, useEffect } from 'react'

export interface FiPermissions { enviarFicha: boolean; aprovar: boolean; alterarRetorno: boolean }

export function useFiPermissions(): { perms: FiPermissions; loaded: boolean } {
  const [perms, setPerms] = useState<FiPermissions>({ enviarFicha: true, aprovar: true, alterarRetorno: true })
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    fetch('/api/financing/my-permissions', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (alive && j?.success) setPerms(j.data) })
      .catch(() => { /* mantém otimista */ })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])
  return { perms, loaded }
}
