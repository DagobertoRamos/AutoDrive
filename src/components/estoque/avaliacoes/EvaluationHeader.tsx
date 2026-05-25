'use client'

import Link from 'next/link'
import { ClipboardCheck, Plus, RefreshCw } from 'lucide-react'

interface Props {
  total?:        number
  loading?:      boolean
  onRefresh?:    () => void
  newHref?:      string
}

export function EvaluationHeader({ total, loading, onRefresh, newHref = '/estoque/avaliacao' }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 shadow-sm">
          <ClipboardCheck size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Avaliações</h1>
          <p className="text-sm text-gray-500">
            Gerencie as solicitações de avaliação e cadastre novas avaliações de veículos.
            {typeof total === 'number' && !loading && (
              <span className="ml-1 font-medium text-gray-700">
                {total} {total === 1 ? 'avaliação' : 'avaliações'} no período
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        )}
        <Link
          href={newHref}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus size={14} strokeWidth={2.5} />
          Nova Avaliação
        </Link>
      </div>
    </div>
  )
}
