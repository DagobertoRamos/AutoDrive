'use client'

// Relatório: diário contábil (partidas dobradas, regime de caixa) e balancete.

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Kpi, Panel, StateBox, fmt, fmtDate, td, tdR, th, thR, useFinanceData } from './shared'
import type { ReportViewProps } from './types'

interface Data {
  from: string; to: string; count: number
  lines: { date: string | null; debit: string; credit: string; amount: number; history: string; document: string | null }[]
  trial: { account: string; debit: number; credit: number; balance: number }[]
  totals: { debit: number; credit: number; balanced: boolean }
}

export function JournalReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<Data>(url)
  const [tab, setTab] = useState<'balancete' | 'diario'>('balancete')
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    registerCsv(data ? (tab === 'diario'
      ? { name: `diario-${data.from}-a-${data.to}`, headers: ['Data', 'Débito', 'Crédito', 'Valor', 'Histórico', 'Documento'], rows: data.lines.map((l) => [fmtDate(l.date), l.debit, l.credit, l.amount, l.history, l.document]) }
      : { name: `balancete-${data.from}-a-${data.to}`, headers: ['Conta', 'Débitos', 'Créditos', 'Saldo'], rows: data.trial.map((t) => [t.account, t.debit, t.credit, t.balance]) }) : null)
  }, [data, tab, registerCsv])
  const t = data?.totals
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Lançamentos" value={loading ? '—' : String(data?.count ?? 0)} />
        <Kpi label="Débitos" value={loading ? '—' : fmt(t?.debit ?? 0)} />
        <Kpi label="Créditos" value={loading ? '—' : fmt(t?.credit ?? 0)} />
        <Kpi label="Partidas" value={loading ? '—' : t?.balanced ? 'Fechadas' : 'Diferença'} tone={t && !t.balanced ? 'red' : 'green'} />
      </div>
      <div className="flex gap-2 print:hidden">
        {(['balancete', 'diario'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', tab === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')}>{k === 'balancete' ? 'Balancete' : 'Diário'}</button>
        ))}
      </div>
      <Panel title={tab === 'balancete' ? 'Balancete' : 'Diário'} helpText="Partidas dobradas dos movimentos pagos e recebidos no período (regime de caixa): recebimento debita a conta e credita a receita; pagamento debita a despesa e credita a conta; transferência passa de uma conta para a outra.">
        <StateBox loading={loading} error={error} empty={!data?.count} />
        {!loading && !error && !!data?.count && (tab === 'balancete' ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className={th}>Conta</th><th className={thR}>Débitos</th><th className={thR}>Créditos</th><th className={thR}>Saldo</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {data.trial.map((x) => <tr key={x.account}><td className={td}>{x.account}</td><td className={tdR}>{fmt(x.debit)}</td><td className={tdR}>{fmt(x.credit)}</td><td className={cn(tdR, 'font-semibold', x.balance < 0 && 'text-red-600')}>{fmt(x.balance)}</td></tr>)}
            </tbody>
          </table>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>Data</th><th className={th}>Débito</th><th className={th}>Crédito</th><th className={th}>Histórico</th><th className={thR}>Valor</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.lines.map((l, i) => <tr key={i}><td className={cn(td, 'whitespace-nowrap')}>{fmtDate(l.date)}</td><td className={td}>{l.debit}</td><td className={td}>{l.credit}</td><td className={cn(td, 'text-xs')}>{l.history}{l.document ? ` · ${l.document}` : ''}</td><td className={tdR}>{fmt(l.amount)}</td></tr>)}
              </tbody>
            </table>
          </div>
        ))}
      </Panel>
    </div>
  )
}
