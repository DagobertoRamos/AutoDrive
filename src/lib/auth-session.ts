// =============================================================================
// auth-session.ts — Regras PURAS e centrais de sessão/autenticação (AutoDrive)
//
// Este arquivo é a ÚNICA fonte de verdade sobre:
//   • quais rotas são públicas / protegidas;
//   • o que caracteriza uma falha de AUTENTICAÇÃO (401 / 403 de sessão) em
//     oposição a um erro comum de API (500, timeout, indisponibilidade);
//   • o payload devolvido pelo callback `session` do NextAuth quando a sessão
//     está expirada.
//
// Não importa React, Next nem Prisma de propósito: roda no middleware (edge),
// no servidor, no client e nos testes unitários.
// =============================================================================

// ── Rotas ────────────────────────────────────────────────────────────────────

export const LOGIN_ROUTE = '/login'

/** Rotas de página acessíveis SEM sessão (a própria /login inclusa). */
export const PUBLIC_ROUTES = [
  '/login',
  '/cadastro',
  '/ativar-cadastro',
  '/recuperar-senha',
  '/privacidade',
  '/excluir-conta',
] as const

/** Prefixos que o guard nunca deve interceptar (assets, auth do NextAuth, etc.). */
const IGNORED_PREFIXES = [
  '/_next',
  '/api/auth',
  '/favicon',
  '/icons',
  '/images',
  '/manifest',
  '/robots',
  '/sitemap',
  '/sw.js',
]

function normalize(pathname: string): string {
  if (!pathname) return '/'
  const clean = pathname.split('?')[0].split('#')[0]
  if (clean.length > 1 && clean.endsWith('/')) return clean.slice(0, -1)
  return clean
}

export function isIgnoredPath(pathname: string): boolean {
  const path = normalize(pathname)
  return IGNORED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(p))
}

export function isPublicPath(pathname: string): boolean {
  const path = normalize(pathname)
  return PUBLIC_ROUTES.some((route) => path === route || path.startsWith(`${route}/`))
}

/**
 * Rota de aplicação que exige sessão válida.
 * `/api/*` fica de fora: rotas de API respondem 401/403 (JSON) e NUNCA podem
 * ser redirecionadas — senão o fetch receberia HTML 200 da tela de login.
 */
export function isProtectedPath(pathname: string): boolean {
  const path = normalize(pathname)
  if (isIgnoredPath(path)) return false
  if (path.startsWith('/api')) return false
  if (isPublicPath(path)) return false
  return true
}

// ── Classificação de falha de autenticação vinda da API ──────────────────────

/** Código devolvido pelas rotas de API quando o problema é de sessão. */
export const SESSION_ERROR_CODE = 'UNAUTHENTICATED'

export interface ApiErrorPayload {
  code?: unknown
  error?: unknown
  message?: unknown
}

const SESSION_ERROR_TEXT = /(n[ãa]o autenticado|sess[ãa]o (expirada|inv[áa]lida|encerrada)|unauthenticated|session (expired|invalid))/i

/**
 * Decide se uma resposta de API significa "perdeu a autenticação".
 *
 * 401 → sempre.
 * 403 → apenas quando o corpo indica sessão/autenticação (código ou texto).
 *       403 de PERMISSÃO (sem acesso ao módulo, role insuficiente) NÃO desloga.
 * Demais status (500, 502, 404, etc.) → nunca.
 */
export function isSessionAuthFailure(status: number, payload?: ApiErrorPayload | null): boolean {
  if (status === 401) return true
  if (status !== 403) return false
  if (!payload) return false
  const code = typeof payload.code === 'string' ? payload.code : ''
  if (code === SESSION_ERROR_CODE) return true
  const text = [payload.error, payload.message].filter((v): v is string => typeof v === 'string').join(' ')
  return SESSION_ERROR_TEXT.test(text)
}

/** URLs cujo resultado o interceptor global deve avaliar (mesma origem, /api, exceto /api/auth). */
export function shouldInspectRequest(url: string, origin: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url, origin)
  } catch {
    return false
  }
  if (parsed.origin !== origin) return false
  if (!parsed.pathname.startsWith('/api')) return false
  if (parsed.pathname.startsWith('/api/auth')) return false
  return true
}

// ── Estado de sessão no client ───────────────────────────────────────────────

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

/**
 * Traduz o par (status, session) do NextAuth em um estado confiável.
 *
 * MOTIVO: quando a sessão expira, o endpoint /api/auth/session pode devolver um
 * objeto SEM `user`. O client do NextAuth trata qualquer objeto não-vazio como
 * "authenticated" — o app então renderiza a área logada com usuário indefinido
 * e só quebra quando a API responde 401. Aqui isso vira `unauthenticated`.
 */
export function resolveSessionStatus(
  status: SessionStatus | string,
  session: { user?: unknown } | null | undefined,
): SessionStatus {
  if (status === 'loading') return 'loading'
  if (status !== 'authenticated') return 'unauthenticated'
  if (!session || !session.user) return 'unauthenticated'
  return 'authenticated'
}

// ── Payload de sessão expirada (usado pelo callback `session` do NextAuth) ────

/**
 * Payload devolvido quando o token está expirado (janela de inatividade).
 *
 * TEM QUE SER UM OBJETO VAZIO: o client do NextAuth faz
 * `Object.keys(data).length > 0 ? data : null` — qualquer chave presente
 * (inclusive `expires`) faz o app achar que continua autenticado.
 */
export function expiredSessionPayload(): Record<string, never> {
  return {} as Record<string, never>
}

// ── Decisão de acesso (usada pelo proxy/servidor) ────────────────────────────

export type RouteAccessDecision = 'allow' | 'unauthorized-json' | 'redirect-login'

export interface RouteAccessInput {
  pathname: string
  /** Token de sessão presente e decodificado com sucesso. */
  hasSessionToken: boolean
  /** Token existe, porém já passou da janela de inatividade. */
  sessionExpired: boolean
}

/**
 * Regra única de acesso no servidor:
 *   • /api/* nunca é redirecionado — devolve 401 JSON (senão o fetch receberia
 *     o HTML do login com status 200 e a tela mostraria "erro ao carregar");
 *   • página sem sessão válida vai para /login antes de renderizar qualquer coisa.
 */
export function decideRouteAccess(input: RouteAccessInput): RouteAccessDecision {
  const valid = input.hasSessionToken && !input.sessionExpired
  if (valid) return 'allow'
  return input.pathname.startsWith('/api') ? 'unauthorized-json' : 'redirect-login'
}

// ── Decisão de acesso (client) ───────────────────────────────────────────────

export type ClientAccessDecision = 'render' | 'wait' | 'logout'

/**
 * Regra única no client:
 *   • enquanto verifica a sessão → 'wait' (nunca renderiza área logada antes);
 *   • sessão válida → 'render';
 *   • sessão inválida em rota protegida → 'logout' (limpa tudo e vai para /login);
 *   • sessão inválida em rota pública (ex.: /login) → 'render', sem loop.
 */
export function decideClientAccess(
  status: SessionStatus | string,
  session: { user?: unknown } | null | undefined,
  pathname: string,
): ClientAccessDecision {
  const state = resolveSessionStatus(status, session)
  if (state === 'loading') return 'wait'
  if (state === 'authenticated') return 'render'
  return isProtectedPath(pathname) ? 'logout' : 'render'
}
