'use client'

// Relatório: resultado completo de cada negociação de venda do período.

import { useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { DealPeekLink } from '@/components/deals/DealPeek'
import { Kpi, Panel, SortTh, StateBox, fmt, fmtDate, fmtPct, td, tdR, useFinanceData, useSort } from './shared'
import type { ReportViewProps } from './types'

interface Row {
  dealId: string; dealNumber: string | null; status: string; date: string; customer: string | null; vehicle: string | null; plate: string | null
  sellerName: string | null; vehicleMargin: number; profit: number; margin: number | null
  revenue: { vehicle: number; services: number; fi: number; total: number }
  cost: { vehicle: number; services: number; storeDebts: number; commissions: number; total: number }
}
interface Data { from: string; to: string; rows: Row[]; totals: { count: number; revenue: number; profit: number; margin: number | null; vehicle: number; fi: number; services: number; commissions: number; avgProfit: number } }

type K = 'date' | 'customer' | 'sellerName' | 'revenue' | 'vehicleMargin' | 'fi' | 'services' | 'commissions' | 'profit' | 'margin'

export function DealResultReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<Data>(url)
  useEffect(() => { onData(data) }, [data, onData])
  const { sort, toggle, apply } = useSort<K>('date')
  const rows = useMemo(() => apply(data?.rows ?? [], (r, k) => {
    switch (k) {
      case 'date': return +new Date(r.date)
      case 'revenue': return r.revenue.total
      case 'fi': return r.revenue.fi
      case 'services': return r.revenue.services - r.cost.services
      case 'commissions': return r.cost.commissions
      default: return r[k]
    }
  }), [data, apply])
  useEffect(() => {
    registerCsv(data ? {
      name: `resultado-negociacoes-${data.from}-a-${data.to}`,
      headers: ['Negociação', 'Data', 'Cliente', 'Veículo', 'Placa', 'Vendedor', 'Receita', 'Venda do veículo', 'Custo do veículo', 'Margem do veículo', 'F&I', 'Serviços cobrados', 'Custo dos serviços', 'Débitos da loja', 'Comissões', 'Resultado', 'Margem %'],
      rows: rows.map((r) => [r.dealNumber, fmtDate(r.date), r.customer, r.vehicle, r.plate, r.sellerName, r.revenue.total, r.revenue.vehicle, r.cost.vehicle, r.vehicleMargin, r.revenue.fi, r.revenue.services, r.cost.services, r.cost.storeDebts, r.cost.commissions, r.profit, r.margin]),
    } : null)
  }, [data, rows, registerCsv])
  const t = data?.totals
  const st = { sort, toggle }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Negociações" value={loading ? '—' : String(t?.count ?? 0)} />
        <Kpi label="Receita" value={loading ? '—' : fmt(t?.revenue ?? 0)} tone="blue" />
        <Kpi label="Resultado" value={loading ? '—' : fmt(t?.profit ?? 0)} tone={(t?.profit ?? 0) < 0 ? 'red' : 'green'} />
        <Kpi label="Margem" value={loading ? '—' : fmtPct(t?.margin)} />
        <Kpi label="Resultado médio" value={loading ? '—' : fmt(t?.avgProfit ?? 0)} />
      </div>
      <Panel title="Negociações" helpText="Receita da venda (veículo − desconto, serviços, documentação, garantia e F&I) menos custo real do carro, custos dos serviços, débitos assumidos pela loja e comissões.">
        <StateBox loading={loading} error={error} empty={!rows.length} />
        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <SortTh k="date" label="Negociação" {...st} />
                <SortTh k="customer" label="Cliente / veículo" {...st} />
                <SortTh k="sellerName" label="Vendedor" {...st} />
                <SortTh k="revenue" label="Receita" right {...st} />
                <SortTh k="vehicleMargin" label="Margem veículo" right {...st} />
                <SortTh k="fi" label="F&I" right {...st} />
                <SortTh k="services" label="Serviços" right {...st} />
                <SortTh k="commissions" label="Comissões" right {...st} />
                <SortTh k="profit" label="Resultado" right {...st} />
                <SortTh k="margin" label="%" right {...st} />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.dealId} className="hover:bg-gray-50">
                    <td className={td}><DealPeekLink dealId={r.dealId} className="font-mono font-medium text-brand-700 hover:underline">{r.dealNumber ?? r.dealId.slice(0, 8)}</DealPeekLink><span className="block text-xs text-gray-500">{fmtDate(r.date)}</span></td>
                    <td className={td}>{r.customer ?? '—'}<span className="block text-xs text-gray-500">{[r.vehicle, r.plate].filter(Boolean).join(' · ')}</span></td>
                    <td className={td}>{r.sellerName ?? '—'}</td>
                    <td className={tdR}>{fmt(r.revenue.total)}</td>
                    <td className={cn(tdR, r.vehicleMargin < 0 && 'text-red-600')}>{fmt(r.vehicleMargin)}</td>
                    <td className={tdR}>{r.revenue.fi ? fmt(r.revenue.fi) : '—'}</td>
                    <td className={tdR}>{r.revenue.services || r.cost.services ? fmt(r.revenue.services - r.cost.services) : '—'}</td>
                    <td className={cn(tdR, 'text-red-600')}>{r.cost.commissions ? fmt(-r.cost.commissions) : '—'}</td>
                    <td className={cn(tdR, 'font-semibold', r.profit < 0 ? 'text-red-600' : 'text-emerald-700')}>{fmt(r.profit)}</td>
                    <td className={tdR}>{fmtPct(r.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
