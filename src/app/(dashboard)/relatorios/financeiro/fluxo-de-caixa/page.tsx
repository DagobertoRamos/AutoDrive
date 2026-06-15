'use client'

// =============================================================================
// Relatório — Fluxo de Caixa (entradas/saídas por mês) — AutoDrive
// Considera lançamentos liquidados (paidDate). Consome
// /api/reports/finance?view=fluxo-de-caixa.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MesRow { mes: string; entradas: number; saidas: number; saldo: number }
interface Summary { entradas: number; saidas: number; saldo: number }
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const mesLabel = (m: string) => { const [y, mm] = m.split('-'); return mm ? `${mm}/${y}` : m }

export default function FluxoDeCaixaReportPage() {
  const [meses, setMeses] = useState<MesRow[]>([])
  const [s, setS] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/finance?view=fluxo-de-caixa', { credentials: 'include' })
      const json = await res.json(); setMeses(json?.meses ?? []); setS(json?.summary ?? null)
    } catch { setMeses([]); setS(null) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  let acumulado = 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fluxo de Caixa</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${meses.length} meses`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-green-700">Entradas</p><p className="mt-1 text-xl font-bold tabular-nums text-green-700">{loading ? '—' : fmt(s?.entradas ?? 0)}</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-red-700">Saídas</p><p className="mt-1 text-xl font-bold tabular-nums text-red-700">{loading ? '—' : fmt(s?.saidas ?? 0)}</p></div>
        <div className={cn('rounded-xl border p-4', (s?.saldo ?? 0) >= 0 ? 'border-brand-200 bg-brand-50' : 'border-orange-200 bg-orange-50')}><p className="text-xs font-medium uppercase tracking-wide text-gray-600">Saldo</p><p className={cn('mt-1 text-xl font-bold tabular-nums', (s?.saldo ?? 0) >= 0 ? 'text-brand-800' : 'text-orange-700')}>{loading ? '—' : fmt(s?.saldo ?? 0)}</p></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Mês', 'Entradas', 'Saídas', 'Saldo do mês', 'Acumulado'].map((h) => (<th key={h} className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Mês' ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : meses.length === 0 ? (
                <tr><td colSpan={5} className="py-14 text-center"><Activity size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Sem movimentos liquidados.</p></td></tr>
              ) : (
                meses.map((m) => {
                  acumulado += m.saldo
                  const ac = acumulado
                  return (
                    <tr key={m.mes} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{mesLabel(m.mes)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-green-700">{fmt(m.entradas)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-red-600">{fmt(m.saidas)}</td>
                      <td className={cn('whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium', m.saldo >= 0 ? 'text-gray-900' : 'text-orange-600')}>{fmt(m.saldo)}</td>
                      <td className={cn('whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold', ac >= 0 ? 'text-brand-800' : 'text-orange-600')}>{fmt(ac)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
