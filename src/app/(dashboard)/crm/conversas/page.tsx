'use client'

// =============================================================================
// CRM › Conversas — Caixa de Entrada omnichannel. Lista (filtros simples),
// mensagens no centro e painel do cliente/veículo/origem/responsável ao lado.
// Responde pelo mesmo canal quando ele permite (hoje: WhatsApp oficial).
// =============================================================================

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, CheckCheck, Clock, ExternalLink, Loader2, MessageSquare, Phone, Search, Send, UserCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint } from '@/components/ui/help-hint'
import { channelInfo, waDigits } from '@/lib/inbox/inbox-core'
import { crmSourceLabel, crmStageLabel } from '@/lib/crm/shared'
import { touchLabel, type Attribution } from '@/lib/crm/attribution-core'

type Filter = 'todos' | 'meus' | 'nao_respondidos' | 'pendentes'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'meus', label: 'Meus' },
  { key: 'nao_respondidos', label: 'Não respondidos' },
  { key: 'pendentes', label: 'Pendentes' },
]

interface Item {
  id: string; channel: string; contactName: string | null; contactPhone: string | null; status: string
  unreadCount: number; lastMessageAt: string | null; lastMessagePreview: string | null; awaitingReply: boolean
  leadId: string | null; assignedToName: string | null; vehicleTitle: string | null
}
interface Msg { id: string; direction: 'IN' | 'OUT'; type: string; body: string | null; status: string; error: string | null; authorName: string | null; sentAt: string }
interface Detail {
  conversation: { id: string; channel: string; contactName: string | null; contactPhone: string | null; status: string; reply: { ok: true } | { ok: false; reason: string; message: string } }
  messages: Msg[]
  lead: { id: string; number: number | null; status: string; source: string; convertedDealId: string | null; attribution: Attribution | null; vehicleSold: { title: string } | null; similarVehicles: { id: string; title: string; price: number | null }[] | null } | null
  vehicle: { id: string; brand: string | null; model: string | null; version: string | null; modelYear: number | null; plate: string | null; salePrice: number | null; stockStatus: string | null } | null
  assignee: { id: string; name: string | null } | null
}

const money = (n: number | null) => (n == null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))

function ago(iso: string | null): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function ChannelTag({ channel }: { channel: string }) {
  const c = channelInfo(channel)
  return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white" style={{ background: c.color }}>{c.label}</span>
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'READ') return <CheckCheck size={12} className="text-sky-500" />
  if (status === 'DELIVERED') return <CheckCheck size={12} />
  if (status === 'SENT') return <Check size={12} />
  if (status === 'PENDING') return <Clock size={12} />
  if (status === 'FAILED') return <X size={12} className="text-red-500" />
  return null
}

function ConversasInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const selected = sp.get('c')
  const [filter, setFilter] = useState<Filter>('todos')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [counts, setCounts] = useState({ unread: 0, pending: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/conversations?filtro=${filter}&q=${encodeURIComponent(q)}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Não foi possível carregar as conversas.')
      setItems(j.data.items); setCounts(j.data.counts); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao carregar.') } finally { setLoading(false) }
  }, [filter, q])

  useEffect(() => { const t = setTimeout(() => { setLoading(true); void loadList() }, q ? 300 : 0); return () => clearTimeout(t) }, [loadList, q])
  useEffect(() => { const t = setInterval(() => void loadList(), 15_000); return () => clearInterval(t) }, [loadList])

  const open = (id: string | null) => router.replace(id ? `/crm/conversas?c=${id}` : '/crm/conversas', { scroll: false })

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[480px] overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
      {/* Lista */}
      <aside className={cn('flex w-full shrink-0 flex-col border-r border-gray-200 dark:border-white/10 md:w-72 2xl:w-80', selected && 'hidden md:flex')}>
        <div className="space-y-2 border-b border-gray-200 p-3 dark:border-white/10">
          <h1 className="flex items-center gap-1.5 text-lg font-bold text-gray-900 dark:text-white">
            Conversas
            <HelpHint text="Mensagens dos clientes em todos os canais conectados. Você responde aqui mesmo, pelo canal de origem, quando ele permite." />
          </h1>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm focus:border-brand-400 focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', filter === f.key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300')}>
                {f.label}
                {f.key === 'pendentes' && counts.pending > 0 && <span className="ml-1 tabular-nums">{counts.pending}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && !items.length && <div className="flex justify-center p-6"><Loader2 size={18} className="animate-spin text-gray-400" /></div>}
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!loading && !error && !items.length && (
            <div className="p-6 text-center text-sm text-gray-500">
              Nenhuma conversa.
              <div className="mt-2"><Link href="/configuracoes/canais" className="text-xs font-medium text-brand-600 hover:underline">Conectar canais</Link></div>
            </div>
          )}
          {items.map((it) => (
            <button key={it.id} onClick={() => open(it.id)} className={cn('flex w-full flex-col gap-0.5 border-b border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5', selected === it.id && 'bg-brand-50 dark:bg-brand-500/10')}>
              <div className="flex items-center gap-2">
                <ChannelTag channel={it.channel} />
                <span className={cn('flex-1 truncate text-sm text-gray-900 dark:text-white', it.unreadCount > 0 && 'font-semibold')}>{it.contactName || it.contactPhone || 'Cliente'}</span>
                <span className="text-[11px] text-gray-400">{ago(it.lastMessageAt)}</span>
              </div>
              {it.vehicleTitle && <span className="truncate text-xs text-gray-500">{it.vehicleTitle}</span>}
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-xs text-gray-500">{it.lastMessagePreview}</span>
                {it.unreadCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white tabular-nums">{it.unreadCount}</span>}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Conversa */}
      {selected
        ? <Thread key={selected} id={selected} onBack={() => open(null)} onChanged={() => void loadList()} />
        : <div className="hidden flex-1 items-center justify-center text-sm text-gray-400 md:flex"><MessageSquare size={18} className="mr-2" />Selecione uma conversa</div>}
    </div>
  )
}

function Thread({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/conversations/${id}`, { cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setError(j.error ?? 'Não foi possível abrir a conversa.'); return }
    setD(j.data); setError('')
  }, [id])

  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])
  useEffect(() => { const t = setInterval(() => void load(), 8_000); return () => clearInterval(t) }, [load])
  const count = d?.messages.length ?? 0
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [count])

  const send = async () => {
    if (!text.trim() || sending) return
    setSending(true); setSendError('')
    const res = await fetch(`/api/crm/conversations/${id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    const j = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) { setSendError(j.error ?? 'Não foi possível enviar.'); void load(); return }
    setText(''); void load(); onChanged()
  }

  const patch = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/crm/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) setSendError(j.error ?? 'Não foi possível alterar.')
    void load(); onChanged()
  }

  const wa = useMemo(() => waDigits(d?.conversation.contactPhone), [d?.conversation.contactPhone])

  if (error) return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">{error}</div>
  if (!d) return <div className="flex flex-1 items-center justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
  const c = d.conversation
  const v = d.vehicle
  const attribution = d.lead?.attribution

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-white/10">
          <button onClick={onBack} className="md:hidden" aria-label="Voltar"><ArrowLeft size={18} /></button>
          <ChannelTag channel={c.channel} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{c.contactName || c.contactPhone}</p>
            {c.contactName && <p className="text-[11px] text-gray-500">{c.contactPhone}</p>}
          </div>
          {d.lead && <Link href={`/crm/leads/${d.lead.id}`} className="btn-secondary text-xs xl:hidden">Lead{d.lead.number ? ` #${d.lead.number}` : ''}</Link>}
          {c.status !== 'CLOSED'
            ? <button onClick={() => void patch({ status: c.status === 'PENDING' ? 'OPEN' : 'PENDING' })} className="btn-secondary text-xs">{c.status === 'PENDING' ? 'Retomar' : 'Pendente'}</button>
            : null}
          <button onClick={() => void patch({ status: c.status === 'CLOSED' ? 'OPEN' : 'CLOSED' })} className="btn-secondary text-xs">{c.status === 'CLOSED' ? 'Reabrir' : 'Encerrar'}</button>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50 p-3 dark:bg-slate-950/40">
          {d.messages.map((m) => (
            <div key={m.id} className={cn('flex', m.direction === 'OUT' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm', m.direction === 'OUT' ? 'bg-brand-600 text-white' : 'bg-white text-gray-900 dark:bg-slate-800 dark:text-white')}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <div className={cn('mt-1 flex items-center justify-end gap-1 text-[10px]', m.direction === 'OUT' ? 'text-white/70' : 'text-gray-400')}>
                  {m.direction === 'OUT' && m.authorName && <span>{m.authorName} ·</span>}
                  {new Date(m.sentAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {m.direction === 'OUT' && <StatusIcon status={m.status} />}
                </div>
                {m.status === 'FAILED' && m.error && <p className="mt-1 text-[11px] text-red-200">{m.error}</p>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <footer className="border-t border-gray-200 p-2.5 dark:border-white/10">
          {c.reply.ok ? (
            <div className="flex items-end gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Escreva a resposta"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
                className="min-h-[44px] flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-white" />
              <button onClick={() => void send()} disabled={sending || !text.trim()} className="btn-primary h-10 px-3" aria-label="Enviar">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="flex-1">{c.reply.message}</span>
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn-secondary text-xs"><ExternalLink size={12} />Abrir WhatsApp</a>}
              {c.contactPhone && <a href={`tel:+${wa}`} className="btn-secondary text-xs"><Phone size={12} />Ligar</a>}
            </div>
          )}
          {sendError && <p className="mt-1 text-xs text-red-600">{sendError}</p>}
        </footer>
      </section>

      {/* Painel lateral */}
      <aside className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l border-gray-200 p-3 text-sm dark:border-white/10 xl:block">
        <div>
          <p className="text-[11px] font-semibold uppercase text-gray-400">Responsável</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex-1 text-gray-900 dark:text-white">{d.assignee?.name ?? 'Sem responsável'}</span>
            <button onClick={() => void patch({ assumir: true })} className="btn-secondary text-xs"><UserCheck size={12} />Assumir</button>
          </div>
        </div>

        {v && (
          <div>
            <p className="text-[11px] font-semibold uppercase text-gray-400">Veículo</p>
            <p className="mt-1 text-gray-900 dark:text-white">{[v.brand, v.model, v.version, v.modelYear].filter(Boolean).join(' ')}</p>
            <p className="text-xs text-gray-500">{[v.plate, money(v.salePrice)].filter(Boolean).join(' · ')}</p>
          </div>
        )}
        {d.lead?.vehicleSold && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="font-semibold">Este veículo foi vendido.</p>
            {!!d.lead.similarVehicles?.length && (
              <ul className="mt-1 space-y-0.5">
                {d.lead.similarVehicles.map((s) => <li key={s.id}><Link href={`/estoque/${s.id}`} className="hover:underline">{s.title}</Link>{s.price ? ` · ${money(s.price)}` : ''}</li>)}
              </ul>
            )}
          </div>
        )}

        {d.lead && (
          <div>
            <p className="text-[11px] font-semibold uppercase text-gray-400">Lead</p>
            <p className="mt-1 text-gray-900 dark:text-white">{d.lead.number ? `#${d.lead.number} · ` : ''}{crmStageLabel(d.lead.status)}</p>
            <p className="text-xs text-gray-500">{crmSourceLabel(d.lead.source)}</p>
            {attribution && (
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                Primeiro contato: {touchLabel(attribution.firstTouch, crmSourceLabel)}
                <HelpHint text="Canal e campanha que trouxeram este cliente pela primeira vez. O último contato pode ser de outro canal." />
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          {d.lead && <Link href={`/crm/leads/${d.lead.id}`} className="btn-secondary w-full justify-center text-xs">Abrir lead</Link>}
          {d.lead && !d.lead.convertedDealId && <Link href={`/negociacoes/nova?leadId=${d.lead.id}`} className="btn-primary w-full justify-center text-xs">Nova negociação</Link>}
          {d.lead?.convertedDealId && <Link href={`/negociacoes/${d.lead.convertedDealId}`} className="btn-secondary w-full justify-center text-xs">Ver negociação</Link>}
        </div>
      </aside>
    </div>
  )
}

export default function ConversasPage() {
  return <Suspense fallback={null}><ConversasInner /></Suspense>
}
