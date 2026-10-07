'use client'

// Relatório: parceiros e consignados — conta-corrente de quem é dono do carro.

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Kpi, Panel, StateBox, fmt, fmtDate, td, tdR, th, thR, useFinanceData } from './shared'
import type { ReportViewProps } from './types'

interface Veh { vehicleId: string; plate: string | null; description: string; value: number; situation: 'ESTOQUE' | 'A_REPASSAR' | 'REPASSADO'; paidDate: string | null; soldAt: string | null }
interface Row { key: string; name: string; kind: 'LOJA_PARCEIRA' | 'PARTICULAR'; inStock: { count: number; value: number }; toPay: { count: number; value: number }; paid: { count: number; value: number }; vehicles: Veh[] }
interface Data { rows: Row[]; totals: { partners: number; inStock: number; toPay: number; paid: number } }

const SIT: Record<Veh['situation'], [string, string]> = {
  ESTOQUE: ['Em estoque', 'bg-gray-100 text-gray-600'], A_REPASSAR: ['A repassar', 'bg-amber-100 text-amber-800'], REPASSADO: ['Repassado', 'bg-green-100 text-green-700'],
}

export function PartnersReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<Data>(url)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    registerCsv(data ? {
      name: 'parceiros-e-consignados',
      headers: ['Parceiro', 'Tipo', 'Veículo', 'Placa', 'Situação', 'Valor', 'Repasse pago em'],
      rows: data.rows.flatMap((r) => r.vehicles.map((v) => [r.name, r.kind === 'LOJA_PARCEIRA' ? 'Loja parceira' : 'Particular', v.description, v.plate, SIT[v.situation][0], v.value, fmtDate(v.paidDate)])),
    } : null)
  }, [data, registerCsv])
  const t = data?.totals
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="A repassar" value={loading ? '—' : fmt(t?.toPay ?? 0)} tone={t?.toPay ? 'amber' : 'default'} />
        <Kpi label="Em estoque de terceiros" value={loading ? '—' : fmt(t?.inStock ?? 0)} tone="blue" />
        <Kpi label="Repassado" value={loading ? '—' : fmt(t?.paid ?? 0)} tone="green" />
        <Kpi label="Parceiros" value={loading ? '—' : String(t?.partners ?? 0)} />
      </div>
      <Panel title="Conta-corrente">
        <StateBox loading={loading} error={error} empty={!data?.rows.length} emptyText="Nenhum carro de parceiro ou consignado." />
        {!loading && !error && !!data?.rows.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className={th}>Parceiro</th><th className={thR}>Em estoque</th><th className={thR}>A repassar</th><th className={thR}>Repassado</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r) => (
                  <Fragment key={r.key}>
                    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setOpen(open === r.key ? null : r.key)}>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1 font-medium text-gray-900">{open === r.key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{r.name}</span>
                        <span className="ml-5 block text-xs text-gray-500">{r.kind === 'LOJA_PARCEIRA' ? 'Loja parceira' : 'Particular'}</span>
                      </td>
                      <td className={tdR}>{r.inStock.count ? <>{fmt(r.inStock.value)}<span className="block text-xs text-gray-500">{r.inStock.count} carro(s)</span></> : '—'}</td>
                      <td className={cn(tdR, r.toPay.value && 'font-semibold text-amber-700')}>{r.toPay.count ? <>{fmt(r.toPay.value)}<span className="block text-xs font-normal text-gray-500">{r.toPay.count} carro(s)</span></> : '—'}</td>
                      <td className={tdR}>{r.paid.value ? fmt(r.paid.value) : '—'}</td>
                    </tr>
                    {open === r.key && r.vehicles.map((v) => (
                      <tr key={v.vehicleId} className="bg-gray-50/60 text-xs">
                        <td className={cn(td, 'pl-10')}><Link href={`/estoque/${v.vehicleId}`} className="text-brand-700 hover:underline">{v.description}</Link>{v.plate && <span className="ml-1 font-mono text-gray-500">{v.plate}</span>}</td>
                        <td className={td} colSpan={2}><span className={cn('rounded-full px-2 py-0.5 font-semibold', SIT[v.situation][1])}>{SIT[v.situation][0]}</span>{v.paidDate && <span className="ml-2 text-gray-500">pago em {fmtDate(v.paidDate)}</span>}</td>
                        <td className={tdR}>{fmt(v.value)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
