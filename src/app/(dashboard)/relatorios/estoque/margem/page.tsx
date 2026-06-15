'use client'

// =============================================================================
// Relatório — Margem por Veículo (AutoDrive)
// Margem = venda − compra. Consome /api/reports/stock/margin.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Car, RefreshCw, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string; plate: string | null; brand: string | null; model: string | null; version: string | null
  year: number | null; status: string | null
  salePrice: number; purchasePrice: number; fipeValue: number; margin: number; marginPct: number | null
}
interface Summary { count: number; totalSale: number; totalPurchase: number; totalMargin: number; avgMarginPct: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

export default function MargemPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/stock/margin', { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null)
      setRows(json?.data ?? [])
    } catch { setSummary(null); setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const cards = [
    { label: 'Veículos', value: summary ? String(summary.count) : '—', cls: 'text-gray-900 bg-white border-gray-200' },
    { label: 'Margem total', value: summary ? fmt(summary.totalMargin) : '—', cls: summary && summary.totalMargin >= 0 ? 'text-brand-800 bg-brand-50 border-brand-200' : 'text-red-700 bg-red-50 border-red-200' },
    { label: 'Margem média', value: summary ? pct(summary.avgMarginPct) : '—', cls: 'text-blue-800 bg-blue-50 border-blue-200' },
    { label: 'Venda / Compra', value: summary ? `${fmt(summary.totalSale)}` : '—', cls: 'text-gray-800 bg-gray-50 border-gray-200' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Margem por Veículo</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.count ?? 0} veículos em estoque com preços`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.cls)}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">{c.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{loading ? '—' : c.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>{['Veículo', 'Placa', 'Compra', 'Venda', 'FIPE', 'Margem', '%'].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="py-14 text-center"><TrendingUp size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Sem dados de preço para calcular margem.</p></td></tr>
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
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-600">{v.purchasePrice ? fmt(v.purchasePrice) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{v.salePrice ? fmt(v.salePrice) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-400">{v.fipeValue ? fmt(v.fipeValue) : '—'}</td>
                    <td className={cn('whitespace-nowrap px-4 py-3 tabular-nums font-bold', v.margin >= 0 ? 'text-brand-700' : 'text-red-600')}>{fmt(v.margin)}</td>
                    <td className={cn('px-4 py-3 tabular-nums', (v.marginPct ?? 0) >= 0 ? 'text-gray-600' : 'text-red-600')}>{pct(v.marginPct)}</td>
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
