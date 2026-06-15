'use client'

// =============================================================================
// Relatório — Contas (saldo por conta financeira) — AutoDrive
// Saldo = saldo inicial + recebido - pago. Consome /api/reports/finance?view=contas.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Landmark, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row { id: string; name: string; type: string; openingBalance: number; recebido: number; pago: number; saldo: number; active: boolean }
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TYPE_LABEL: Record<string, string> = { CAIXA: 'Caixa', BANCO: 'Banco', CARTAO: 'Cartão', OUTRO: 'Outro' }

export default function ContasReportPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [saldoTotal, setSaldoTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/finance?view=contas', { credentials: 'include' })
      const json = await res.json(); setRows(json?.data ?? []); setSaldoTotal(json?.summary?.saldoTotal ?? 0)
    } catch { setRows([]); setSaldoTotal(0) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contas</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${rows.length} contas`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-brand-700">Saldo total</p><p className="mt-1 text-2xl font-bold tabular-nums text-brand-800">{loading ? '—' : fmt(saldoTotal)}</p></div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Conta', 'Tipo', 'Saldo inicial', 'Recebido', 'Pago', 'Saldo atual'].map((h) => (<th key={h} className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Conta' || h === 'Tipo' ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center"><Landmark size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma conta cadastrada.</p></td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={cn('hover:bg-gray-50', !r.active && 'opacity-50')}>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{TYPE_LABEL[r.type] ?? r.type}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-400">{fmt(r.openingBalance)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-green-700">{fmt(r.recebido)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-red-600">{fmt(r.pago)}</td>
                    <td className={cn('whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold', r.saldo >= 0 ? 'text-gray-900' : 'text-orange-600')}>{fmt(r.saldo)}</td>
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
