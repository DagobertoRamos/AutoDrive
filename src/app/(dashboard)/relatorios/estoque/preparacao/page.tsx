'use client'

// =============================================================================
// Relatório — Custo de Preparação (AutoDrive)
// Serviços de preparação dos veículos (estimado vs realizado), por tipo/status.
// Consome /api/reports/stock/preparation.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Wrench, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TypeRow { type: string; count: number; estimated: number; actual: number }
interface StatusRow { status: string; count: number; actual: number }
interface Row { id: string; description: string; type: string; status: string; estimated: number; actual: number }
interface Summary { count: number; totalEstimated: number; totalActual: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const STATUS_LABEL: Record<string, string> = { PREDICTED: 'Previsto', APPROVED: 'Aprovado', IN_PROGRESS: 'Em andamento', DONE: 'Concluído', CANCELED: 'Cancelado' }

export default function PreparacaoPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [byType, setByType] = useState<TypeRow[]>([])
  const [byStatus, setByStatus] = useState<StatusRow[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/stock/preparation', { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setByType(json?.byType ?? []); setByStatus(json?.byStatus ?? []); setRows(json?.data ?? [])
    } catch { setSummary(null); setByType([]); setByStatus([]); setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const cards = [
    { label: 'Serviços', value: summary ? String(summary.count) : '—', cls: 'text-gray-900 bg-white border-gray-200' },
    { label: 'Custo estimado', value: summary ? fmt(summary.totalEstimated) : '—', cls: 'text-blue-800 bg-blue-50 border-blue-200' },
    { label: 'Custo realizado', value: summary ? fmt(summary.totalActual) : '—', cls: 'text-brand-800 bg-brand-50 border-brand-200' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Custo de Preparação</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.count ?? 0} serviços de preparação`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((c) => (<div key={c.label} className={cn('rounded-xl border p-4', c.cls)}><p className="text-xs font-medium uppercase tracking-wide opacity-70">{c.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{loading ? '—' : c.value}</p></div>))}
      </div>

      {byType.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="section-header"><Wrench size={15} className="text-brand-700" /><h2 className="text-sm font-semibold text-gray-800">Por tipo de serviço</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50"><tr>{['Tipo', 'Qtd', 'Estimado', 'Realizado'].map((h) => (<th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {byType.map((t) => (<tr key={t.type}><td className="px-4 py-2.5 font-medium text-gray-800">{t.type}</td><td className="px-4 py-2.5 tabular-nums text-gray-600">{t.count}</td><td className="px-4 py-2.5 tabular-nums text-gray-600">{fmt(t.estimated)}</td><td className="px-4 py-2.5 tabular-nums font-semibold text-brand-700">{fmt(t.actual)}</td></tr>))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {byStatus.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byStatus.map((s) => (<span key={s.status} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">{STATUS_LABEL[s.status] ?? s.status}: <span className="font-semibold tabular-nums text-gray-900">{s.count}</span></span>))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Serviço', 'Tipo', 'Status', 'Estimado', 'Realizado'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-14 text-center"><Wrench size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum serviço de preparação registrado.</p></td></tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="max-w-xs truncate px-4 py-3 font-medium text-gray-800" title={s.description}>{s.description}</td>
                    <td className="px-4 py-3 text-gray-600">{s.type}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{STATUS_LABEL[s.status] ?? s.status}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-600">{s.estimated ? fmt(s.estimated) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-brand-700">{s.actual ? fmt(s.actual) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
