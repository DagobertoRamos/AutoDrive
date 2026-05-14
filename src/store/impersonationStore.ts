// =============================================================================
// impersonationStore — Estado da sessão de impersonation ativa
//
// Quando o MASTER inicia uma impersonation via /api/master/tenants/:id/impersonate,
// os dados da sessão ficam aqui e o banner é exibido em toda a interface.
// =============================================================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
      startImpersonation: (data) => set({ active: data }),
      endImpersonation:   ()     => set({ active: null }),
    }),
    {
      name:    'autodrive-impersonation',
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
