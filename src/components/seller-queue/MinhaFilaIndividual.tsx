'use client'

// =============================================================================
// MinhaFilaIndividual — a "fila dentro da fila" do próprio colaborador.
// Lista agendamento/retorno/pós-venda que entraram enquanto ele atendia e
// permite "iniciar" o próximo (ou qualquer um) e cancelar. Só aparece quando há
// itens aguardando. Reusa GET/POST /api/seller-queue/personal-queue[/:id].
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { ListChecks, Play, X, RefreshCw, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  itemType: string
  itemTypeLabel: string
  status: string
  priority: number
  customerName: string | null
  customerPhone: string | null
  waitingSeconds: number
  queuedAt: string
}

const TYPE_CLS: Record<string, string> = {
  RETORNO: 'bg-purple-100 text-purple-700',
  AGENDAMENTO: 'bg-blue-100 text-blue-700',
  POS_VENDA: 'bg-amber-100 text-amber-700',
  OUTRO: 'bg-gray-100 text-gray-600',
}

function waitLabel(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${m % 60}min`
}

export default function MinhaFilaIndividual({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/personal-queue', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (res.ok) setItems(j?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i) }, [load])

  const act = async (id: string, action: 'start' | 'cancel') => {
    setBusyId(id); setError('')
    try {
      const res = await fetch(`/api/seller-queue/personal-queue/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Falha na ação.'); return }
      onChanged?.()
      await load()
    } finally { setBusyId(null) }
  }

  if (loading || items.length === 0) return null // só aparece quando há itens

  return (
    <div className="overflow-hidden rounded-xl border border-brand-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 bg-brand-50 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-800"><ListChecks size={15} />Minha fila individual ({items.length})</p>
        <button onClick={load} className="rounded p-1 text-brand-600 hover:bg-brand-100" title="Atualizar"><RefreshCw size={13} /></button>
      </div>
      {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
      <ul className="divide-y divide-gray-100">
        {items.map((it, i) => (
          <li key={it.id} className="flex items-center gap-3 px-4 py-3">
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', TYPE_CLS[it.itemType] ?? 'bg-gray-100 text-gray-600')}>{it.itemTypeLabel}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{it.customerName ?? 'Cliente'}</p>
              <p className="flex items-center gap-1 text-xs text-gray-400"><Clock size={11} />aguardando {waitLabel(it.waitingSeconds)}</p>
            </div>
            <button
              onClick={() => act(it.id, 'start')}
              disabled={busyId === it.id}
              className={cn('flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold', i === 0 ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-brand-300 text-brand-700 hover:bg-brand-50')}
            >
              {busyId === it.id ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}{i === 0 ? 'Iniciar próximo' : 'Iniciar'}
            </button>
            <button onClick={() => act(it.id, 'cancel')} disabled={busyId === it.id} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Cancelar"><X size={14} /></button>
          </li>
        ))}
      </ul>
    </div>
  )
}
