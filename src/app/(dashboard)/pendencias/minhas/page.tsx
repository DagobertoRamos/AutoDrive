'use client'

// =============================================================================
// Minhas Pendências — AutoDrive
// Visão pessoal do vendedor/usuário (apenas as próprias pendências)
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { RefreshCw, Search, Filter, Plus, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'
import { PendencyCard } from '@/components/pendencies/PendencyCard'
import { cn } from '@/lib/utils'
import type { PendencyWithRelations } from '@/types'
import type { PendencyStatus, PendencyPriority } from '@/types'

const STATUS_OPTIONS: { value: PendencyStatus | ''; label: string }[] = [
  { value: '',                   label: 'Todos os status' },
  { value: 'ABERTA',             label: 'Aberta' },
  { value: 'EM_ANDAMENTO',       label: 'Em Andamento' },
  { value: 'AGUARDANDO_RESPOSTA',label: 'Aguardando Resposta' },
  { value: 'PAUSADA',            label: 'Pausada' },
  { value: 'FINALIZADA',         label: 'Finalizada' },
  { value: 'VENCIDA',            label: 'Vencida' },
]

const PRIORITY_OPTIONS: { value: PendencyPriority | ''; label: string }[] = [
  { value: '',        label: 'Todas as prioridades' },
  { value: 'URGENTE', label: 'Urgente' },
  { value: 'ALTA',    label: 'Alta' },
  { value: 'MEDIA',   label: 'Média' },
  { value: 'BAIXA',   label: 'Baixa' },
]

interface SummaryItem {
  label:  string
  count:  number
  color:  string
}

export default function MinhasPendenciasPage() {
  const { data: session } = useSession()
  const [pendencies, setPendencies]   = useState<PendencyWithRelations[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter]     = useState<PendencyStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState<PendencyPriority | ''>('')

  const fetchPendencies = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter)   params.set('status',   statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      params.set('perPage', '100')
      const res  = await fetch(`/api/pendencies?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) setPendencies(data.data ?? [])
    } catch {
      // keep previous data
    } finally {
      setLoading(false)
    }
  }, [statusFilter, priorityFilter])

  useEffect(() => {
    fetchPendencies()
    const iv = setInterval(fetchPendencies, 30_000)
    return () => clearInterval(iv)
  }, [fetchPendencies])

  const filtered = pendencies.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.customerName?.toLowerCase().includes(q) ||
      p.plate?.toLowerCase().includes(q)        ||
      p.vehicle?.toLowerCase().includes(q)      ||
      p.negotiation?.toLowerCase().includes(q)
    )
  })

  const countByStatus = (s: PendencyStatus) => pendencies.filter((p) => p.status === s).length
  const countByPriority = (pr: PendencyPriority) => pendencies.filter((p) => p.priority === pr).length

  const summary: SummaryItem[] = [
    { label: 'Urgentes',          count: countByPriority('URGENTE'),          color: 'bg-red-50 text-red-700 border-red-200' },
    { label: 'Em Andamento',      count: countByStatus('EM_ANDAMENTO'),       color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { label: 'Aguardando Resp.',  count: countByStatus('AGUARDANDO_RESPOSTA'),color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { label: 'Finalizadas',       count: countByStatus('FINALIZADA'),         color: 'bg-green-50 text-green-700 border-green-200' },
  ]

  const urgentes = pendencies.filter((p) => p.priority === 'URGENTE' && p.status !== 'FINALIZADA' && p.status !== 'CANCELADA')

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Minhas Pendências</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading
              ? 'Carregando...'
              : `${filtered.length} pendência${filtered.length !== 1 ? 's' : ''} encontrada${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={fetchPendencies}
          disabled={loading}
          className="btn-secondary text-xs"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* ── Alerta de urgentes ────────────────────────────────────────────── */}
      {!loading && urgentes.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 animate-fade-in">
          <AlertTriangle size={16} className="shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-700">
            Você tem <span className="font-bold">{urgentes.length}</span> pendência{urgentes.length > 1 ? 's' : ''} urgente{urgentes.length > 1 ? 's' : ''}
            {' '}que requer{urgentes.length > 1 ? 'em' : ''} atenção imediata.
          </p>
        </div>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className={cn('rounded-lg border px-3 py-3 text-center', s.color)}>
            <p className="text-2xl font-bold tabular-nums">{loading ? '—' : s.count}</p>
            <p className="mt-0.5 text-xs font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, placa, veículo..."
            className="input pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PendencyStatus | '')}
          className="input w-auto"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as PendencyPriority | '')}
          className="input w-auto"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── Cards grid ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <CheckCircle2 size={40} strokeWidth={1} className="text-brand-300" />
          <p className="mt-3 text-base font-medium text-gray-500">Nenhuma pendência encontrada</p>
          <p className="text-sm text-gray-400">
            {search || statusFilter || priorityFilter
              ? 'Tente ajustar os filtros de busca.'
              : 'Você não possui pendências no momento.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PendencyCard key={p.id} pendency={p} onRefresh={fetchPendencies} />
          ))}
        </div>
      )}
    </div>
  )
}
