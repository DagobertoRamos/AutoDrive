'use client'

// =============================================================================
// FinanceEntryListReport — receitas/despesas/contas-a-pagar/contas-a-receber.
// Consome /api/reports/finance?view=...
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Wallet, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import PeriodFilter from './PeriodFilter'

interface Row {
  id: string; type: string; status: string; description: string; amount: number
  category: string; account: string | null; counterparty: string | null
  dueDate: string | null; competenceDate: string | null; paidDate: string | null; source: string | null; vencida: boolean
}
interface Cat { categoria: string; total: number; count: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const STATUS_LABEL: Record<string, string> = { PREVISTO: 'Previsto', PAGO: 'Pago', RECEBIDO: 'Recebido', CANCELADO: 'Cancelado' }
const STATUS_CLS: Record<string, string> = { PAGO: 'bg-green-100 text-green-700', RECEBIDO: 'bg-green-100 text-green-700', PREVISTO: 'bg-amber-100 text-amber-700', CANCELADO: 'bg-gray-100 text-gray-500' }

export default function FinanceEntryListReport({
  view, title, aging = false, Icon = Wallet,
}: {
  view: 'receitas' | 'despesas' | 'contas-a-pagar' | 'contas-a-receber'; title: string; aging?: boolean; Icon?: LucideIcon
}) {
  const [summary, setSummary] = useState<{ count: number; total: number; vencidas?: number } | null>(null)
  const [byCategory, setByCategory] = useState<Cat[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ view }); if (from) qs.set('from', from); if (to) qs.set('to', to)
      const res = await fetch(`/api/reports/finance?${qs}`, { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setByCategory(json?.byCategory ?? []); setRows(json?.data ?? [])
    } catch { setSummary(null); setByCategory([]); setRows([]) } finally { setLoading(false) }
  }, [view, from, to])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.count ?? 0} lançamentos`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <PeriodFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-brand-700">Total</p><p className="mt-1 text-xl font-bold tabular-nums text-brand-800">{loading ? '—' : fmt(summary?.total ?? 0)}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Lançamentos</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.count ?? 0}</p></div>
        {aging && <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-red-700">Vencidas</p><p className="mt-1 text-xl font-bold tabular-nums text-red-700">{loading ? '—' : summary?.vencidas ?? 0}</p></div>}
      </div>

      {byCategory.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byCategory.map((c) => (<span key={c.categoria} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">{c.categoria}: <span className="font-semibold tabular-nums text-gray-900">{fmt(c.total)}</span></span>))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Descrição', 'Categoria', 'Contraparte', aging ? 'Vencimento' : 'Competência', 'Valor', 'Status'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center"><Icon size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum lançamento. Rode a sincronização ou crie lançamentos manuais.</p></td></tr>
              ) : (
                rows.map((e) => (
                  <tr key={e.id} className={cn('hover:bg-gray-50', e.vencida && 'bg-red-50/40')}>
                    <td className="px-4 py-3"><p className="font-medium text-gray-900">{e.description}</p>{e.source && e.source !== 'MANUAL' && <span className="text-[10px] uppercase tracking-wide text-brand-600">{e.source}</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{e.category}</td>
                    <td className="px-4 py-3 text-gray-600">{e.counterparty ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(aging ? e.dueDate : e.competenceDate)}{e.vencida && <span className="ml-1 font-semibold text-red-600">venc.</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-gray-900">{fmt(e.amount)}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[e.status] ?? 'bg-gray-100 text-gray-600')}>{STATUS_LABEL[e.status] ?? e.status}</span></td>
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
