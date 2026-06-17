'use client'

// =============================================================================
// Master > F&I > Webhooks (Fase 7b). MASTER-only.
// Mostra o status do receptor, a URL do endpoint e os eventos recebidos.
// O receptor é público sob /api/webhook/financing/[provider], protegido por
// FINANCE_WEBHOOK_SECRET. Read-only; não expõe payload bruto.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Webhook, RefreshCw, CheckCircle2, XCircle, Lock, ShieldCheck, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EventRow { id: string; provider: string | null; externalId: string | null; signatureValid: boolean | null; processed: boolean; error: string | null; createdAt: string }

const dt = (s: string) => new Date(s).toLocaleString('pt-BR')

export default function MasterWebhooksPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const isMaster = !role || role === 'MASTER'

  const [events, setEvents] = useState<EventRow[]>([])
  const [enabled, setEnabled] = useState(false)
  const [summary, setSummary] = useState({ total: 0, pending: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/master/financing/webhooks', { credentials: 'include' }).then((x) => x.json())
      if (r?.success) { setEvents(r.data ?? []); setEnabled(!!r.enabled); setSummary(r.summary ?? { total: 0, pending: 0 }) }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  if (session && !isMaster) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Webhook size={20} className="text-brand-600" />Webhooks F&amp;I</h1>
          <p className="mt-0.5 text-sm text-gray-500">Receptor de retorno dos provedores. {summary.total} evento(s){summary.pending > 0 ? ` · ${summary.pending} não processado(s)` : ''}.</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      {/* Status + endpoint */}
      <div className={cn('flex items-start gap-3 rounded-xl border p-4', enabled ? 'border-green-200 bg-green-50/50' : 'border-amber-200 bg-amber-50')}>
        {enabled ? <ShieldCheck size={18} className="mt-0.5 shrink-0 text-green-600" /> : <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600" />}
        <div className="text-sm">
          <p className={cn('font-semibold', enabled ? 'text-green-800' : 'text-amber-800')}>{enabled ? 'Receptor ativo' : 'Receptor desativado'}</p>
          <p className="mt-0.5 text-gray-600">{enabled ? 'O endpoint aceita retornos autenticados pelo segredo.' : 'Defina FINANCE_WEBHOOK_SECRET (≥8 caracteres) no ambiente para ativar.'}</p>
          <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-gray-700">
            POST <span className="text-brand-700">/api/webhook/financing/&lt;provedor&gt;</span>
            <span className="ml-2 text-gray-400">· header <code>x-webhook-secret</code> ou <code>?secret=</code></span>
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">A assinatura oficial do provedor (HMAC) substitui o segredo compartilhado quando a integração for homologada.</p>
        </div>
      </div>

      {/* Eventos */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Provedor', 'External ID', 'Assinatura', 'Processado', 'Erro', 'Recebido'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : events.length === 0 ? (
                <tr><td colSpan={6} className="py-14 text-center"><Webhook size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum webhook recebido ainda.</p></td></tr>
              ) : events.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{e.provider ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.externalId ?? '—'}</td>
                  <td className="px-4 py-3">{e.signatureValid ? <CheckCircle2 size={15} className="text-green-600" /> : <XCircle size={15} className="text-red-500" />}</td>
                  <td className="px-4 py-3">{e.processed ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">sim</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">não</span>}</td>
                  <td className="px-4 py-3"><span className="block max-w-[220px] truncate text-xs text-gray-500">{e.error ?? '—'}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
