'use client'

// =============================================================================
// Financiamento — Relatórios / BI — AutoDrive
// KPIs + status + banco (FN-5) + funil, produção por vendedor, envios por banco,
// documentos pendentes e retorno estimado (Fase 9). Consome /api/reports/financing.
// Retorno estimado (margem) só aparece para financing.config (a API decide).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Landmark, BarChart3, Users, Send, FileWarning, Filter, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import PeriodFilter from '@/components/reports/PeriodFilter'
import SummarizeReportButton from '@/components/ai/SummarizeReportButton'

interface Summary { total: number; simulacoes: number; enviadas: number; aprovadas: number; recusadas: number; canceladas: number; taxaAprovacao: number; valorAprovado: number }
interface StatusRow { status: string; count: number; solicitado: number; aprovado: number }
interface BankRow { banco: string; count: number; aprovado: number }
interface Funnel { simulacoes: number; fichas: number; enviadas: number; aprovadas: number }
interface SellerRow { vendedor: string; total: number; aprovadas: number; valorAprovado: number }
interface SubBankRow { banco: string; enviados: number; aprovados: number }
interface Margin { retornoEstimado: number; valorAprovado: number }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const STATUS_LABEL: Record<string, string> = { SIMULACAO: 'Simulação', ENVIADA: 'Enviada', APROVADA: 'Aprovada', RECUSADA: 'Recusada', CANCELADA: 'Cancelada' }
const FUNNEL_STAGES: { key: keyof Funnel; label: string; cls: string }[] = [
  { key: 'simulacoes', label: 'Simulações', cls: 'bg-indigo-500' },
  { key: 'fichas', label: 'Fichas', cls: 'bg-blue-500' },
  { key: 'enviadas', label: 'Enviadas', cls: 'bg-amber-500' },
  { key: 'aprovadas', label: 'Aprovadas', cls: 'bg-green-600' },
]

