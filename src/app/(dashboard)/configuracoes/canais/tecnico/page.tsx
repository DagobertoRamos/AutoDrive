'use client'

// =============================================================================
// Canais e integrações › Detalhes técnicos — eventos recebidos pelo Gateway de
// Entrada (identificador do evento, origem, tentativas, erro, corpo mascarado)
// e reprocessamento. Área técnica: não aparece para o vendedor.
// =============================================================================

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint } from '@/components/ui/help-hint'

interface Ev {
  id: string; correlationId: string | null; provider: string; kind: string | null; status: string; attempts: number
  error: string | null; receivedAt: string; processedAt: string | null; nextAttemptAt: string | null; resultRef: string | null; payload: unknown
}

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Recebido', PROCESSING: 'Processando', PROCESSED: 'Processado', FAILED: 'Nova tentativa agendada', IGNORED: 'Recusado', DEAD: 'Falhou',
}
const STATUS_TONE: Record<string, string> = {
  PROCESSED: 'text-emerald-600', FAILED: 'text-amber-600', DEAD: 'text-red-600', IGNORED: 'text-gray-500', RECEIVED: 'text-sky-600', PROCESSING: 'text-sky-600',
}
const PROVIDER_LABEL: Record<string, string> = { CRM_CHANNEL: 'Canal de captação', SITE: 'Site', EMAIL: 'E-mail', WHATSAPP: 'WhatsApp' }
const FILTERS = [['', 'Todos'], ['DEAD', 'Falhou'], ['FAILED', 'Em nova tentativa'], ['IGNORED', 'Recusados'], ['PROCESSED', 'Processados']] as const

export default function TecnicoPage() {
  const [status, setStatus] = useState('')
  const [items, setItems] = useState<Ev[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/integrations/hub/events${status ? `?status=${status}` : ''}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(j.error ?? 'Não foi possível carregar.'); setItems([]); return }
    setItems(j.data.items); setCounts(j.data.counts)
  }, [status])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const retry = async (id: string) => {
    setBusy(id); setMsg('')
    const r = await fetch(`/api/integrations/hub/events/${id}/retry`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    setMsg(r.ok ? 'Reprocessado com sucesso.' : j.error ?? j.data?.error ?? 'Ainda não foi possível processar.')
    void load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/configuracoes/canais" className="btn-secondary text-xs"><ArrowLeft size={12} />Canais</Link>
        <h1 className="flex flex-1 items-center gap-1.5 text-xl font-bold text-gray-900 dark:text-white">
          Detalhes técnicos
          <HelpHint text="Tudo o que os canais enviaram para a loja. Cada evento é guardado antes de virar lead ou mensagem; o que falha é tentado de novo automaticamente." />
        </h1>
        <button onClick={() => void load()} className="btn-secondary text-xs"><RefreshCw size={12} />Atualizar</button>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)} className={cn('rounded-full px-2.5 py-1 text-xs font-medium', status === k ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300')}>
            {label}{k && counts[k] ? <span className="ml-1 tabular-nums">{counts[k]}</span> : null}
          </button>
        ))}
      </div>
      {msg && <p className="text-sm text-gray-600 dark:text-gray-300">{msg}</p>}

      {!items && <div className="flex justify-center p-8"><Loader2 size={18} className="animate-spin text-gray-400" /></div>}
      {items && !items.length && <p className="text-sm text-gray-500">Nenhum evento.</p>}
      {items && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase text-gray-500 dark:bg-white/5">
              <tr><th className="px-3 py-2">Evento</th><th className="px-3 py-2">Origem</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Tentativas</th><th className="px-3 py-2">Recebido</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {items.map((e) => (
                <Fragment key={e.id}>
                  <tr className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5" onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                    <td className="px-3 py-2 font-mono text-xs">{e.correlationId ?? e.id.slice(-8)}</td>
                    <td className="px-3 py-2">{PROVIDER_LABEL[e.provider] ?? e.provider}</td>
                    <td className={cn('px-3 py-2 font-medium', STATUS_TONE[e.status])}>{STATUS_LABEL[e.status] ?? e.status}</td>
                    <td className="px-3 py-2 tabular-nums">{e.attempts}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{new Date(e.receivedAt).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 text-right">
                      {(e.status === 'DEAD' || e.status === 'FAILED') && (
                        <button onClick={(ev) => { ev.stopPropagation(); void retry(e.id) }} disabled={busy === e.id} className="btn-secondary text-xs">
                          {busy === e.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}Reprocessar
                        </button>
                      )}
                    </td>
                  </tr>
                  {openId === e.id && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50 px-3 py-2 text-xs dark:bg-white/5">
                        {e.error && <p className="mb-1 text-red-600">Erro: {e.error}</p>}
                        {e.resultRef && <p className="mb-1 text-gray-600">Resultado: {e.kind === 'MESSAGE' ? <Link className="underline" href={`/crm/conversas?c=${e.resultRef}`}>conversa</Link> : <Link className="underline" href={`/crm/leads/${e.resultRef}`}>lead</Link>}</p>}
                        {e.nextAttemptAt && e.status === 'FAILED' && <p className="mb-1 text-gray-600">Próxima tentativa: {new Date(e.nextAttemptAt).toLocaleString('pt-BR')}</p>}
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-2 font-mono text-[11px] text-gray-700 dark:bg-slate-900 dark:text-gray-300">{e.payload ? JSON.stringify(e.payload, null, 2) : 'Conteúdo original já removido pela política de retenção.'}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
