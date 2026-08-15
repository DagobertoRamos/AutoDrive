'use client'

// =============================================================================
// auth-client.ts — Encerramento de sessão ÚNICO e centralizado (AutoDrive)
//
// Todo caminho que derruba a sessão (botão "Sair", 401 da API, expiração por
// inatividade, token/cookie inválido) passa por `forceClientLogout`. Não existe
// mais logout "artesanal" espalhado em componente.
// =============================================================================

import { signOut } from 'next-auth/react'
import { LOGIN_ROUTE } from '@/lib/auth-session'
import { clearSidebarMenuState } from '@/lib/sidebar-menu-state'
import { useAuthStore } from '@/store/auth.store'

/** Chaves de estado do usuário autenticado persistidas no browser. */
const AUTH_STORAGE_KEYS = [
  'autodrive-auth',
  'autodrive-impersonation',
  'autodrive-sidebar',
]

/** Cookies não-HttpOnly criados pelo app (o cookie de sessão é limpo pelo signOut/middleware). */
const APP_COOKIES = ['acting_tenant']

let loggingOut = false

function clearStorage(storage: Storage | undefined | null): void {
  if (!storage) return
  for (const key of AUTH_STORAGE_KEYS) {
    try { storage.removeItem(key) } catch { /* ignore */ }
  }
}

function clearCookies(): void {
  if (typeof document === 'undefined') return
  for (const name of APP_COOKIES) {
    try { document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax` } catch { /* ignore */ }
  }
}

/** Limpa TODO o estado local de autenticação/usuário (storage + cookies do app). */
export function clearClientAuthState(): void {
  if (typeof window === 'undefined') return
  try { clearStorage(window.localStorage) } catch { /* ignore */ }
  try { clearStorage(window.sessionStorage) } catch { /* ignore */ }
  clearSidebarMenuState()
  clearCookies()
  // Estado em memória do usuário autenticado (Zustand).
  try { useAuthStore.getState().clearUser() } catch { /* ignore */ }
}

export interface ForceLogoutOptions {
  /** Motivo — apenas para log/telemetria. */
  reason?: 'manual' | 'expired' | 'unauthorized' | 'invalid-session'
  /** Rota de destino (padrão: /login). */
  redirectTo?: string
}

/**
 * Encerra a sessão e manda o usuário para /login.
 *
 * 1. bloqueia reentrância (vários 401 simultâneos = 1 logout só);
 * 2. limpa storage/cookies/estado local;
 * 3. invalida a sessão no servidor (signOut sem redirect do NextAuth, que também
 *    avisa as outras abas pelo BroadcastChannel);
 * 4. navega com `replace` — o Voltar do browser não retorna à área logada, e o
 *    reload completo garante que nenhum cache do React Query / Zustand sobreviva.
 */
export async function forceClientLogout(options: ForceLogoutOptions = {}): Promise<void> {
  if (typeof window === 'undefined') return
  const target = options.redirectTo ?? LOGIN_ROUTE

  if (loggingOut) return
  loggingOut = true

  if (options.reason && options.reason !== 'manual') {
    console.warn(`[auth] sessão encerrada (${options.reason}) — redirecionando para ${target}`)
  }

  clearClientAuthState()

  try {
    await signOut({ redirect: false })
  } catch {
    /* servidor fora do ar não pode impedir a saída local */
  }

  clearClientAuthState()

  const current = `${window.location.pathname}${window.location.search}`
  if (current === target) {
    loggingOut = false
    return
  }
  window.location.replace(target)
}

/** Exposto apenas para testes/cenários de recuperação. */
export function resetLogoutGuard(): void {
  loggingOut = false
}
