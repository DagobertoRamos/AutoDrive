'use client'

// =============================================================================
// F&I > Dashboard — visão geral da loja. Reaproveita /api/reports/financing
// (KPIs + funil + por banco + docs pendentes) e /api/financing/proposals
// (fichas recentes). Atalhos para as áreas. RBAC: financing (a API gateia).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { LayoutDashboard, RefreshCw, Filter, Landmark, FileText, Users, Calculator, Percent, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Summary { total: number; simulacoes: number; enviadas: number; aprovadas: number; recusadas: number; taxaAprovacao: number; valorAprovado: number }
interface Funnel { simulacoes: number; fichas: number; enviadas: number; aprovadas: number }
interface BankRow { banco: string; count: number; aprovado: number }
interface Recent { id: string; proponentNome: string; vehicle: string | null; status: string; amountRequested: number; createdAt: string }

const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const STATUS_CLS: Record<string, string> = { SIMULACAO: 'bg-amber-100 text-amber-700', ENVIADA: 'bg-blue-100 text-blue-700', APROVADA: 'bg-green-100 text-green-700', RECUSADA: 'bg-red-100 text-red-600', CANCELADA: 'bg-gray-100 text-gray-500' }
const STAGES: { key: keyof Funnel; label: string; cls: string }[] = [
  { key: 'simulacoes', label: 'Simulações', cls: 'bg-indigo-500' }, { key: 'fichas', label: 'Fichas', cls: 'bg-blue-500' },
  { key: 'enviadas', label: 'Enviadas', cls: 'bg-amber-500' }, { key: 'aprovadas', label: 'Aprovadas', cls: 'bg-green-600' },
]
const LINKS = [
  { href: '/financiamento/proponentes', title: 'Proponentes', icon: Users },
  { href: '/financiamento/simulacoes', title: 'Simulações', icon: Calculator },
  { href: '/financiamento/fichas', title: 'Fichas', icon: FileText },
  { href: '/financiamento/contratos', title: 'Contratos', icon: FileText },
  { href: '/financiamento/documentos', title: 'Documentos', icon: FolderOpen },
  { href: '/financiamento/relatorios', title: 'Relatórios', icon: Percent },
]

export default function FinancingDashboardPage() {
  const [s, setS] = useState<Summary | null>(null)
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [byBank, setByBank] = useState<BankRow[]>([])
  const [pendingDocs, setPendingDocs] = useState(0)
  const [recent, setRecent] = useState<Recent[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rep, props] = await Promise.all([
        fetch('/api/reports/financing', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/financing/proposals', { credentials: 'include' }).then((r) => r.json()),
      ])
      setS(rep?.summary ?? null); setFunnel(rep?.funnel ?? null); setByBank(rep?.byBank ?? []); setPendingDocs(rep?.pendingDocsProposals ?? 0)
      setRecent((props?.data ?? []).slice(0, 6))
    } catch { /* vazio */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const cards = [
    { label: 'Fichas', value: String(s?.total ?? 0), cls: 'border-gray-200 bg-white text-gray-900' },
    { label: 'Simulações', value: String(s?.simulacoes ?? 0), cls: 'border-amber-200 bg-amber-50 text-amber-700' },
    { label: 'Aprovadas', value: String(s?.aprovadas ?? 0), cls: 'border-green-200 bg-green-50 text-green-700' },
    { label: 'Taxa de aprovação', value: `${s?.taxaAprovacao ?? 0}%`, cls: 'border-brand-200 bg-brand-50 text-brand-800' },
    { label: 'Valor aprovado', value: fmt(s?.valorAprovado ?? 0), cls: 'border-green-200 bg-green-50 text-green-700' },
    { label: 'Docs pendentes', value: String(pendingDocs), cls: cn(pendingDocs > 0 ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-200 bg-white text-gray-900') },
  ]
  const fMax = funnel ? Math.max(funnel.simulacoes, funnel.fichas, funnel.enviadas, funnel.aprovadas, 1) : 1

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><LayoutDashboard size={20} className="text-brand-600" />Dashboard F&amp;I</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : 'Visão geral do financiamento da loja.'}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (<div key={c.label} className={cn('rounded-xl border p-4', c.cls)}><p className="text-xs font-medium uppercase tracking-wide opacity-80">{c.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{loading ? '—' : c.value}</p></div>))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Funil */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800"><Filter size={15} className="text-brand-600" />Funil</div>
          {funnel ? (
            <div className="space-y-2">{STAGES.map((st) => { const v = funnel[st.key]; return (
              <div key={st.key} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-gray-500">{st.label}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100"><div className={cn('h-full rounded', st.cls)} style={{ width: `${Math.max(2, (v / fMax) * 100)}%` }} /></div>
                <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-800">{v}</span>
              </div>) })}
            </div>
          ) : <p className="py-6 text-center text-sm text-gray-400">Sem dados.</p>}
        </div>

        {/* Por banco */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800"><Landmark size={15} className="text-brand-600" />Por banco</div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <tbody className="divide-y divide-gray-100">
              {byBank.length === 0 ? (<tr><td className="py-8 text-center text-sm text-gray-400" colSpan={3}>Sem dados.</td></tr>) : byBank.slice(0, 6).map((r) => (
                <tr key={r.banco} className="hover:bg-gray-50"><td className="px-4 py-2.5 text-gray-700">{r.banco}</td><td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{r.count}</td><td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-green-700">{r.aprovado ? fmt(r.aprovado) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {LINKS.map((l) => (<Link key={l.href} href={l.href} className="group flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-3 text-center shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/30"><l.icon size={18} className="text-brand-600" /><span className="text-xs font-medium text-gray-700 group-hover:text-brand-800">{l.title}</span></Link>))}
      </div>

      {/* Fichas recentes */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800"><FileText size={15} className="text-brand-600" />Fichas recentes</div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <tbody className="divide-y divide-gray-100">
            {loading ? (Array.from({ length: 4 }).map((_, i) => (<tr key={i}><td className="px-4 py-3" colSpan={5}><div className="h-4 animate-pulse rounded bg-gray-200" /></td></tr>))
            ) : recent.length === 0 ? (<tr><td className="py-10 text-center text-sm text-gray-400" colSpan={5}>Nenhuma ficha ainda.</td></tr>
            ) : recent.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5"><Link href={`/financiamento/fichas/${r.id}`} className="font-medium text-gray-900 hover:text-brand-700">{r.proponentNome}</Link></td>
                <td className="px-4 py-2.5 text-gray-600">{r.vehicle ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-700">{r.amountRequested ? fmt(r.amountRequested) : '—'}</td>
                <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[r.status] ?? 'bg-gray-100 text-gray-600')}>{r.status}</span></td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">{date(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
