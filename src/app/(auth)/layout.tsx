// =============================================================================
// Auth Layout — AutoDrive
// Layout para telas de autenticação
// =============================================================================

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Acesso — AutoDrive',
  description: 'Acesse o AutoDrive — Sua loja no piloto automático',
}

// As páginas /login, /ativar-cadastro e /recuperar-senha usam useSearchParams
// para tokens/callbacks. Forçamos rendering dinâmico no layout pai para evitar
// o bailout de SSG ("missing-suspense-with-csr-bailout") sem precisar refatorar
// cada page em Suspense boundaries.
export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0A1F12] px-4 py-12">
      {/* Background decorativo */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-800/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-brand-700/15 blur-3xl" />
      </div>

      {/* Logo / branding */}
      <div className="relative mb-8 flex flex-col items-center gap-3 select-none">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-xl">
          {/* Símbolo AutoDrive — substituir por <Image> quando logo disponível */}
          <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
            <path
              d="M20 4L36 13V27L20 36L4 27V13L20 4Z"
              fill="#166534"
              opacity="0.9"
            />
            <path
              d="M14 20L18 24L26 16"
              stroke="#4ADE80"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            AutoDrive
          </h1>
          <p className="text-sm text-white/50 font-medium mt-0.5">
            Sua loja no piloto automático
          </p>
        </div>
      </div>

      {/* Card de conteúdo */}
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/40 border border-white/5 overflow-hidden">
          {children}
        </div>
      </div>

      {/* Footer */}
      <p className="relative mt-8 text-xs text-white/25 text-center">
        &copy; {new Date().getFullYear()} AutoDrive. Todos os direitos reservados.
      </p>
    </div>
  )
}
