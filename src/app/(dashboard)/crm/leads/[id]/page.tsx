'use client'

// =============================================================================
// CRM Workspace 360° do Lead — Fase A
// Cabeçalho fixo + abas (Resumo | Histórico | Atividades | Veículos | Negociações)
// Transferência (próprio ou gestão) · Interações · Resumo comercial · Visitas
// Veículos de interesse · Negociações vinculadas · Temperatura · Etiquetas
// =============================================================================

import Link from 'next/link'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Calendar, Car, CheckCircle2, ChevronDown, ChevronRight,
  Clock, FileText, Handshake, Loader2, MessageSquare, MoreVertical, Phone,
  Plus, RefreshCw, Tag as TagIcon, Thermometer, User, X, XCircle,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { CRM_TEMPERATURES, CRM_STAGE_OPTIONS, crmSourceLabel, crmTemperature } from '@/lib/crm/shared'

// ── Types ─────────────────────────────────────────────────────────────────────
interface LeadTag    { id: string; name: string; color: string | null }
interface VisitItem  { id: string; scheduledAt: string; status: string; objective: string | null; vehicleRef: string | null; clientConfirmed: boolean }
interface VehicleItem { id: string; vehicleId: string | null; brand: string | null; model: string | null; version: string | null; plate: string | null; isPrimary: boolean; status: string; interest: string; removedAt: string | null }
interface DealLink   { id: string; dealId: string; isPrimary: boolean; linkedAt: string; deal: { id: string; dealNumber: string | null; status: string; type: string } | null }
interface Summary    { id: string; version: number; objective: string | null; desiredVehicle: string | null; hasTradeIn: boolean; narrative: string | null; authorName: string | null; createdAt: string }
interface Interaction { id: string; type: string; channel: string | null; result: string | null; summary: string | null; authorName: string | null; occurredAt: string }
interface Task        { id: string; type: string; title: string; status: string; dueAt: string | null; notes: string | null; assignedToUserName: string | null }
interface TimelineItem { id: string; at: string; type: string; title: string; detail: string | null; actorName: string | null }

interface LeadDetail {
  id: string; leadNumber: number | null; name: string | null; phone: string | null; email: string | null
  source: string | null; status: string; notes: string | null; lostReason: string | null
  assignedToUserId: string | null; assignedToUserName: string | null; unitId: string | null; unitName: string | null
  customerId: string | null; vehicleId: string | null; convertedDealId: string | null
  lastContactAt: string | null; createdAt: string; updatedAt: string; temperature: string | null
}

interface Workspace {
  nextVisit: VisitItem | null
  vehicleInterests: VehicleItem[]
  linkedDeals: DealLink[]
  latestSummary: Summary | null
}

interface Payload {
  lead: LeadDetail; tags: LeadTag[]; availableTags: LeadTag[]
  workspace: Workspace
  tasks: Task[]; timeline: TimelineItem[]
  relations: { customer: { name: string | null } | null; deal: { dealNumber: string | null } | null }
}

type Tab = 'summary' | 'history' | 'activities' | 'vehicles' | 'deals'
const TABS: { id: Tab; label: string }[] = [
  { id: 'summary',    label: 'Resumo' },
  { id: 'history',    label: 'Histórico' },
  { id: 'activities', label: 'Atividades' },
  { id: 'vehicles',   label: 'Veículos' },
  { id: 'deals',      label: 'Negociações' },
]

