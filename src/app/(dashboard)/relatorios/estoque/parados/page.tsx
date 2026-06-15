'use client'

// =============================================================================
// Relatório — Veículos Parados (AutoDrive)
// Veículos em estoque há mais tempo. Consome /api/reports/stock/stale.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Car, RefreshCw, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string; plate: string | null; brand: string | null; model: string | null; version: string | null
  year: number | null; km: number | null; status: string | null; salePrice: number; daysInStock: number | null
}
interface Bucket { label: string; count: number; totalSale: number }
interface Summary { totalEmEstoque: number; parados: number; valorParado: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MIN_OPTS = [30, 60, 90, 120]

export default function VeiculosParadosPage() {
  const [minDays, setMinDays] = useState(60)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/stock/stale?minDays=${minDays}`, { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null)
      setBuckets(json?.buckets ?? [])
      setRows(json?.data ?? [])
    } catch { setSummary(null); setBuckets([]); setRows([]) } finally { setLoading(false) }
  }, [minDays])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Veículos Parados</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.parados ?? 0} veículos há ${minDays}+ dias em estoque`}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Parado há</span>
          <select value={minDays} onChange={(e) => setMinDays(Number(e.target.value))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
            {MIN_OPTS.map((d) => <option key={d} value={d}>{d}+ dias</option>)}
          </select>
          <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      </div>

      {/* Faixas de tempo em estoque */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(buckets.length ? buckets : [{ label: '—', count: 0, totalSale: 0 }]).map((b) => (
          <div key={b.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{b.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : b.count}</p>
            {!loading && b.totalSale > 0 && <p className="text-xs text-gray-400">{fmt(b.totalSale)}</p>}
          </div>
        ))}
      </div>

      {!loading && summary && (
        <p className="text-sm text-gray-500">Valor parado (≥ {minDays} dias): <span className="font-semibold text-amber-700">{fmt(summary.valorParado)}</span> de {summary.totalEmEstoque} em estoque.</p>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>{['Veículo', 'Placa', 'Ano', 'Status', 'Venda', 'Dias em estoque'].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center"><Clock size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum veículo parado há {minDays}+ dias. 👍</p></td></tr>
              ) : (
                rows.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100"><Car className="h-3.5 w-3.5 text-gray-500" /></div>
                        <div className="min-w-0"><p className="font-medium text-gray-900">{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</p>{v.version && <p className="max-w-xs truncate text-xs text-gray-400">{v.version}</p>}</div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{v.plate ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">{v.year ?? '—'}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{v.status ?? '—'}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{v.salePrice ? fmt(v.salePrice) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', (v.daysInStock ?? 0) >= 90 ? 'bg-red-100 text-red-700' : (v.daysInStock ?? 0) >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>
                        {v.daysInStock ?? '—'} dias
                      </span>
                    </td>
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
