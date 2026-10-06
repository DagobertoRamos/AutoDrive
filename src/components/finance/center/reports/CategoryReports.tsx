'use client'

// Relatórios: despesas por categoria e fornecedores (resultado por área: CenterReports).

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { COLORS, Kpi, PALETTE, Panel, StateBox, fmt, fmtDate, fmtPct, fmtShort, monthLabel, td, tdR, th, thR, useFinanceData } from './shared'
import type { ReportViewProps } from './types'

// ── Despesas por categoria ──────────────────────────────────────────────────
interface TreeRow { id: string; name: string; code: string | null; depth: number; current: number; previous: number; share: number | null; variation: number | null; hasChildren: boolean }
interface ExpData { from: string; to: string; previous: { from: string; to: string }; total: number; previousTotal: number; variation: number | null; rows: TreeRow[]; chart: { name: string; value: number; previous: number }[] }

export function ExpensesByCategoryReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<ExpData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const visible = useMemo(() => {
    const out: TreeRow[] = []
    let hideBelow: number | null = null
    for (const r of data?.rows ?? []) {
      if (hideBelow != null && r.depth > hideBelow) continue
      hideBelow = null
      out.push(r)
      if (closed.has(r.id)) hideBelow = r.depth
    }
    return out
  }, [data, closed])

  useEffect(() => {
    registerCsv(data ? {
      name: `despesas-por-categoria-${data.from}-a-${data.to}`,
      headers: ['Código', 'Categoria', 'Nível', 'Atual', '% do total', 'Período anterior', 'Variação %'],
      rows: data.rows.map((r) => [r.code, `${'  '.repeat(r.depth)}${r.name}`, r.depth + 1, r.current, r.share, r.previous, r.variation]),
    } : null)
  }, [data, registerCsv])

  const pie = useMemo(() => {
    const c = [...(data?.chart ?? [])].filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
    if (c.length <= 8) return c
    const rest = c.slice(7)
    return [...c.slice(0, 7), { name: 'Outras', value: rest.reduce((s, x) => s + x.value, 0), previous: rest.reduce((s, x) => s + x.previous, 0) }]
  }, [data])

  const toggle = (id: string) => setClosed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Despesas no período" value={loading ? '—' : fmt(data?.total ?? 0)} tone="red" />
        <Kpi label="Período anterior" value={loading ? '—' : fmt(data?.previousTotal ?? 0)} hint={data ? `${monthLabel(data.previous.from)} a ${monthLabel(data.previous.to)}` : undefined} />
        <Kpi label="Variação" helpText="Quanto as despesas subiram (+) ou caíram (−) em relação ao período anterior de mesmo tamanho." value={loading ? '—' : fmtPct(data?.variation)} tone={(data?.variation ?? 0) > 0 ? 'red' : 'green'} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Participação por grupo">
          <StateBox loading={loading} error={error} empty={!pie.length} />
          {!loading && !error && !!pie.length && (
            <div className="h-72 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="80%" paddingAngle={1}>
                    {pie.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Atual × período anterior">
          <StateBox loading={loading} error={error} empty={!pie.length} />
          {!loading && !error && !!pie.length && (
            <div className="h-72 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pie} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="value" name="Atual" fill={COLORS.despesa} radius={[0, 3, 3, 0]} maxBarSize={14} />
                  <Bar dataKey="previous" name="Anterior" fill={COLORS.neutro} radius={[0, 3, 3, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Despesas por categoria">
        <StateBox loading={loading} error={error} empty={!data?.rows.length} />
        {!loading && !error && !!data?.rows.length && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>Categoria</th><th className={thR}>Atual</th><th className={thR}>% do total</th><th className={thR}>Anterior</th><th className={thR}>Variação</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((r) => (
                  <tr key={r.id} className={cn(r.depth === 0 && 'bg-gray-50 font-semibold text-gray-900')}>
                    <td className={td} style={{ paddingLeft: 12 + r.depth * 20 }}>
                      {r.hasChildren ? (
                        <button type="button" onClick={() => toggle(r.id)} className="inline-flex items-center gap-1 hover:text-brand-700">
                          {closed.has(r.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{r.code ? `${r.code} ` : ''}{r.name}
                        </button>
                      ) : <span className={cn(r.depth === 0 && 'pl-[18px]')}>{r.code ? `${r.code} ` : ''}{r.name}</span>}
                    </td>
                    <td className={tdR}>{fmt(r.current)}</td>
                    <td className={cn(tdR, 'text-gray-500')}>{fmtPct(r.share)}</td>
                    <td className={cn(tdR, 'text-gray-500')}>{fmt(r.previous)}</td>
                    <td className={cn(tdR, (r.variation ?? 0) > 0 ? 'text-red-600' : (r.variation ?? 0) < 0 ? 'text-green-700' : 'text-gray-400')}>{r.variation == null ? '—' : `${r.variation > 0 ? '+' : ''}${fmtPct(r.variation)}`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 font-semibold"><tr><td className={td}>Total</td><td className={tdR}>{fmt(data.total)}</td><td className={tdR}>100,0%</td><td className={tdR}>{fmt(data.previousTotal)}</td><td className={tdR}>{fmtPct(data.variation)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

// ── Fornecedores ────────────────────────────────────────────────────────────
interface SupRow { key: string; name: string; supplierId: string | null; total: number; count: number; share: number | null; lastDate: string | null; mainGroup: string | null }
interface SupData { from: string; to: string; total: number; suppliersCount: number; rows: SupRow[]; chart: { name: string; value: number }[] }

export function SuppliersReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<SupData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    registerCsv(data ? {
      name: `fornecedores-${data.from}-a-${data.to}`,
      headers: ['Posição', 'Fornecedor', 'Total', '% do total', 'Lançamentos', 'Principal grupo', 'Último lançamento'],
      rows: data.rows.map((r, i) => [i + 1, r.name, r.total, r.share, r.count, r.mainGroup, fmtDate(r.lastDate)]),
    } : null)
  }, [data, registerCsv])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Gasto total" value={loading ? '—' : fmt(data?.total ?? 0)} tone="red" />
        <Kpi label="Fornecedores" value={loading ? '—' : String(data?.suppliersCount ?? 0)} />
        <Kpi label="Concentração top 5" helpText="Quanto dos gastos do período foi para os 5 maiores fornecedores. Alto = dependência de poucos fornecedores." value={loading ? '—' : fmtPct((data?.rows ?? []).slice(0, 5).reduce((s, r) => s + (r.share ?? 0), 0))} />
      </div>
      <Panel title="Maiores gastos">
        <StateBox loading={loading} error={error} empty={!data?.chart.length} />
        {!loading && !error && !!data?.chart.length && (
          <div className="h-80 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chart} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Bar dataKey="value" name="Total" fill={COLORS.despesa} radius={[0, 3, 3, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
      {!loading && !error && !!data?.rows.length && (
        <Panel title="Ranking">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>#</th><th className={th}>Fornecedor</th><th className={th}>Principal grupo</th><th className={thR}>Lançamentos</th><th className={thR}>Último</th><th className={thR}>Total</th><th className={thR}>%</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((r, i) => (
                  <tr key={r.key} className="hover:bg-gray-50">
                    <td className={cn(td, 'text-gray-400')}>{i + 1}</td>
                    <td className={cn(td, 'font-medium text-gray-900')}>{r.name}</td>
                    <td className={cn(td, 'text-xs text-gray-500')}>{r.mainGroup ?? '—'}</td>
                    <td className={cn(tdR, 'text-gray-500')}>{r.count}</td>
                    <td className={cn(tdR, 'text-xs text-gray-500')}>{fmtDate(r.lastDate)}</td>
                    <td className={cn(tdR, 'font-medium')}>{fmt(r.total)}</td>
                    <td className={cn(tdR, 'text-gray-500')}>{fmtPct(r.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
