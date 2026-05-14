'use client'

// =============================================================================
// /estoque/novo — Redireciona para o fluxo obrigatório de avaliação
// Todo veículo DEVE passar por uma avaliação antes de entrar no estoque.
// =============================================================================

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'

export default function EstoqueNovoPage() {
  const router = useRouter()

  useEffect(() => {
    // Redireciona automaticamente após breve mensagem
    const t = setTimeout(() => router.replace('/estoque/avaliacao'), 1500)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <ClipboardCheck className="h-14 w-14 text-brand-500 animate-pulse" />
      <h2 className="text-xl font-bold text-gray-800">Avaliação obrigatória</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        Para cadastrar um veículo no estoque é necessário realizar uma avaliação primeiro.
        Redirecionando...
      </p>
    </div>
  )
}