const INT_TYPES = ['CALL','WHATSAPP','EMAIL','NOTE','VISIT','PROPOSAL','FINANCING','NEGOTIATION','ATTENDANCE','NO_CONTACT','OTHER']
const INT_LABELS: Record<string,string> = { CALL:'Ligação', WHATSAPP:'WhatsApp', EMAIL:'E-mail', NOTE:'Nota interna', VISIT:'Visita', PROPOSAL:'Proposta', FINANCING:'Financiamento', NEGOTIATION:'Negociação', ATTENDANCE:'Atendimento presencial', NO_CONTACT:'Sem contato', OTHER:'Outro' }
const INT_RESULTS = ['NO_ANSWER','INVALID_NUMBER','MESSAGE_SENT','AWAITING_RESPONSE','CONTACT_MADE','PROPOSAL_SENT','VISIT_SCHEDULED','VISIT_DONE','FINANCING_STARTED','NO_INTEREST','LOST','CONVERTED','OTHER']
const RESULT_LABELS: Record<string,string> = { NO_ANSWER:'Não atendeu', INVALID_NUMBER:'Número inválido', MESSAGE_SENT:'Mensagem enviada', AWAITING_RESPONSE:'Aguardando resposta', CONTACT_MADE:'Contato realizado', PROPOSAL_SENT:'Proposta enviada', VISIT_SCHEDULED:'Visita agendada', VISIT_DONE:'Visita realizada', FINANCING_STARTED:'Financiamento iniciado', NO_INTEREST:'Sem interesse', LOST:'Perdido para concorrente', CONVERTED:'Convertido', OTHER:'Outro' }
const TRANSFER_REASONS = [['CLIENT_REQUEST','Solicitação do cliente'],['SELLER_EXPERTISE','Especialidade do vendedor'],['ABSENCE','Ausência'],['UNIT_CHANGE','Mudança de unidade'],['OVERLOAD','Sobrecarga'],['DISTRIBUTION_ERROR','Erro de distribuição'],['MANAGEMENT_REQUEST','Solicitação gerencial'],['OTHER','Outro']]

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDT = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'

