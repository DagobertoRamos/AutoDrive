'use client'

// DRE gerencial — meses em colunas, total, análise vertical, grupos expansíveis
// por categoria, gráfico receita líquida × resultado líquido e margem.

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import {
  COLORS, Kpi, MonthInput, Panel, RegimeToggle, SelectInput, StateBox, Toolbar, currentMonth, downloadCsv, fmt, fmtPct,
  fmtShort, monthLabel, monthsBack, qs, useFinanceData, type Option,
} from './shared'

interface Line { key: string; label: string; values: Record<string, number>; total: number; kind: 'group' | 'subtotal' | 'result'; av: Record<string, number | null>; avTotal: number | null }
interface Drill { categoryId: string | null; label: string; values: Record<string, number>; total: number }
interface DreData {
  regime: 'competencia' | 'caixa'
  from: string
  to: string
  periods: string[]
  lines: Line[]
  drill: Record<string, Drill[]>
  chart: { period: string; receitaLiquida: number; resultadoLiquido: number; margem: number | null }[]
  estoqueEmFormacao: { total: number; vehicles: number; byGroup: Record<string, number> }
  filters: { costCenters: Option[]; units: Option[] }
}

export default function DreReport() {
  const [from, setFrom] = useState(monthsBack(6))
  const [to, setTo] = useState(currentMonth())
  const [regime, setRegime] = useState<'competencia' | 'caixa'>('competencia')
  const [costCenterId, setCostCenterId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [avByMonth, setAvByMonth] = useState(false)
  const [hideZero, setHideZero] = useState(true)

  const url = `/api/finance/center/dre?${qs({ from, to, regime, costCenterId, unitId })}`
  const { data, loading, error, reload } = useFinanceData<DreData>(url)

  const lines = useMemo(() => (data?.lines ?? []).filter((l) => !hideZero || l.kind !== 'group' || l.total !== 0 || Object.values(l.values).some((v) => v !== 0)), [data, hideZero])
  const get = (k: string) => data?.lines.find((l) => l.key === k)
  const rl = get('RECEITA_LIQUIDA'), mb = get('MARGEM_BRUTA'), res = get('RESULTADO_LIQUIDO')

  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const expandAll = () => setOpen(new Set(Object.keys(data?.drill ?? {})))

  const exportCsv = () => {
    if (!data) return
    const headers = ['Linha', ...data.periods.map(monthLabel), 'Total', 'AV %']
    const rows: (string | number | null)[][] = []
    for (const l of data.lines) {
      rows.push([l.label, ...data.periods.map((p) => l.values[p] ?? 0), l.total, l.avTotal])
      if (l.kind === 'group') for (const d of data.drill[l.key] ?? []) rows.push([`    ${d.label}`, ...data.periods.map((p) => d.values[p] ?? 0), d.total, null])
    }
    if (data.regime === 'competencia') rows.push(['Custo em estoque (veículos não vendidos)', ...data.periods.map(() => null), data.estoqueEmFormacao.total, null])
    downloadCsv(`dre-${data.regime}-${data.from}-a-${data.to}`, headers, rows)
  }

  const periods = data?.periods ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">DRE gerencial</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {data ? `${monthLabel(data.from)} a ${monthLabel(data.to)} · regime de ${data.regime === 'caixa' ? 'caixa' : 'competência'}` : 'Demonstração do resultado'}
        </p>
      </div>

      <Toolbar onCsv={data ? exportCsv : undefined} onReload={reload} loading={loading}>
        <MonthInput label="De" value={from} onChange={setFrom} />
        <MonthInput label="Até" value={to} onChange={setTo} />
        <RegimeToggle value={regime} onChange={setRegime} />
        <SelectInput label="Centro de custo" value={costCenterId} onChange={setCostCenterId} all="Todos"
          options={[...(data?.filters.costCenters ?? []), { id: 'none', name: 'Sem centro de custo' }]} />
        {(data?.filters.units.length ?? 0) > 1 && <SelectInput label="Unidade" value={unitId} onChange={setUnitId} all="Todas" options={data?.filters.units ?? []} />}
      </Toolbar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Receita líquida" value={loading ? '—' : fmt(rl?.total ?? 0)} tone="blue" />
        <Kpi label="Margem bruta" value={loading ? '—' : fmt(mb?.total ?? 0)} hint={mb?.avTotal != null ? `${fmtPct(mb.avTotal)} da receita líquida` : undefined} tone={(mb?.total ?? 0) < 0 ? 'red' : 'default'} />
        <Kpi label="Resultado líquido" value={loading ? '—' : fmt(res?.total ?? 0)} hint={res?.avTotal != null ? `Margem líquida ${fmtPct(res.avTotal)}` : undefined} tone={(res?.total ?? 0) < 0 ? 'red' : 'green'} />
        {regime === 'competencia'
          ? <Kpi label="Custo em estoque" value={loading ? '—' : fmt(data?.estoqueEmFormacao.total ?? 0)} hint={data ? `${data.estoqueEmFormacao.vehicles} veículo(s) não vendido(s)` : undefined} tone="amber" />
          : <Kpi label="Meses" value={String(periods.length)} />}
      </div>

      <Panel title="Receita líquida × resultado líquido">
        <StateBox loading={loading} error={error} empty={!data?.chart.length} />
        {!loading && !error && !!data?.chart.length && (
          <div className="h-72 px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.chart.map((c) => ({ ...c, label: monthLabel(c.period) }))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="v" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={64} />
                <YAxis yAxisId="p" orientation="right" tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={(v, name) => (name === 'Margem líquida' ? fmtPct(Number(v)) : fmt(Number(v)))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="v" dataKey="receitaLiquida" name="Receita líquida" fill={COLORS.resultado} radius={[3, 3, 0, 0]} maxBarSize={36} />
                <Bar yAxisId="v" dataKey="resultadoLiquido" name="Resultado líquido" fill={COLORS.receita} radius={[3, 3, 0, 0]} maxBarSize={36} />
                <Line yAxisId="p" dataKey="margem" name="Margem líquida" stroke={COLORS.linha} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        title="Demonstração do resultado"
        actions={
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 print:hidden">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={avByMonth} onChange={(e) => setAvByMonth(e.target.checked)} />AV % por mês</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />Ocultar linhas zeradas</label>
            <button type="button" onClick={open.size ? () => setOpen(new Set()) : expandAll} className="font-medium text-brand-700 hover:underline">{open.size ? 'Recolher' : 'Expandir'} categorias</button>
          </div>
        }
      >
        <StateBox loading={loading} error={error} empty={!data} />
        {!loading && !error && data && (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[260px] bg-gray-50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Linha</th>
                  {periods.map((p) => <th key={p} className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{monthLabel(p)}</th>)}
                  <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-700">Total</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">AV %</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const drill = data.drill[l.key] ?? []
                  const canOpen = l.kind === 'group' && drill.length > 0
                  const isOpen = open.has(l.key)
                  const rowCls = l.kind === 'result' ? 'bg-brand-50 font-bold text-gray-900' : l.kind === 'subtotal' ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-700'
                  const stickyBg = l.kind === 'result' ? 'bg-brand-50' : l.kind === 'subtotal' ? 'bg-gray-100' : 'bg-white'
                  return (
                    <Fragment key={l.key}>
                      <tr className={cn('border-t border-gray-100', rowCls)}>
                        <td className={cn('sticky left-0 z-10 px-3 py-2', stickyBg)}>
                          {canOpen ? (
                            <button type="button" onClick={() => toggle(l.key)} className="inline-flex items-center gap-1 text-left hover:text-brand-700">
                              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{l.label}
                            </button>
                          ) : <span className={cn(l.kind === 'group' && 'pl-[18px]')}>{l.label}</span>}
                        </td>
                        {periods.map((p) => (
                          <td key={p} className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', (l.values[p] ?? 0) < 0 && 'text-red-600', (l.values[p] ?? 0) === 0 && 'text-gray-300')}>
                            {fmt(l.values[p] ?? 0)}
                            {avByMonth && <span className="block text-[11px] font-normal text-gray-400">{fmtPct(l.av[p])}</span>}
                          </td>
                        ))}
                        <td className={cn('whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums', l.total < 0 && 'text-red-600')}>{fmt(l.total)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-500">{fmtPct(l.avTotal)}</td>
                      </tr>
                      {canOpen && isOpen && drill.map((d) => (
                        <tr key={`${l.key}:${d.categoryId ?? d.label}`} className="border-t border-gray-50 bg-gray-50/40 text-xs text-gray-600">
                          <td className="sticky left-0 z-10 bg-gray-50 py-1.5 pl-10 pr-3">{d.label}</td>
                          {periods.map((p) => <td key={p} className={cn('whitespace-nowrap px-3 py-1.5 text-right tabular-nums', (d.values[p] ?? 0) === 0 && 'text-gray-300')}>{fmt(d.values[p] ?? 0)}</td>)}
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{fmt(d.total)}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-gray-400">{rl?.total ? fmtPct((d.total / rl.total) * 100) : '—'}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {!loading && data?.regime === 'competencia' && data.estoqueEmFormacao.total !== 0 && (
        <Panel title="Custo em estoque (veículos não vendidos)">
          <div className="flex flex-wrap gap-6 px-4 py-3 text-sm">
            <div><p className="text-xs text-gray-500">Total</p><p className="font-semibold tabular-nums text-gray-900">{fmt(data.estoqueEmFormacao.total)}</p></div>
            <div><p className="text-xs text-gray-500">Veículos</p><p className="font-semibold tabular-nums text-gray-900">{data.estoqueEmFormacao.vehicles}</p></div>
            {Object.entries(data.estoqueEmFormacao.byGroup).map(([k, v]) => (
              <div key={k}><p className="text-xs text-gray-500">{STOCK_LABEL[k] ?? k}</p><p className="font-semibold tabular-nums text-gray-900">{fmt(v)}</p></div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

const STOCK_LABEL: Record<string, string> = { CMV_AQUISICAO: 'Aquisição', CMV_PREPARACAO: 'Preparação', CMV_DOCUMENTACAO: 'Documentação' }
