'use client'

// =============================================================================
// NegotiationsReport — relatório reutilizável de negociações por tipo.
// Usado por relatorios/negociacoes/{vendas,trocas,compras,consignacao}.
// Consome /api/reports/negotiations?type=...
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Handshake, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type DealType = 'VENDA' | 'TROCA' | 'COMPRA' | 'CONSIGNACAO'

interface Row {
  id: string; dealNumber: string | null; status: string
  value: number; seller: string; customer: string; vehicle: string; plate: string | null; date: string
}
interface Summary { count: number; finalizadas: number; valorRealizado: number; valorTotal: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (s: string) => new Date(s).toLocaleDateString('pt-BR')

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', EM_NEGOCIACAO: 'Em negociação', AGUARDANDO_APROVACAO: 'Aguard. aprovação',
  APROVADA: 'Aprovada', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada', DEVOLVIDA: 'Devolvida',
}
const STATUS_CLS: Record<string, string> = {
  FINALIZADA: 'bg-green-100 text-green-700', CANCELADA: 'bg-red-100 text-red-600',
  DEVOLVIDA: 'bg-orange-100 text-orange-600', EM_NEGOCIACAO: 'bg-amber-100 text-amber-700',
  APROVADA: 'bg-blue-100 text-blue-700',
}

export default function NegotiationsReport({
  type, title, valueLabel, Icon = Handshake,
}: {
  type: DealType; title: string; valueLabel?: string; Icon?: LucideIcon
}) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [byStatus, setByStatus] = useState<{ status: string; count: number }[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/negotiations?type=${type}`, { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setByStatus(json?.byStatus ?? []); setRows(json?.data ?? [])
    } catch { setSummary(null); setByStatus([]); setRows([]) } finally { setLoading(false) }
  }, [type])

  useEffect(() => { load() }, [load])

  const realizedLabel = valueLabel ?? 'Valor realizado'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.count ?? 0} negociações`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.count ?? 0}</p></div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Finalizadas</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.finalizadas ?? 0}</p></div>
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-brand-700">{realizedLabel}</p><p className="mt-1 text-xl font-bold tabular-nums text-brand-800">{loading ? '—' : fmt(summary?.valorRealizado ?? 0)}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Valor (todas)</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-700">{loading ? '—' : fmt(summary?.valorTotal ?? 0)}</p></div>
      </div>

      {byStatus.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byStatus.map((s) => (<span key={s.status} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">{STATUS_LABEL[s.status] ?? s.status}: <span className="font-semibold tabular-nums text-gray-900">{s.count}</span></span>))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Nº', 'Veículo', 'Placa', 'Cliente', 'Vendedor', 'Valor', 'Status', 'Data'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center"><Icon size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma negociação registrada.</p></td></tr>
              ) : (
                rows.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">{d.dealNumber ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{d.vehicle}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{d.plate ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{d.customer}</td>
                    <td className="px-4 py-3 text-gray-600">{d.seller}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-gray-900">{d.value ? fmt(d.value) : '—'}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[d.status] ?? 'bg-gray-100 text-gray-600')}>{STATUS_LABEL[d.status] ?? d.status}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(d.date)}</td>
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
