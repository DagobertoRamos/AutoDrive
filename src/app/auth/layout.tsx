// =============================================================================
// /auth layout — força dynamic rendering nas rotas /auth/* (ex.:
// /auth/change-password) para evitar erros de SSG do tipo
// `TypeError: Invalid URL` durante o prerender de páginas client-side
// que dependem de sessão.
// =============================================================================

export const dynamic = 'force-dynamic'

export default function AuthSubLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
