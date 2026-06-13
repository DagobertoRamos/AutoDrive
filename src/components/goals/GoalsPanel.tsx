'use client'

// =============================================================================
// GoalsPanel — Busca as metas ativas do usuário (/api/goals/me) e renderiza os
// cards com progresso. Trata loading, vazio e erro.
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import { Target, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GoalCard, type GoalCardData } from '@/components/goals/GoalCard'

export function GoalsPanel() {
  const [items, setItems] = useState<GoalCardData[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/goals/me', { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setItems(Array.isArray(json?.data) ? json.data : [])
      setState('ready')
    } catch {
      setState('error')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-brand-700" />
          <h2 className="text-sm font-semibold text-gray-800">Minhas Metas</h2>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="text-gray-400 transition-colors hover:text-gray-600"
          aria-label="Atualizar metas"
        >
          <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
        </button>
      </div>

      <div className="p-5">
        {state === 'loading' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-50" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <p className="py-8 text-center text-sm text-gray-400">
            Não foi possível carregar suas metas.
          </p>
        )}

        {state === 'ready' && items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">
            Nenhuma meta ativa no momento.
          </p>
        )}

        {state === 'ready' && items.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <GoalCard key={item.goal.id} data={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
