'use client'

// Relatório: negociações canceladas × valores recebidos, estornados e retidos.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Kpi, Panel, StateBox, fmt, fmtDate, td, tdR, th, thR, useFinanceData } from './shared'
import type { ReportViewProps } from './types'

interface Row {
  dealId: string; dealNumber: string | null; type: string; cancelledAt: string | null; reason: string | null; cancelledBy: string | null
  customer: string | null; seller: string | null; vehicle: string | null
  received: number; refunded: number; retained: number; ownerPaid: number; ownerReturned: number; lastRefundAt: string | null
}
interface Data { rows: Row[]; totals: { count: number; received: number; refunded: number; retained: number; ownerPending: number; withRetained: number } }

type Filter = 'todos' | 'retido' | 'estornado'

export function CancellationReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<Data>(url)
  const [filter, setFilter] = useState<Filter>('todos')
  useEffect(() => { onData(data) }, [data, onData])
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => filter === 'todos' || (filter === 'retido' ? r.retained > 0.009 : r.refunded > 0.009)), [data, filter])
  useEffect(() => {
    if (!data) { registerCsv(null); return }
    registerCsv({
      name: 'cancelamentos-e-estornos',
      headers: ['Negociação', 'Tipo', 'Cancelada em', 'Cliente', 'Veículo', 'Vendedor', 'Motivo', 'Cancelada por', 'Recebido', 'Estornado', 'Retido', 'Pago ao proprietário', 'Devolvido pelo proprietário', 'Último estorno'],
      rows: rows.map((r) => [r.dealNumber, r.type, fmtDate(r.cancelledAt), r.customer, r.vehicle, r.seller, r.reason, r.cancelledBy, r.received, r.refunded, r.retained, r.ownerPaid, r.ownerReturned, fmtDate(r.lastRefundAt)]),
    })
  }, [data, rows, registerCsv])
  const t = data?.totals
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cancelamentos" value={loading ? '—' : String(t?.count ?? 0)} />
        <Kpi label="Recebido" value={loading ? '—' : fmt(t?.received ?? 0)} tone="green" />
        <Kpi label="Estornado" value={loading ? '—' : fmt(t?.refunded ?? 0)} tone="red" />
        <Kpi label="Retido" value={loading ? '—' : fmt(t?.retained ?? 0)} tone="amber" />
      </div>
      <Panel title="Negociações canceladas" actions={
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 print:hidden">
          {(['todos', 'retido', 'estornado'] as Filter[]).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', filter === f ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
              {f === 'todos' ? 'Todas' : f === 'retido' ? 'Com valor retido' : 'Estornadas'}
            </button>
          ))}
        </div>
      }>
        <StateBox loading={loading} error={error} empty={!rows.length} emptyText="Nenhum cancelamento no período." />
        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className={th}>Negociação</th><th className={th}>Cancelada</th><th className={th}>Cliente / veículo</th><th className={th}>Motivo</th>
                <th className={thR}>Recebido</th><th className={thR}>Estornado</th><th className={thR}>Retido</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.dealId} className="hover:bg-gray-50">
                    <td className={td}>
                      <Link href={`/negociacoes/${r.dealId}`} className="font-mono font-medium text-brand-700 hover:underline">{r.dealNumber ?? r.dealId.slice(0, 8)}</Link>
                      <span className="block text-xs text-gray-500">{r.type}{r.seller ? ` · ${r.seller}` : ''}</span>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap')}>{fmtDate(r.cancelledAt)}<span className="block text-xs text-gray-500">{r.cancelledBy ?? ''}</span></td>
                    <td className={td}>{r.customer ?? '—'}<span className="block text-xs text-gray-500">{r.vehicle ?? ''}</span></td>
                    <td className={cn(td, 'max-w-[18rem] text-xs')}>{r.reason ?? '—'}</td>
                    <td className={tdR}>{r.received ? fmt(r.received) : '—'}</td>
                    <td className={cn(tdR, r.refunded ? 'text-red-600' : 'text-gray-400')}>{r.refunded ? fmt(r.refunded) : '—'}{r.lastRefundAt && <span className="block text-[11px] text-gray-500">{fmtDate(r.lastRefundAt)}</span>}</td>
                    <td className={cn(tdR, r.retained ? 'font-semibold text-amber-700' : 'text-gray-400')}>{r.retained ? fmt(r.retained) : '—'}</td>
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
