'use client'

// =============================================================================
// Relatório — DRE (Demonstrativo de Resultado) — AutoDrive
// Receitas e despesas por categoria (regime de competência).
// Consome /api/reports/finance?view=dre.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import PeriodFilter from '@/components/reports/PeriodFilter'

interface CatRow { categoria: string; total: number }
interface Summary { totalReceitas: number; totalDespesas: number; resultado: number }
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function Block({ title, rows, total, tone }: { title: string; rows: CatRow[]; total: number; tone: 'green' | 'red' }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
      <div className={cn('px-4 py-3 text-sm font-semibold', tone === 'green' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>{title}</div>
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr><td className="px-4 py-6 text-center text-sm text-gray-400">Sem lançamentos.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.categoria} className="hover:bg-gray-50">
              <td className="px-4 py-2.5 text-gray-700">{r.categoria}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-900">{fmt(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t border-gray-200 bg-gray-50"><td className="px-4 py-2.5 font-semibold text-gray-700">Total</td><td className={cn('whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums', tone === 'green' ? 'text-green-700' : 'text-red-600')}>{fmt(total)}</td></tr></tfoot>
      </table>
    </div>
  )
}

export default function DreReportPage() {
  const [receitas, setReceitas] = useState<CatRow[]>([])
  const [despesas, setDespesas] = useState<CatRow[]>([])
  const [s, setS] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ view: 'dre' }); if (from) qs.set('from', from); if (to) qs.set('to', to)
      const res = await fetch(`/api/reports/finance?${qs}`, { credentials: 'include' })
      const json = await res.json(); setReceitas(json?.receitas ?? []); setDespesas(json?.despesas ?? []); setS(json?.summary ?? null)
    } catch { setReceitas([]); setDespesas([]); setS(null) } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { load() }, [load])

  const resultado = s?.resultado ?? 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">DRE — Demonstrativo de Resultado</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : 'Por categoria (competência)'}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <PeriodFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block title="Receitas" rows={receitas} total={s?.totalReceitas ?? 0} tone="green" />
        <Block title="Despesas" rows={despesas} total={s?.totalDespesas ?? 0} tone="red" />
      </div>

      <div className={cn('rounded-xl border p-5 text-center', resultado >= 0 ? 'border-brand-200 bg-brand-50' : 'border-orange-200 bg-orange-50')}>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Resultado do período</p>
        <p className={cn('mt-1 text-3xl font-bold tabular-nums', resultado >= 0 ? 'text-brand-800' : 'text-orange-700')}>{loading ? '—' : fmt(resultado)}</p>
      </div>
    </div>
  )
}
