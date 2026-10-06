'use client'

// Relatórios: resultado por área (centros de resultado/custo), serviços vendidos
// e receitas de F&I por banco.

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { HelpHint, WithHint } from '@/components/ui/help-hint'
import type { GlossaryTerm } from '@/lib/glossary'
import { COLORS, Kpi, Panel, StateBox, SortTh, fmt, fmtDate, fmtPct, fmtShort, td, tdR, th, thR, useFinanceData, useSort } from './shared'
import type { ReportViewProps } from './types'
import { DealPeekLink } from '@/components/deals/DealPeek'

const money = (n: number) => <span className={cn('tabular-nums', n < 0 ? 'text-red-600' : n > 0 ? 'text-green-700' : 'text-gray-400')}>{fmt(n)}</span>

// ── Resultado por área ──────────────────────────────────────────────────────
interface CenterRow { id: string | null; key: string | null; name: string; kind: 'RESULTADO' | 'CUSTO' | null; receitas: number; despesas: number; resultado: number; margem: number | null; count: number }
interface Totals { receitas: number; despesas: number; resultado: number; margem: number | null }
interface ServiceLine { kind: string; label: string; center: string; count: number; charged: number; cost: number; commissions: number; profit: number; margin: number | null }
interface ServiceRow {
  id: string; origin: 'SERVICO' | 'DOCUMENTACAO' | 'GARANTIA'; kind: string; kindLabel: string; center: string; date: string
  dealId: string; dealNumber: string | null; customer: string | null; plate: string | null; vehicle: string | null
  service: string; supplier: string | null; charged: number; cost: number; costItems: { description: string; amount: number }[]
  commissions: number; profit: number; margin: number | null; status: 'PAGO' | 'PREVISTO' | 'CADASTRO' | 'SEM_CUSTO'; outsideBalance: boolean
}
interface ServiceTotals { charged: number; cost: number; commissions: number; profit: number; margin: number | null; count: number }
interface CenterDetail {
  center: CenterRow
  isServiceCenter: boolean
  byCategory: { categoryId: string | null; label: string; type: 'RECEITA' | 'DESPESA'; amount: number; count: number }[]
  byGroup: { group: string; label: string; receitas: number; despesas: number; resultado: number }[]
  entries: { key: string; entryId: string; period: string; date: string | null; type: 'RECEITA' | 'DESPESA'; status: string; amount: number; description: string | null; counterparty: string | null; category: string | null; group: string; dealId: string | null; part: string | null }[]
  entriesTotal: number
  services: { lines: ServiceLine[]; rows: ServiceRow[]; totals: ServiceTotals } | null
}
interface CentersData { from: string; to: string; rows: CenterRow[]; totals: Totals; chart: { id: string | null; name: string; resultado: number }[]; detail: CenterDetail | null }

