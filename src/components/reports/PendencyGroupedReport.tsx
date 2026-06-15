'use client'

// =============================================================================
// PendencyGroupedReport — pendências agregadas por responsável ou unidade.
// Consome /api/reports/pendencies?view=responsavel|unidade
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Users, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GroupRow { name: string; total: number; abertas: number; resolvidas: number; vencidas: number }
interface Summary { grupos: number; total: number; abertas: number; vencidas: number }

export default function PendencyGroupedReport({
  view, title, groupLabel, Icon = Users,
}: {
  view: 'responsavel' | 'unidade'; title: string; groupLabel: string; Icon?: LucideIcon
}) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/pendencies?view=${view}`, { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setRows(json?.grouped ?? [])
    } catch { setSummary(null); setRows([]) } finally { setLoading(false) }
  }, [view])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.grupos ?? 0} ${groupLabel.toLowerCase()}s`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.total ?? 0}</p></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-blue-700">Abertas</p><p className="mt-1 text-xl font-bold tabular-nums text-blue-700">{loading ? '—' : summary?.abertas ?? 0}</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-red-700">Vencidas</p><p className="mt-1 text-xl font-bold tabular-nums text-red-700">{loading ? '—' : summary?.vencidas ?? 0}</p></div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{groupLabel}s</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.grupos ?? 0}</p></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{[groupLabel, 'Abertas', 'Resolvidas', 'Vencidas', 'Total'].map((h) => (<th key={h} className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', h === groupLabel ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-14 text-center"><Icon size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma pendência.</p></td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-blue-700">{r.abertas}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-green-700">{r.resolvidas}</td>
                    <td className={cn('whitespace-nowrap px-4 py-3 text-right tabular-nums', r.vencidas > 0 ? 'font-semibold text-red-600' : 'text-gray-400')}>{r.vencidas}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.total}</td>
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
