// =============================================================================
// Next.js Proxy (middleware) — AutoDrive
//
// Responsabilidades:
//   1. Barrar rota protegida sem sessão válida ANTES de qualquer render
//      (sem sessão OU token expirado por inatividade → /login, cookie limpo)
//   2. Responder 401 JSON — nunca redirect — para chamadas /api/*
//   3. Redirecionar quem tem mustChangePassword=true para /auth/change-password
//      (exceto na própria página de troca)
//   4. Impedir acesso à /auth/change-password para quem NÃO precisa trocar senha
//   5. RBAC de defesa em profundidade para /master/*
//
// POR QUE (2) IMPORTA: o matcher abaixo cobre /api/*. Antes, uma chamada de API
// sem sessão recebia 307 para /login; o fetch seguia o redirect e recebia o HTML
// da tela de login com status 200. O front não via 401 nenhum — via "resposta
// estranha" — e mostrava "Não foi possível carregar o dashboard" com a sessão já
// morta. Agora a API devolve 401 com `code: UNAUTHENTICATED` e o interceptor
// global do client encerra a sessão e leva para /login.
//
// NOTA: usa `getToken` + `req.nextUrl.clone()` em vez de `withAuth` do
// next-auth. O wrapper `withAuth` quebra no edge runtime de PRODUÇÃO do
// Next 16 (constrói `new URL('')` → ERR_INVALID_URL), embora funcione em dev.
// Esta versão constrói as URLs sempre a partir de `req.nextUrl` (já válida).
// =============================================================================

import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'
import { decideRouteAccess, LOGIN_ROUTE, SESSION_ERROR_CODE } from '@/lib/auth-session'

/** Cookies de sessão do NextAuth (com e sem prefixo seguro, incluindo chunks). */
const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
]

function clearSessionCookies(req: NextRequest, response: NextResponse): NextResponse {
  for (const cookie of req.cookies.getAll()) {
    const isSessionCookie = SESSION_COOKIE_NAMES.some(
      (name) => cookie.name === name || cookie.name.startsWith(`${name}.`),
    )
    if (isSessionCookie || cookie.name === 'acting_tenant') {
      response.cookies.delete(cookie.name)
    }
  }
  return response
}

/** Resposta para chamadas de API: JSON 401, jamais redirect. */
function unauthorizedJson(req: NextRequest): NextResponse {
  return clearSessionCookies(
    req,
    NextResponse.json(
      { success: false, code: SESSION_ERROR_CODE, error: 'Não autenticado.' },
      { status: 401 },
    ),
  )
}

/** Resposta para páginas: volta para o login com a sessão local encerrada. */
function redirectToLogin(req: NextRequest, expired: boolean): NextResponse {
  const url = req.nextUrl.clone()
  url.pathname = LOGIN_ROUTE
  url.search = ''
  url.searchParams.set('callbackUrl', req.nextUrl.pathname)
  if (expired) url.searchParams.set('expired', '1')
  return clearSessionCookies(req, NextResponse.redirect(url))
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApiRoute = pathname.startsWith('/api')

  let token: Awaited<ReturnType<typeof getToken>> = null
  try {
    token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  } catch (error) {
    // Falha de infraestrutura ao ler o token NÃO pode deslogar todo mundo:
    // os guards de API (getSessionUser) e do client seguem valendo.
    console.error('[proxy] falha ao ler o token de sessão:', error)
    return NextResponse.next()
  }

  const sessionExpired = token ? (token as { expired?: boolean }).expired === true : false

  // ── Sem sessão ou sessão expirada ─────────────────────────────────────────
  const decision = decideRouteAccess({ pathname, hasSessionToken: Boolean(token), sessionExpired })
  if (decision === 'unauthorized-json') return unauthorizedJson(req)
  if (decision === 'redirect-login') return redirectToLogin(req, sessionExpired)
  // Neste ponto a decisão já garantiu sessão válida — narrowing para o TypeScript.
  if (!token) return NextResponse.next()

  // Daqui para baixo são regras de navegação (páginas). API segue o fluxo normal
  // e é validada pelos guards de cada rota.
  if (isApiRoute) return NextResponse.next()

  // ── Rota de troca de senha ─────────────────────────────────────────────────
  if (pathname.startsWith('/auth/change-password')) {
    // Autenticado SEM flag → não deveria estar aqui → manda para a home
    if (!token.mustChangePassword) {
      const url = req.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // ── Qualquer outra rota protegida: força troca de senha quando exigido ──────
  if (token.mustChangePassword) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/change-password'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // ── RBAC (defesa em profundidade): painel MASTER só para MASTER ─────────────
  // Impede abrir /master/* digitando na barra de endereço com outro perfil.
  // Fail-open se o papel não vier no token (não tranca ninguém indevidamente;
  // as APIs já barram os dados de qualquer forma).
  if (pathname.startsWith('/master') && token.role && token.role !== 'MASTER') {
    const url = req.nextUrl.clone()
    url.pathname = '/inicio'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

// ── Matcher ───────────────────────────────────────────────────────────────────
// Protege todas as rotas EXCETO páginas públicas de auth e arquivos estáticos.
// IMPORTANTE: `cadastro(?=/|$)` casa SOMENTE a página pública `/cadastro`
// (e `/cadastro/...`), NÃO `/cadastros/*` (plural, protegido — clientes,
// vendedores, gerentes, veículos, garantias...). Sem o lookahead, o prefixo
// "cadastro" excluía `/cadastros/*` da autenticação (furo de segurança).
export const config = {
  matcher: [
    // IMPORTANTE: assets estáticos NÃO passam pelo proxy.
    // `tesseract/`, `tessdata/`, `pdfjs/`, `pdf.worker.min.mjs`, `icons/`
    // são carregados por Web Workers (Tesseract, pdfjs) que NÃO enviam cookie
    // de sessão. Se passarem pelo proxy, viram redirect 307 para /login e o
    // Worker falha silenciosamente ("Failed to execute 'importScripts'").
    '/((?!login|cadastro(?=/|$)|ativar-cadastro|recuperar-senha|privacidade|excluir-conta|api/auth|api/webhook|api/internal|api/integrations|api/queue/jobs|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|tesseract/|tessdata/|pdfjs/|pdf.worker.min.mjs|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|traineddata|gz)$).*)',
  ],
}
