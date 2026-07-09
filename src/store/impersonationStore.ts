// =============================================================================
// impersonationStore — Estado da sessão de impersonation ativa
//
// Quando o MASTER inicia uma impersonation via /api/master/tenants/:id/impersonate,
// os dados da sessão ficam aqui e o banner é exibido em toda a interface.
// =============================================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Durante a impersonation, o MASTER opera COMO a loja impersonada. As APIs
// tenant-scoped resolvem a "loja ativa" pelo cookie `acting_tenant` — então
// setamos/limpamos ele junto com a impersonation. Sem isso, salvar colaborador,
// carregar módulos etc. retornavam "Selecione uma loja para operar".
const ACTING_TENANT_COOKIE = 'acting_tenant'
function setActingTenantCookie(tenantId: string | null): void {
  if (typeof document === 'undefined') return
  document.cookie = tenantId
    ? `${ACTING_TENANT_COOKIE}=${encodeURIComponent(tenantId)}; path=/; max-age=86400; samesite=lax`
    : `${ACTING_TENANT_COOKIE}=; path=/; max-age=0; samesite=lax`
}

export interface ImpersonationData {
  impersonationSessionId: string
  masterId:               string
  masterName:             string
  targetUser:             { id: string; name: string; email: string; role: string }
  tenant:                 { id: string; name: string }
  reason:                 string
  startedAt:              string
}

interface ImpersonationStore {
  active:    ImpersonationData | null
  startImpersonation: (data: ImpersonationData) => void
  endImpersonation:   () => void
}

export const useImpersonationStore = create<ImpersonationStore>()(
  persist(
    (set) => ({
      active: null,
      startImpersonation: (data) => { setActingTenantCookie(data.tenant.id); set({ active: data }) },
      endImpersonation:   ()     => { setActingTenantCookie(null); set({ active: null }) },
    }),
    {
      name:    'autodrive-impersonation',
      // Ao recarregar a página com impersonation ativa, garante que o cookie
      // `acting_tenant` continue setado (o backend precisa dele em toda request).
      onRehydrateStorage: () => (state) => { if (state?.active?.tenant?.id) setActingTenantCookie(state.active.tenant.id) },
      // sessionStorage: limpa quando o browser fecha
      storage: typeof window !== 'undefined'
        ? {
            getItem:    (k) => { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null },
            setItem:    (k, v) => sessionStorage.setItem(k, JSON.stringify(v)),
            removeItem: (k) => sessionStorage.removeItem(k),
          }
        : undefined,
    },
  ),
)
