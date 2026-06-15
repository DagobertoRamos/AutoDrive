'use client'

// =============================================================================
// CommissionLedgerReport — extrato de comissões (geral/garantias/retornos).
// Consome /api/reports/commissions?view=...
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string; ruleType: string; description: string | null
  baseValue: number; commissionValue: number; status: string; period: string | null
  createdAt: string; responsavel: string
}
interface Bucket { total: number; count: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (s: string) => new Date(s).toLocaleDateString('pt-BR')

const TYPE_LABEL: Record<string, string> = { VENDA: 'Venda', RETORNO: 'Retorno', GARANTIA: 'Garantia', SERVICO: 'Serviço', DOCUMENTACAO: 'Documentação', ACESSORIO: 'Acessório' }
const STATUS_LABEL: Record<string, string> = { PREVISTO: 'Previsto', APROVADO: 'Aprovado', PAGO: 'Pago', CANCELADO: 'Cancelado', ESTORNADO: 'Estornado' }
const STATUS_CLS: Record<string, string> = { PAGO: 'bg-green-100 text-green-700', PREVISTO: 'bg-amber-100 text-amber-700', APROVADO: 'bg-blue-100 text-blue-700', CANCELADO: 'bg-red-100 text-red-600', ESTORNADO: 'bg-orange-100 text-orange-600' }

export default function CommissionLedgerReport({
  view, title, Icon = DollarSign,
}: {
  view: 'geral' | 'garantias' | 'retornos'; title: string; Icon?: LucideIcon
}) {
  const [summary, setSummary] = useState<{ count: number; grandTotal: number } | null>(null)
  const [byType, setByType] = useState<(Bucket & { ruleType: string })[]>([])
  const [byStatus, setByStatus] = useState<(Bucket & { status: string })[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/commissions?view=${view}`, { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setByType(json?.totalsByType ?? []); setByStatus(json?.totalsByStatus ?? []); setRows(json?.data ?? [])
    } catch { setSummary(null); setByType([]); setByStatus([]); setRows([]) } finally { setLoading(false) }
  }, [view])

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-brand-700">Total comissões</p><p className="mt-1 text-xl font-bold tabular-nums text-brand-800">{loading ? '—' : fmt(summary?.grandTotal ?? 0)}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Lançamentos</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.count ?? 0}</p></div>
        {byType.slice(0, 2).map((t) => (
          <div key={t.ruleType} className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{TYPE_LABEL[t.ruleType] ?? t.ruleType}</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{fmt(t.total)}</p></div>
        ))}
      </div>

      {byStatus.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byStatus.map((s) => (<span key={s.status} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">{STATUS_LABEL[s.status] ?? s.status}: <span className="font-semibold tabular-nums text-gray-900">{fmt(s.total)}</span> ({s.count})</span>))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Tipo', 'Descrição', 'Responsável', 'Período', 'Base', 'Comissão', 'Status', 'Data'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center"><Icon size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum lançamento de comissão.</p></td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{TYPE_LABEL[r.ruleType] ?? r.ruleType}</span></td>
                    <td className="px-4 py-3 text-gray-600"><p className="max-w-xs truncate">{r.description ?? '—'}</p></td>
                    <td className="px-4 py-3 text-gray-600">{r.responsavel}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{r.period ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-400">{r.baseValue ? fmt(r.baseValue) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-medium text-gray-900">{fmt(r.commissionValue)}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[r.status] ?? 'bg-gray-100 text-gray-600')}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{date(r.createdAt)}</td>
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
