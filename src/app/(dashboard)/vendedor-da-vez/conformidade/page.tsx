'use client'

// =============================================================================
// Central de Conformidade e Penalidades — Fila de Atendimento
// Itens:
//   1. Banner quando compliance está desativado (link p/ configurações)
//   2. Formulário para gestão criar ocorrência manual (favorecimento, manipulação…)
//   3. Recurso de penalidade pelo próprio vendedor (cria pendência para a gestão)
//   4. Config de conformidade existe em /configuracoes (já existia)
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  AlertTriangle, CheckCircle2, Plus, RefreshCw, RotateCcw,
  Settings, Shield, ShieldAlert, ShieldCheck, User, X, FileWarning,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type TabId = 'overview' | 'occurrences' | 'penalties' | 'restrictions' | 'my'
const TABS: { id: TabId; label: string; icon: typeof Shield }[] = [
  { id: 'overview',     label: 'Visão Geral',       icon: Shield },
  { id: 'occurrences',  label: 'Ocorrências',        icon: AlertTriangle },
  { id: 'penalties',    label: 'Penalidades',         icon: ShieldAlert },
  { id: 'restrictions', label: 'Restrições da Fila', icon: ShieldCheck },
  { id: 'my',           label: 'Minha Conformidade', icon: User },
]

const MANAGE_ROLES = ['MASTER','ADM','GERENTE_GERAL','GERENTE_ADMINISTRATIVO','GERENTE','VENDEDOR_LIDER']
const STATUS_PT: Record<string,{label:string;cls:string}> = {
  OPEN:      { label:'Pendente',    cls:'bg-amber-50 text-amber-700 border-amber-200' },
  REVIEWED:  { label:'Em revisão',  cls:'bg-blue-50 text-blue-700 border-blue-200' },
  CONFIRMED: { label:'Confirmada',  cls:'bg-red-50 text-red-700 border-red-200' },
  DISMISSED: { label:'Descartada',  cls:'bg-gray-100 text-gray-500 border-gray-200' },
}
const KIND_PT: Record<string,string> = {
  TIMEOUT:'Timeout de aceite', CHECK_IN_OUTSIDE:'Check-in fora do local', FAKE_CUSTOMER:'Cliente fictício suspeito',
  FAVORITISM:'Favorecimento', IMPROPER_SKIP:'Pulo indevido', DUPLICATE:'Duplicata', OFF_SYSTEM:'Atendimento fora do sistema',
  DISPUTE:'Disputa', MANIPULATION:'Manipulação', OTHER:'Outro',
}
const KIND_OPTIONS = Object.entries(KIND_PT).map(([v,l]) => ({ value: v, label: l }))
function fmtDT(iso: string) { return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) }

