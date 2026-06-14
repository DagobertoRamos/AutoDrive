'use client'

// =============================================================================
// Lançamentos de Comissão — AutoDrive
// View read-only das comissões geradas pelo motor (venda, retorno, garantia,
// serviço, etc.), com totais por tipo. Sobre /api/commissions/calculations.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string
  ruleType: string
  description: string
  baseValue: number
  commissionValue: number
  status: string
  period: string
  responsavel: string
}
interface TypeTotal { ruleType: string; total: number; count: number }

const TYPE_LABEL: Record<string, string> = {
  VENDA: 'Venda', TROCA: 'Troca', COMPRA: 'Compra', GARANTIA: 'Garantia',
  RETORNO: 'Retorno', SERVICO: 'Serviço', DOCUMENTO: 'Documento',
  BONUS_META: 'Bônus meta', BONUS_DEZENA: 'Bônus dezena', EXCECAO: 'Exceção',
}
const STATUS_LABEL: Record<string, string> = {
  PREVISTO: 'Prevista', APROVADO: 'Liberada', PAGO: 'Paga', CANCELADO: 'Estornada', AJUSTADO: 'Ajustada',
}
const STATUS_COLOR: Record<string, string> = {
  PREVISTO: 'bg-amber-100 text-amber-700', APROVADO: 'bg-blue-100 text-blue-700',
  PAGO: 'bg-green-100 text-green-700', CANCELADO: 'bg-red-100 text-red-600', AJUSTADO: 'bg-purple-100 text-purple-700',
}
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function LancamentosComissaoPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<TypeTotal[]>([])
  const [grand, setGrand] = useState(0)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('')
  const [ruleType, setRuleType] = useState('')
  const [status, setStatus] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (period) params.set('period', period)
      if (ruleType) params.set('ruleType', ruleType)
      if (status) params.set('status', status)
      const res = await fetch(`/api/commissions/calculations?${params}`, { credentials: 'include' })
      const json = await res.json()
      setRows(json?.data ?? [])
      setTotals(json?.totalsByType ?? [])
      setGrand(json?.grandTotal ?? 0)
    } catch {
      setRows([]); setTotals([]); setGrand(0)
    } finally {
      setLoading(false)
    }
  }, [period, ruleType, status])

  useEffect(() => { fetchData() }, [fetchData])

  // Destaque para os tipos pedidos na spec (venda/retorno/garantia) + demais.
  const highlight = ['VENDA', 'RETORNO', 'GARANTIA', 'SERVICO']
  const cards = highlight
    .map((t) => ({ ruleType: t, total: totals.find((x) => x.ruleType === t)?.total ?? 0 }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lançamentos de Comissão</h1>
          <p className="mt-0.5 text-sm text-gray-500">Comissões geradas por venda, retorno, garantia e serviços.</p>
        </div>
        <button onClick={fetchData} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar
        </button>
      </div>

      {/* Totais por tipo (destaque) + total geral */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.ruleType} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{TYPE_LABEL[c.ruleType] ?? c.ruleType}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{loading ? '—' : fmt(c.total)}</p>
          </div>
        ))}
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Total geral</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-brand-800">{loading ? '—' : fmt(grand)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="input w-auto" />
        <select value={ruleType} onChange={(e) => setRuleType(e.target.value)} className="input w-auto">
          <option value="">Todos os tipos</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Responsável', 'Tipo', 'Descrição', 'Base', 'Comissão', 'Status', 'Período'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                  ))}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <DollarSign size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
                    <p className="text-sm text-gray-400">Nenhuma comissão lançada no filtro atual.</p>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">{r.responsavel}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{TYPE_LABEL[r.ruleType] ?? r.ruleType}</span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-600" title={r.description}>{r.description}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-600">{fmt(r.baseValue)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums text-brand-700">{fmt(r.commissionValue)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-600')}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">{r.period}</td>
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
