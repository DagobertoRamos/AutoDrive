'use client'

// =============================================================================
// Financiamento — Relatórios — AutoDrive
// KPIs + por status + por banco. Consome /api/reports/financing.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Landmark, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import PeriodFilter from '@/components/reports/PeriodFilter'

interface Summary { total: number; simulacoes: number; enviadas: number; aprovadas: number; recusadas: number; canceladas: number; taxaAprovacao: number; valorAprovado: number }
interface StatusRow { status: string; count: number; solicitado: number; aprovado: number }
interface BankRow { banco: string; count: number; aprovado: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const STATUS_LABEL: Record<string, string> = { SIMULACAO: 'Simulação', ENVIADA: 'Enviada', APROVADA: 'Aprovada', RECUSADA: 'Recusada', CANCELADA: 'Cancelada' }

export default function FinancingReportsPage() {
  const [s, setS] = useState<Summary | null>(null)
  const [byStatus, setByStatus] = useState<StatusRow[]>([])
  const [byBank, setByBank] = useState<BankRow[]>([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to)
      const res = await fetch(`/api/reports/financing?${qs}`, { credentials: 'include' })
      const json = await res.json(); setS(json?.summary ?? null); setByStatus(json?.byStatus ?? []); setByBank(json?.byBank ?? [])
    } catch { setS(null); setByStatus([]); setByBank([]) } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { load() }, [load])

  const cards = [
    { label: 'Total de fichas', value: String(s?.total ?? 0), cls: 'border-gray-200 bg-white text-gray-900' },
    { label: 'Simulações', value: String(s?.simulacoes ?? 0), cls: 'border-amber-200 bg-amber-50 text-amber-700' },
    { label: 'Aprovadas', value: String(s?.aprovadas ?? 0), cls: 'border-green-200 bg-green-50 text-green-700' },
    { label: 'Recusadas', value: String(s?.recusadas ?? 0), cls: 'border-red-200 bg-red-50 text-red-600' },
    { label: 'Taxa de aprovação', value: `${s?.taxaAprovacao ?? 0}%`, cls: 'border-brand-200 bg-brand-50 text-brand-800' },
    { label: 'Valor aprovado', value: fmt(s?.valorAprovado ?? 0), cls: 'border-green-200 bg-green-50 text-green-700' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relatórios de Financiamento</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : 'Visão consolidada das fichas e simulações'}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <PeriodFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.cls)}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{c.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{loading ? '—' : c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Por status */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800"><BarChart3 size={15} className="text-brand-600" />Por status</div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50"><tr>{['Status', 'Fichas', 'Solicitado', 'Aprovado'].map((h) => (<th key={h} className={cn('px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Status' ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {byStatus.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">Sem dados.</td></tr>
              ) : byStatus.map((r) => (
                <tr key={r.status} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{r.count}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-500">{r.solicitado ? fmt(r.solicitado) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-green-700">{r.aprovado ? fmt(r.aprovado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Por banco */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800"><Landmark size={15} className="text-brand-600" />Por banco</div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50"><tr>{['Banco', 'Fichas', 'Aprovado'].map((h) => (<th key={h} className={cn('px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Banco' ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {byBank.length === 0 ? (
                <tr><td colSpan={3} className="py-8 text-center text-sm text-gray-400">Sem dados.</td></tr>
              ) : byBank.map((r) => (
                <tr key={r.banco} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{r.banco}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{r.count}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-green-700">{r.aprovado ? fmt(r.aprovado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
