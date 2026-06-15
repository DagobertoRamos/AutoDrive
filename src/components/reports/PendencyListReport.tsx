'use client'

// =============================================================================
// PendencyListReport — pendências em lista (abertas/resolvidas/sla).
// Consome /api/reports/pendencies?view=...
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string; customerName: string; plate: string | null; vehicle: string | null; description: string | null
  priority: string; status: string; responsavel: string; unidade: string
  dueDate: string | null; slaDeadline: string | null; resolvedAt: string | null; createdAt: string
  vencida: boolean; horasResolucao: number | null
}
interface Summary { count: number; vencidas: number; tempoMedioHoras?: number; noPrazo?: number; percentVencidas?: number }

const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const PRIORITY_LABEL: Record<string, string> = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente' }
const PRIORITY_CLS: Record<string, string> = { URGENTE: 'bg-red-100 text-red-700', ALTA: 'bg-orange-100 text-orange-700', MEDIA: 'bg-amber-100 text-amber-700', BAIXA: 'bg-gray-100 text-gray-600' }
const STATUS_LABEL: Record<string, string> = { ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_RESPOSTA: 'Aguard. resposta', PAUSADA: 'Pausada', FINALIZADA: 'Finalizada', REATIVADA: 'Reativada', CANCELADA: 'Cancelada', VENCIDA: 'Vencida' }
const STATUS_CLS: Record<string, string> = { FINALIZADA: 'bg-green-100 text-green-700', ABERTA: 'bg-blue-100 text-blue-700', EM_ANDAMENTO: 'bg-amber-100 text-amber-700', AGUARDANDO_RESPOSTA: 'bg-purple-100 text-purple-700', PAUSADA: 'bg-gray-100 text-gray-600', VENCIDA: 'bg-red-100 text-red-700', CANCELADA: 'bg-gray-100 text-gray-500', REATIVADA: 'bg-orange-100 text-orange-600' }
const hrs = (n: number) => (n >= 48 ? `${Math.round(n / 24)}d` : `${n}h`)

export default function PendencyListReport({
  view, title, Icon = ClipboardList,
}: {
  view: 'abertas' | 'resolvidas' | 'sla'; title: string; Icon?: LucideIcon
}) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [byPriority, setByPriority] = useState<{ priority: string; count: number }[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/pendencies?view=${view}`, { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setByPriority(json?.byPriority ?? []); setRows(json?.data ?? [])
    } catch { setSummary(null); setByPriority([]); setRows([]) } finally { setLoading(false) }
  }, [view])

  useEffect(() => { load() }, [load])

  const isResolved = view === 'resolvidas'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.count ?? 0} pendências`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.count ?? 0}</p></div>
        {!isResolved && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-red-700">Vencidas</p><p className="mt-1 text-xl font-bold tabular-nums text-red-700">{loading ? '—' : summary?.vencidas ?? 0}</p></div>
        )}
        {view === 'sla' && (
          <>
            <div className="rounded-xl border border-green-200 bg-green-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-green-700">No prazo</p><p className="mt-1 text-xl font-bold tabular-nums text-green-700">{loading ? '—' : summary?.noPrazo ?? 0}</p></div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">% Vencidas</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : `${summary?.percentVencidas ?? 0}%`}</p></div>
          </>
        )}
        {isResolved && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-brand-700">Tempo médio</p><p className="mt-1 text-xl font-bold tabular-nums text-brand-800">{loading ? '—' : hrs(summary?.tempoMedioHoras ?? 0)}</p></div>
        )}
      </div>

      {byPriority.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byPriority.map((p) => (<span key={p.priority} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">{PRIORITY_LABEL[p.priority] ?? p.priority}: <span className="font-semibold tabular-nums text-gray-900">{p.count}</span></span>))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Cliente', 'Veículo', 'Responsável', 'Unidade', 'Prioridade', 'Status', isResolved ? 'Resolvida' : 'Prazo', isResolved ? 'Tempo' : 'SLA'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center"><Icon size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma pendência.</p></td></tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} className={cn('hover:bg-gray-50', p.vencida && !isResolved && 'bg-red-50/40')}>
                    <td className="px-4 py-3"><p className="font-medium text-gray-900">{p.customerName}</p>{p.description && <p className="max-w-xs truncate text-xs text-gray-400">{p.description}</p>}</td>
                    <td className="px-4 py-3 text-gray-600">{p.vehicle ?? '—'}{p.plate && <span className="ml-1 font-mono text-xs text-gray-400">{p.plate}</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{p.responsavel}</td>
                    <td className="px-4 py-3 text-gray-600">{p.unidade}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', PRIORITY_CLS[p.priority] ?? 'bg-gray-100 text-gray-600')}>{PRIORITY_LABEL[p.priority] ?? p.priority}</span></td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[p.status] ?? 'bg-gray-100 text-gray-600')}>{STATUS_LABEL[p.status] ?? p.status}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{isResolved ? date(p.resolvedAt) : date(p.dueDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {isResolved
                        ? <span className="text-gray-600">{p.horasResolucao != null ? hrs(p.horasResolucao) : '—'}</span>
                        : p.vencida ? <span className="font-semibold text-red-600">Vencida</span> : <span className="text-gray-400">{date(p.slaDeadline)}</span>}
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
