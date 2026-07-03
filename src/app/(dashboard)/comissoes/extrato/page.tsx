'use client'

// =============================================================================
// Extrato de Comissões — AutoDrive
// Listagem das comissões calculadas por período e vendedor
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, RefreshCw, Download, TrendingUp, TrendingDown } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import ExtratoDetalheModal, { type ExtratoEntry } from '@/components/comissoes/ExtratoDetalheModal'

interface CommissionEntry {
  id:           string
  sellerId:     string
  responsavel?: string
  period:       string
  baseValue:    number
  adjustments:  number
  finalValue:   number
  status:       string
  paidAt:       string | null
  createdAt?:   string
  seller?: { fullName: string; shortName: string | null }
}

interface Colaborador { id: string; nome: string }
interface Meta { total: number; page: number; totalPages: number }

const STATUS_COLOR: Record<string, string> = {
  PREVISTO:  'bg-amber-100 text-amber-700',
  APROVADO:  'bg-blue-100 text-blue-700',
  PAGO:      'bg-green-100 text-green-700',
  AJUSTADO:  'bg-purple-100 text-purple-700',
  CANCELADO: 'bg-red-100 text-red-600',
}
const STATUS_LABEL: Record<string, string> = {
  PREVISTO: 'Prevista', APROVADO: 'Liberada', PAGO: 'Paga', AJUSTADO: 'Ajustada', CANCELADO: 'Estornada',
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ExtratoComisoesPage() {
  const [entries, setEntries]   = useState<CommissionEntry[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [meta, setMeta]         = useState<Meta>({ total: 0, page: 1, totalPages: 1 })
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [period, setPeriod]     = useState('')
  const [status, setStatus]     = useState('')
  const [colaborador, setColaborador] = useState('')
  const [detalhe, setDetalhe] = useState<ExtratoEntry | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), perPage: '200' })
      if (period) params.set('period', period)
      if (status) params.set('status', status)
      const res  = await fetch(`/api/commissions?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setEntries(data.data ?? [])
        setColaboradores(data.colaboradores ?? [])
        setMeta(data.meta ?? meta)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [page, period, status])

  // Filtro por colaborador é aplicado no cliente (a lista já vem escopada pela visibilidade).
  const visible = colaborador ? entries.filter((e) => e.sellerId === colaborador) : entries

  useEffect(() => { fetchData() }, [fetchData])

  const totalValue = visible.reduce((s, e) => s + e.finalValue, 0)
  const totalBase  = visible.reduce((s, e) => s + e.baseValue, 0)
  const totalAdj   = visible.reduce((s, e) => s + e.adjustments, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Extrato de Comissões</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${meta.total} registros`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </button>
          <button className="btn-secondary text-xs">
            <Download size={13} />
            Exportar
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Total Base',      value: totalBase, icon: DollarSign, color: 'text-gray-700 bg-gray-50 border-gray-200' },
          { label: 'Ajustes',         value: totalAdj,  icon: totalAdj >= 0 ? TrendingUp : TrendingDown, color: totalAdj >= 0 ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200' },
          { label: 'Total Final',     value: totalValue,icon: DollarSign, color: 'text-brand-700 bg-brand-50 border-brand-200' },
        ].map((c) => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.color)}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '—' : fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="month"
          value={period}
          onChange={(e) => { setPeriod(e.target.value); setPage(1) }}
          className="input w-auto"
          placeholder="Período"
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="input w-auto">
          <option value="">Todos os status</option>
          <option value="PREVISTO">Prevista</option>
          <option value="APROVADO">Liberada</option>
          <option value="PAGO">Paga</option>
          <option value="AJUSTADO">Ajustada</option>
          <option value="CANCELADO">Estornada</option>
        </select>
        {colaboradores.length > 1 && (
          <select value={colaborador} onChange={(e) => setColaborador(e.target.value)} className="input w-auto">
            <option value="">Todos os colaboradores</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Vendedor','Período','Base','Ajustes','Total Final','Status','Pago em'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <DollarSign size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
                    <p className="text-sm text-gray-400">Nenhum registro de comissão encontrado</p>
                  </td>
                </tr>
              ) : (
                visible.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setDetalhe({ sellerId: e.sellerId, responsavel: e.responsavel ?? e.seller?.shortName ?? e.seller?.fullName ?? '—', period: e.period, baseValue: e.baseValue, finalValue: e.finalValue, status: e.status })}
                    className="cursor-pointer hover:bg-brand-50/50"
                    title="Ver detalhes da comissão"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-brand-700 underline-offset-2 hover:underline">
                      {e.responsavel ?? e.seller?.shortName ?? e.seller?.fullName ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-gray-600">{e.period}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{fmt(e.baseValue)}</td>
                    <td className={cn('whitespace-nowrap px-4 py-3 tabular-nums font-medium', e.adjustments >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {e.adjustments >= 0 ? '+' : ''}{fmt(e.adjustments)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums text-brand-700">{fmt(e.finalValue)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_COLOR[e.status] ?? 'bg-gray-100 text-gray-600')}>
                        {STATUS_LABEL[e.status] ?? e.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {e.paidAt ? formatDate(new Date(e.paidAt)) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-gray-500">Página {meta.page} de {meta.totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="btn-secondary text-xs disabled:opacity-40">Anterior</button>
              <button disabled={page >= meta.totalPages || loading} onClick={() => setPage((p) => p + 1)} className="btn-secondary text-xs disabled:opacity-40">Próxima</button>
            </div>
          </div>
        )}
      </div>

      {detalhe && <ExtratoDetalheModal entry={detalhe} onClose={() => setDetalhe(null)} onChanged={fetchData} />}
    </div>
  )
}
