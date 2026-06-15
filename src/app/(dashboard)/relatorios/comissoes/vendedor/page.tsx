'use client'

// =============================================================================
// Relatório — Comissões por Vendedor (AutoDrive)
// Agregado por vendedor (total + quebra por tipo). Consome
// /api/reports/commissions?view=vendedor.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Users, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SellerRow { seller: string; total: number; count: number; byType: Record<string, number> }
interface Summary { sellers: number; total: number; count: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TYPE_LABEL: Record<string, string> = { VENDA: 'Venda', RETORNO: 'Retorno', GARANTIA: 'Garantia', SERVICO: 'Serviço', DOCUMENTACAO: 'Documentação', ACESSORIO: 'Acessório' }

export default function ComissoesVendedorReportPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [rows, setRows] = useState<SellerRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/commissions?view=vendedor', { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setRows(json?.bySeller ?? [])
    } catch { setSummary(null); setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comissões por Vendedor</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.sellers ?? 0} vendedores`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-brand-700">Total comissões</p><p className="mt-1 text-xl font-bold tabular-nums text-brand-800">{loading ? '—' : fmt(summary?.total ?? 0)}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Vendedores</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.sellers ?? 0}</p></div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Lançamentos</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.count ?? 0}</p></div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Vendedor', 'Venda', 'Retorno', 'Garantia', 'Lançamentos', 'Total'].map((h) => (<th key={h} className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Vendedor' ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center"><Users size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma comissão registrada.</p></td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.seller} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.seller}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600">{r.byType.VENDA ? fmt(r.byType.VENDA) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600">{r.byType.RETORNO ? fmt(r.byType.RETORNO) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600">{r.byType.GARANTIA ? fmt(r.byType.GARANTIA) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-500">{r.count}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{fmt(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400">Coluna “Venda/Retorno/Garantia” soma apenas lançamentos do tipo. Outros tipos entram no Total.</p>
    </div>
  )
}