export default function ConformidadePage() {
  const { data: session } = useSession()
  const role = (session?.user as {role?:string})?.role ?? ''
  const isManager = MANAGE_ROLES.includes(role)
  const [tab, setTab] = useState<TabId>('overview')
  const [complianceEnabled, setComplianceEnabled] = useState<boolean | null>(null)

  // Busca se compliance está ativo para mostrar banner.
  useEffect(() => {
    fetch('/api/seller-queue/compliance/overview', { credentials: 'include' })
      .then(r => r.json()).then(j => { if (j?.success) setComplianceEnabled(j.data.complianceEnabled ?? false) }).catch(() => {})
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Shield size={20} className="text-brand-600" />Conformidade e Penalidades
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Central de ocorrências, penalidades confirmadas e restrições da fila de atendimento.
        </p>
      </div>

      {/* ── Item 1: Banner de módulo desativado ─────────────────────────────── */}
      {isManager && complianceEnabled === false && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Piloto de conformidade desativado</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">As ocorrências não geram pendências e o ranking não sofre desconto. Para ativar, acesse as configurações da fila.</p>
          </div>
          <Link href="/vendedor-da-vez/configuracoes" className="shrink-0 flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50">
            <Settings size={12} />Ativar
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-0.5 border-b border-gray-200 dark:border-white/10">
        {TABS.filter(t => isManager || t.id === 'my').map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition -mb-px',
              tab === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            )}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
        {!isManager && (
          <button onClick={() => setTab('my')} className={cn('flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition -mb-px', tab === 'my' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            <User size={14} />Minha Conformidade
          </button>
        )}
      </div>

      <div className="mt-2">
        {tab === 'overview'     && <OverviewTab isManager={isManager} onComplianceStatus={setComplianceEnabled} />}
        {tab === 'occurrences'  && <OccurrencesTab isManager={isManager} />}
        {tab === 'penalties'    && <PenaltiesTab isManager={isManager} />}
        {tab === 'restrictions' && <RestrictionsTab />}
        {tab === 'my'           && <MyTab />}
      </div>
    </div>
  )
}

// ── Visão Geral ────────────────────────────────────────────────────────────────
function OverviewTab({ isManager, onComplianceStatus }: { isManager: boolean; onComplianceStatus: (v: boolean) => void }) {
  const [data, setData] = useState<{ complianceEnabled: boolean; occurrences: Record<string,number>; penalties: Record<string,unknown>; restrictions: unknown[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/seller-queue/compliance/overview', { credentials: 'include' }).then(x => x.json()).catch(() => null)
    setData(r?.data ?? null)
    if (r?.data?.complianceEnabled !== undefined) onComplianceStatus(!!r.data.complianceEnabled)
    setLoading(false)
  }, [onComplianceStatus])
  useEffect(() => { void load() }, [load])

  if (loading) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({length:4}).map((_,i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />)}</div>

  const occ = data?.occurrences as { pending:number; confirmed:number; dismissed:number; total:number } | undefined
  const pen = data?.penalties as { active:number; totalActivePoints:number } | undefined
  const restrictions = (data?.restrictions ?? []) as { id:string; sellerName:string; points:number; endsAt:string; reason:string }[]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label:'Ocorrências pendentes', value: occ?.pending ?? 0, cls:'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300' },
          { label:'Confirmadas no período', value: occ?.confirmed ?? 0, cls:'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300' },
          { label:'Penalidades ativas', value: pen?.active ?? 0, cls:'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300' },
          { label:'Pontos ativos (total)', value: pen?.totalActivePoints ?? 0, cls:'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300' },
        ].map(c => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.cls)}>
            <p className="text-2xl font-black tabular-nums">{c.value}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider opacity-80">{c.label}</p>
          </div>
        ))}
      </div>

      {restrictions.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-white dark:border-red-900 dark:bg-slate-900">
          <div className="border-b border-red-100 px-4 py-3 dark:border-red-900/50"><p className="text-sm font-semibold text-red-700 dark:text-red-400">🚫 Restrições ativas da fila</p></div>
          <div className="divide-y divide-gray-50 dark:divide-white/5">
            {restrictions.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{r.sellerName}</span>
                <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">até {fmtDT(r.endsAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {restrictions.length === 0 && !loading && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
          <ShieldCheck size={15} className="mr-1.5 inline" />Nenhum vendedor possui restrição operacional da fila.
        </div>
      )}

      {isManager && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Link href="/vendedor-da-vez/configuracoes" className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:text-gray-800 dark:border-white/10 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-white/20">
            <Settings size={12} />Configurar conformidade
          </Link>
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:border-gray-300 dark:border-white/10 dark:bg-slate-800"><RefreshCw size={12} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      )}
    </div>
  )
}

