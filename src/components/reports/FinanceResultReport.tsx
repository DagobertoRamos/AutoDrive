'use client'

// =============================================================================
// FinanceResultReport — resultado por unidade/vendedor/período.
// Consome /api/reports/finance?view=resultado-*
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import PeriodFilter from './PeriodFilter'

interface GroupRow { name: string; receitas: number; despesas: number; resultado: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FinanceResultReport({
  view, title, groupLabel, Icon = BarChart3,
}: {
  view: 'resultado-unidade' | 'resultado-vendedor' | 'resultado-periodo'; title: string; groupLabel: string; Icon?: LucideIcon
}) {
  const [summary, setSummary] = useState<{ grupos: number; receitas: number; despesas: number } | null>(null)
  const [rows, setRows] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ view }); if (from) qs.set('from', from); if (to) qs.set('to', to)
      const res = await fetch(`/api/reports/finance?${qs}`, { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setRows(json?.grouped ?? [])
    } catch { setSummary(null); setRows([]) } finally { setLoading(false) }
  }, [view, from, to])

  useEffect(() => { load() }, [load])

  const resultadoTotal = (summary?.receitas ?? 0) - (summary?.despesas ?? 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.grupos ?? 0} ${groupLabel.toLowerCase()}s`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <PeriodFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-green-700">Receitas</p><p className="mt-1 text-xl font-bold tabular-nums text-green-700">{loading ? '—' : fmt(summary?.receitas ?? 0)}</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-red-700">Despesas</p><p className="mt-1 text-xl font-bold tabular-nums text-red-700">{loading ? '—' : fmt(summary?.despesas ?? 0)}</p></div>
        <div className={cn('rounded-xl border p-4', resultadoTotal >= 0 ? 'border-brand-200 bg-brand-50' : 'border-orange-200 bg-orange-50')}><p className="text-xs font-medium uppercase tracking-wide text-gray-600">Resultado</p><p className={cn('mt-1 text-xl font-bold tabular-nums', resultadoTotal >= 0 ? 'text-brand-800' : 'text-orange-700')}>{loading ? '—' : fmt(resultadoTotal)}</p></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{[groupLabel, 'Receitas', 'Despesas', 'Resultado'].map((h) => (<th key={h} className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', h === groupLabel ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (<tr key={i}>{Array.from({ length: 4 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="py-14 text-center"><Icon size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Sem dados financeiros no período.</p></td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-green-700">{fmt(r.receitas)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-red-600">{fmt(r.despesas)}</td>
                    <td className={cn('whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold', r.resultado >= 0 ? 'text-gray-900' : 'text-orange-600')}>{fmt(r.resultado)}</td>
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
