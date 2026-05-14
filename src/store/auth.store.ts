// =============================================================================
// Zustand auth store — AutoDrive
// =============================================================================

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { type UserSession } from '@/types'

// ---------------------------------------------------------------------------
// State & actions interface
// ---------------------------------------------------------------------------

interface AuthState {
  /** Dados do usuário autenticado (null quando não autenticado) */
  user: UserSession | null
  /** Indica se uma operação de auth está em andamento */
  isLoading: boolean
  /** Erro de auth mais recente */
  error: string | null

  // Actions
  setUser: (user: UserSession) => void
  clearUser: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        isLoading: false,
        error: null,

        setUser: (user) =>
          set({ user, isLoading: false, error: null }, false, 'auth/setUser'),

        clearUser: () =>
          set({ user: null, isLoading: false, error: null }, false, 'auth/clearUser'),

        setLoading: (isLoading) =>
          set({ isLoading }, false, 'auth/setLoading'),

        setError: (error) =>
          set({ error, isLoading: false }, false, 'auth/setError'),
      }),
      {
        name: 'autodrive-auth',
        // Persiste apenas dados não-sensíveis — a sessão real é gerenciada pelo NextAuth
        partialize: (state) => ({ user: state.user }),
      },
    ),
    { name: 'AuthStore' },
  ),
)

// ---------------------------------------------------------------------------
// Selectors (para evitar re-renders desnecessários)
// ---------------------------------------------------------------------------

export const selectUser = (state: AuthState) => state.user
export const selectIsLoading = (state: AuthState) => state.isLoading
export const selectError = (state: AuthState) => state.error
export const selectIsAuthenticated = (state: AuthState) => state.user !== null
export const selectUserRole = (state: AuthState) => state.user?.role ?? null
export const selectUserUnitId = (state: AuthState) => state.user?.unitId ?? null
