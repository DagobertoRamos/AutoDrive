'use client'

// =============================================================================
// Centro Financeiro — Fluxo de caixa (realizado × previsto), por dia ou mês.
// Consome /api/finance/center/cashflow.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, ErrorBox, KpiCard, brl, dateBR, inputClass } from '@/components/finance/center/dashboard/shared'
import { CashflowChart, type CashflowBucket } from '@/components/finance/center/dashboard/CashflowChart'
import PrintHeader from '@/components/finance/center/print/PrintHeader'
import PrintFooter, { PrintFrame } from '@/components/finance/center/print/PrintFooter'

type Granularity = 'day' | 'month'
interface Cashflow {
  from: string; to: string; today: string; granularity: Granularity; accountId: string; costCenterId: string | null; includeOverdue: boolean
  anchored: boolean; startBalance: number; currentBalance: number | null
  overdue: { count: number; in: number; out: number }
  totals: { entradas: number; saidas: number; saldo: number; realizedIn: number; realizedOut: number; projectedIn: number; projectedOut: number; finalBalance: number }
  buckets: CashflowBucket[]
  filters: { accounts: { id: string; name: string }[]; costCenters: { id: string; name: string }[] }
}

function spToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const monthLast = (ym: string) => addDays(`${shiftMonth(ym, 1)}-01`, -1)
function defaultRange(g: Granularity) {
  const today = spToday()
  const cur = today.slice(0, 7)
  return g === 'day' ? { from: `${cur}-01`, to: addDays(today, 30) } : { from: `${shiftMonth(cur, -5)}-01`, to: monthLast(shiftMonth(cur, 6)) }
}

const KIND = {
  realized: { label: 'Realizado', cls: 'bg-gray-100 text-gray-700' },
  mixed: { label: 'Atual', cls: 'bg-brand-50 text-brand-800' },
  projected: { label: 'Previsto', cls: 'bg-indigo-50 text-indigo-700' },
} as const

