import { describe, it, expect } from 'vitest'
import {
  expiredSessionPayload,
  isProtectedPath,
  isPublicPath,
  isSessionAuthFailure,
  decideClientAccess,
  decideRouteAccess,
  resolveSessionStatus,
  shouldInspectRequest,
  SESSION_ERROR_CODE,
} from './auth-session'

describe('rotas públicas x protegidas', () => {
  it('mantém /login e demais telas de acesso públicas (sem loop de redirect)', () => {
    for (const path of ['/login', '/cadastro', '/recuperar-senha', '/ativar-cadastro', '/privacidade', '/excluir-conta']) {
      expect(isPublicPath(path)).toBe(true)
      expect(isProtectedPath(path)).toBe(false)
    }
  })

  it('protege dashboard e demais áreas internas', () => {
    for (const path of ['/', '/dashboard', '/cadastros/clientes', '/estoque/veiculos', '/configuracoes/sistema', '/crm/leads']) {
      expect(isProtectedPath(path)).toBe(true)
    }
  })

  it('nunca redireciona /api (a API responde 401/403 em JSON) nem assets', () => {
    for (const path of ['/api/dashboard/summary', '/api/auth/session', '/_next/static/chunk.js', '/favicon.ico']) {
      expect(isProtectedPath(path)).toBe(false)
    }
  })

  it('ignora barra final e query string', () => {
    expect(isPublicPath('/login/')).toBe(true)
    expect(isProtectedPath('/dashboard?tab=1')).toBe(true)
  })
})

describe('classificação de falha de autenticação', () => {
  it('401 sempre encerra a sessão', () => {
    expect(isSessionAuthFailure(401, { error: 'Não autenticado.' })).toBe(true)
    expect(isSessionAuthFailure(401, null)).toBe(true)
  })

  it('403 de sessão encerra; 403 de permissão NÃO', () => {
    expect(isSessionAuthFailure(403, { code: SESSION_ERROR_CODE, error: 'Sessão expirada.' })).toBe(true)
    expect(isSessionAuthFailure(403, { error: 'Sessão inválida. Faça login novamente.' })).toBe(true)
    expect(isSessionAuthFailure(403, { error: 'Sem acesso ao dashboard.' })).toBe(false)
    expect(isSessionAuthFailure(403, { error: 'Acesso não permitido.' })).toBe(false)
    expect(isSessionAuthFailure(403, null)).toBe(false)
  })

  it('erro de servidor / indisponibilidade não desloga ninguém', () => {
    for (const status of [400, 404, 409, 422, 500, 502, 503, 504]) {
      expect(isSessionAuthFailure(status, { error: 'Não autenticado.' })).toBe(false)
    }
  })
})

describe('interceptor global — quais requests avaliar', () => {
  const origin = 'https://app.autodrive.com'

  it('avalia /api do próprio app', () => {
    expect(shouldInspectRequest('/api/dashboard/summary', origin)).toBe(true)
    expect(shouldInspectRequest(`${origin}/api/notifications`, origin)).toBe(true)
  })

  it('ignora /api/auth (senão o próprio signOut/signIn viraria loop)', () => {
    expect(shouldInspectRequest('/api/auth/session', origin)).toBe(false)
    expect(shouldInspectRequest('/api/auth/signout', origin)).toBe(false)
  })

  it('ignora outras origens e rotas não-API', () => {
    expect(shouldInspectRequest('https://viacep.com.br/ws/01001000/json/', origin)).toBe(false)
    expect(shouldInspectRequest('/dashboard', origin)).toBe(false)
  })
})

describe('estado de sessão no client', () => {
  it('loading enquanto verifica — nunca renderiza área logada antes da hora', () => {
    expect(resolveSessionStatus('loading', null)).toBe('loading')
  })

  it('sessão sem usuário (token expirado) conta como NÃO autenticado', () => {
    expect(resolveSessionStatus('authenticated', {})).toBe('unauthenticated')
    expect(resolveSessionStatus('authenticated', { user: undefined })).toBe('unauthenticated')
    expect(resolveSessionStatus('authenticated', null)).toBe('unauthenticated')
  })

  it('sessão com usuário é autenticada', () => {
    expect(resolveSessionStatus('authenticated', { user: { id: '1' } })).toBe('authenticated')
  })

  it('unauthenticated permanece unauthenticated', () => {
    expect(resolveSessionStatus('unauthenticated', null)).toBe('unauthenticated')
  })
})

