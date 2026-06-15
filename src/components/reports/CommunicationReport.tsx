'use client'

// =============================================================================
// CommunicationReport — relatório de comunicação (whatsapp/email/avisos/logs).
// Consome /api/reports/communication?view=...
// Adapta colunas/cards conforme a view.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type View = 'whatsapp' | 'email' | 'avisos' | 'logs'
interface Bucket { key: string; count: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const dt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const STATUS_CLS: Record<string, string> = { ENTREGUE: 'bg-green-100 text-green-700', LIDO: 'bg-green-100 text-green-700', ENVIADO: 'bg-blue-100 text-blue-700', ENVIANDO: 'bg-amber-100 text-amber-700', PENDENTE: 'bg-gray-100 text-gray-600', ERRO: 'bg-red-100 text-red-600', CANCELADO: 'bg-gray-100 text-gray-500' }
const CHANNEL_LABEL: Record<string, string> = { APP_WEB: 'App Web', APP_MOBILE: 'App Mobile', WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', PUSH: 'Push' }
const statusPill = (s: string) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[s] ?? 'bg-gray-100 text-gray-600')}>{s}</span>

export default function CommunicationReport({
  view, title, Icon = MessageSquare,
}: {
  view: View; title: string; Icon?: LucideIcon
}) {
  const [summary, setSummary] = useState<Row | null>(null)
  const [chips, setChips] = useState<Bucket[]>([])
  const [chips2, setChips2] = useState<Bucket[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/communication?view=${view}`, { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null)
      setChips(json?.byStatus ?? json?.byType ?? [])
      setChips2(json?.byChannel ?? [])
      setRows(json?.data ?? [])
    } catch { setSummary(null); setChips([]); setChips2([]); setRows([]) } finally { setLoading(false) }
  }, [view])

  useEffect(() => { load() }, [load])

  // Cards por view
  const cards: { label: string; value: string | number; tone?: 'brand' | 'red' | 'green' | 'gray' }[] = (() => {
    const c = summary?.count ?? 0
    if (view === 'avisos') return [{ label: 'Avisos', value: c }, { label: 'Lidos', value: summary?.lidas ?? 0, tone: 'green' }, { label: 'Não lidos', value: summary?.naoLidas ?? 0, tone: 'brand' }]
    if (view === 'whatsapp') return [{ label: 'Mensagens', value: c }, { label: 'Enviadas', value: summary?.enviadas ?? 0, tone: 'brand' }, { label: 'Recebidas', value: summary?.recebidas ?? 0, tone: 'green' }]
    return [{ label: 'Entregas', value: c }, { label: 'Entregues', value: summary?.entregues ?? 0, tone: 'green' }, { label: 'Erros', value: summary?.erros ?? 0, tone: 'red' }]
  })()
  const toneCls = (t?: string) => t === 'red' ? 'border-red-200 bg-red-50 text-red-700' : t === 'green' ? 'border-green-200 bg-green-50 text-green-700' : t === 'brand' ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-900'

  const headers = view === 'avisos' ? ['Destinatário', 'Título', 'Tipo', 'Lido', 'Data']
    : view === 'whatsapp' ? ['Cliente', 'Conteúdo', 'Direção', 'Status', 'Data']
    : view === 'email' ? ['Destinatário', 'Assunto', 'Status', 'Enviado', 'Entregue']
    : ['Canal', 'Título', 'Destinatário', 'Status', 'Data']

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.count ?? 0} registros`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {cards.map((cd) => (
          <div key={cd.label} className={cn('rounded-xl border p-4', toneCls(cd.tone))}><p className="text-xs font-medium uppercase tracking-wide opacity-80">{cd.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{loading ? '—' : cd.value}</p></div>
        ))}
      </div>

      {(chips.length > 0 || chips2.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {chips2.map((b) => (<span key={`c-${b.key}`} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs text-brand-700">{CHANNEL_LABEL[b.key] ?? b.key}: <span className="font-semibold tabular-nums">{b.count}</span></span>))}
          {chips.map((b) => (<span key={`s-${b.key}`} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">{b.key}: <span className="font-semibold tabular-nums text-gray-900">{b.count}</span></span>))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{headers.map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{headers.map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={headers.length} className="py-14 text-center"><Icon size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum registro de comunicação.</p></td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={cn('hover:bg-gray-50', r.status === 'ERRO' && 'bg-red-50/40')}>
                    {view === 'avisos' && <>
                      <td className="px-4 py-3 text-gray-700">{r.destinatario}</td>
                      <td className="px-4 py-3"><p className="font-medium text-gray-900">{r.title}</p>{r.message && <p className="max-w-xs truncate text-xs text-gray-400">{r.message}</p>}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.type}</td>
                      <td className="px-4 py-3">{r.read ? <span className="text-green-600">Lido</span> : <span className="text-amber-600">Não lido</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(r.createdAt)}</td>
                    </>}
                    {view === 'whatsapp' && <>
                      <td className="px-4 py-3 text-gray-700">{r.cliente}{r.plate && <span className="ml-1 font-mono text-xs text-gray-400">{r.plate}</span>}</td>
                      <td className="px-4 py-3"><p className="max-w-md truncate text-gray-600">{r.content ?? '—'}</p></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.direction === 'INBOUND' ? 'Recebida' : 'Enviada'}</td>
                      <td className="px-4 py-3">{statusPill(r.status ?? '—')}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(r.createdAt)}</td>
                    </>}
                    {view === 'email' && <>
                      <td className="px-4 py-3 text-gray-700">{r.destinatario}</td>
                      <td className="px-4 py-3 text-gray-600">{r.title}</td>
                      <td className="px-4 py-3">{statusPill(r.status)}{r.errorMessage && <p className="mt-0.5 max-w-xs truncate text-[10px] text-red-500">{r.errorMessage}</p>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(r.sentAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(r.deliveredAt)}</td>
                    </>}
                    {view === 'logs' && <>
                      <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{CHANNEL_LABEL[r.channel] ?? r.channel}</span></td>
                      <td className="px-4 py-3 text-gray-600">{r.title}</td>
                      <td className="px-4 py-3 text-gray-700">{r.destinatario}</td>
                      <td className="px-4 py-3">{statusPill(r.status)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(r.createdAt)}</td>
                    </>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