export default function CashflowPage() {
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [range, setRange] = useState(() => defaultRange('day'))
  const [accountId, setAccountId] = useState('all')
  const [costCenterId, setCostCenterId] = useState('')
  const [includeOverdue, setIncludeOverdue] = useState(true)
  const [data, setData] = useState<Cashflow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ granularity, from: range.from, to: range.to, accountId, includeOverdue: includeOverdue ? '1' : '0' })
      if (costCenterId) qs.set('costCenterId', costCenterId)
      const res = await fetch(`/api/finance/center/cashflow?${qs}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Não foi possível carregar o fluxo de caixa.'); return }
      setData(json.data)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [granularity, range, accountId, costCenterId, includeOverdue])
  useEffect(() => { void load() }, [load])

  const changeGranularity = (g: Granularity) => {
    if (g === granularity) return
    setGranularity(g)
    setRange(defaultRange(g))
  }

  const d = data
  const visible = d?.buckets.filter((b) => granularity === 'month' || b.entradas || b.saidas || b.kind === 'mixed') ?? []

  const accountName = accountId === 'all' ? 'Todas as contas' : d?.filters.accounts.find((a) => a.id === accountId)?.name ?? 'Conta'
  const centerName = costCenterId ? d?.filters.costCenters.find((c) => c.id === costCenterId)?.name ?? null : null

  return (
    <PrintFrame className="space-y-5 print:space-y-3">
      <PrintHeader
        title={`Fluxo de caixa — ${granularity === 'day' ? 'diário' : 'mensal'}`}
        subtitle={<>Período: {dateBR(range.from)} a {dateBR(range.to)}<br />{[accountName, centerName].filter(Boolean).join(' · ')}{includeOverdue ? ' · com vencidos' : ''}</>}
      />
      <PrintFooter label={`Fluxo de caixa ${granularity === 'day' ? 'diário' : 'mensal'} · ${dateBR(range.from)} a ${dateBR(range.to)}`} />
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Link href="/financeiro" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Voltar ao painel"><ArrowLeft size={18} /></Link>
          <h1 className="text-xl font-bold text-gray-900">Fluxo de caixa</h1>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['day', 'month'] as const).map((g) => (
            <button key={g} onClick={() => changeGranularity(g)}
              className={cn('rounded-md px-4 py-1.5 text-sm font-medium', granularity === g ? 'bg-brand-800 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              {g === 'day' ? 'Diário' : 'Mensal'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">De
          <input type="date" className={cn(inputClass, 'min-w-[10rem]')} value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Até
          <input type="date" className={cn(inputClass, 'min-w-[10rem]')} value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
        </label>
        <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-gray-600">Conta
          <select className={cn(inputClass, 'w-full min-w-[11rem] max-w-full truncate sm:w-auto sm:max-w-[18rem]')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">Todas as contas</option>
            {(d?.filters.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-gray-600">Centro de custo
          <select className={cn(inputClass, 'w-full min-w-[11rem] max-w-full truncate sm:w-auto sm:max-w-[18rem]')} value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
            <option value="">Todos</option>
            {(d?.filters.costCenters ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          <input type="checkbox" className="rounded border-gray-300 text-brand-700 focus:ring-brand-500" checked={includeOverdue} onChange={(e) => setIncludeOverdue(e.target.checked)} />
          Incluir vencidos{d && d.overdue.count > 0 ? ` (${d.overdue.count})` : ''}
        </label>
        <button onClick={() => void load()} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Atualizar"><RefreshCw size={15} className={cn(loading && 'animate-spin')} /></button>
        <button onClick={() => window.print()} disabled={!d} className="btn-secondary ml-auto text-sm" title="Imprimir ou salvar em PDF"><Printer size={15} />Imprimir / PDF</button>
      </div>

      {error && <ErrorBox message={error} onRetry={() => void load()} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4 print:gap-2">
        <KpiCard label={d?.anchored === false ? 'Saldo inicial (filtro)' : 'Saldo inicial'} loading={loading && !d} value={brl(d?.startBalance)} />
        <KpiCard label="Entradas" loading={loading && !d} value={brl(d?.totals.entradas)} tone="in"
          sub={d && <>Realizadas {brl(d.totals.realizedIn)}<br />Previstas {brl(d.totals.projectedIn)}</>} />
        <KpiCard label="Saídas" loading={loading && !d} value={brl(d?.totals.saidas)} tone="out"
          sub={d && <>Realizadas {brl(d.totals.realizedOut)}<br />Previstas {brl(d.totals.projectedOut)}</>} />
        <KpiCard label={d?.anchored === false ? 'Acumulado no fim' : 'Saldo no fim'} loading={loading && !d} value={brl(d?.totals.finalBalance)}
          tone={(d?.totals.finalBalance ?? 0) < 0 ? 'alert' : 'default'}
          sub={d?.currentBalance != null ? `Saldo hoje ${brl(d.currentBalance)}` : undefined} />
      </div>

      <Card className="print:break-inside-avoid">
        {d ? <CashflowChart data={d.buckets} /> : <div className="h-72 animate-pulse rounded-lg bg-gray-100" />}
      </Card>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        <div className="overflow-x-auto print:overflow-visible">
          <table className="min-w-full divide-y divide-gray-200 text-sm print:text-[9px] print:[&_td]:py-0.5 print:[&_th]:py-1">
            <thead className="bg-gray-50">
              <tr>
                {['Período', '', 'Entradas', 'Saídas', 'Saldo do período', 'Saldo acumulado'].map((h, i) => (
                  <th key={i} className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', i >= 2 ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && !d ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-gray-400">Sem movimentação no período.</td></tr>
              ) : visible.map((b) => (
                <tr key={b.key} className={cn(b.kind === 'mixed' && 'bg-brand-50/40')}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-gray-900">{granularity === 'day' ? dateBR(b.key) : b.label}</td>
                  <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', KIND[b.kind].cls)}>{KIND[b.kind].label}</span></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-teal-700">{b.entradas ? brl(b.entradas) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-orange-700">{b.saidas ? brl(b.saidas) : '—'}</td>
                  <td className={cn('whitespace-nowrap px-4 py-2.5 text-right tabular-nums', b.saldo < 0 ? 'text-red-600' : 'text-gray-900')}>{brl(b.saldo)}</td>
                  <td className={cn('whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums', b.acumulado < 0 ? 'text-red-600' : 'text-gray-900')}>{brl(b.acumulado)}</td>
                </tr>
              ))}
            </tbody>
            {d && visible.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3 text-gray-900" colSpan={2}>Total</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-teal-700">{brl(d.totals.entradas)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-orange-700">{brl(d.totals.saidas)}</td>
                  <td className={cn('whitespace-nowrap px-4 py-3 text-right tabular-nums', d.totals.saldo < 0 ? 'text-red-600' : 'text-gray-900')}>{brl(d.totals.saldo)}</td>
                  <td className={cn('whitespace-nowrap px-4 py-3 text-right tabular-nums', d.totals.finalBalance < 0 ? 'text-red-600' : 'text-gray-900')}>{brl(d.totals.finalBalance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </PrintFrame>
  )
}