// ── Ocorrências ────────────────────────────────────────────────────────────────
function OccurrencesTab({ isManager }: { isManager: boolean }) {
  const [rows, setRows] = useState<{ id:string; sellerId:string|null; sellerName:string|null; kind:string; severity:string; status:string; detail:string|null; createdAt:string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [decidingId, setDecidingId] = useState<string|null>(null)
  const [decision, setDecision] = useState<'CONFIRMED'|'DISMISSED'>('DISMISSED')
  const [decisionReason, setDecisionReason] = useState('')
  const [busy, setBusy] = useState(false)

  // ── Item 2: form de criação manual ──
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [sellers, setSellers] = useState<{sellerId:string;name:string}[]>([])
  const [newForm, setNewForm] = useState({ sellerId:'', kind:'FAVORITISM', severity:'MEDIUM', detail:'' })
  const [createBusy, setCreateBusy] = useState(false)
  const [createErr, setCreateErr] = useState<string|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = filterStatus ? `?status=${filterStatus}` : ''
    const r = await fetch(`/api/seller-queue/compliance/occurrences${qs}`, { credentials: 'include' }).then(x => x.json()).catch(() => null)
    setRows(r?.data ?? [])
    setLoading(false)
  }, [filterStatus])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (isManager && showCreateForm && sellers.length === 0) {
      fetch('/api/seller-queue/callable', { credentials: 'include' }).then(r => r.json()).then(j => { if (j?.data) setSellers(j.data) }).catch(() => {})
    }
  }, [isManager, showCreateForm, sellers.length])

  const decide = async () => {
    if (!decidingId || !decisionReason.trim()) return
    setBusy(true)
    const res = await fetch(`/api/seller-queue/compliance/occurrences/${decidingId}/decide`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ decision, reason: decisionReason.trim() }) })
    if (res.ok) { setDecidingId(null); setDecisionReason(''); await load() }
    else { const j = await res.json().catch(() => ({} as {error?:string})); alert(j?.error ?? 'Falha.') }
    setBusy(false)
  }

  const createOccurrence = async () => {
    setCreateErr(null)
    if (!newForm.sellerId) { setCreateErr('Selecione o vendedor.'); return }
    if (!newForm.detail || newForm.detail.trim().length < 10) { setCreateErr('Descreva com pelo menos 10 caracteres.'); return }
    setCreateBusy(true)
    const res = await fetch('/api/seller-queue/compliance/occurrences/create', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify(newForm) })
    const j = await res.json().catch(() => ({} as {error?:string}))
    if (res.ok) { setShowCreateForm(false); setNewForm({ sellerId:'', kind:'FAVORITISM', severity:'MEDIUM', detail:'' }); await load() }
    else setCreateErr(j?.error ?? 'Falha ao registrar.')
    setCreateBusy(false)
  }

  return (
    <div className="space-y-4">
      {/* Filtros e botão criar */}
      <div className="flex flex-wrap items-center gap-2">
        {[['','Todas'],['OPEN','Pendentes'],['REVIEWED','Em revisão'],['CONFIRMED','Confirmadas'],['DISMISSED','Descartadas']].map(([v,l]) => (
          <button key={v||'all'} onClick={() => setFilterStatus(v)} className={cn('rounded-lg border px-3 py-1.5 text-[11px] font-medium transition',
            filterStatus === v ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-300' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/10 dark:bg-slate-800 dark:text-gray-400'
          )}>{l}</button>
        ))}
        {isManager && (
          <button onClick={() => setShowCreateForm(v => !v)} className="ml-auto flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
            <Plus size={12} />Registrar ocorrência
          </button>
        )}
        <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 dark:border-white/10 dark:bg-slate-800"><RefreshCw size={12} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {/* ── Item 2: Formulário de criação manual ─────────────────────────────── */}
      {isManager && showCreateForm && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900/50 dark:bg-brand-950/30 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-brand-800 dark:text-brand-300 flex items-center gap-2"><FileWarning size={15} />Registrar ocorrência manual</p>
            <button onClick={() => { setShowCreateForm(false); setCreateErr(null) }} className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={14} /></button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-700 dark:text-gray-300">Vendedor *</label>
              <select value={newForm.sellerId} onChange={e => setNewForm(f=>({...f,sellerId:e.target.value}))} className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-white/20 dark:bg-slate-700 dark:text-white">
                <option value="">Selecione…</option>
                {sellers.map(s => <option key={s.sellerId} value={s.sellerId}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-700 dark:text-gray-300">Tipo *</label>
              <select value={newForm.kind} onChange={e => setNewForm(f=>({...f,kind:e.target.value}))} className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-white/20 dark:bg-slate-700 dark:text-white">
                {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-700 dark:text-gray-300">Gravidade *</label>
              <select value={newForm.severity} onChange={e => setNewForm(f=>({...f,severity:e.target.value}))} className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-white/20 dark:bg-slate-700 dark:text-white">
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-gray-700 dark:text-gray-300">Descrição do ocorrido *</label>
            <textarea rows={3} value={newForm.detail} onChange={e => setNewForm(f=>({...f,detail:e.target.value}))} placeholder="Descreva o que foi observado (mín. 10 caracteres)…" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs dark:border-white/20 dark:bg-slate-700 dark:text-white" />
          </div>

          {createErr && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">{createErr}</p>}

          <div className="flex gap-2">
            <button onClick={createOccurrence} disabled={createBusy} className="flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {createBusy ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}Registrar
            </button>
            <button onClick={() => { setShowCreateForm(false); setCreateErr(null) }} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs dark:border-white/10">Cancelar</button>
          </div>
        </div>
      )}

      {/* Painel de decisão */}
      {decidingId && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900/50 dark:bg-brand-950/30">
          <p className="mb-2 text-sm font-semibold text-brand-800 dark:text-brand-300">Decisão sobre ocorrência</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {(['CONFIRMED','DISMISSED'] as const).map(d => (
              <button key={d} onClick={() => setDecision(d)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold', decision === d ? (d==='CONFIRMED'?'border-red-500 bg-red-600 text-white':'border-emerald-500 bg-emerald-600 text-white') : 'border-gray-300 bg-white text-gray-700')}>{d==='CONFIRMED'?'Confirmar penalidade':'Descartar ocorrência'}</button>
            ))}
          </div>
          <textarea rows={2} value={decisionReason} onChange={e => setDecisionReason(e.target.value)} placeholder="Motivo obrigatório" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white" />
          <div className="mt-2 flex gap-2">
            <button onClick={() => setDecidingId(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs dark:border-white/10">Cancelar</button>
            <button onClick={decide} disabled={busy || !decisionReason.trim()} className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Confirmar decisão</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
        {loading ? <div className="h-40 animate-pulse" /> : rows.length === 0 ? (
          <div className="py-12 text-center"><AlertTriangle size={28} className="mx-auto mb-2 text-gray-200" strokeWidth={1.5} /><p className="text-sm text-gray-400">Nenhuma ocorrência {filterStatus ? 'com este status' : 'aguarda análise'}.</p></div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-white/5">
            {rows.map(r => {
              const st = STATUS_PT[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' }
              const sevCls = r.severity === 'HIGH' ? 'text-red-600' : r.severity === 'MEDIUM' ? 'text-amber-600' : 'text-gray-400'
              return (
                <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-md border px-1.5 py-0.5 text-[9px] font-bold', st.cls)}>{st.label}</span>
                      <span className={cn('text-[10px] font-bold uppercase', sevCls)}>{r.severity}</span>
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{KIND_PT[r.kind] ?? r.kind}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{r.sellerName ?? '—'} · {fmtDT(r.createdAt)}</p>
                    {r.detail && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 line-clamp-2">{r.detail}</p>}
                  </div>
                  {isManager && r.status === 'OPEN' && !decidingId && (
                    <button onClick={() => setDecidingId(r.id)} className="shrink-0 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-[10px] font-semibold text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
                      Analisar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Penalidades ────────────────────────────────────────────────────────────────
function PenaltiesTab({ isManager }: { isManager: boolean }) {
  const [rows, setRows] = useState<{ id:string; sellerId:string; sellerName:string; type:string; points:number; reason:string|null; active:boolean; createdAt:string; endsAt:string|null }[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyActive, setOnlyActive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/seller-queue/compliance/penalties${onlyActive?'?active=true':''}`, { credentials: 'include' }).then(x => x.json()).catch(() => null)
    setRows(r?.data ?? [])
    setLoading(false)
  }, [onlyActive])
  useEffect(() => { void load() }, [load])

  const reverse = async (id: string, sellerName: string) => {
    const reason = window.prompt(`Estornar pontos de ${sellerName}? Informe o motivo:`)
    if (!reason?.trim()) return
    const res = await fetch(`/api/seller-queue/compliance/penalties/${id}/reverse`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ reason: reason.trim() }) })
    if (res.ok) await load()
    else { const j = await res.json().catch(() => ({} as {error?:string})); alert(j?.error ?? 'Falha.') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} className="rounded border-gray-300 text-brand-600" />Somente ativas</label>
        <button onClick={() => void load()} className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 dark:border-white/10 dark:bg-slate-800"><RefreshCw size={12} className={cn(loading && 'animate-spin')} /></button>
      </div>
      <div className="overflow-x-auto overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
        {loading ? <div className="h-40 animate-pulse" /> : rows.length === 0 ? (
          <div className="py-12 text-center"><ShieldCheck size={28} className="mx-auto mb-2 text-gray-200" strokeWidth={1.5} /><p className="text-sm text-gray-400">Nenhuma penalidade {onlyActive ? 'ativa' : ''} encontrada.</p></div>
        ) : (
          <table className="min-w-full divide-y divide-gray-50 text-sm dark:divide-white/5">
            <thead className="bg-gray-50/80 dark:bg-slate-800/60">
              <tr>{['Vendedor','Tipo','Pontos','Motivo','Data','Status',''].map(h => <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{r.sellerName}</td>
                  <td className="px-4 py-2.5 text-[11px] text-gray-500 dark:text-gray-400">{r.type}</td>
                  <td className="px-4 py-2.5 tabular-nums"><span className={cn('font-bold', r.points < 0 ? 'text-emerald-600' : 'text-red-600')}>{r.points > 0 ? '+' : ''}{r.points}</span></td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-[11px] text-gray-500">{r.reason ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-gray-400">{fmtDT(r.createdAt)}</td>
                  <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-[9px] font-semibold', r.active ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400')}>{r.active ? 'Ativa' : 'Inativa'}</span></td>
                  <td className="px-4 py-2.5">
                    {isManager && r.active && r.points > 0 && (
                      <button onClick={() => void reverse(r.id, r.sellerName)} className="text-[10px] font-medium text-brand-600 hover:underline dark:text-brand-400">Estornar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Restrições da Fila ─────────────────────────────────────────────────────────
function RestrictionsTab() {
  const [restrictions, setRestrictions] = useState<{ id:string; sellerName:string; points:number; reason:string|null; endsAt:string|null; startsAt:string|null }[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/seller-queue/compliance/overview', { credentials: 'include' }).then(x => x.json()).catch(() => null)
    setRestrictions(r?.data?.restrictions ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">Vendedores com restrição operacional ativa na fila de atendimento.</p>
        <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 dark:border-white/10 dark:bg-slate-800"><RefreshCw size={12} className={cn(loading && 'animate-spin')} /></button>
      </div>
      {loading ? <div className="h-40 animate-pulse rounded-xl bg-gray-100" /> : restrictions.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
          <ShieldCheck size={20} className="mx-auto mb-1" />Nenhum vendedor possui restrição operacional da fila agora.
        </div>
      ) : (
        <div className="space-y-2">
          {restrictions.map(r => (
            <div key={r.id} className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-red-900 dark:text-red-200">{r.sellerName}</p>
                <span className="text-[11px] font-medium text-red-600 dark:text-red-400">{r.points} ponto(s)</span>
              </div>
              {r.reason && <p className="mt-0.5 text-[11px] text-red-700 dark:text-red-400">{r.reason}</p>}
              {r.endsAt && <p className="mt-1 text-[10px] tabular-nums text-red-600 dark:text-red-400">Restrição até {fmtDT(r.endsAt)}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Minha Conformidade ─────────────────────────────────────────────────────────
function MyTab() {
  const [data, setData] = useState<{
    activePoints:number; activeRestriction:unknown;
    penalties:{ id:string; type:string; points:number; reason:string|null; active:boolean; createdAt:string }[];
    occurrences:{ id:string; kind:string; severity:string; status:string; createdAt:string }[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  // ── Item 3: recurso de penalidade ──
  const [appealingId, setAppealingId] = useState<string|null>(null)
  const [appealReason, setAppealReason] = useState('')
  const [appealBusy, setAppealBusy] = useState(false)
  const [appealMsg, setAppealMsg] = useState<{ok:boolean;text:string}|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/seller-queue/compliance/my', { credentials: 'include' }).then(x => x.json()).catch(() => null)
    setData(r?.data ?? null)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const submitAppeal = async () => {
    if (!appealingId || appealReason.trim().length < 10) return
    setAppealBusy(true)
    const res = await fetch(`/api/seller-queue/compliance/penalties/${appealingId}/appeal`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ reason: appealReason.trim() }) })
    const j = await res.json().catch(() => ({} as {error?:string; data?:{protocol?:string}}))
    if (res.ok) {
      setAppealMsg({ ok:true, text: `Recurso enviado com sucesso. Protocolo: ${j.data?.protocol ?? '—'}` })
      setAppealingId(null); setAppealReason('')
    } else setAppealMsg({ ok:false, text: j?.error ?? 'Falha ao enviar recurso.' })
    setAppealBusy(false)
    setTimeout(() => setAppealMsg(null), 6000)
  }

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />

  const pts = data?.activePoints ?? 0
  const restriction = data?.activeRestriction as { endsAt:string; reason:string|null } | null
  const activePenalties = (data?.penalties ?? []).filter(p => p.active && p.points > 0)

  return (
    <div className="space-y-4">
      {appealMsg && (
        <div className={cn('flex items-center gap-2 rounded-lg px-4 py-3 text-sm', appealMsg.ok ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400' : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400')}>
          {appealMsg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {appealMsg.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={cn('rounded-xl border p-4', pts > 0 ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400')}>
          <p className="text-3xl font-black tabular-nums">{pts}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider">Pontos ativos</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800">
          <p className="text-3xl font-black text-gray-900 tabular-nums dark:text-white">{data?.penalties?.filter(p => p.active).length ?? 0}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Penalidades ativas</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800">
          <p className="text-3xl font-black text-gray-900 tabular-nums dark:text-white">{data?.occurrences?.filter(o => o.status === 'OPEN').length ?? 0}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Ocorrências pendentes</p>
        </div>
      </div>

      {restriction && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/20">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">🚫 Restrição operacional ativa</p>
          {(restriction as {reason:string|null}).reason && <p className="mt-0.5 text-xs text-red-600">{(restriction as {reason:string|null}).reason}</p>}
          <p className="mt-0.5 text-[11px] tabular-nums text-red-600 dark:text-red-400">Válida até {fmtDT((restriction as {endsAt:string}).endsAt)}</p>
        </div>
      )}

      {/* ── Item 3: Recurso de penalidade ──────────────────────────────────── */}
      {activePenalties.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
          <p className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900 dark:border-white/5 dark:text-white">Penalidades ativas</p>
          {activePenalties.map(p => (
            <div key={p.id} className="border-b border-gray-50 px-4 py-3 last:border-0 dark:border-white/5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-red-600">+{p.points} pts</span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{p.type}</span>
                    <span className="text-[10px] tabular-nums text-gray-400">{fmtDT(p.createdAt)}</span>
                  </div>
                  {p.reason && <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">{p.reason}</p>}
                </div>
                {!appealingId && (
                  <button onClick={() => { setAppealingId(p.id); setAppealReason('') }} className="shrink-0 flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[10px] font-semibold text-gray-600 hover:border-brand-400 hover:text-brand-700 dark:border-white/10 dark:bg-slate-800 dark:hover:border-brand-700">
                    <RotateCcw size={10} />Recorrer
                  </button>
                )}
              </div>

              {/* Form de recurso inline */}
              {appealingId === p.id && (
                <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/60 p-3 space-y-2 dark:border-brand-900/40 dark:bg-brand-950/20">
                  <p className="text-[11px] font-semibold text-brand-800 dark:text-brand-300">Solicitar revisão desta penalidade</p>
                  <textarea rows={3} value={appealReason} onChange={e => setAppealReason(e.target.value)} placeholder="Descreva o motivo do seu recurso (mín. 10 caracteres)…" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs dark:border-white/20 dark:bg-slate-700 dark:text-white" />
                  <p className="text-[10px] text-gray-400">Seu recurso gera uma pendência para a gestão analisar. Você receberá uma notificação quando for revisado.</p>
                  <div className="flex gap-2">
                    <button onClick={submitAppeal} disabled={appealBusy || appealReason.trim().length < 10} className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                      {appealBusy ? <RefreshCw size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}Enviar recurso
                    </button>
                    <button onClick={() => { setAppealingId(null); setAppealReason('') }} className="rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] dark:border-white/10">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(data?.occurrences ?? []).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
          <p className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900 dark:border-white/5 dark:text-white">Minhas ocorrências</p>
          {data!.occurrences.map(o => {
            const st = STATUS_PT[o.status] ?? { label: o.status, cls: '' }
            return (
              <div key={o.id} className="flex items-center justify-between border-b border-gray-50 px-4 py-2.5 last:border-0 dark:border-white/5 text-sm">
                <span className="text-gray-700 dark:text-gray-300">{KIND_PT[o.kind] ?? o.kind}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] tabular-nums text-gray-400">{fmtDT(o.createdAt)}</span>
                  <span className={cn('rounded border px-1.5 py-0.5 text-[9px] font-bold', st.cls)}>{st.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!restriction && pts === 0 && (data?.occurrences ?? []).length === 0 && activePenalties.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <ShieldCheck size={28} className="mx-auto mb-2 text-emerald-500" />
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Tudo em ordem</p>
          <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">Nenhuma ocorrência ou penalidade ativa no seu histórico.</p>
        </div>
      )}
    </div>
  )
}
