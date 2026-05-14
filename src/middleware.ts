// =============================================================================
// Next.js Edge Middleware — AutoDrive
//
// Responsabilidades:
//   1. Redirecionar usuários não autenticados para /login em rotas protegidas
//   2. Redirecionar usuários com mustChangePassword=true para /auth/change-password
//      (exceto na própria página de troca e nas rotas de API de autenticação)
//   3. Impedir acesso à /auth/change-password para quem NÃO precisa trocar senha
// =============================================================================

import { withAuth, NextRequestWithAuth } from 'next-auth/middleware'
import { NextResponse }                  from 'next/server'

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const { pathname } = req.nextUrl
    const token        = req.nextauth.token

    // ── Rota de troca de senha ────────────────────────────────────────────────
    if (pathname.startsWith('/auth/change-password')) {
      // Usuário autenticado mas SEM flag → não deveria estar aqui → redireciona
      if (token && !token.mustChangePassword) {
        return NextResponse.redirect(new URL('/', req.url))
      }
      // Usuário autenticado COM flag → deixa passar
      return NextResponse.next()
    }

    // ── Qualquer outra rota protegida ─────────────────────────────────────────
    // Se mustChangePassword === true, força a troca antes de qualquer outra coisa
    if (token?.mustChangePassword) {
      return NextResponse.redirect(new URL('/auth/change-password', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // withAuth só executa o middleware acima quando authorized() retorna true.
      // Retornando sempre true aqui, deixamos a lógica de redirecionamento
      // acima tratar os casos — o withAuth já garante que, se não há token,
      // o usuário é enviado para a página de login definida em pages.signIn.
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  },
)

// ── Matcher ───────────────────────────────────────────────────────────────────
// Protege todas as rotas EXCETO páginas públicas de auth e arquivos estáticos.
// Páginas públicas: login, cadastro, ativar-cadastro, recuperar-senha
export const config = {
  matcher: [
    '/((?!login|cadastro|ativar-cadastro|recuperar-senha|api/auth|api/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