// ── Transfer modal ─────────────────────────────────────────────────────────────
function TransferModal({ leadId, currentName, onClose, onDone }: { leadId: string; currentName: string | null; onClose: () => void; onDone: () => void }) {
  const [sellers, setSellers] = useState<{ id: string; name: string | null }[]>([])
  const [toUserId, setToUserId] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/crm/context', { credentials: 'include' }).then(r => r.json()).then(j => setSellers(j?.data?.sellers ?? [])).catch(() => {})
  }, [])

  const submit = async () => {
    if (!toUserId) { setErr('Selecione o novo responsável.'); return }
    if (!reason)  { setErr('Informe o motivo.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/transfer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ toUserId, reason, note, transferTasks: true, transferVisits: true }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error ?? 'Falha ao transferir.'); return }
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 dark:text-white">Transferir lead</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="mb-4 text-[11px] text-gray-500 dark:text-gray-400">Responsável atual: <b>{currentName ?? '—'}</b></p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Novo responsável *</label>
            <select value={toUserId} onChange={e => setToUserId(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white">
              <option value="">— Selecione —</option>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Motivo *</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white">
              <option value="">— Selecione —</option>
              {TRANSFER_REASONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Observação</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white" />
          </div>
          <p className="text-[10px] text-gray-400">Tarefas abertas e visitas futuras também serão transferidas.</p>
          {err && <p className="text-[11px] text-red-600">{err}</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm dark:border-white/10 dark:text-gray-300">Cancelar</button>
          <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Transferir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Interaction form ───────────────────────────────────────────────────────────
function InteractionForm({ leadId, onSaved }: { leadId: string; onSaved: () => void }) {
  const [type, setType] = useState('NOTE')
  const [result, setResult] = useState('')
  const [summary, setSummary] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [nextActionAt, setNextActionAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/interactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ type, result: result || null, summary: summary || null, nextAction: nextAction || null, nextActionAt: nextActionAt || null, occurredAt: new Date().toISOString() }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error ?? 'Falha ao registrar.'); return }
      setSummary(''); setResult(''); setNextAction(''); setNextActionAt('')
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><MessageSquare size={15} />Registrar interação</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Tipo</label>
          <select value={type} onChange={e => setType(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm dark:border-white/10 dark:bg-slate-700 dark:text-white">
            {INT_TYPES.map(t => <option key={t} value={t}>{INT_LABELS[t] ?? t}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Resultado</label>
          <select value={result} onChange={e => setResult(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm dark:border-white/10 dark:bg-slate-700 dark:text-white">
            <option value="">— opcional —</option>
            {INT_RESULTS.map(r => <option key={r} value={r}>{RESULT_LABELS[r] ?? r}</option>)}
          </select>
        </div>
      </div>
      <textarea rows={3} value={summary} onChange={e => setSummary(e.target.value)} placeholder="O que aconteceu? (objeções, interesse, proposta…)" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-700 dark:text-white dark:placeholder-gray-500" />
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Próxima ação (opcional)" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-700 dark:text-white" />
        <input type="datetime-local" value={nextActionAt} onChange={e => setNextActionAt(e.target.value)} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-700 dark:text-white" />
      </div>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      <button onClick={save} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}Registrar
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LeadWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = use(params)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('summary')
  const [showTransfer, setShowTransfer] = useState(false)
  const [showInteraction, setShowInteraction] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!leadId) return
    setLoading(true)
    try {
      const [pRes, iRes] = await Promise.all([
        fetch(`/api/crm/leads/${leadId}`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
        fetch(`/api/crm/leads/${leadId}/interactions?perPage=30`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      ])
      if (pRes?.data) setPayload(pRes.data as Payload)
      if (iRes?.data) setInteractions(iRes.data as Interaction[])
    } finally { setLoading(false) }
  }, [leadId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [])

  const patchLead = async (body: Record<string, unknown>) => {
    await fetch(`/api/crm/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
    void load()
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-brand-600" /></div>
  )
  if (!payload) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center"><p className="text-red-700">Lead não encontrado ou sem acesso.</p><Link href="/crm/leads" className="mt-4 inline-block text-sm text-brand-600 hover:underline">← Voltar para leads</Link></div>
  )

  const { lead, tags, availableTags, workspace, tasks, timeline, relations } = payload
  const temp = crmTemperature(lead.temperature)
  const pendingTasks = tasks?.filter(t => t.status === 'PENDING') ?? []
  const hasTemp = lead.temperature && lead.temperature !== 'UNCLASSIFIED'

  return (
    <div className="space-y-4">
      {showTransfer && <TransferModal leadId={leadId} currentName={lead.assignedToUserName} onClose={() => setShowTransfer(false)} onDone={() => { setShowTransfer(false); void load() }} />}

      {/* ── Cabeçalho ── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {/* Barra de identidade */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/5">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/crm/leads" className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={18} /></Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {lead.leadNumber && <span className="font-mono text-xs text-gray-400 dark:text-gray-500">#{lead.leadNumber}</span>}
                <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">{lead.name ?? lead.phone ?? 'Lead sem identificação'}</h1>
                {hasTemp && (
                  <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', temp.badge)}>{temp.label}</span>
                )}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><User size={10} />{lead.assignedToUserName ?? 'Sem responsável'}</span>
                {lead.unitName && <span>· {lead.unitName}</span>}
                <span>· {crmSourceLabel(lead.source)}</span>
              </p>
            </div>
          </div>

          {/* Ações principais */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { setShowInteraction(v => !v); setTab('summary') }} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
              <MessageSquare size={13} />Interação
            </button>
            <button onClick={() => setTab('activities')} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-300">
              <Calendar size={13} />Visita
            </button>
            <button onClick={() => setTab('deals')} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-300">
              <Handshake size={13} />Negociação
            </button>

            {/* Menu ⋮ */}
            <div ref={menuRef} className="relative">
              <button onClick={() => setMenuOpen(v => !v)} aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menuOpen} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-400">
                <MoreVertical size={15} />
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-9 z-30 min-w-[180px] rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-slate-800">
                  {[
                    ['Transferir lead', () => { setMenuOpen(false); setShowTransfer(true) }],
                    ['Editar lead', () => { setMenuOpen(false) }],
                  ].map(([label, action]) => (
                    <button key={String(label)} role="menuitem" onClick={() => (action as () => void)()} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-700">{String(label)}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => void load()} disabled={loading} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-400">
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Barra de status + etapa */}
        <div className="flex flex-wrap items-center gap-4 px-5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Etapa</span>
            <select value={lead.status} onChange={e => void patchLead({ status: e.target.value })} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-700 dark:text-gray-200">
              {CRM_STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Temperatura */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Temp.</span>
            <div className="flex gap-1">
              {CRM_TEMPERATURES.filter(t => t.value !== 'UNCLASSIFIED').map(t => (
                <button key={t.value} onClick={() => void patchLead({ metadata: { temperature: t.value } })} title={t.label}
                  className={cn('h-5 w-5 rounded-full border-2 transition', lead.temperature === t.value ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-105')}
                  style={{ background: t.color }} />
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap items-center gap-1">
            {tags.map(t => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-gray-100 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color ?? '#9ca3af' }} />{t.name}
              </span>
            ))}
          </div>

          {/* Próxima visita */}
          {workspace.nextVisit && (
            <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              <Calendar size={11} />Visita {fmtDT(workspace.nextVisit.scheduledAt)}
            </span>
          )}

          {/* Deal vinculado */}
          {relations.deal?.dealNumber && (
            <Link href={`/negociacoes/${lead.convertedDealId}`} className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400">
              <Handshake size={11} />{relations.deal.dealNumber}
            </Link>
          )}

          <div className="ml-auto text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
            {lead.lastContactAt ? `Último contato ${fmtDT(lead.lastContactAt)}` : `Criado ${fmtDT(lead.createdAt)}`}
          </div>
        </div>
      </div>

      {/* ── Interação rápida (colapsável) ── */}
      {showInteraction && (
        <div className="relative">
          <button onClick={() => setShowInteraction(false)} className="absolute right-3 top-3 z-10 text-gray-400 hover:text-gray-600"><X size={14} /></button>
          <InteractionForm leadId={leadId} onSaved={() => { setShowInteraction(false); void load() }} />
        </div>
      )}

      {/* ── Abas ── */}
      <div>
        <div className="flex gap-0.5 overflow-x-auto border-b border-gray-200 dark:border-white/10">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('flex-none px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition',
                tab === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {/* ── Tab: Resumo ── */}
          {tab === 'summary' && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Dados do lead */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Dados do lead</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                  {[
                    ['Cliente', lead.name],
                    ['Telefone', lead.phone],
                    ['E-mail', lead.email],
                    ['Origem', crmSourceLabel(lead.source)],
                    ['Criado em', fmtDT(lead.createdAt)],
                    ['Responsável', lead.assignedToUserName],
                    ['Unidade', lead.unitName],
                    ['Cliente vinculado', relations.customer?.name],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{k}</dt>
                      <dd className="text-gray-700 dark:text-gray-300 truncate">{v ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
                {lead.notes && (
                  <div className="mt-3 rounded-lg bg-gray-50 p-3 text-[12px] text-gray-600 dark:bg-slate-800 dark:text-gray-300">{lead.notes}</div>
                )}
              </div>

              {/* Resumo comercial */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><FileText size={15} />Resumo comercial</h3>
                  <Link href={`/crm/leads/${leadId}#summary-edit`} className="text-[11px] text-brand-600 hover:underline">Editar</Link>
                </div>
                {workspace.latestSummary ? (
                  <div className="space-y-2 text-[12px]">
                    {workspace.latestSummary.objective && <p className="text-gray-700 dark:text-gray-300"><b>Objetivo:</b> {workspace.latestSummary.objective}</p>}
                    {workspace.latestSummary.desiredVehicle && <p className="text-gray-700 dark:text-gray-300"><b>Veículo desejado:</b> {workspace.latestSummary.desiredVehicle}</p>}
                    {workspace.latestSummary.hasTradeIn && <p className="text-amber-700 dark:text-amber-400 font-medium">Possui veículo de troca</p>}
                    {workspace.latestSummary.narrative && <p className="mt-2 rounded-lg bg-gray-50 p-3 text-gray-600 dark:bg-slate-800 dark:text-gray-300">{workspace.latestSummary.narrative}</p>}
                    <p className="text-[10px] text-gray-400">v{workspace.latestSummary.version} · por {workspace.latestSummary.authorName} · {fmtDT(workspace.latestSummary.createdAt)}</p>
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-400 italic">Nenhum resumo registrado ainda.</p>
                )}
              </div>

              {/* Tarefas pendentes */}
              {pendingTasks.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                  <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2"><Clock size={14} />Próximas ações ({pendingTasks.length})</h3>
                  {pendingTasks.slice(0, 3).map(t => (
                    <div key={t.id} className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-gray-700 dark:text-gray-300 truncate">{t.title}</span>
                      {t.dueAt && <span className="ml-2 shrink-0 tabular-nums text-gray-500">{fmtDT(t.dueAt)}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Veículo de interesse principal */}
              {workspace.vehicleInterests.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                  <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Car size={14} />Veículo de interesse</h3>
                  {workspace.vehicleInterests.slice(0, 2).map(v => (
                    <div key={v.id} className="mb-2 flex items-center gap-2 text-[12px]">
                      {v.isPrimary && <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">Principal</span>}
                      <span className="text-gray-700 dark:text-gray-300">{[v.brand, v.model, v.version].filter(Boolean).join(' ')}</span>
                      {v.plate && <span className="font-mono text-[10px] text-gray-400">{v.plate}</span>}
                    </div>
                  ))}
                  {workspace.vehicleInterests.length > 2 && <p className="text-[11px] text-gray-400">+{workspace.vehicleInterests.length - 2} mais</p>}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Histórico ── */}
          {tab === 'history' && (
            <div className="space-y-2">
              {[...interactions.map(i => ({ id: 'i_'+i.id, at: i.occurredAt, type: i.type, title: INT_LABELS[i.type] ?? i.type, detail: i.summary, actorName: i.authorName })),
                ...(timeline ?? [])
              ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).map((ev, idx) => (
                <div key={ev.id+idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-brand-400" />
                    <div className="w-0.5 flex-1 bg-gray-100 dark:bg-slate-700 my-1" />
                  </div>
                  <div className="pb-3 min-w-0 flex-1">
                    <p className="text-[11px] text-gray-400 tabular-nums">{fmtDT(ev.at)}{ev.actorName ? ` · ${ev.actorName}` : ''}</p>
                    <p className="text-[13px] font-medium text-gray-900 dark:text-white">{ev.title}</p>
                    {ev.detail && <p className="mt-0.5 text-[12px] text-gray-600 dark:text-gray-300 line-clamp-3">{ev.detail}</p>}
                  </div>
                </div>
              ))}
              {(!interactions.length && !timeline?.length) && <p className="py-12 text-center text-sm text-gray-400">Nenhum histórico registrado.</p>}
            </div>
          )}

          {/* ── Tab: Atividades ── */}
          {tab === 'activities' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Visitas e tarefas</h3>
                <button onClick={() => setShowInteraction(true)} className="flex items-center gap-1 text-xs text-brand-600 hover:underline"><Plus size={12} />Registrar</button>
              </div>
              {workspace.nextVisit && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400">Próxima visita</p>
                  <p className="mt-1 text-sm font-bold text-green-900 dark:text-green-200">{fmtDT(workspace.nextVisit.scheduledAt)}</p>
                  {workspace.nextVisit.objective && <p className="text-[12px] text-green-700 dark:text-green-400">{workspace.nextVisit.objective}</p>}
                  {workspace.nextVisit.vehicleRef && <p className="mt-1 flex items-center gap-1 text-[11px] text-green-600"><Car size={10} />{workspace.nextVisit.vehicleRef}</p>}
                </div>
              )}
              {tasks?.map(t => (
                <div key={t.id} className={cn('rounded-xl border p-3 text-[12px]', t.status === 'DONE' ? 'border-gray-100 bg-gray-50 opacity-60 dark:border-white/5 dark:bg-slate-800/40' : 'border-gray-200 bg-white dark:border-white/10 dark:bg-slate-800')}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-900 dark:text-white">{t.title}</p>
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-semibold', t.status === 'DONE' ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>{t.status === 'DONE' ? 'Concluída' : 'Pendente'}</span>
                  </div>
                  {t.dueAt && <p className="mt-0.5 text-gray-500 tabular-nums">{fmtDT(t.dueAt)}</p>}
                </div>
              ))}
              {!tasks?.length && !workspace.nextVisit && <p className="py-8 text-center text-sm text-gray-400">Nenhuma atividade registrada.</p>}
            </div>
          )}

          {/* ── Tab: Veículos ── */}
          {tab === 'vehicles' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Veículos de interesse</h3>
                <button className="flex items-center gap-1 text-xs text-brand-600 hover:underline"><Plus size={12} />Adicionar</button>
              </div>
              {workspace.vehicleInterests.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Nenhum veículo de interesse cadastrado.</p>
              ) : workspace.vehicleInterests.map(v => (
                <div key={v.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-slate-800">
                  <Car size={20} className="shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">{[v.brand, v.model, v.version].filter(Boolean).join(' ') || 'Veículo não especificado'}</p>
                    {v.plate && <p className="font-mono text-[11px] text-gray-400">{v.plate}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {v.isPrimary && <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">Principal</span>}
                    <span className="text-[10px] text-gray-400">{v.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Tab: Negociações ── */}
          {tab === 'deals' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Negociações vinculadas</h3>
                <Link href={`/negociacoes/nova?leadId=${leadId}`} className="flex items-center gap-1 text-xs text-brand-600 hover:underline"><Plus size={12} />Nova negociação</Link>
              </div>
              {workspace.linkedDeals.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Nenhuma negociação vinculada.</p>
              ) : workspace.linkedDeals.map(dl => (
                <div key={dl.id} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-slate-800">
                  <Handshake size={18} className="shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">{dl.deal?.dealNumber ?? `NEG-${dl.dealId.slice(-8)}`}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{dl.deal?.status ?? '—'} · {dl.deal?.type ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {dl.isPrimary && <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">Principal</span>}
                    {dl.deal && <Link href={`/negociacoes/${dl.dealId}`} className="text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400">Abrir →</Link>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
