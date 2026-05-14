'use client'

// =============================================================================
// Pendências — Gerência — AutoDrive
// Visão da equipe com filtros avançados e actions de gestão
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, Eye, BarChart2, AlertTriangle, Clock, CheckCircle2, Users } from 'lucide-react'
import { PriorityBadge, StatusBadge } from '@/components/pendencies/PendencyStatusBadge'
import { PendencyModal } from '@/components/pendencies/PendencyModal'
import { cn, formatDate } from '@/lib/utils'
import type { PendencyWithRelations } from '@/types'

interface Filters {
  search:   string
  status:   string
  priority: string
  sellerId: string
  unitId:   string
}

export default function PendenciasGerenciaPage() {
  const [pendencies, setPendencies] = useState<PendencyWithRelations[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<PendencyWithRelations | null>(null)
  const [filters, setFilters]       = useState<Filters>({
    search: '', status: '', priority: '', sellerId: '', unitId: '',
  })
  const [total, setTotal] = useState(0)

  const fetchPendencies = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status)   params.set('status',   filters.status)
      if (filters.priority) params.set('priority', filters.priority)
      if (filters.unitId)   params.set('unitId',   filters.unitId)
      if (filters.sellerId) params.set('sellerId', filters.sellerId)
      if (filters.search)   params.set('search',   filters.search)
      params.set('perPage', '100')
      const res  = await fetch(`/api/pendencies?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setPendencies(data.data ?? [])
        setTotal(data.meta?.total ?? 0)
      }
    } catch { /* keep prev data */ }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { fetchPendencies() }, [fetchPendencies])

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }))

  const summary = {
    total:         pendencies.length,
    urgentes:      pendencies.filter((p) => p.priority === 'URGENTE').length,
    emAndamento:   pendencies.filter((p) => p.status === 'EM_ANDAMENTO').length,
    vencidas:      pendencies.filter((p) => p.status === 'VENCIDA').length,
    finalizadas:   pendencies.filter((p) => p.status === 'FINALIZADA').length,
  }

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pendências — Gerência</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Carregando...' : `${pendencies.length} pendências`}
          </p>
        </div>
        <button onClick={fetchPendencies} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total',        value: summary.total,       color: 'bg-gray-50 border-gray-200 text-gray-700',    icon: BarChart2 },
          { label: 'Urgentes',     value: summary.urgentes,    color: 'bg-red-50 border-red-200 text-red-700',       icon: AlertTriangle },
          { label: 'Em Andamento', value: summary.emAndamento, color: 'bg-blue-50 border-blue-200 text-blue-700',    icon: Clock },
          { label: 'Vencidas',     value: summary.vencidas,    color: 'bg-amber-50 border-amber-200 text-amber-700', icon: AlertTriangle },
          { label: 'Finalizadas',  value: summary.finalizadas, color: 'bg-green-50 border-green-200 text-green-700', icon: CheckCircle2 },
        ].map((c) => (
          <div key={c.label} className={cn('rounded-xl border p-3 text-center', c.color)}>
            <p className="text-2xl font-bold tabular-nums">{loading ? '—' : c.value}</p>
            <p className="mt-0.5 text-xs font-medium">{c.label}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Buscar cliente, placa..."
            className="input pl-9"
          />
        </div>
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} className="input w-auto">
          <option value="">Status</option>
          <option value="ABERTA">Aberta</option>
          <option value="EM_ANDAMENTO">Em Andamento</option>
          <option value="AGUARDANDO_RESPOSTA">Aguardando Resposta</option>
          <option value="PAUSADA">Pausada</option>
          <option value="FINALIZADA">Finalizada</option>
          <option value="VENCIDA">Vencida</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)} className="input w-auto">
          <option value="">Prioridade</option>
          <option value="URGENTE">Urgente</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Média</option>
          <option value="BAIXA">Baixa</option>
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Prioridade','Status','Cliente','Placa','Veículo','Vendedor','Vencimento','Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pendencies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <Users size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
                    <p className="text-sm text-gray-400">Nenhuma pendência encontrada</p>
                  </td>
                </tr>
              ) : (
                pendencies.map((p) => {
                  const overdue = p.dueDate && new Date(p.dueDate) < new Date()
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <PriorityBadge priority={p.priority} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} size="sm" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">
                        {p.customerName}
                      </td>
                      <td className="px-4 py-3">
                        {p.plate
                          ? <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">{p.plate}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="max-w-[140px] truncate whitespace-nowrap px-4 py-3 text-gray-600">
                        {p.vehicle ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {p.responsible?.shortName ?? p.responsible?.fullName ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {p.dueDate ? (
                          <span className={cn('text-xs', overdue ? 'font-semibold text-red-600' : 'text-gray-500')}>
                            {formatDate(new Date(p.dueDate))}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelected(p)}
                          title="Ver detalhes"
                          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <PendencyModal
          pendency={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => { setSelected(null); fetchPendencies() }}
        />
      )}
    </div>
  )
}
