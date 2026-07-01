// =============================================================================
// Next.js Middleware — AutoDrive
//
// Responsabilidades:
//   1. Redirecionar usuários não autenticados para /login em rotas protegidas
//   2. Redirecionar usuários com mustChangePassword=true para /auth/change-password
//      (exceto na própria página de troca)
//   3. Impedir acesso à /auth/change-password para quem NÃO precisa trocar senha
//
// NOTA: usa `getToken` + `req.nextUrl.clone()` em vez de `withAuth` do
// next-auth. O wrapper `withAuth` quebra no edge runtime de PRODUÇÃO do
// Next 16 (constrói `new URL('')` → ERR_INVALID_URL), embora funcione em dev.
// Esta versão constrói as URLs sempre a partir de `req.nextUrl` (já válida).
// =============================================================================

import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  // ── Não autenticado → login (preservando o destino em callbackUrl) ─────────
  if (!token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

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
    '/((?!login|cadastro(?=/|$)|ativar-cadastro|recuperar-senha|privacidade|excluir-conta|api/auth|api/webhook|api/internal|api/integrations|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
