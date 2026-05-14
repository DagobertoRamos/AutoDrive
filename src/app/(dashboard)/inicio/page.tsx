// =============================================================================
// Início — AutoDrive
// Tela de boas-vindas com atalhos rápidos para o usuário logado
// =============================================================================

import { getServerAuthSession } from '@/lib/auth'
import Link from 'next/link'

export const metadata = { title: 'Início' }

export default async function InicioPage() {
  const session = await getServerAuthSession()
  const firstName = session?.user?.name?.split(' ')[0] ?? 'Usuário'

  return (
    <div className="flex h-full min-h-[calc(100vh-8rem)] flex-col items-center justify-center">
      <div className="text-center max-w-md">
        {/* Logo / ícone */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-800 shadow-brand">
          <span className="text-3xl font-black text-white">AD</span>
        </div>

        {/* Título */}
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
          AutoDrive
        </h1>
        <p className="mt-1 text-sm font-medium text-brand-700 uppercase tracking-widest">
          Sua loja no piloto automático
        </p>

        {/* Saudação */}
        <p className="mt-6 text-lg text-gray-500">
          Bem-vindo de volta,{' '}
          <span className="font-semibold text-gray-800">{firstName}</span> 👋
        </p>
        <p className="mt-2 text-sm text-gray-400">
          Use o menu lateral para acessar os módulos do sistema.
        </p>

        {/* Atalhos rápidos */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Ver Dashboard
          </Link>
          <Link
            href="/pendencias/minhas"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Minhas Pendências
          </Link>
        </div>
      </div>
    </div>
  )
}