export function ResultByCenterReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<CentersData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  // Seleção vale só para os filtros atuais (mudou o período → fecha o detalhe).
  const [pick, setPick] = useState<{ url: string; id: string } | null>(null)
  const selected = pick?.url === url ? pick.id : null
  const setSelected = (id: string | null) => setPick(id ? { url, id } : null)
  const detail = useFinanceData<CentersData>(selected ? `${url}&center=${encodeURIComponent(selected)}` : null)

  useEffect(() => {
    registerCsv(data ? {
      name: `resultado-por-area-${data.from}-a-${data.to}`,
      headers: ['Área', 'Tipo', 'Receitas', 'Custos e despesas', 'Resultado', 'Margem %', 'Lançamentos'],
      rows: data.rows.map((r) => [r.name, r.kind === 'RESULTADO' ? 'Centro de resultado' : r.kind === 'CUSTO' ? 'Centro de custo' : '—', r.receitas, r.despesas, r.resultado, r.margem, r.count]),
    } : null)
  }, [data, registerCsv])

  const resultCenters = (data?.rows ?? []).filter((r) => r.kind === 'RESULTADO')
  const costCenters = (data?.rows ?? []).filter((r) => r.kind !== 'RESULTADO')
  const t = data?.totals

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Receitas" value={loading ? '—' : fmt(t?.receitas ?? 0)} tone="green" />
        <Kpi label="Custos e despesas" value={loading ? '—' : fmt(t?.despesas ?? 0)} tone="red" />
        <Kpi label="Resultado geral" value={loading ? '—' : fmt(t?.resultado ?? 0)} tone={(t?.resultado ?? 0) < 0 ? 'red' : 'green'} />
        <Kpi label="Margem" helpTerm="MARGEM" value={loading ? '—' : fmtPct(t?.margem)} />
      </div>

      {(loading || error || !data?.rows.length) && <Panel><StateBox loading={loading} error={error} empty={!data?.rows.length} /></Panel>}

      {!loading && !error && !!data?.rows.length && (
        <>
          <CenterCards title="Centros de resultado" helpTerm="CENTRO_RESULTADO" rows={resultCenters} selected={selected} onSelect={setSelected} />
          <CenterCards title="Centros de custo" helpTerm="CENTRO_CUSTO" rows={costCenters} selected={selected} onSelect={setSelected} />

          {selected && (
            <CenterDetailPanel loading={detail.loading} error={detail.error} detail={detail.data?.detail ?? null} onClose={() => setSelected(null)} />
          )}

          <Panel title="Resultado por área">
            <div className="h-72 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.chart} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#374151' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={64} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="resultado" name="Resultado" radius={[3, 3, 0, 0]} maxBarSize={40} cursor="pointer"
                    onClick={(d: { payload?: { id: string | null } }) => setSelected(d?.payload?.id ?? 'none')}>
                    {data.chart.map((c) => <Cell key={c.id ?? 'none'} fill={c.resultado < 0 ? COLORS.despesa : COLORS.receita} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}

function CenterCards({ title, rows, selected, onSelect, helpTerm }: { title: string; rows: CenterRow[]; selected: string | null; onSelect: (id: string) => void; helpTerm?: GlossaryTerm }) {
  if (!rows.length) return null
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-800">{title}{helpTerm && <HelpHint term={helpTerm} size={12} />}</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => {
          const id = r.id ?? 'none'
          const isCost = r.kind !== 'RESULTADO'
          return (
            <button key={id} type="button" onClick={() => onSelect(id)}
              className={cn('rounded-xl border bg-white p-4 text-left shadow-card transition-colors hover:border-brand-400 print:shadow-none',
                selected === id ? 'border-brand-600 ring-1 ring-brand-600' : 'border-gray-200', !r.count && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                {r.margem != null && !isCost && <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', r.resultado < 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>{fmtPct(r.margem)}</span>}
              </div>
              <p className={cn('mt-2 text-2xl font-bold tabular-nums', r.resultado < 0 ? 'text-red-600' : r.resultado > 0 ? 'text-green-700' : 'text-gray-400')}>
                {r.resultado > 0 ? '+' : ''}{fmt(r.resultado)}
              </p>
              <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                {(!isCost || r.receitas !== 0) && <div className="flex justify-between"><span>Receitas</span><span className="tabular-nums text-gray-700">{fmt(r.receitas)}</span></div>}
                <div className="flex justify-between"><span>{isCost ? 'Despesas' : 'Custos e despesas'}</span><span className="tabular-nums text-gray-700">{fmt(r.despesas)}</span></div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function CenterDetailPanel({ detail, loading, error, onClose }: { detail: CenterDetail | null; loading: boolean; error: string | null; onClose: () => void }) {
  const [showEntries, setShowEntries] = useState(false)
  const c = detail?.center
  return (
    <Panel title={c ? `${c.name} — detalhamento` : 'Detalhamento'}
      actions={<button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Fechar"><X size={16} /></button>}>
      <StateBox loading={loading} error={error} empty={!loading && !error && !detail} />
      {!loading && !error && detail && c && (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Receitas" value={fmt(c.receitas)} tone="green" />
            <Kpi label="Custos e despesas" value={fmt(c.despesas)} tone="red" />
            <Kpi label="Resultado" value={fmt(c.resultado)} tone={c.resultado < 0 ? 'red' : 'green'} />
            <Kpi label="Margem" value={fmtPct(c.margem)} hint={`${c.count} lançamento(s)`} />
          </div>

          {detail.services && <ServiceTables lines={detail.services.lines} rows={detail.services.rows} totals={detail.services.totals} compact />}

          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>{detail.isServiceCenter ? 'Categoria' : 'Despesas por categoria'}</th><th className={thR}>Lançamentos</th><th className={thR}>Valor</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {detail.byCategory.map((r) => (
                  <tr key={`${r.type}:${r.categoryId ?? r.label}`}>
                    <td className={td}><span className={cn('mr-2 inline-block rounded px-1.5 text-[10px] font-semibold', r.type === 'RECEITA' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{r.type === 'RECEITA' ? 'REC' : 'DESP'}</span>{r.label}</td>
                    <td className={cn(tdR, 'text-gray-500')}>{r.count}</td>
                    <td className={tdR}>{money(r.type === 'RECEITA' ? r.amount : -r.amount)}</td>
                  </tr>
                ))}
                {!detail.byCategory.length && <tr><td colSpan={3} className="p-4 text-center text-sm text-gray-400">Sem lançamentos no período.</td></tr>}
              </tbody>
            </table>
          </div>

          {!!detail.entries.length && (
            <div>
              <button type="button" onClick={() => setShowEntries((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                {showEntries ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Lançamentos ({detail.entriesTotal > detail.entries.length ? `${detail.entries.length} maiores de ${detail.entriesTotal}` : detail.entriesTotal})
              </button>
              {showEntries && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50"><tr><th className={th}>Data</th><th className={th}>Descrição</th><th className={th}>Categoria</th><th className={th}>Situação</th><th className={thR}>Valor</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.entries.map((e) => (
                        <tr key={e.key} className="hover:bg-gray-50">
                          <td className={cn(td, 'whitespace-nowrap text-xs text-gray-500')}>{fmtDate(e.date)}</td>
                          <td className={td}>
                            <div className="text-gray-900">{e.description ?? '—'}</div>
                            <div className="text-xs text-gray-500">
                              {[e.counterparty, e.part].filter(Boolean).join(' · ')}
                              {e.dealId && <> · <DealPeekLink dealId={e.dealId} className="text-brand-700 hover:underline">negociação</DealPeekLink></>}
                            </div>
                          </td>
                          <td className={cn(td, 'text-xs text-gray-500')}>{e.category ?? e.group}</td>
                          <td className={cn(td, 'text-xs text-gray-500')}>{e.status === 'PREVISTO' ? 'Previsto' : e.status === 'PAGO' ? 'Pago' : e.status === 'RECEBIDO' ? 'Recebido' : e.status}</td>
                          <td className={tdR}>{money(e.type === 'RECEITA' ? e.amount : -e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

// ── Serviços vendidos ───────────────────────────────────────────────────────
const STATUS: Record<ServiceRow['status'], { label: string; cls: string }> = {
  PAGO: { label: 'Custo pago', cls: 'bg-green-50 text-green-700' },
  PREVISTO: { label: 'Custo previsto', cls: 'bg-amber-50 text-amber-700' },
  CADASTRO: { label: 'Custo do cadastro', cls: 'bg-gray-100 text-gray-600' },
  SEM_CUSTO: { label: 'Sem custo', cls: 'bg-gray-100 text-gray-500' },
}

function ServiceTables({ lines, rows, totals, compact }: { lines: ServiceLine[]; rows: ServiceRow[]; totals: ServiceTotals; compact?: boolean }) {
  const [kind, setKind] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const { sort, toggle, apply } = useSort<'date' | 'service' | 'charged' | 'cost' | 'commissions' | 'profit' | 'margin'>('date')
  const shown = useMemo(() => apply(rows.filter((r) => !kind || r.kind === kind), (r, k) => (k === 'date' ? r.date : r[k])), [rows, kind, apply])
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50"><tr><th className={th}>Linha de serviço</th><th className={thR}>Qtd.</th><th className={thR}>Cobrado</th><th className={thR}><WithHint text="O que a loja gastou de fato com o serviço (fornecedor, peças, mão de obra), lançado no financeiro.">Custo real</WithHint></th><th className={thR}>Comissões</th><th className={thR}>Lucro</th><th className={thR}>Margem</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((l) => (
              <tr key={l.kind} className={cn('cursor-pointer hover:bg-gray-50', kind === l.kind && 'bg-brand-50')} onClick={() => setKind((k) => (k === l.kind ? '' : l.kind))}>
                <td className={cn(td, 'font-medium text-gray-900')}>{l.label}</td>
                <td className={cn(tdR, 'text-gray-500')}>{l.count}</td>
                <td className={tdR}>{fmt(l.charged)}</td>
                <td className={cn(tdR, 'text-red-600')}>{fmt(l.cost)}</td>
                <td className={cn(tdR, 'text-red-600')}>{fmt(l.commissions)}</td>
                <td className={cn(tdR, 'font-semibold')}>{money(l.profit)}</td>
                <td className={cn(tdR, 'text-gray-500')}>{fmtPct(l.margin)}</td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={7} className="p-4 text-center text-sm text-gray-400">Nenhum serviço vendido no período.</td></tr>}
          </tbody>
          {lines.length > 1 && (
            <tfoot className="border-t-2 border-gray-200 font-semibold"><tr>
              <td className={td}>Total</td><td className={tdR}>{totals.count}</td><td className={tdR}>{fmt(totals.charged)}</td><td className={tdR}>{fmt(totals.cost)}</td>
              <td className={tdR}>{fmt(totals.commissions)}</td><td className={tdR}>{money(totals.profit)}</td><td className={tdR}>{fmtPct(totals.margin)}</td>
            </tr></tfoot>
          )}
        </table>
      </div>

      {!!rows.length && (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          {kind && <p className="border-b border-gray-100 bg-brand-50 px-3 py-1.5 text-xs text-brand-800">Filtrado: {lines.find((l) => l.kind === kind)?.label} · <button type="button" className="underline" onClick={() => setKind('')}>ver todos</button></p>}
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <SortTh k="date" label="Data" sort={sort} toggle={toggle} />
              <th className={th}>Negociação</th>
              <SortTh k="service" label="Serviço" sort={sort} toggle={toggle} />
              {!compact && <th className={th}>Fornecedor</th>}
              <SortTh k="charged" label="Cobrado" sort={sort} toggle={toggle} right />
              <SortTh k="cost" label="Custo real" sort={sort} toggle={toggle} right />
              <SortTh k="commissions" label="Comissões" sort={sort} toggle={toggle} right />
              <SortTh k="profit" label="Lucro" sort={sort} toggle={toggle} right />
              <SortTh k="margin" label="Margem" sort={sort} toggle={toggle} right />
              <th className={th}>Situação</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((r) => (
                <Fragment key={r.id}>
                  <tr className="hover:bg-gray-50">
                    <td className={cn(td, 'whitespace-nowrap text-xs text-gray-500')}>{fmtDate(r.date)}</td>
                    <td className={td}>
                      <DealPeekLink dealId={r.dealId} className="font-medium text-brand-700 hover:underline">{r.dealNumber ?? 'Negociação'}</DealPeekLink>
                      <div className="text-xs text-gray-500">{[r.customer, r.plate].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className={td}>
                      <div className="text-gray-900">{r.service}</div>
                      <div className="text-xs text-gray-500">{r.kindLabel}{r.outsideBalance ? ' · fora do saldo da negociação' : ''}{compact && r.supplier ? ` · ${r.supplier}` : ''}</div>
                    </td>
                    {!compact && <td className={cn(td, 'text-xs text-gray-600')}>{r.supplier ?? '—'}</td>}
                    <td className={tdR}>{fmt(r.charged)}</td>
                    <td className={cn(tdR, 'text-red-600')}>
                      {r.costItems.length ? (
                        <button type="button" onClick={() => setOpen((o) => (o === r.id ? null : r.id))} className="inline-flex items-center gap-1 hover:underline" title="Ver composição do custo">
                          {open === r.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{fmt(r.cost)}
                        </button>
                      ) : fmt(r.cost)}
                    </td>
                    <td className={cn(tdR, 'text-red-600')}>{fmt(r.commissions)}</td>
                    <td className={cn(tdR, 'font-semibold')}>{money(r.profit)}</td>
                    <td className={cn(tdR, 'text-gray-500')}>{fmtPct(r.margin)}</td>
                    <td className={td}><span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', STATUS[r.status].cls)}>{STATUS[r.status].label}</span></td>
                  </tr>
                  {open === r.id && r.costItems.map((it, i) => (
                    <tr key={`${r.id}:${i}`} className="bg-gray-50/60 text-xs">
                      <td colSpan={compact ? 4 : 5} className="px-3 py-1 pl-10 text-gray-500">{it.description}</td>
                      <td className="px-3 py-1 text-right tabular-nums text-gray-600">{fmt(it.amount)}</td>
                      <td colSpan={4} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface ServicesData { from: string; to: string; lines: ServiceLine[]; rows: ServiceRow[]; totals: ServiceTotals; chart: { name: string; cobrado: number; custo: number; comissoes: number; lucro: number }[] }

export function ServicesSoldReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<ServicesData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    registerCsv(data ? {
      name: `servicos-vendidos-${data.from}-a-${data.to}`,
      headers: ['Data', 'Negociação', 'Cliente', 'Placa', 'Linha', 'Serviço', 'Fornecedor', 'Cobrado', 'Custo real', 'Comissões', 'Lucro', 'Margem %', 'Situação do custo'],
      rows: data.rows.map((r) => [fmtDate(r.date), r.dealNumber, r.customer, r.plate, r.kindLabel, r.service, r.supplier, r.charged, r.cost, r.commissions, r.profit, r.margin, STATUS[r.status].label]),
    } : null)
  }, [data, registerCsv])
  const t = data?.totals
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cobrado dos clientes" helpTerm="COBRADO_CUSTO" value={loading ? '—' : fmt(t?.charged ?? 0)} tone="blue" hint={t ? `${t.count} serviço(s)` : undefined} />
        <Kpi label="Custo real" value={loading ? '—' : fmt(t?.cost ?? 0)} tone="red" />
        <Kpi label="Comissões" value={loading ? '—' : fmt(t?.commissions ?? 0)} tone="amber" />
        <Kpi label="Lucro" value={loading ? '—' : fmt(t?.profit ?? 0)} tone={(t?.profit ?? 0) < 0 ? 'red' : 'green'} hint={t ? `Margem ${fmtPct(t.margin)}` : undefined} />
      </div>
      <Panel title="Por linha de serviço">
        <StateBox loading={loading} error={error} empty={!data?.lines.length} emptyText="Nenhum serviço vendido nas negociações do período." />
        {!loading && !error && !!data?.chart.length && (
          <div className="h-72 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.chart} margin={{ left: 8, right: 8 }}>
                <CartesianGrid stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="cobrado" name="Cobrado" fill={COLORS.resultado} radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="custo" name="Custo real" fill={COLORS.despesa} radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="comissoes" name="Comissões" fill={COLORS.linha} radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="lucro" name="Lucro" fill={COLORS.receita} radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
      {!loading && !error && !!data?.lines.length && (
        <Panel title="Serviços vendidos">
          <div className="p-4"><ServiceTables lines={data.lines} rows={data.rows} totals={data.totals} /></div>
        </Panel>
      )}
    </div>
  )
}

// ── Receitas de F&I ─────────────────────────────────────────────────────────
interface FiByBank { bank: string; previsto: number; recebido: number; total: number; byType: Record<string, number> }
interface FiContract {
  id: string; dealId: string; dealNumber: string | null; date: string; customer: string | null; plate: string | null; bank: string; contractNumber: string | null
  financed: number; gross: number | null; ila: number | null; iof: number | null; irrf: number | null; net: number | null; plus: number | null
  addOnsStore: number; storeIncome: number; returnStatus: 'RECEBIDO' | 'PREVISTO' | 'SEM_LANCAMENTO'
}
interface FiData {
  from: string; to: string
  totals: { previsto: number; recebido: number; total: number }
  byBank: FiByBank[]
  byType: { type: string; label: string; previsto: number; recebido: number; total: number }[]
  types: { key: string; label: string }[]
  chart: { name: string; previsto: number; recebido: number }[]
  contracts: FiContract[]
  contractTotals: { count: number; financed: number; gross: number; ila: number; iof: number; irrf: number; net: number; plus: number; addOnsStore: number; storeIncome: number }
}

const RET_STATUS: Record<FiContract['returnStatus'], { label: string; cls: string }> = {
  RECEBIDO: { label: 'Recebido', cls: 'bg-green-50 text-green-700' },
  PREVISTO: { label: 'A receber', cls: 'bg-amber-50 text-amber-700' },
  SEM_LANCAMENTO: { label: 'Sem lançamento', cls: 'bg-gray-100 text-gray-500' },
}

export function FiRevenueReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<FiData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  useEffect(() => {
    registerCsv(data ? {
      name: `receitas-fi-${data.from}-a-${data.to}`,
      headers: ['Data', 'Negociação', 'Cliente', 'Placa', 'Banco', 'Contrato', 'Financiado', 'Retorno bruto', 'ILA', 'IOF', 'IRRF', 'Retorno líquido', 'PLUS', 'Agregados (loja)', 'Total da loja', 'Retorno'],
      rows: data.contracts.map((c) => [fmtDate(c.date), c.dealNumber, c.customer, c.plate, c.bank, c.contractNumber, c.financed, c.gross, c.ila, c.iof, c.irrf, c.net, c.plus, c.addOnsStore, c.storeIncome, RET_STATUS[c.returnStatus].label]),
    } : null)
  }, [data, registerCsv])
  const usedTypes = (data?.types ?? []).filter((t) => data?.byType.some((x) => x.type === t.key))
  const ct = data?.contractTotals
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Receitas de F&I" helpTerm="FI" value={loading ? '—' : fmt(data?.totals.total ?? 0)} tone="green" />
        <Kpi label="Recebido" value={loading ? '—' : fmt(data?.totals.recebido ?? 0)} tone="blue" />
        <Kpi label="A receber (previsto)" helpTerm="PREVISTO" value={loading ? '—' : fmt(data?.totals.previsto ?? 0)} tone="amber" />
        <Kpi label="Contratos financiados" value={loading ? '—' : String(ct?.count ?? 0)} hint={ct ? `Financiado ${fmt(ct.financed)}` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Por banco">
          <StateBox loading={loading} error={error} empty={!data?.chart.length} emptyText="Sem receitas de F&I no período." />
          {!loading && !error && !!data?.chart.length && (
            <div className="h-72 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.chart} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="recebido" name="Recebido" stackId="a" fill={COLORS.receita} maxBarSize={16} />
                  <Bar dataKey="previsto" name="A receber" stackId="a" fill={COLORS.linha} radius={[0, 3, 3, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Por tipo de receita">
          <StateBox loading={loading} error={error} empty={!data?.byType.length} emptyText="Sem receitas de F&I no período." />
          {!loading && !error && !!data?.byType.length && (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>Tipo</th><th className={thR}>Recebido</th><th className={thR}>A receber</th><th className={thR}>Total</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.byType.map((t) => (
                  <tr key={t.type}><td className={cn(td, 'font-medium text-gray-900')}>{t.label}</td><td className={tdR}>{fmt(t.recebido)}</td><td className={cn(tdR, 'text-amber-700')}>{fmt(t.previsto)}</td><td className={cn(tdR, 'font-semibold')}>{fmt(t.total)}</td></tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 font-semibold"><tr><td className={td}>Total</td><td className={tdR}>{fmt(data.totals.recebido)}</td><td className={tdR}>{fmt(data.totals.previsto)}</td><td className={tdR}>{fmt(data.totals.total)}</td></tr></tfoot>
            </table>
          )}
        </Panel>
      </div>

      {!loading && !error && !!data?.byBank.length && (
        <Panel title="Bancos × tipo de receita">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className={th}>Banco</th>
                {usedTypes.map((t) => <th key={t.key} className={thR}>{t.label}</th>)}
                <th className={thR}>Recebido</th><th className={thR}>A receber</th><th className={thR}>Total</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.byBank.map((b) => (
                  <tr key={b.bank} className="hover:bg-gray-50">
                    <td className={cn(td, 'font-medium text-gray-900')}>{b.bank}</td>
                    {usedTypes.map((t) => <td key={t.key} className={cn(tdR, !b.byType[t.key] && 'text-gray-300')}>{fmt(b.byType[t.key] ?? 0)}</td>)}
                    <td className={tdR}>{fmt(b.recebido)}</td>
                    <td className={cn(tdR, 'text-amber-700')}>{fmt(b.previsto)}</td>
                    <td className={cn(tdR, 'font-semibold')}>{fmt(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {!loading && !error && !!data?.contracts.length && ct && (
        <Panel title="Contratos de financiamento">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr>
                <th className={th}>Data</th><th className={th}>Negociação</th><th className={th}>Banco / contrato</th>
                <th className={thR}>Financiado</th><th className={thR}><WithHint term="RETORNO_BRUTO">Retorno bruto</WithHint></th><th className={thR}><WithHint term="ILA">ILA</WithHint></th><th className={thR}><WithHint term="IOF">IOF</WithHint></th><th className={thR}><WithHint term="IRRF">IRRF</WithHint></th>
                <th className={thR}><WithHint term="RETORNO_LIQUIDO">Líquido</WithHint></th><th className={thR}><WithHint term="PLUS">PLUS</WithHint></th><th className={thR}><WithHint text="Receita da loja com os agregados do financiamento (comissões de seguro, garantia etc.).">Agregados</WithHint></th><th className={thR}><WithHint text="Retorno líquido + PLUS + agregados: tudo o que a loja ganha com o contrato.">Total loja</WithHint></th><th className={th}><WithHint text="Situação do retorno: recebido do banco, a receber, ou ainda sem lançamento no financeiro.">Retorno</WithHint></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className={cn(td, 'whitespace-nowrap text-xs text-gray-500')}>{fmtDate(c.date)}</td>
                    <td className={td}>
                      <DealPeekLink dealId={c.dealId} className="font-medium text-brand-700 hover:underline">{c.dealNumber ?? 'Negociação'}</DealPeekLink>
                      <div className="text-xs text-gray-500">{[c.customer, c.plate].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className={td}><div className="text-gray-900">{c.bank}</div>{c.contractNumber && <div className="text-xs text-gray-500">{c.contractNumber}</div>}</td>
                    <td className={tdR}>{fmt(c.financed)}</td>
                    <td className={tdR}>{fmt(c.gross)}</td>
                    <td className={cn(tdR, 'text-red-600')}>{fmt(c.ila)}</td>
                    <td className={cn(tdR, 'text-red-600')}>{fmt(c.iof)}</td>
                    <td className={cn(tdR, 'text-red-600')}>{fmt(c.irrf)}</td>
                    <td className={cn(tdR, 'font-medium')}>{fmt(c.net)}</td>
                    <td className={tdR}>{fmt(c.plus)}</td>
                    <td className={tdR}>{fmt(c.addOnsStore)}</td>
                    <td className={cn(tdR, 'font-semibold text-green-700')}>{fmt(c.storeIncome)}</td>
                    <td className={td}><span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', RET_STATUS[c.returnStatus].cls)}>{RET_STATUS[c.returnStatus].label}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 font-semibold"><tr>
                <td className={td} colSpan={3}>Total ({ct.count})</td>
                <td className={tdR}>{fmt(ct.financed)}</td><td className={tdR}>{fmt(ct.gross)}</td><td className={tdR}>{fmt(ct.ila)}</td><td className={tdR}>{fmt(ct.iof)}</td>
                <td className={tdR}>{fmt(ct.irrf)}</td><td className={tdR}>{fmt(ct.net)}</td><td className={tdR}>{fmt(ct.plus)}</td><td className={tdR}>{fmt(ct.addOnsStore)}</td>
                <td className={tdR}>{fmt(ct.storeIncome)}</td><td />
              </tr></tfoot>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