describe('payload de sessão expirada (causa raiz)', () => {
  it('é um objeto vazio — o client do NextAuth só trata como deslogado nesse caso', () => {
    const payload = expiredSessionPayload()
    expect(Object.keys(payload)).toHaveLength(0)
    // Regra literal do next-auth/client/_utils.js: Object.keys(data).length > 0 ? data : null
    expect(Object.keys(payload).length > 0 ? payload : null).toBeNull()
  })

  it('o payload antigo ({ expires }) seria interpretado como AUTENTICADO', () => {
    const antigo = { expires: new Date(0).toISOString() }
    expect(Object.keys(antigo).length > 0 ? antigo : null).not.toBeNull()
  })
})

// =============================================================================
// Matriz dos cenários obrigatórios de sessão
// =============================================================================

describe('cenários obrigatórios de sessão', () => {
  const usuario = { user: { id: 'u1', name: 'Fulano' } }

  it('login válido → dashboard renderiza normalmente', () => {
    expect(decideRouteAccess({ pathname: '/dashboard', hasSessionToken: true, sessionExpired: false })).toBe('allow')
    expect(decideClientAccess('authenticated', usuario, '/dashboard')).toBe('render')
  })

  it('carregamento inicial (verificando sessão) → espera, nunca renderiza antes', () => {
    expect(decideClientAccess('loading', null, '/dashboard')).toBe('wait')
  })

  it('abrir /dashboard sem autenticação → /login (antes de renderizar)', () => {
    expect(decideRouteAccess({ pathname: '/dashboard', hasSessionToken: false, sessionExpired: false })).toBe('redirect-login')
    expect(decideClientAccess('unauthenticated', null, '/dashboard')).toBe('logout')
  })

  it('cookie de autenticação removido/inválido → /login em qualquer rota protegida', () => {
    for (const rota of ['/clientes', '/veiculos', '/configuracoes', '/comissoes/extrato', '/crm/kanban']) {
      expect(decideRouteAccess({ pathname: rota, hasSessionToken: false, sessionExpired: false })).toBe('redirect-login')
    }
  })

  it('token expirado / sessão expirada → /login e não renderiza área logada', () => {
    expect(decideRouteAccess({ pathname: '/dashboard', hasSessionToken: true, sessionExpired: true })).toBe('redirect-login')
    // o endpoint de sessão devolve payload vazio → client entende "deslogado"
    expect(resolveSessionStatus('unauthenticated', null)).toBe('unauthenticated')
    expect(decideClientAccess('unauthenticated', null, '/dashboard')).toBe('logout')
  })

  it('reload (F5) com sessão expirada → /login, não dashboard quebrado', () => {
    expect(decideRouteAccess({ pathname: '/dashboard', hasSessionToken: true, sessionExpired: true })).toBe('redirect-login')
  })

  it('API 401 com dashboard aberto → encerra sessão (nunca "não foi possível carregar")', () => {
    expect(shouldInspectRequest('/api/dashboard/summary', 'https://app.autodrive.com')).toBe(true)
    expect(isSessionAuthFailure(401, { code: SESSION_ERROR_CODE, error: 'Não autenticado.' })).toBe(true)
  })

  it('chamada de API sem sessão devolve 401 JSON — nunca redirect para HTML de login', () => {
    expect(decideRouteAccess({ pathname: '/api/dashboard/summary', hasSessionToken: false, sessionExpired: false })).toBe('unauthorized-json')
    expect(decideRouteAccess({ pathname: '/api/notifications', hasSessionToken: true, sessionExpired: true })).toBe('unauthorized-json')
  })

  it('erro real de servidor / API fora do ar → segue como erro comum, sem logout', () => {
    expect(isSessionAuthFailure(500, { error: 'Erro interno' })).toBe(false)
    expect(isSessionAuthFailure(503, null)).toBe(false)
    expect(isSessionAuthFailure(403, { error: 'Sem acesso ao módulo.' })).toBe(false)
  })

  it('depois do logout, tela de login permanece pública (sem loop)', () => {
    expect(decideRouteAccess({ pathname: '/login', hasSessionToken: false, sessionExpired: false })).toBe('redirect-login')
    // a /login está fora do matcher do proxy e é pública para o guard do client:
    expect(isProtectedPath('/login')).toBe(false)
    expect(decideClientAccess('unauthenticated', null, '/login')).toBe('render')
  })

  it('login novamente após expiração → sessão válida volta a renderizar', () => {
    expect(decideRouteAccess({ pathname: '/dashboard', hasSessionToken: true, sessionExpired: false })).toBe('allow')
    expect(decideClientAccess('authenticated', usuario, '/dashboard')).toBe('render')
  })
})
