'use client'

// Relatório: contratos em trânsito — financiamentos vendidos que o banco ainda não pagou.

import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { DealPeekLink } from '@/components/deals/DealPeek'
import { Kpi, Panel, StateBox, fmt, fmtDate, td, tdR, th, thR, useFinanceData } from './shared'
import type { ReportViewProps } from './types'

interface Row {
  paymentId: string; dealId: string; dealNumber: string | null; bank: string; contract: string | null; customer: string | null
  vehicle: string | null; plate: string | null; seller: string | null; amount: number; saleDate: string; expectedDate: string | null; days: number; late: boolean
}
interface Data {
  alertDays: number; rows: Row[]; byBank: { bank: string; count: number; amount: number; late: number }[]
  totals: { count: number; amount: number; late: number; lateAmount: number; avgDays: number }
}

export function TransitReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<Data>(url)
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    registerCsv(data ? {
      name: 'contratos-em-transito',
      headers: ['Banco', 'Negociação', 'Cliente', 'Veículo', 'Placa', 'Contrato', 'Valor', 'Data da venda', 'Dias aguardando', 'Vendedor'],
      rows: data.rows.map((r) => [r.bank, r.dealNumber, r.customer, r.vehicle, r.plate, r.contract, r.amount, fmtDate(r.saleDate), r.days, r.seller]),
    } : null)
  }, [data, registerCsv])
  const t = data?.totals
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="A receber dos bancos" value={loading ? '—' : fmt(t?.amount ?? 0)} tone="blue" />
        <Kpi label="Contratos" value={loading ? '—' : String(t?.count ?? 0)} />
        <Kpi label={`Acima de ${data?.alertDays ?? 7} dias`} value={loading ? '—' : fmt(t?.lateAmount ?? 0)} tone={t?.late ? 'red' : 'default'} hint={t?.late ? `${t.late} contrato(s)` : undefined} />
        <Kpi label="Espera média" value={loading ? '—' : `${t?.avgDays ?? 0} dias`} />
      </div>

      {!!data?.byBank.length && (
        <Panel title="Por banco">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className={th}>Banco</th><th className={thR}>Contratos</th><th className={thR}>Atrasados</th><th className={thR}>Valor</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {data.byBank.map((b) => (
                <tr key={b.bank}><td className={td}>{b.bank}</td><td className={tdR}>{b.count}</td><td className={cn(tdR, b.late && 'font-semibold text-red-600')}>{b.late || '—'}</td><td className={tdR}>{fmt(b.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Contratos">
        <StateBox loading={loading} error={error} empty={!data?.rows.length} emptyText="Nenhum financiamento aguardando pagamento." />
        {!loading && !error && !!data?.rows.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className={th}>Banco</th><th className={th}>Negociação</th><th className={th}>Cliente / veículo</th><th className={th}>Vendedor</th><th className={thR}>Valor</th><th className={thR}>Venda</th><th className={thR}>Dias</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r) => (
                  <tr key={r.paymentId} className={cn('hover:bg-gray-50', r.late && 'bg-red-50/40')}>
                    <td className={td}>{r.bank}{r.contract && <span className="block font-mono text-xs text-gray-500">{r.contract}</span>}</td>
                    <td className={td}><DealPeekLink dealId={r.dealId} className="font-mono font-medium text-brand-700 hover:underline">{r.dealNumber ?? r.dealId.slice(0, 8)}</DealPeekLink></td>
                    <td className={td}>{r.customer ?? '—'}<span className="block text-xs text-gray-500">{[r.vehicle, r.plate].filter(Boolean).join(' · ')}</span></td>
                    <td className={td}>{r.seller ?? '—'}</td>
                    <td className={tdR}>{fmt(r.amount)}</td>
                    <td className={tdR}>{fmtDate(r.saleDate)}</td>
                    <td className={cn(tdR, 'font-semibold', r.late ? 'text-red-600' : 'text-gray-700')}>{r.days}</td>
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
