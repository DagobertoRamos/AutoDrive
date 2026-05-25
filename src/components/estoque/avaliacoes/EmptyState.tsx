'use client'

import Link from 'next/link'
import { ClipboardCheck, Plus, SearchX } from 'lucide-react'

interface Props {
  filtered?:  boolean   // true = não achou por filtro, false = banco vazio
  newHref?:   string
  onClear?:   () => void
}

export function EmptyState({ filtered, newHref = '/estoque/avaliacao', onClear }: Props) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <SearchX size={24} />
        </div>
        <h3 className="mt-4 text-base font-semibold text-gray-800">Nenhum resultado encontrado</h3>
        <p className="mt-1 max-w-md text-sm text-gray-500">
          Não há avaliações que correspondam aos filtros aplicados. Tente ajustar a busca, mudar o período ou limpar os filtros.
        </p>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="mt-5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Limpar filtros
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
        <ClipboardCheck size={28} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">Nenhuma avaliação pendente no momento</h3>
      <p className="mt-1 max-w-md text-sm text-gray-500">
        Quando uma solicitação de avaliação chegar, ela aparecerá aqui. Você também pode cadastrar uma nova avaliação manualmente.
      </p>
      <Link
        href={newHref}
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
      >
        <Plus size={14} strokeWidth={2.5} />
        Nova Avaliação
      </Link>
    </div>
  )
}