export default function FinancingReportsPage() {
  const [s, setS] = useState<Summary | null>(null)
  const [byStatus, setByStatus] = useState<StatusRow[]>([])
  const [byBank, setByBank] = useState<BankRow[]>([])
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [bySeller, setBySeller] = useState<SellerRow[]>([])
  const [bySubBank, setBySubBank] = useState<SubBankRow[]>([])
  const [pendingDocs, setPendingDocs] = useState(0)
  const [margin, setMargin] = useState<Margin | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to)
      const res = await fetch(`/api/reports/financing?${qs}`, { credentials: 'include' })
      const j = await res.json()
      setS(j?.summary ?? null); setByStatus(j?.byStatus ?? []); setByBank(j?.byBank ?? [])
      setFunnel(j?.funnel ?? null); setBySeller(j?.bySeller ?? []); setBySubBank(j?.bySubmissionBank ?? [])
      setPendingDocs(j?.pendingDocsProposals ?? 0); setMargin(j?.margin ?? null)
    } catch { setS(null); setByStatus([]); setByBank([]); setFunnel(null); setBySeller([]); setBySubBank([]); setPendingDocs(0); setMargin(null) } finally { setLoading(false) }
  }, [from, to])
  useEffect(() => { load() }, [load])

  const cards = [
    { label: 'Total de fichas', value: String(s?.total ?? 0), cls: 'border-gray-200 bg-white text-gray-900' },
    { label: 'Simulações', value: String(s?.simulacoes ?? 0), cls: 'border-amber-200 bg-amber-50 text-amber-700' },
    { label: 'Aprovadas', value: String(s?.aprovadas ?? 0), cls: 'border-green-200 bg-green-50 text-green-700' },
    { label: 'Taxa de aprovação', value: `${s?.taxaAprovacao ?? 0}%`, cls: 'border-brand-200 bg-brand-50 text-brand-800' },
    { label: 'Valor aprovado', value: fmt(s?.valorAprovado ?? 0), cls: 'border-green-200 bg-green-50 text-green-700' },
    { label: 'Docs pendentes', value: String(pendingDocs), cls: 'border-red-200 bg-red-50 text-red-600' },
  ]
  const funnelMax = funnel ? Math.max(funnel.simulacoes, funnel.fichas, funnel.enviadas, funnel.aprovadas, 1) : 1

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relatórios de Financiamento</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : 'Visão consolidada de fichas, simulações, produção e funil'}</p>
        </div>
        <div className="flex items-center gap-2">
          <SummarizeReportButton title="Relatório de Financiamento (F&I)" data={{ resumo: s, funil: funnel, porStatus: byStatus, porBanco: byBank, porVendedor: bySeller, enviosPorBanco: bySubBank, docsPendentes: pendingDocs, retorno: margin }} />
          <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      </div>

      <PeriodFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.cls)}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{c.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{loading ? '—' : c.value}</p>
          </div>
        ))}
      </div>

      {/* Funil + Retorno estimado */}
      <div className={cn('grid grid-cols-1 gap-4', margin && 'lg:grid-cols-3')}>
        <div className={cn('overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-card', margin && 'lg:col-span-2')}>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800"><Filter size={15} className="text-brand-600" />Funil simulação → aprovação</div>
          {funnel ? (
            <div className="space-y-2">
              {FUNNEL_STAGES.map((st) => {
                const v = funnel[st.key]
                return (
                  <div key={st.key} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-gray-500">{st.label}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
                      <div className={cn('h-full rounded', st.cls)} style={{ width: `${Math.max(2, (v / funnelMax) * 100)}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-800">{v}</span>
                  </div>
                )
              })}
            </div>
          ) : <p className="py-6 text-center text-sm text-gray-400">Sem dados.</p>}
        </div>

        {margin && (
          <div className="overflow-hidden rounded-xl border border-green-200 bg-green-50/40 p-4 shadow-card">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800"><TrendingUp size={15} className="text-green-600" />Retorno (margem)</div>
            <p className="text-xs text-gray-500">Retorno estimado (simulações)</p>
            <p className="mb-2 text-xl font-bold tabular-nums text-green-700">{fmt(margin.retornoEstimado)}</p>
            <p className="text-xs text-gray-500">Valor aprovado (fichas)</p>
            <p className="text-lg font-semibold tabular-nums text-gray-800">{fmt(margin.valorAprovado)}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Por status */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800"><BarChart3 size={15} className="text-brand-600" />Por status</div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50"><tr>{['Status', 'Fichas', 'Solicitado', 'Aprovado'].map((h) => (<th key={h} className={cn('px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Status' ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {byStatus.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">Sem dados.</td></tr>
              ) : byStatus.map((r) => (
                <tr key={r.status} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{r.count}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-500">{r.solicitado ? fmt(r.solicitado) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-green-700">{r.aprovado ? fmt(r.aprovado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Por banco (fichas) */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800"><Landmark size={15} className="text-brand-600" />Por banco (fichas)</div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50"><tr>{['Banco', 'Fichas', 'Aprovado'].map((h) => (<th key={h} className={cn('px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Banco' ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {byBank.length === 0 ? (
                <tr><td colSpan={3} className="py-8 text-center text-sm text-gray-400">Sem dados.</td></tr>
              ) : byBank.map((r) => (
                <tr key={r.banco} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{r.banco}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{r.count}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-green-700">{r.aprovado ? fmt(r.aprovado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Produção por vendedor */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800"><Users size={15} className="text-brand-600" />Produção por vendedor</div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50"><tr>{['Vendedor', 'Fichas', 'Aprov.', 'Valor aprov.'].map((h) => (<th key={h} className={cn('px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Vendedor' ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {bySeller.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-400">Sem dados.</td></tr>
              ) : bySeller.map((r) => (
                <tr key={r.vendedor} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{r.vendedor}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{r.total}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700">{r.aprovadas}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-gray-500">{r.valorAprovado ? fmt(r.valorAprovado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Envios por banco (submissões) */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800"><Send size={15} className="text-brand-600" />Envios por banco</div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50"><tr>{['Banco', 'Enviados', 'Aprovados'].map((h) => (<th key={h} className={cn('px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Banco' ? 'text-left' : 'text-right')}>{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {bySubBank.length === 0 ? (
                <tr><td colSpan={3} className="py-8 text-center text-sm text-gray-400"><span className="inline-flex items-center gap-1.5"><FileWarning size={14} className="text-gray-300" />Nenhum envio no período.</span></td></tr>
              ) : bySubBank.map((r) => (
                <tr key={r.banco} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{r.banco}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{r.enviados}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700">{r.aprovados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
