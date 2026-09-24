'use client'

// =============================================================================
// AuthSessionWatcher — vigia ÚNICO da sessão (AutoDrive)
//
// Montado uma única vez em `Providers` (dentro do SessionProvider). É o único
// responsável por decidir "perdeu a autenticação → /login". Componentes de tela
// apenas deixam de renderizar; ninguém mais faz redirect de auth por conta.
//
// Cobre:
//   • sessão inexistente/expirada ao abrir ou durante o uso;
//   • sessão devolvida sem usuário (token expirado pela janela de inatividade);
//   • qualquer resposta 401 (ou 403 de sessão) de /api/* — inclusive as centenas
//     de `fetch` diretos espalhados pelas telas — via interceptor global;
//   • logout em outra aba (o NextAuth avisa; aqui o status vira unauthenticated).
//
// NÃO desloga em 500, timeout de rede, API fora do ar ou 403 de permissão.
// =============================================================================

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { forceClientLogout } from '@/lib/auth-client'
import {
  decideClientAccess,
  isProtectedPath,
  isSessionAuthFailure,
  shouldInspectRequest,
  type ApiErrorPayload,
} from '@/lib/auth-session'

const PATCH_FLAG = '__autodriveAuthFetchPatched'

/** Site público da loja (marcado no layout do site): não há sessão a vigiar. */
function isPublicSite(): boolean {
  return typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__AUTODRIVE_PUBLIC_SITE__ === true
}

export function AuthSessionWatcher() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const pathRef = useRef(pathname)

  // Mantém o caminho atual acessível dentro do interceptor (efeito com deps [])
  // sem escrever no ref durante o render.
  useEffect(() => { pathRef.current = pathname }, [pathname])

  // ── Interceptor global de 401/403-de-sessão ───────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as Record<string, unknown>
    if (w[PATCH_FLAG]) return
    w[PATCH_FLAG] = true

    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch(input, init)

      try {
        if (response.status !== 401 && response.status !== 403) return response

        const url =
          typeof input === 'string' ? input
          : input instanceof URL ? input.toString()
          : (input as Request).url

        if (isPublicSite()) return response
        if (!shouldInspectRequest(url, window.location.origin)) return response
        // Em rota pública (ex.: /login) um 401 é resposta esperada, não perda de sessão.
        if (!isProtectedPath(pathRef.current ?? '/')) return response

        let payload: ApiErrorPayload | null = null
        if (response.status === 403) {
          payload = await response.clone().json().catch(() => null) as ApiErrorPayload | null
        }

        if (isSessionAuthFailure(response.status, payload)) {
          void forceClientLogout({ reason: response.status === 401 ? 'unauthorized' : 'expired' })
        }
      } catch {
        /* o interceptor jamais pode quebrar a request original */
      }

      return response
    }

    return () => {
      window.fetch = originalFetch
      w[PATCH_FLAG] = false
    }
  }, [])

  // ── Sessão inválida em rota protegida → sai da área logada ────────────────
  useEffect(() => {
    if (isPublicSite()) return
    const decision = decideClientAccess(status, session, pathRef.current ?? '/')
    if (decision !== 'logout') return
    void forceClientLogout({ reason: 'invalid-session' })
  }, [status, session, pathname])

  return null
}

export default AuthSessionWatcher
