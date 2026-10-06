'use client'

// Relatórios: lucratividade por veículo vendido, por vendedor e por unidade.

import { useEffect, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { COLORS, Kpi, Panel, StateBox, SortTh, fmt, fmtDate, fmtPct, fmtShort, td, tdR, useFinanceData, useSort } from './shared'
import type { ReportViewProps } from './types'

interface ProfitMath { saleValue: number; acquisition: number; preparation: number; documentation: number; commissions: number; fiReturn: number; totalCost: number; profit: number; margin: number | null }
interface Aggregate extends ProfitMath { key: string; label: string; count: number; avgProfit: number; avgDays: number | null }
interface VehicleRow extends ProfitMath {
  id: string; vehicleId: string | null; dealId: string; dealNumber: string | null; plate: string | null; description: string; saleDate: string
  sellerId: string | null; sellerName: string | null; unitId: string | null; unitName: string | null; daysInStock: number | null
  acquisitionSource: 'LANCAMENTOS' | 'TROCA' | 'CADASTRO' | null
}
interface VehicleData { from: string; to: string; rows: VehicleRow[]; totals: Aggregate | null }
interface GroupData { from: string; to: string; rows: Aggregate[]; totals: Aggregate | null }

const ACQ_HINT: Record<string, string> = { TROCA: 'Valor da troca', CADASTRO: 'Preço de compra do cadastro' }

function TotalsKpis({ t, loading }: { t: Aggregate | null | undefined; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Kpi label="Veículos vendidos" value={loading ? '—' : String(t?.count ?? 0)} />
      <Kpi label="Faturamento" value={loading ? '—' : fmt(t?.saleValue ?? 0)} tone="blue" />
      <Kpi label="Lucro" value={loading ? '—' : fmt(t?.profit ?? 0)} tone={(t?.profit ?? 0) < 0 ? 'red' : 'green'} />
      <Kpi label="Margem" value={loading ? '—' : fmtPct(t?.margin)} hint={t ? `Lucro médio ${fmt(t.avgProfit)}` : undefined} />
      <Kpi label="Dias em estoque" value={loading ? '—' : t?.avgDays != null ? `${t.avgDays} dias` : '—'} hint="Média" />
    </div>
  )
}

function Composition({ t }: { t: Aggregate }) {
  const data = [
    { name: 'Venda', value: t.saleValue, color: COLORS.resultado },
    { name: 'Retorno F&I', value: t.fiReturn, color: COLORS.receita },
    { name: 'Aquisição', value: -t.acquisition, color: COLORS.despesa },
    { name: 'Preparação', value: -t.preparation, color: COLORS.despesa },
    { name: 'Documentação', value: -t.documentation, color: COLORS.despesa },
    { name: 'Comissões', value: -t.commissions, color: COLORS.despesa },
    { name: 'Lucro', value: t.profit, color: t.profit < 0 ? COLORS.despesa : COLORS.receita },
  ]
  return (
    <div className="h-64 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 8, right: 8 }}>
          <CartesianGrid stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={64} />
          <Tooltip formatter={(v) => fmt(Number(v))} />
          <Bar dataKey="value" name="Valor" radius={[3, 3, 0, 0]} maxBarSize={40}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

type VKey = 'saleDate' | 'description' | 'sellerName' | 'saleValue' | 'acquisition' | 'preparation' | 'documentation' | 'commissions' | 'fiReturn' | 'profit' | 'margin' | 'daysInStock'

export function VehicleProfitReport({ url, onData, registerCsv }: ReportViewProps) {
  const { data, loading, error } = useFinanceData<VehicleData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  const { sort, toggle, apply } = useSort<VKey>('saleDate')
  const rows = useMemo(() => apply(data?.rows ?? [], (r, k) => (k === 'saleDate' ? +new Date(r.saleDate) : r[k])), [data, apply])
  useEffect(() => {
    registerCsv(data ? {
      name: `lucratividade-veiculos-${data.from}-a-${data.to}`,
      headers: ['Data da venda', 'Negociação', 'Placa', 'Veículo', 'Vendedor', 'Unidade', 'Venda', 'Aquisição', 'Origem da aquisição', 'Preparação', 'Documentação', 'Comissões', 'Retorno F&I', 'Custo total', 'Lucro', 'Margem %', 'Dias em estoque'],
      rows: data.rows.map((r) => [fmtDate(r.saleDate), r.dealNumber, r.plate, r.description, r.sellerName, r.unitName, r.saleValue, r.acquisition, r.acquisitionSource ? ({ LANCAMENTOS: 'Lançamentos', TROCA: 'Valor da troca', CADASTRO: 'Cadastro do veículo' })[r.acquisitionSource] : 'Sem custo', r.preparation, r.documentation, r.commissions, r.fiReturn, r.totalCost, r.profit, r.margin, r.daysInStock]),
    } : null)
  }, [data, registerCsv])
  const t = data?.totals
  const cols: [VKey, string, boolean][] = [
    ['saleDate', 'Venda em', false], ['description', 'Veículo', false], ['sellerName', 'Vendedor', false], ['saleValue', 'Venda', true],
    ['acquisition', 'Aquisição', true], ['preparation', 'Preparação', true], ['documentation', 'Documentação', true], ['commissions', 'Comissões', true],
    ['fiReturn', 'Retorno F&I', true], ['profit', 'Lucro', true], ['margin', 'Margem', true], ['daysInStock', 'Dias', true],
  ]
  return (
    <div className="space-y-4">
      <TotalsKpis t={t} loading={loading} />
      {!loading && t && <Panel title="Composição do resultado"><Composition t={t} /></Panel>}
      <Panel title="Veículos vendidos">
        <StateBox loading={loading} error={error} empty={!data?.rows.length} emptyText="Nenhum veículo vendido no período." />
        {!loading && !error && !!data?.rows.length && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr>{cols.map(([k, l, r]) => <SortTh key={k} k={k} label={l} sort={sort} toggle={toggle} right={r} />)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className={cn(td, 'whitespace-nowrap text-xs text-gray-500')}>{fmtDate(r.saleDate)}</td>
                    <td className={td}>
                      <p className="font-medium text-gray-900">{r.plate ?? '—'}</p>
                      <p className="text-xs text-gray-500">{r.description}{r.dealNumber ? ` · ${r.dealNumber}` : ''}</p>
                    </td>
                    <td className={cn(td, 'text-xs')}>{r.sellerName ?? '—'}</td>
                    <td className={tdR}>{fmt(r.saleValue)}</td>
                    <td className={tdR} title={r.acquisitionSource ? ACQ_HINT[r.acquisitionSource] : r.acquisition ? undefined : 'Sem custo de aquisição lançado'}>
                      {fmt(r.acquisition)}{r.acquisitionSource && r.acquisitionSource !== 'LANCAMENTOS' && <span className="ml-0.5 text-amber-600">*</span>}
                    </td>
                    <td className={tdR}>{fmt(r.preparation)}</td>
                    <td className={tdR}>{fmt(r.documentation)}</td>
                    <td className={tdR}>{fmt(r.commissions)}</td>
                    <td className={cn(tdR, 'text-green-700')}>{fmt(r.fiReturn)}</td>
                    <td className={cn(tdR, 'font-semibold', r.profit < 0 ? 'text-red-600' : 'text-gray-900')}>{fmt(r.profit)}</td>
                    <td className={cn(tdR, (r.margin ?? 0) < 0 ? 'text-red-600' : 'text-gray-600')}>{fmtPct(r.margin)}</td>
                    <td className={cn(tdR, 'text-gray-500')}>{r.daysInStock ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              {t && (
                <tfoot className="border-t-2 border-gray-200 font-semibold">
                  <tr>
                    <td className={td} colSpan={3}>Total ({t.count})</td>
                    <td className={tdR}>{fmt(t.saleValue)}</td><td className={tdR}>{fmt(t.acquisition)}</td><td className={tdR}>{fmt(t.preparation)}</td>
                    <td className={tdR}>{fmt(t.documentation)}</td><td className={tdR}>{fmt(t.commissions)}</td><td className={tdR}>{fmt(t.fiReturn)}</td>
                    <td className={cn(tdR, t.profit < 0 && 'text-red-600')}>{fmt(t.profit)}</td><td className={tdR}>{fmtPct(t.margin)}</td><td className={tdR}>{t.avgDays ?? '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            {data.rows.some((r) => r.acquisitionSource === 'TROCA' || r.acquisitionSource === 'CADASTRO') && (
              <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500"><span className="text-amber-600">*</span> Aquisição sem lançamento: valor da troca ou preço de compra do cadastro.</p>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}

type GKey = 'label' | 'count' | 'saleValue' | 'totalCost' | 'fiReturn' | 'profit' | 'margin' | 'avgProfit' | 'avgDays'

export function GroupProfitReport({ url, onData, registerCsv, groupLabel }: ReportViewProps & { groupLabel: string }) {
  const { data, loading, error } = useFinanceData<GroupData>(url)
  useEffect(() => { onData(data) }, [data, onData])
  const { sort, toggle, apply } = useSort<GKey>('profit')
  const rows = useMemo(() => apply(data?.rows ?? [], (r, k) => r[k]), [data, apply])
  useEffect(() => {
    registerCsv(data ? {
      name: `lucratividade-${groupLabel.toLowerCase()}-${data.from}-a-${data.to}`,
      headers: [groupLabel, 'Veículos', 'Venda', 'Aquisição', 'Preparação', 'Documentação', 'Comissões', 'Retorno F&I', 'Custo total', 'Lucro', 'Margem %', 'Lucro médio', 'Dias em estoque (média)'],
      rows: data.rows.map((r) => [r.label, r.count, r.saleValue, r.acquisition, r.preparation, r.documentation, r.commissions, r.fiReturn, r.totalCost, r.profit, r.margin, r.avgProfit, r.avgDays]),
    } : null)
  }, [data, registerCsv, groupLabel])
  const cols: [GKey, string, boolean][] = [
    ['label', groupLabel, false], ['count', 'Veículos', true], ['saleValue', 'Venda', true], ['totalCost', 'Custo total', true],
    ['fiReturn', 'Retorno F&I', true], ['profit', 'Lucro', true], ['margin', 'Margem', true], ['avgProfit', 'Lucro médio', true], ['avgDays', 'Dias (média)', true],
  ]
  return (
    <div className="space-y-4">
      <TotalsKpis t={data?.totals} loading={loading} />
      <Panel title={`Lucro por ${groupLabel.toLowerCase()}`}>
        <StateBox loading={loading} error={error} empty={!data?.rows.length} emptyText="Nenhum veículo vendido no período." />
        {!loading && !error && !!data?.rows.length && (
          <div className="p-2" style={{ height: Math.max(180, Math.min(rows.length, 20) * 30 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...data.rows].slice(0, 20)} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Bar dataKey="profit" name="Lucro" radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {data.rows.slice(0, 20).map((r) => <Cell key={r.key} fill={r.profit < 0 ? COLORS.despesa : COLORS.receita} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
      {!loading && !error && !!data?.rows.length && (
        <Panel>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr>{cols.map(([k, l, r]) => <SortTh key={k} k={k} label={l} sort={sort} toggle={toggle} right={r} />)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.key || 'none'} className="hover:bg-gray-50">
                    <td className={cn(td, 'font-medium', r.key ? 'text-gray-900' : 'italic text-gray-500')}>{r.label}</td>
                    <td className={tdR}>{r.count}</td>
                    <td className={tdR}>{fmt(r.saleValue)}</td>
                    <td className={tdR}>{fmt(r.totalCost)}</td>
                    <td className={cn(tdR, 'text-green-700')}>{fmt(r.fiReturn)}</td>
                    <td className={cn(tdR, 'font-semibold', r.profit < 0 ? 'text-red-600' : 'text-gray-900')}>{fmt(r.profit)}</td>
                    <td className={tdR}>{fmtPct(r.margin)}</td>
                    <td className={tdR}>{fmt(r.avgProfit)}</td>
                    <td className={cn(tdR, 'text-gray-500')}>{r.avgDays ?? '—'}</td>
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
