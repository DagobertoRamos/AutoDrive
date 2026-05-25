// =============================================================================
// 404 — Página não encontrada
//
// Forçamos dynamic rendering para que o Next não tente pré-renderizar
// estaticamente (o bundle compartilhado contém componentes client que
// quebram com `new URL("")` durante o prerender).
// =============================================================================

import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0A1F12] px-4 py-12 text-center">
      <div className="text-7xl font-bold text-white/90 mb-4">404</div>
      <h1 className="text-2xl font-semibold text-white mb-2">Página não encontrada</h1>
      <p className="text-white/60 max-w-md mb-8">
        O endereço acessado não existe ou foi movido. Verifique o link ou volte ao início.
      </p>
      <Link
        href="/inicio"
        className="rounded-lg bg-brand-600 hover:bg-brand-700 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-brand-600/20 transition-colors"
      >
        Voltar ao início
      </Link>
    </div>
  )
}
