'use client'

// Relatórios: comparativo mensal, orçado × realizado e aging.

import { Fragment, useEffect } from 'react'
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { COLORS, Kpi, Panel, StateBox, fmt, fmtDate, fmtPct, fmtShort, monthLabel, td, tdR, th, thR, useFinanceData } from './shared'
import type { ReportViewProps } from './types'

const signed = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : ''}${fmtPct(n)}`)

// ── Comparativo mensal ──────────────────────────────────────────────────────
interface MonthRow {
  period: string; receitas: number; despesas: number; resultado: number; margem: number | null
  prior: { period: string; receitas: number; despesas: number; resultado: number } | null
  yoyReceitas: number | null; yoyResultado: number | null
}
interface MonthlyData { months: string[]; hasPrior: boolean; rows: MonthRow[]; totals: { receitas: number; despesas: number; resultado: number; margem: number | null } }

export function MonthlyComparisonReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<MonthlyData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    if (!data) { registerCsv(null); return }
    const headers = ['Mês', 'Receitas', 'Despesas', 'Resultado', 'Margem %', ...(data.hasPrior ? ['Receitas ano anterior', 'Resultado ano anterior', 'Var. receitas %', 'Var. resultado %'] : [])]
    registerCsv({
      name: `comparativo-mensal-${data.months[0]}-a-${data.months[data.months.length - 1]}`,
      headers,
      rows: data.rows.map((r) => [monthLabel(r.period), r.receitas, r.despesas, r.resultado, r.margem, ...(data.hasPrior ? [r.prior?.receitas, r.prior?.resultado, r.yoyReceitas, r.yoyResultado] : [])]),
    })
  }, [data, registerCsv])
  const t = data?.totals
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Receitas (12 meses)" value={loading ? '—' : fmt(t?.receitas ?? 0)} tone="green" />
        <Kpi label="Despesas (12 meses)" value={loading ? '—' : fmt(t?.despesas ?? 0)} tone="red" />
        <Kpi label="Resultado" value={loading ? '—' : fmt(t?.resultado ?? 0)} tone={(t?.resultado ?? 0) < 0 ? 'red' : 'blue'} />
        <Kpi label="Margem" value={loading ? '—' : fmtPct(t?.margem)} />
      </div>
      <Panel title="Receitas, despesas e resultado">
        <StateBox loading={loading} error={error} empty={!data?.rows.length} />
        {!loading && !error && !!data?.rows.length && (
          <div className="h-80 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.rows.map((r) => ({ ...r, label: monthLabel(r.period), resultadoAnterior: r.prior?.resultado ?? null }))} margin={{ left: 8, right: 8 }}>
                <CartesianGrid stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="receitas" name="Receitas" fill={COLORS.receita} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="despesas" name="Despesas" fill={COLORS.despesa} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Line dataKey="resultado" name="Resultado" stroke={COLORS.resultado} strokeWidth={2} dot={{ r: 3 }} />
                {data.hasPrior && <Line dataKey="resultadoAnterior" name="Resultado ano anterior" stroke={COLORS.neutro} strokeDasharray="4 4" strokeWidth={2} dot={false} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
      {!loading && !error && !!data?.rows.length && (
        <Panel>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className={th}>Mês</th><th className={thR}>Receitas</th><th className={thR}>Despesas</th><th className={thR}>Resultado</th><th className={thR}>Margem</th>
                {data.hasPrior && <><th className={thR}>Resultado ano anterior</th><th className={thR}>Var. receitas</th><th className={thR}>Var. resultado</th></>}
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r) => (
                  <tr key={r.period} className="hover:bg-gray-50">
                    <td className={cn(td, 'font-medium capitalize text-gray-900')}>{monthLabel(r.period)}</td>
                    <td className={cn(tdR, 'text-green-700')}>{fmt(r.receitas)}</td>
                    <td className={cn(tdR, 'text-red-600')}>{fmt(r.despesas)}</td>
                    <td className={cn(tdR, 'font-semibold', r.resultado < 0 ? 'text-red-600' : 'text-gray-900')}>{fmt(r.resultado)}</td>
                    <td className={cn(tdR, 'text-gray-500')}>{fmtPct(r.margem)}</td>
                    {data.hasPrior && <>
                      <td className={cn(tdR, 'text-gray-500')}>{fmt(r.prior?.resultado ?? 0)}</td>
                      <td className={cn(tdR, (r.yoyReceitas ?? 0) < 0 ? 'text-red-600' : 'text-green-700')}>{signed(r.yoyReceitas)}</td>
                      <td className={cn(tdR, (r.yoyResultado ?? 0) < 0 ? 'text-red-600' : 'text-green-700')}>{signed(r.yoyResultado)}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
              {t && <tfoot className="border-t-2 border-gray-200 font-semibold"><tr><td className={td}>Total</td><td className={tdR}>{fmt(t.receitas)}</td><td className={tdR}>{fmt(t.despesas)}</td><td className={tdR}>{fmt(t.resultado)}</td><td className={tdR}>{fmtPct(t.margem)}</td>{data.hasPrior && <td colSpan={3} />}</tr></tfoot>}
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}

// ── Orçado × realizado ──────────────────────────────────────────────────────
interface BudgetRow { categoryId: string; name: string; code: string | null; kind: 'RECEITA' | 'DESPESA'; budget: number; actual: number; deviation: number; deviationPct: number | null; topLevel: boolean }
interface BudgetSum { budget: number; actual: number; deviation: number; deviationPct: number | null }
interface BudgetData { from: string; to: string; rows: BudgetRow[]; totals: { receitas: BudgetSum; despesas: BudgetSum }; monthly: { period: string; budget: number; actual: number }[]; hasBudget: boolean }

/** Desvio desfavorável: despesa acima do orçado ou receita abaixo. */
const bad = (kind: 'RECEITA' | 'DESPESA', dev: number) => (kind === 'DESPESA' ? dev > 0 : dev < 0)

export function BudgetReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<BudgetData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    registerCsv(data ? {
      name: `orcado-realizado-${data.from}-a-${data.to}`,
      headers: ['Tipo', 'Código', 'Categoria', 'Orçado', 'Realizado', 'Desvio', 'Desvio %'],
      rows: data.rows.map((r) => [r.kind === 'RECEITA' ? 'Receita' : 'Despesa', r.code, r.name, r.budget, r.actual, r.deviation, r.deviationPct]),
    } : null)
  }, [data, registerCsv])
  const d = data?.totals.despesas, rcv = data?.totals.receitas
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Despesas orçadas" value={loading ? '—' : fmt(d?.budget ?? 0)} />
        <Kpi label="Despesas realizadas" value={loading ? '—' : fmt(d?.actual ?? 0)} hint={d?.deviationPct != null ? `${signed(d.deviationPct)} do orçado` : undefined} tone={d && d.deviation > 0 ? 'red' : 'green'} />
        <Kpi label="Receitas orçadas" value={loading ? '—' : fmt(rcv?.budget ?? 0)} />
        <Kpi label="Receitas realizadas" value={loading ? '—' : fmt(rcv?.actual ?? 0)} hint={rcv?.deviationPct != null ? `${signed(rcv.deviationPct)} do orçado` : undefined} tone={rcv && rcv.deviation < 0 ? 'red' : 'green'} />
      </div>
      {!loading && !error && data && data.monthly.length > 1 && data.hasBudget && (
        <Panel title="Despesas: orçado × realizado por mês">
          <div className="h-64 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly.map((m) => ({ ...m, label: monthLabel(m.period) }))} margin={{ left: 8, right: 8 }}>
                <CartesianGrid stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="budget" name="Orçado" fill={COLORS.neutro} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Bar dataKey="actual" name="Realizado" fill={COLORS.despesa} radius={[3, 3, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
      <Panel title="Por categoria">
        <StateBox loading={loading} error={error} empty={!data?.rows.length} emptyText="Nenhum orçamento cadastrado para o período." />
        {!loading && !error && !!data?.rows.length && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>Categoria</th><th className={thR}>Orçado</th><th className={thR}>Realizado</th><th className={thR}>Desvio</th><th className={thR}>Desvio %</th><th className={th}>Execução</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r, i) => {
                  const showHeader = i === 0 || data.rows[i - 1].kind !== r.kind
                  const exec = r.budget ? Math.min(150, (r.actual / r.budget) * 100) : 0
                  return (
                    <Fragment key={r.categoryId}>
                      {showHeader && <tr key={`h-${r.kind}`} className="bg-gray-50"><td colSpan={6} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{r.kind === 'RECEITA' ? 'Receitas' : 'Despesas'}</td></tr>}
                      <tr className="hover:bg-gray-50">
                        <td className={cn(td, r.topLevel ? 'font-medium text-gray-900' : 'pl-8 text-gray-600')}>{r.code ? `${r.code} ` : ''}{r.name}</td>
                        <td className={tdR}>{fmt(r.budget)}</td>
                        <td className={tdR}>{fmt(r.actual)}</td>
                        <td className={cn(tdR, bad(r.kind, r.deviation) ? 'text-red-600' : 'text-green-700')}>{fmt(r.deviation)}</td>
                        <td className={cn(tdR, bad(r.kind, r.deviation) ? 'text-red-600' : 'text-green-700')}>{signed(r.deviationPct)}</td>
                        <td className="px-3 py-2">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-100">
                            <div className={cn('h-full rounded-full', bad(r.kind, r.deviation) ? 'bg-red-500' : 'bg-green-500')} style={{ width: `${(exec / 150) * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

// ── Aging ───────────────────────────────────────────────────────────────────
type Bucket = 'A_VENCER' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90'
type Totals = Record<Bucket, { total: number; count: number }>
interface AgingData {
  buckets: { key: Bucket; label: string }[]
  pagar: Totals; receber: Totals
  totals: { pagar: { total: number; count: number; vencido: number }; receber: { total: number; count: number; vencido: number } }
  overdue: { id: string; type: 'RECEITA' | 'DESPESA'; amount: number; dueDate: string | null; daysOverdue: number; bucket: Bucket; description: string; counterparty: string | null }[]
}

export function AgingReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<AgingData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    registerCsv(data ? {
      name: `aging-${new Date().toISOString().slice(0, 10)}`,
      headers: ['Faixa', 'A pagar', 'Qtde a pagar', 'A receber', 'Qtde a receber'],
      rows: [
        ...data.buckets.map((b) => [b.label, data.pagar[b.key].total, data.pagar[b.key].count, data.receber[b.key].total, data.receber[b.key].count]),
        ['Total', data.totals.pagar.total, data.totals.pagar.count, data.totals.receber.total, data.totals.receber.count],
      ],
    } : null)
  }, [data, registerCsv])
  const chart = data?.buckets.map((b) => ({ label: b.label, pagar: data.pagar[b.key].total, receber: data.receber[b.key].total })) ?? []
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="A pagar em aberto" value={loading ? '—' : fmt(data?.totals.pagar.total ?? 0)} hint={data ? `${data.totals.pagar.count} lançamento(s)` : undefined} />
        <Kpi label="A pagar vencido" value={loading ? '—' : fmt(data?.totals.pagar.vencido ?? 0)} tone="red" />
        <Kpi label="A receber em aberto" value={loading ? '—' : fmt(data?.totals.receber.total ?? 0)} hint={data ? `${data.totals.receber.count} lançamento(s)` : undefined} />
        <Kpi label="A receber vencido" value={loading ? '—' : fmt(data?.totals.receber.vencido ?? 0)} tone="amber" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Por faixa de vencimento">
          <StateBox loading={loading} error={error} empty={!data} />
          {!loading && !error && data && (
            <div className="h-64 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="pagar" name="A pagar" fill={COLORS.despesa} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="receber" name="A receber" fill={COLORS.receita} radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Resumo">
          {!loading && !error && data && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50"><tr><th className={th}>Faixa</th><th className={thR}>A pagar</th><th className={thR}>Qtde</th><th className={thR}>A receber</th><th className={thR}>Qtde</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {data.buckets.map((b) => (
                    <tr key={b.key}>
                      <td className={cn(td, b.key === 'A_VENCER' ? 'text-gray-900' : 'text-red-700')}>{b.key === 'A_VENCER' ? b.label : `Vencido ${b.label.toLowerCase()}`}</td>
                      <td className={tdR}>{fmt(data.pagar[b.key].total)}</td><td className={cn(tdR, 'text-gray-500')}>{data.pagar[b.key].count}</td>
                      <td className={tdR}>{fmt(data.receber[b.key].total)}</td><td className={cn(tdR, 'text-gray-500')}>{data.receber[b.key].count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 font-semibold"><tr><td className={td}>Total</td><td className={tdR}>{fmt(data.totals.pagar.total)}</td><td className={tdR}>{data.totals.pagar.count}</td><td className={tdR}>{fmt(data.totals.receber.total)}</td><td className={tdR}>{data.totals.receber.count}</td></tr></tfoot>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Vencidos (mais antigos primeiro)">
        <StateBox loading={loading} error={error} empty={!data?.overdue.length} emptyText="Nenhum lançamento vencido." />
        {!loading && !error && !!data?.overdue.length && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>Descrição</th><th className={th}>Tipo</th><th className={thR}>Vencimento</th><th className={thR}>Atraso</th><th className={thR}>Valor</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.overdue.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className={td}><p className="font-medium text-gray-900">{o.description}</p>{o.counterparty && <p className="text-xs text-gray-500">{o.counterparty}</p>}</td>
                    <td className={td}><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', o.type === 'RECEITA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>{o.type === 'RECEITA' ? 'A receber' : 'A pagar'}</span></td>
                    <td className={cn(tdR, 'text-xs text-gray-500')}>{fmtDate(o.dueDate)}</td>
                    <td className={cn(tdR, 'text-red-600')}>{o.daysOverdue} d</td>
                    <td className={cn(tdR, 'font-medium')}>{fmt(o.amount)}</td>
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
