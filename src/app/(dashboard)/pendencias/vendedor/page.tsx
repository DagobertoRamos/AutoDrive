'use client'

// =============================================================================
// Pendências Vendedor — AutoDrive
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { RefreshCw, Search, Filter } from 'lucide-react'
import { PendencyCard } from '@/components/pendencies/PendencyCard'
import { cn } from '@/lib/utils'
import type { PendencyWithRelations, PendencyStatus, PendencyPriority } from '@/types'

const STATUS_OPTIONS: { value: PendencyStatus | ''; label: string }[] = [
  { value: '',                    label: 'Todos os status' },
  { value: 'ABERTA',              label: 'Aberta' },
  { value: 'EM_ANDAMENTO',        label: 'Em Andamento' },
  { value: 'AGUARDANDO_RESPOSTA', label: 'Aguardando Resposta' },
  { value: 'PAUSADA',             label: 'Pausada' },
  { value: 'FINALIZADA',          label: 'Finalizada' },
  { value: 'VENCIDA',             label: 'Vencida' },
]

const PRIORITY_OPTIONS: { value: PendencyPriority | ''; label: string }[] = [
  { value: '',        label: 'Todas as prioridades' },
  { value: 'URGENTE', label: 'Urgente' },
  { value: 'ALTA',    label: 'Alta' },
  { value: 'MEDIA',   label: 'Média' },
  { value: 'BAIXA',   label: 'Baixa' },
]

export default function PendenciasVendedorPage() {
  const { data: session } = useSession()
  const [pendencies, setPendencies] = useState<PendencyWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PendencyStatus | ''>('')
  const [priority, setPriority] = useState<PendencyPriority | ''>('')

  const fetchPendencies = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (priority) params.set('priority', priority)
      const res = await fetch(`/api/pendencies?${params}`)
      const data = await res.json()
      if (data.success) setPendencies(data.data ?? [])
    } catch {
      // silently fail, keep previous data
    } finally {
      setLoading(false)
    }
  }, [status, priority])

  useEffect(() => {
    fetchPendencies()
    const interval = setInterval(fetchPendencies, 30_000)
    return () => clearInterval(interval)
  }, [fetchPendencies])

  const filtered = pendencies.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.customerName?.toLowerCase().includes(q) ||
      p.plate?.toLowerCase().includes(q) ||
      p.negotiation?.toLowerCase().includes(q) ||
      p.vehicle?.toLowerCase().includes(q)
    )
  })

  const countByStatus = (s: PendencyStatus) => pendencies.filter(p => p.status === s).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Minhas Pendências</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Carregando...' : `${filtered.length} pendência${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={fetchPendencies}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Urgentes',    status: 'URGENTE'      as any,            color: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'Em Andamento',status: 'EM_ANDAMENTO' as PendencyStatus, color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Vencidas',    status: 'VENCIDA'      as PendencyStatus, color: 'bg-orange-50 text-orange-700 border-orange-200' },
          { label: 'Finalizadas', status: 'FINALIZADA'   as PendencyStatus, color: 'bg-green-50 text-green-700 border-green-200' },
        ].map(item => (
          <div key={item.label} className={cn('rounded-lg border px-3 py-2.5 text-center', item.color)}>
            <p className="text-lg font-bold">{countByStatus(item.status)}</p>
            <p className="text-xs font-medium">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, placa ou negociação..."
            className="input pl-9"
          />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value as any)} className="input w-auto">
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={priority} onChange={e => setPriority(e.target.value as any)} className="input w-auto">
          {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Filter size={40} strokeWidth={1} />
          <p className="mt-3 text-base font-medium">Nenhuma pendência encontrada</p>
          <p className="text-sm">Tente ajustar os filtros ou aguarde novas pendências.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(p => (
            <PendencyCard key={p.id} pendency={p} onRefresh={fetchPendencies} />
          ))}
        </div>
      )}
    </div>
  )
}
