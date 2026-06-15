'use client'

// =============================================================================
// Relatório — Estoque Atual (AutoDrive)
// Veículos atualmente em estoque, com totais e quebra por status.
// Consome /api/reports/stock/current. (Padrão de relatório read-only.)
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Car, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string; plate: string | null; brand: string | null; model: string | null; version: string | null
  year: number | null; km: number | null; color: string | null
  condition: string | null; status: string | null; stockType: string | null
  salePrice: number; purchasePrice: number; fipeValue: number
  daysInStock: number | null
}
interface Summary { count: number; totalSale: number; totalPurchase: number; totalFipe: number }
interface StatusRow { status: string | null; count: number; totalSale: number }

const STATUS_LABEL: Record<string, string> = {
  DISPONIVEL: 'Disponível', RESERVADO: 'Reservado', EM_NEGOCIACAO: 'Em negociação',
  EM_PROMOCAO: 'Em promoção', EM_ATACADO: 'Atacado', EM_SERVICO: 'Em serviço',
  BLOQUEADO: 'Bloqueado', PENDENTE_DOCUMENTACAO: 'Pend. documentação',
  PENDENTE_AVALIACAO: 'Pend. avaliação', PENDENTE_PREPARACAO: 'Pend. preparação',
  EM_PRECIFICACAO: 'Em precificação',
}
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtInt = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR'))
const lbl = (s: string | null) => (s ? (STATUS_LABEL[s] ?? s) : '—')

export default function EstoqueAtualPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [byStatus, setByStatus] = useState<StatusRow[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/stock/current', { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null)
      setByStatus(json?.byStatus ?? [])
      setRows(json?.data ?? [])
    } catch {
      setSummary(null); setByStatus([]); setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const cards = [
    { label: 'Veículos em estoque', value: summary ? String(summary.count) : '—', cls: 'text-gray-900 bg-white border-gray-200' },
    { label: 'Valor de venda', value: summary ? fmt(summary.totalSale) : '—', cls: 'text-brand-800 bg-brand-50 border-brand-200' },
    { label: 'Valor de compra', value: summary ? fmt(summary.totalPurchase) : '—', cls: 'text-gray-800 bg-gray-50 border-gray-200' },
    { label: 'Total FIPE', value: summary ? fmt(summary.totalFipe) : '—', cls: 'text-blue-800 bg-blue-50 border-blue-200' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Estoque Atual</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.count ?? 0} veículos em estoque`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.cls)}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">{c.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{loading ? '—' : c.value}</p>
          </div>
        ))}
      </div>

      {byStatus.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byStatus.map((s) => (
            <span key={s.status ?? 'null'} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">
              {lbl(s.status)}: <span className="font-semibold tabular-nums text-gray-900">{s.count}</span>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Veículo', 'Placa', 'Ano', 'KM', 'Status', 'Venda', 'Compra', 'Dias'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                  ))}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center">
                  <Car size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
                  <p className="text-sm text-gray-400">Nenhum veículo em estoque.</p>
                </td></tr>
              ) : (
                rows.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100"><Car className="h-3.5 w-3.5 text-gray-500" /></div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{[v.brand, v.model].filter(Boolean).join(' ') || '—'}</p>
                          {v.version && <p className="max-w-xs truncate text-xs text-gray-400">{v.version}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{v.plate ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">{v.year ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">{fmtInt(v.km)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{lbl(v.status)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-brand-700">{v.salePrice ? fmt(v.salePrice) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-600">{v.purchasePrice ? fmt(v.purchasePrice) : '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-500">{fmtInt(v.daysInStock)}</td>
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
