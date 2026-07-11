'use client'

// =============================================================================
// Central de Conformidade e Penalidades — Fila de Atendimento
// Área única: Visão Geral · Ocorrências · Penalidades · Restrições · Minha Conformidade
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  AlertTriangle, CheckCircle2, Clock, RefreshCw, RotateCcw, Search,
  Shield, ShieldAlert, ShieldCheck, Sliders, User, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TabId = 'overview' | 'occurrences' | 'penalties' | 'restrictions' | 'my'
const TABS: { id: TabId; label: string; icon: typeof Shield }[] = [
  { id: 'overview',     label: 'Visão Geral',     icon: Shield },
  { id: 'occurrences',  label: 'Ocorrências',      icon: AlertTriangle },
  { id: 'penalties',    label: 'Penalidades',       icon: ShieldAlert },
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
function fmtDT(iso: string) { return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) }

export default function ConformidadePage() {
  const { data: session } = useSession()
  const role = (session?.user as {role?:string})?.role ?? ''
  const isManager = MANAGE_ROLES.includes(role)
  const [tab, setTab] = useState<TabId>('overview')

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

      <div className="flex flex-wrap gap-0.5 border-b border-gray-200 dark:border-white/10">
        {TABS.filter(t => t.id !== 'my' || !isManager).map(t => (
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
        {tab === 'overview'     && <OverviewTab isManager={isManager} />}
        {tab === 'occurrences'  && <OccurrencesTab />}
        {tab === 'penalties'    && <PenaltiesTab isManager={isManager} />}
        {tab === 'restrictions' && <RestrictionsTab />}
        {tab === 'my'           && <MyTab />}
      </div>
    </div>
  )
}

// ── Visão Geral ────────────────────────────────────────────────────────────────
function OverviewTab({ isManager }: { isManager: boolean }) {
  const [data, setData] = useState<{ occurrences: Record<string,number>; penalties: Record<string,unknown>; restrictions: unknown[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/seller-queue/compliance/overview', { credentials: 'include' }).then(x => x.json()).catch(() => null)
    setData(r?.data ?? null)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (loading) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({length:4}).map((_,i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />)}</div>

  const occ = data?.occurrences as { pending:number; confirmed:number; dismissed:number; total:number } | undefined
  const pen = data?.penalties as { active:number; totalActivePoints:number } | undefined
  const restrictions = (data?.restrictions ?? []) as { id:string; sellerName:string; points:number; endsAt:string; reason:string }[]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label:'Ocorrências pendentes', value: occ?.pending ?? 0, cls:'border-amber-200 bg-amber-50 text-amber-700' },
          { label:'Confirmadas no período', value: occ?.confirmed ?? 0, cls:'border-red-200 bg-red-50 text-red-700' },
          { label:'Penalidades ativas', value: pen?.active ?? 0, cls:'border-orange-200 bg-orange-50 text-orange-700' },
          { label:'Pontos ativos (total)', value: pen?.totalActivePoints ?? 0, cls:'border-purple-200 bg-purple-50 text-purple-700' },
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
      <div className="flex justify-end">
        <button onClick={() => void load()} className="btn-secondary text-xs"><RefreshCw size={12} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>
    </div>
  )
}

// ── Ocorrências ────────────────────────────────────────────────────────────────
function OccurrencesTab() {
  const [rows, setRows] = useState<{ id:string; sellerId:string|null; sellerName:string|null; kind:string; severity:string; status:string; detail:string|null; createdAt:string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [decidingId, setDecidingId] = useState<string|null>(null)
  const [decision, setDecision] = useState<'CONFIRMED'|'DISMISSED'>('DISMISSED')
  const [decisionReason, setDecisionReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = filterStatus ? `?status=${filterStatus}` : ''
    const r = await fetch(`/api/seller-queue/compliance/occurrences${qs}`, { credentials: 'include' }).then(x => x.json()).catch(() => null)
    setRows(r?.data ?? [])
    setLoading(false)
  }, [filterStatus])
  useEffect(() => { void load() }, [load])

  const decide = async () => {
    if (!decidingId || !decisionReason.trim()) return
    setBusy(true)
    const res = await fetch(`/api/seller-queue/compliance/occurrences/${decidingId}/decide`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ decision, reason: decisionReason.trim() }) })
    if (res.ok) { setDecidingId(null); setDecisionReason(''); await load() }
    else { const j = await res.json().catch(() => ({} as {error?:string})); alert(j?.error ?? 'Falha.') }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[['','Todas'],['OPEN','Pendentes'],['REVIEWED','Em revisão'],['CONFIRMED','Confirmadas'],['DISMISSED','Descartadas']].map(([v,l]) => (
          <button key={v||'all'} onClick={() => setFilterStatus(v)} className={cn('rounded-lg border px-3 py-1.5 text-[11px] font-medium transition',
            filterStatus === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          )}>{l}</button>
        ))}
        <button onClick={() => void load()} className="ml-auto btn-secondary text-xs"><RefreshCw size={12} className={cn(loading && 'animate-spin')} /></button>
      </div>

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
              return (
                <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-md border px-1.5 py-0.5 text-[9px] font-bold', st.cls)}>{st.label}</span>
                      <span className="text-[10px] font-semibold uppercase text-gray-400">{r.severity}</span>
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{KIND_PT[r.kind] ?? r.kind}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{r.sellerName ?? '—'} · {fmtDT(r.createdAt)}</p>
                    {r.detail && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 line-clamp-2">{r.detail}</p>}
                  </div>
                  {r.status === 'OPEN' && !decidingId && (
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
        <button onClick={() => void load()} className="ml-auto btn-secondary text-xs"><RefreshCw size={12} className={cn(loading && 'animate-spin')} /></button>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
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
                  <td className="px-4 py-2.5 text-[11px] text-gray-500 max-w-[200px] truncate">{r.reason ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-gray-400">{fmtDT(r.createdAt)}</td>
                  <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-[9px] font-semibold', r.active ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500')}>{r.active ? 'Ativa' : 'Inativa'}</span></td>
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
        <button onClick={() => void load()} className="btn-secondary text-xs"><RefreshCw size={12} className={cn(loading && 'animate-spin')} /></button>
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
  const [data, setData] = useState<{ activePoints:number; activeRestriction:unknown; penalties:{ id:string; type:string; points:number; reason:string|null; active:boolean; createdAt:string }[]; occurrences:{ id:string; kind:string; severity:string; status:string; createdAt:string }[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/seller-queue/compliance/my', { credentials: 'include' }).then(x => x.json()).catch(() => null)
    setData(r?.data ?? null)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />

  const pts = data?.activePoints ?? 0
  const restriction = data?.activeRestriction as { endsAt:string; reason:string|null } | null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={cn('rounded-xl border p-4', pts > 0 ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
          <p className="text-3xl font-black tabular-nums">{pts}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider">Pontos ativos</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-3xl font-black text-gray-900 tabular-nums">{data?.penalties?.filter(p => p.active).length ?? 0}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Penalidades ativas</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-3xl font-black text-gray-900 tabular-nums">{data?.occurrences?.filter(o => o.status === 'OPEN').length ?? 0}</p>
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
    </div>
  )
}
