'use client'

// =============================================================================
// Relatório — Avaliações (AutoDrive)
// Avaliações de veículos por resultado/intenção + lista.
// Consome /api/reports/stock/evaluations.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { ClipboardCheck, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string; plate: string | null; brand: string | null; model: string | null; version: string | null; year: number | null
  result: string | null; intention: string | null; ownerName: string | null
  fipeValue: number; evaluatedValue: number; suggestedSalePrice: number; createdAt: string
}
interface Summary { count: number; totalEvaluated: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const RESULT_LABEL: Record<string, string> = { APROVADO: 'Aprovado', RECUSADO: 'Recusado', PENDENTE: 'Pendente' }
const RESULT_CLS: Record<string, string> = { APROVADO: 'bg-green-100 text-green-700', RECUSADO: 'bg-red-100 text-red-600', PENDENTE: 'bg-amber-100 text-amber-700' }
const INTENTION_LABEL: Record<string, string> = { COMPRA: 'Compra', TROCA: 'Troca', CONSIGNACAO: 'Consignação', APENAS_AVALIACAO: 'Só avaliação' }

export default function AvaliacoesReportPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [byResult, setByResult] = useState<{ result: string | null; count: number }[]>([])
  const [byIntention, setByIntention] = useState<{ intention: string | null; count: number }[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/stock/evaluations', { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setByResult(json?.byResult ?? []); setByIntention(json?.byIntention ?? []); setRows(json?.data ?? [])
    } catch { setSummary(null); setByResult([]); setByIntention([]); setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Avaliações</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.count ?? 0} avaliações`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Avaliações</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.count ?? 0}</p></div>
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-brand-700">Valor avaliado (total)</p><p className="mt-1 text-xl font-bold tabular-nums text-brand-800">{loading ? '—' : fmt(summary?.totalEvaluated ?? 0)}</p></div>
        {byResult.map((r) => (
          <div key={r.result ?? 'null'} className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{RESULT_LABEL[r.result ?? ''] ?? r.result}</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{r.count}</p></div>
        ))}
      </div>

      {byIntention.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byIntention.map((i) => (<span key={i.intention ?? 'null'} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">{INTENTION_LABEL[i.intention ?? ''] ?? i.intention}: <span className="font-semibold tabular-nums text-gray-900">{i.count}</span></span>))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Veículo', 'Placa', 'Proprietário', 'Intenção', 'FIPE', 'Avaliado', 'Resultado', 'Data'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center"><ClipboardCheck size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma avaliação registrada.</p></td></tr>
              ) : (
                rows.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><p className="font-medium text-gray-900">{[e.brand, e.model].filter(Boolean).join(' ') || '—'}</p>{e.version && <p className="max-w-xs truncate text-xs text-gray-400">{e.version}</p>}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{e.plate ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{e.ownerName ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{INTENTION_LABEL[e.intention ?? ''] ?? e.intention ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-400">{e.fipeValue ? fmt(e.fipeValue) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{e.evaluatedValue ? fmt(e.evaluatedValue) : '—'}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', RESULT_CLS[e.result ?? ''] ?? 'bg-gray-100 text-gray-600')}>{RESULT_LABEL[e.result ?? ''] ?? e.result}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(e.createdAt)}</td>
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
