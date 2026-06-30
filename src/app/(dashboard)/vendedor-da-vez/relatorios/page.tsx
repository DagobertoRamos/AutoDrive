'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Relatórios — profissional, com filtros.
// Abas: Resumo (totais + por vendedor + por unidade + suspeitas) e Atendimentos
// (histórico do dia com ações de gestão). Filtros: período, vendedor, unidade.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, RefreshCw, AlertTriangle, Filter, Download, Building2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import AtendimentosPanel from '@/components/seller-queue/AtendimentosPanel'

interface Seller { sellerId: string; sellerName: string; finished: number; timeouts: number; rejected: number; called: number; avgAcceptSeconds: number | null }
interface UnitRow { unitId: string; unitName: string; called: number; finished: number; timeouts: number }
interface Flag { id: string; kind: string; severity: string; detail: string | null; createdAt: string }
interface Data { days: number; tenantWide: boolean; byUnit: UnitRow[]; totals: { arrivals: number; recurring: number; attendances: number; finished: number; timeouts: number }; bySeller: Seller[]; fraudFlags: Flag[]; penalties: { id: string; sellerId: string; type: string }[] }
interface Opt { id: string; name: string }

const PERIODS = [['7', '7 dias'], ['15', '15 dias'], ['30', '30 dias'], ['90', '90 dias'], ['custom', 'Personalizado']] as const

function toCSV(d: Data): string {
  const rows = [['Vendedor', 'Chamados', 'Finalizados', 'Timeouts', 'Recusas', 'Tempo medio aceite (s)']]
  d.bySeller.forEach((s) => rows.push([s.sellerName, String(s.called), String(s.finished), String(s.timeouts), String(s.rejected), s.avgAcceptSeconds != null ? String(s.avgAcceptSeconds) : '']))
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')
}

export default function RelatoriosPage() {
  const [tab, setTab] = useState<'resumo' | 'atendimentos'>('resumo')
  const [data, setData] = useState<Data | null>(null)
  const [period, setPeriod] = useState('7')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [sellers, setSellers] = useState<Opt[]>([])
  const [units, setUnits] = useState<Opt[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (period === 'custom' && from && to) { qs.set('from', from); qs.set('to', to) } else if (period !== 'custom') qs.set('days', period)
      if (sellerId) qs.set('sellerId', sellerId)
      if (unitId) qs.set('unitId', unitId)
      const res = await fetch(`/api/seller-queue/reports?${qs.toString()}`, { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { const j = await res.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null); setData((await res.json())?.data ?? null)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [period, from, to, sellerId, unitId])
  useEffect(() => { load() }, [load])

  // Opções dos filtros (vendedores + unidades).
  useEffect(() => {
    fetch('/api/seller-queue/callable', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => { if (j?.success) setSellers((j.data ?? []).map((c: { sellerId: string; name: string }) => ({ id: c.sellerId, name: c.name }))) }).catch(() => {})
    fetch('/api/seller-queue/units', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => { if (j?.success) setUnits(j.data ?? []) }).catch(() => {})
  }, [])

  const exportCSV = () => {
    if (!data) return
    const blob = new Blob(['﻿' + toCSV(data)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `relatorio-fila-${period}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>
  const t = data?.totals

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><BarChart3 size={20} className="text-brand-600" />Relatórios da Fila</h1>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200">
        {([['resumo', 'Resumo'], ['atendimentos', 'Atendimentos']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-semibold', tab === v ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>{l}</button>
        ))}
      </div>

      {tab === 'resumo' ? (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-card">
            <Filter size={16} className="mb-2 text-brand-600" />
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Período</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm">{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
            {period === 'custom' && (<>
              <div><label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">De</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" /></div>
              <div><label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Até</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" /></div>
            </>)}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Vendedor</label>
              <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"><option value="">Todos</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </div>
            {units.length > 1 && (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Unidade</label>
                <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"><option value="">Minha unidade</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              </div>
            )}
            <button onClick={exportCSV} disabled={!data} className="btn-secondary ml-auto text-xs"><Download size={13} />Exportar CSV</button>
          </div>

          {/* Totais */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[['Clientes', t?.arrivals], ['Recorrentes', t?.recurring], ['Atendimentos', t?.attendances], ['Finalizados', t?.finished], ['Timeouts', t?.timeouts]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-gray-200 bg-white p-3 shadow-card"><p className="text-xs uppercase tracking-wide text-gray-400">{l}</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : (v ?? 0)}</p></div>
            ))}
          </div>

          {/* Por vendedor */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
            <div className="border-b border-gray-100 px-4 py-2.5"><p className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Users size={15} className="text-brand-600" />Por vendedor</p></div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50"><tr>{['Vendedor', 'Chamados', 'Finalizados', 'Timeouts', 'Recusas', 'Tempo médio aceite'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.bySeller ?? []).length === 0 ? (<tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">Sem dados no período.</td></tr>)
                  : data!.bySeller.map((s) => (
                    <tr key={s.sellerId} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{s.sellerName}</td>
                      <td className="px-4 py-2.5 tabular-nums text-gray-600">{s.called}</td>
                      <td className="px-4 py-2.5 tabular-nums text-green-700">{s.finished}</td>
                      <td className="px-4 py-2.5 tabular-nums text-red-600">{s.timeouts}</td>
                      <td className="px-4 py-2.5 tabular-nums text-gray-500">{s.rejected}</td>
                      <td className="px-4 py-2.5 tabular-nums text-gray-600">{s.avgAcceptSeconds != null ? `${s.avgAcceptSeconds}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Por unidade (loja inteira) */}
          {data?.tenantWide && (data?.byUnit?.length ?? 0) > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
              <div className="border-b border-gray-100 px-4 py-2.5"><p className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Building2 size={15} className="text-brand-600" />Por unidade</p></div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50"><tr>{['Unidade', 'Chamados', 'Finalizados', 'Timeouts'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {data!.byUnit.map((u) => (
                      <tr key={u.unitId} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{u.unitName}</td>
                        <td className="px-4 py-2.5 tabular-nums text-gray-600">{u.called}</td>
                        <td className="px-4 py-2.5 tabular-nums text-green-700">{u.finished}</td>
                        <td className="px-4 py-2.5 tabular-nums text-red-600">{u.timeouts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Suspeitas de fraude */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-card">
            <div className="border-b border-gray-100 px-4 py-2.5"><p className="flex items-center gap-2 text-sm font-semibold text-gray-700"><AlertTriangle size={15} className="text-amber-500" />Suspeitas de fraude ({data?.fraudFlags?.length ?? 0})</p></div>
            {(data?.fraudFlags ?? []).length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma suspeita aberta.</p> : (
              <ul className="divide-y divide-gray-100">
                {data!.fraudFlags.map((f) => (<li key={f.id} className="px-4 py-2.5 text-sm"><span className={cn('mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold', f.severity === 'HIGH' ? 'bg-red-100 text-red-700' : f.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>{f.severity}</span><span className="font-medium text-gray-800">{f.kind}</span>{f.detail && <span className="text-gray-500"> — {f.detail}</span>}</li>))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <AtendimentosPanel
          from={period === 'custom' ? (from || undefined) : new Date(Date.now() - Number(period) * 86400000).toISOString().slice(0, 10)}
          to={period === 'custom' ? (to || undefined) : new Date().toISOString().slice(0, 10)}
        />
      )}
    </div>
  )
}
