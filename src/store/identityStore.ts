// =============================================================================
// identityStore — armazena nome/tagline do sistema lido pela API de identidade
// Populado pelo ThemeInjector na montagem; consumido pela Topbar e onde mais
// precisar exibir o nome da instalação em runtime.
// =============================================================================

import { create } from 'zustand'

interface IdentityState {
  appName:    string
  appTagline: string
  loaded:     boolean
  setIdentity: (appName: string, appTagline: string) => void
}

export const useIdentityStore = create<IdentityState>((set) => ({
  appName:    'AutoDrive',
  appTagline: 'Sua loja no piloto automático',
  loaded:     false,
  setIdentity: (appName, appTagline) =>
    set({ appName: appName || 'AutoDrive', appTagline, loaded: true }),
}))
