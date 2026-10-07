'use client'

// Relatório: conta-corrente entre unidades (uma pagou/recebeu em nome da outra).

import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Kpi, Panel, StateBox, fmt, fmtDate, td, tdR, th, thR, useFinanceData } from './shared'
import type { ReportViewProps } from './types'

interface Data {
  balances: { debtor: string; creditor: string; amount: number; paidFor: number; receivedFor: number }[]
  entries: { id: string; date: string; type: string; amount: number; description: string; payer: string; owner: string; account: string }[]
  totals: { count: number; open: number }
}

export function BetweenUnitsReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<Data>(url)
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    registerCsv(data ? {
      name: 'entre-unidades',
      headers: ['Data', 'Tipo', 'Descrição', 'Conta', 'Unidade que pagou/recebeu', 'Unidade dona', 'Valor'],
      rows: data.entries.map((e) => [fmtDate(e.date), e.type === 'DESPESA' ? 'Pagamento' : 'Recebimento', e.description, e.account, e.payer, e.owner, e.amount]),
    } : null)
  }, [data, registerCsv])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Saldo entre unidades" value={loading ? '—' : fmt(data?.totals.open ?? 0)} tone={data?.totals.open ? 'amber' : 'default'} />
        <Kpi label="Movimentos cruzados" value={loading ? '—' : String(data?.totals.count ?? 0)} />
      </div>
      <Panel title="Quem deve a quem" helpText="Despesa de uma unidade paga pela conta de outra, ou receita recebida na conta de outra. Acerte com uma transferência entre as contas das unidades.">
        <StateBox loading={loading} error={error} empty={!data?.balances.length} emptyText="Nenhum valor entre unidades no período." />
        {!loading && !error && !!data?.balances.length && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className={th}>Deve</th><th className={th}>Para</th><th className={thR}>Pagou por</th><th className={thR}>Recebeu por</th><th className={thR}>Saldo</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {data.balances.map((b) => (
                <tr key={`${b.debtor}|${b.creditor}`}><td className={td}>{b.debtor}</td><td className={td}>{b.creditor}</td><td className={tdR}>{fmt(b.paidFor)}</td><td className={tdR}>{fmt(b.receivedFor)}</td><td className={cn(tdR, 'font-semibold text-amber-700')}>{fmt(b.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {!!data?.entries.length && (
        <Panel title="Movimentos">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>Data</th><th className={th}>Descrição</th><th className={th}>Conta de</th><th className={th}>Unidade dona</th><th className={thR}>Valor</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.entries.map((e) => (
                  <tr key={e.id}><td className={td}>{fmtDate(e.date)}</td><td className={td}>{e.description}</td><td className={td}>{e.payer}</td><td className={td}>{e.owner}</td><td className={cn(tdR, e.type === 'DESPESA' ? 'text-orange-700' : 'text-teal-700')}>{fmt(e.type === 'DESPESA' ? -e.amount : e.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
