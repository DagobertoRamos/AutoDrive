'use client'

// =============================================================================
// Central de Qualidade — Score global de atendimento, leads e procedimentos.
// Abas: Visão Geral · Eventos · Aplicar · Meu Score
// Layout análogo ao de Conformidade para consistência visual.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Plus, RefreshCw, RotateCcw, Settings, Shield, ShieldCheck, Star, TrendingDown, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

// ── Constantes de tipos disponíveis para o formulário de aplicação manual ──
const MANUAL_TYPE_OPTIONS = [
  { value: 'ATTENDANCE_NOT_FINALIZED',   label: 'Atendimento não finalizado',       category: 'Atendimento' },
  { value: 'ATTENDANCE_NO_REGISTRATION', label: 'Cliente não cadastrado',            category: 'Atendimento' },
  { value: 'ADMIN_PROCEDURE_MISSED',     label: 'Procedimento não seguido',          category: 'Administrativo' },
  { value: 'ADMIN_DEADLINE_MISSED',      label: 'Prazo administrativo perdido',      category: 'Administrativo' },
  { value: 'LEAD_NOT_FED_SYSTEM',        label: 'Sistema não alimentado',            category: 'Leads' },
  { value: 'LEAD_CLIENT_WAITING',        label: 'Cliente de lead aguardando',        category: 'Leads' },
  { value: 'MANUAL_WARNING',             label: 'Aviso formal',                      category: 'Manual' },
  { value: 'MANUAL_PENALTY',             label: 'Penalidade manual (específica)',    category: 'Manual' },
  { value: 'MANUAL_REVERSAL',            label: 'Estorno / correção (positivo)',     category: 'Manual' },
]
const CATEGORY_PT: Record<string,string> = { PENDENCY:'Pendências', LEAD:'Leads', ATTENDANCE:'Atendimento', ADMIN:'Administrativo', QUEUE:'Fila', MANUAL:'Manual' }
const MANAGE_ROLES = ['MASTER','ADM','GERENTE_GERAL','GERENTE_ADMINISTRATIVO','GERENTE','VENDEDOR_LIDER']

type TabId = 'overview' | 'events' | 'apply' | 'my'

function fmtDT(iso: string) { return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) }
function fmtPts(pts: number) {
  if (pts > 0) return <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+{pts}</span>
  if (pts < 0) return <span className="font-bold tabular-nums text-red-600 dark:text-red-400">{pts}</span>
  return <span className="font-bold tabular-nums text-gray-500">0</span>
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
    : score >= -10  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
    : score >= -30  ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800'
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-sm font-black tabular-nums', cls)}>
      {score > 0 ? '+' : ''}{score}
    </span>
  )
}

export default function QualidadePage() {
  const { data: session } = useSession()
  const role = (session?.user as {role?:string})?.role ?? ''
  const isManager = MANAGE_ROLES.includes(role)
  const [tab, setTab] = useState<TabId>(isManager ? 'overview' : 'my')

  const TABS: {id:TabId;label:string;icon:typeof Shield;managerOnly?:boolean}[] = [
    { id:'overview', label:'Visão Geral',   icon:Shield,        managerOnly:true },
    { id:'events',   label:'Eventos',        icon:TrendingDown,  managerOnly:true },
    { id:'apply',    label:'Aplicar',        icon:AlertTriangle, managerOnly:true },
    { id:'my',       label:'Meu Score',      icon:User },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Star size={20} className="text-brand-600" />Score de Qualidade
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Pontuação global de qualidade: atendimento, leads, pendências e procedimentos administrativos.
        </p>
      </div>

      <div className="flex flex-wrap gap-0.5 border-b border-gray-200 dark:border-white/10">
        {TABS.filter(t => !t.managerOnly || isManager).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition -mb-px',
              tab === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400')}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {tab === 'overview' && isManager && <OverviewTab />}
        {tab === 'events'   && isManager && <EventsTab isManager={isManager} />}
        {tab === 'apply'    && isManager && <ApplyTab />}
        {tab === 'my'       && <MyScoreTab />}
      </div>
    </div>
  )
}

// ── Visão Geral ────────────────────────────────────────────────────────────────
function OverviewTab() {
  const [data, setData] = useState<{enabled:boolean;scorePeriodDays:number;thresholds:Record<string,number>;sellers:{sellerId:string;sellerName:string;total:number;eventCount:number;restrictions:{action:string;label:string}[]}[]}|null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/quality/overview', { credentials:'include' }).then(x=>x.json()).catch(()=>null)
    setData(r?.data ?? null)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (loading) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({length:4}).map((_,i)=><div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800"/>)}</div>

  if (!data?.enabled) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/40 dark:bg-amber-950/20">
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Sistema de qualidade desativado</p>
      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Ative nas configurações da fila para começar a monitorar o score dos vendedores.</p>
      <Link href="/vendedor-da-vez/configuracoes" className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        <Settings size={12} />Ir para configurações
      </Link>
    </div>
  )

  const sellers = data.sellers ?? []
  const withRestrictions = sellers.filter(s => s.restrictions.length > 0)
  const totalEvents = sellers.reduce((a,s) => a + s.eventCount, 0)
  const avgScore = sellers.length ? Math.round(sellers.reduce((a,s)=>a+s.total,0) / sellers.length) : 0

  return (
    <div className="space-y-5">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label:'Vendedores monitorados', value: sellers.length,           cls:'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-300' },
          { label:'Com restrições ativas',  value: withRestrictions.length,  cls:'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300' },
          { label:'Score médio',            value: avgScore,                 cls:'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300' },
          { label:'Eventos no período',     value: totalEvents,              cls:'border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-slate-800 dark:text-gray-300' },
        ].map(c => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.cls)}>
            <p className="text-2xl font-black tabular-nums">{c.value}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider opacity-80">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Tabela de vendedores */}
      <div className="overflow-x-auto overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Ranking de qualidade — {data.scorePeriodDays} dias</p>
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 dark:border-white/10"><RefreshCw size={11} />Atualizar</button>
        </div>
        {sellers.length === 0 ? (
          <div className="py-12 text-center"><ShieldCheck size={28} className="mx-auto mb-2 text-gray-200" strokeWidth={1.5}/><p className="text-sm text-gray-400">Nenhum evento de qualidade registrado no período.</p></div>
        ) : (
          <table className="min-w-full divide-y divide-gray-50 text-sm dark:divide-white/5">
            <thead className="bg-gray-50/80 dark:bg-slate-800/60">
              <tr>{['#','Vendedor','Score','Eventos','Restrições',''].map((h,i)=><th key={i} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {sellers.map((s, idx) => (
                <tr key={s.sellerId} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-gray-400">{idx+1}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{s.sellerName}</td>
                  <td className="px-4 py-2.5">{fmtPts(s.total)}</td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-gray-500">{s.eventCount}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {s.restrictions.slice(0,2).map(r=>(
                        <span key={r.action} className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-400">{r.label}</span>
                      ))}
                      {s.restrictions.length > 2 && <span className="text-[10px] text-gray-400">+{s.restrictions.length-2}</span>}
                      {s.restrictions.length === 0 && <span className="text-[10px] text-emerald-600">✓ Sem restrições</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/vendedor-da-vez/qualidade?seller=${s.sellerId}`} className="text-[10px] font-medium text-brand-600 hover:underline dark:text-brand-400">Ver eventos</Link>
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

// ── Eventos ────────────────────────────────────────────────────────────────────
function EventsTab({ isManager }: { isManager: boolean }) {
  const [rows, setRows] = useState<{id:string;sellerId:string;sellerName:string;category:string;type:string;typeLabel:string;points:number;reason:string;appliedAt:string;active:boolean;reversedAt:string|null}[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyActive, setOnlyActive] = useState(false)
  const [sellerId, setSellerId] = useState('')
  const [reversingId, setReversingId] = useState<string|null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (onlyActive) qs.set('active','true')
    if (sellerId)   qs.set('sellerId', sellerId)
    const r = await fetch(`/api/quality/events?${qs}`, { credentials:'include' }).then(x=>x.json()).catch(()=>null)
    setRows(r?.data ?? [])
    setLoading(false)
  }, [onlyActive, sellerId])
  useEffect(() => { void load() }, [load])

  const reverse = async () => {
    if (!reversingId || reverseReason.trim().length < 5) return
    setBusy(true)
    const res = await fetch(`/api/quality/events/${reversingId}/reverse`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ reason: reverseReason.trim() }) })
    if (res.ok) { setReversingId(null); setReverseReason(''); await load() }
    else { const j = await res.json().catch(()=>({} as {error?:string})); alert(j?.error ?? 'Falha.') }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={onlyActive} onChange={e=>setOnlyActive(e.target.checked)} className="rounded border-gray-300 text-brand-600"/>Somente ativos</label>
        <input value={sellerId} onChange={e=>setSellerId(e.target.value)} placeholder="Filtrar por ID do vendedor…" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs dark:border-white/20 dark:bg-slate-800 dark:text-white w-52" />
        <button onClick={()=>void load()} className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 dark:border-white/10 dark:bg-slate-800"><RefreshCw size={11} className={cn(loading&&'animate-spin')}/></button>
      </div>

      {reversingId && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 space-y-2 dark:border-brand-900/50 dark:bg-brand-950/30">
          <p className="text-sm font-semibold text-brand-800 dark:text-brand-300">Estornar evento</p>
          <input value={reverseReason} onChange={e=>setReverseReason(e.target.value)} placeholder="Motivo do estorno (mín. 5 caracteres)…" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs dark:border-white/20 dark:bg-slate-700 dark:text-white" />
          <div className="flex gap-2">
            <button onClick={reverse} disabled={busy||reverseReason.trim().length<5} className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{busy?<RefreshCw size={10} className="animate-spin"/>:<CheckCircle2 size={10}/>}Estornar</button>
            <button onClick={()=>{setReversingId(null);setReverseReason('')}} className="text-xs text-gray-500">Cancelar</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
        {loading ? <div className="h-40 animate-pulse"/> : rows.length === 0 ? (
          <div className="py-12 text-center"><TrendingDown size={28} className="mx-auto mb-2 text-gray-200" strokeWidth={1.5}/><p className="text-sm text-gray-400">Nenhum evento encontrado.</p></div>
        ) : (
          <table className="min-w-full divide-y divide-gray-50 text-sm dark:divide-white/5">
            <thead className="bg-gray-50/80 dark:bg-slate-800/60">
              <tr>{['Vendedor','Categoria','Tipo','Pontos','Motivo','Data','Status',''].map((h,i)=><th key={i} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{r.sellerName}</td>
                  <td className="px-4 py-2.5 text-[11px] text-gray-500">{CATEGORY_PT[r.category]??r.category}</td>
                  <td className="max-w-[150px] truncate px-4 py-2.5 text-[11px] text-gray-600 dark:text-gray-400">{r.typeLabel}</td>
                  <td className="px-4 py-2.5">{fmtPts(r.points)}</td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-[11px] text-gray-500">{r.reason}</td>
                  <td className="px-4 py-2.5 text-[11px] tabular-nums text-gray-400">{fmtDT(r.appliedAt)}</td>
                  <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-[9px] font-semibold', r.active&&!r.reversedAt?'bg-red-50 text-red-700':'bg-gray-100 text-gray-500 line-through')}>{r.active&&!r.reversedAt?'Ativo':'Estornado'}</span></td>
                  <td className="px-4 py-2.5">
                    {isManager && r.active && !r.reversedAt && r.points < 0 && !reversingId && (
                      <button onClick={()=>{setReversingId(r.id);setReverseReason('')}} className="text-[10px] font-medium text-brand-600 hover:underline dark:text-brand-400">Estornar</button>
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

// ── Aplicar evento manual ──────────────────────────────────────────────────────
function ApplyTab() {
  const [sellers, setSellers] = useState<{sellerId:string;name:string}[]>([])
  const [form, setForm] = useState({ sellerId:'', type:'MANUAL_PENALTY', reason:'', points:'', appliedAt:'' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ok:boolean;text:string}|null>(null)

  useEffect(() => {
    fetch('/api/seller-queue/callable', { credentials:'include' }).then(r=>r.json()).then(j=>{ if(j?.data) setSellers(j.data) }).catch(()=>{})
  }, [])

  const selType = MANUAL_TYPE_OPTIONS.find(o => o.value === form.type)
  const isReversal = form.type === 'MANUAL_REVERSAL'

  const submit = async () => {
    if (!form.sellerId || !form.reason.trim() || form.reason.trim().length < 5) { setMsg({ ok:false, text:'Preencha vendedor e motivo (mín. 5 chars).' }); return }
    setBusy(true); setMsg(null)
    const body: Record<string,unknown> = { sellerId: form.sellerId, type: form.type, reason: form.reason.trim() }
    if (form.points) body.points = Number(form.points) * (isReversal ? 1 : -1) // reversal = positivo, penalidade = negativo
    if (form.appliedAt) body.appliedAt = new Date(form.appliedAt).toISOString()
    const res = await fetch('/api/quality/events', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify(body) })
    const j = await res.json().catch(()=>({} as {error?:string;data?:{sellerName?:string;points?:number}}))
    if (res.ok) {
      const sellerName = j.data?.sellerName ?? 'vendedor'
      const pts = j.data?.points ?? 0
      setMsg({ ok:true, text:`Evento aplicado para ${sellerName}: ${pts > 0 ? '+' : ''}${pts} ponto(s).` })
      setForm(f=>({...f, sellerId:'', reason:'', points:'', appliedAt:''}))
    } else setMsg({ ok:false, text: j?.error ?? 'Falha ao aplicar.' })
    setBusy(false)
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 dark:border-white/10 dark:bg-slate-900">
        <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500"/>Aplicar evento de qualidade</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Eventos de penalidade descontam pontos (sinal negativo). Estornos devolvem pontos (sinal positivo). Suporta data retroativa.</p>

        {msg && (
          <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm', msg.ok?'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400':'border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400')}>
            {msg.ok?<CheckCircle2 size={14}/>:<AlertTriangle size={14}/>}{msg.text}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">Vendedor *</label>
            <select value={form.sellerId} onChange={e=>setForm(f=>({...f,sellerId:e.target.value}))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white">
              <option value="">Selecione o vendedor…</option>
              {sellers.map(s=><option key={s.sellerId} value={s.sellerId}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">Tipo de evento *</label>
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white">
              {['Atendimento','Administrativo','Leads','Manual'].map(cat => (
                <optgroup key={cat} label={cat}>
                  {MANUAL_TYPE_OPTIONS.filter(o=>o.category===cat).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
            {selType && <p className="mt-1 text-[11px] text-gray-400">Categoria: {selType.category} {isReversal ? '— pontos positivos (verde)' : '— desconta pontos'}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">Pontos {isReversal ? '(positivo — padrão: 10)' : '(negativo — padrão do tipo)'}</label>
            <input type="number" value={form.points} onChange={e=>setForm(f=>({...f,points:e.target.value}))} placeholder="Deixe vazio para usar o padrão do tipo" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white" />
            <p className="mt-0.5 text-[11px] text-gray-400">Informe o valor absoluto; o sistema aplica o sinal correto automaticamente.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">Motivo / descrição do ocorrido *</label>
            <textarea rows={3} value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} placeholder="Ex: Não cadastrou e não finalizou 4 atendimentos no dia 10/07, confirmado pessoalmente…" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white"/>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">Data de aplicação (retroativo — opcional)</label>
            <input type="datetime-local" value={form.appliedAt} onChange={e=>setForm(f=>({...f,appliedAt:e.target.value}))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white"/>
            <p className="mt-0.5 text-[11px] text-gray-400">Deixe vazio para aplicar na data/hora atual. Para retroativo (ex.: ontem), informe a data.</p>
          </div>

          <button onClick={submit} disabled={busy||!form.sellerId||form.reason.trim().length<5} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy?<RefreshCw size={14} className="animate-spin"/>:<Plus size={14}/>}
            {isReversal ? 'Aplicar estorno (pontos +)' : 'Aplicar penalidade (pontos −)'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Meu Score ──────────────────────────────────────────────────────────────────
function MyScoreTab() {
  const [data, setData] = useState<{
    enabled:boolean; score:number; breakdown:{category:string;label:string;points:number;eventCount:number}[];
    restrictions:{action:string;label:string;message:string}[];
    periodDays:number; unresolvedPendencies:{exceeded:boolean;count:number;max:number};
    recentEvents:{id:string;category:string;type:string;typeLabel:string;points:number;reason:string;appliedAt:string;active:boolean;reversedAt:string|null}[]
  }|null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/quality/my', { credentials:'include' }).then(x=>x.json()).catch(()=>null)
    setData(r?.data ?? null)
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  if (loading) return <div className="h-60 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800"/>

  if (!data?.enabled) return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-white/10 dark:bg-slate-900">
      <ShieldCheck size={32} className="mx-auto mb-2 text-gray-200"/>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sistema de qualidade não ativo</p>
      <p className="mt-1 text-xs text-gray-400">A gestão pode ativar nas configurações da fila.</p>
    </div>
  )

  const score = data.score
  const events = showAll ? data.recentEvents : data.recentEvents.slice(0, 10)
  const activeRestrictions = data.restrictions.filter(r => r.action.startsWith('BLOCK') || r.action === 'WARN')

  return (
    <div className="space-y-4">
      {/* Score e restrições */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={cn('rounded-xl border p-4', score >= 0 ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : score >= -10 ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30')}>
          <div className="flex items-end gap-1">
            <p className={cn('text-3xl font-black tabular-nums', score >= 0 ? 'text-emerald-700 dark:text-emerald-400' : score >= -10 ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400')}>
              {score > 0 ? '+' : ''}{score}
            </p>
          </div>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Score ({data.periodDays}d)</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800">
          <p className="text-3xl font-black text-gray-900 tabular-nums dark:text-white">{data.unresolvedPendencies.count}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Pendências abertas</p>
          {data.unresolvedPendencies.exceeded && <p className="mt-1 text-[10px] text-red-600">Limite de {data.unresolvedPendencies.max} atingido!</p>}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800">
          <p className="text-3xl font-black text-gray-900 tabular-nums dark:text-white">{activeRestrictions.length}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Restrições ativas</p>
        </div>
      </div>

      {/* Restrições */}
      {activeRestrictions.length > 0 && (
        <div className="space-y-2">
          {activeRestrictions.map(r => (
            <div key={r.action} className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/20">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">🚫 {r.label}</p>
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{r.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Breakdown por categoria */}
      {data.breakdown.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
          <p className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900 dark:border-white/5 dark:text-white">Por categoria</p>
          {data.breakdown.map(b => (
            <div key={b.category} className="flex items-center justify-between border-b border-gray-50 px-4 py-2.5 last:border-0 dark:border-white/5">
              <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{b.label}</p>
                <p className="text-[10px] text-gray-400">{b.eventCount} evento(s)</p>
              </div>
              {fmtPts(b.points)}
            </div>
          ))}
        </div>
      )}

      {/* Histórico de eventos */}
      {data.recentEvents.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-900">
          <p className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900 dark:border-white/5 dark:text-white">Histórico recente</p>
          {events.map(e => (
            <div key={e.id} className="flex items-start justify-between border-b border-gray-50 px-4 py-2.5 last:border-0 dark:border-white/5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {fmtPts(e.points)}
                  <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{e.typeLabel}</span>
                  {e.reversedAt && <span className="rounded bg-gray-100 px-1 text-[9px] text-gray-500 line-through">estornado</span>}
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400 line-clamp-1">{e.reason}</p>
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-gray-400">{fmtDT(e.appliedAt)}</span>
            </div>
          ))}
          {data.recentEvents.length > 10 && (
            <button onClick={() => setShowAll(v=>!v)} className="flex w-full items-center justify-center gap-1 border-t border-gray-100 py-2.5 text-xs text-gray-500 hover:text-gray-700 dark:border-white/5">
              {showAll ? <><ChevronUp size={12}/>Mostrar menos</> : <><ChevronDown size={12}/>Ver todos ({data.recentEvents.length})</>}
            </button>
          )}
        </div>
      )}

      {score === 0 && data.recentEvents.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
          <Star size={28} className="mx-auto mb-2 text-emerald-500"/>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Score perfeito</p>
          <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-500">Nenhum evento de qualidade nos últimos {data.periodDays} dias.</p>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 dark:border-white/10 dark:bg-slate-800"><RefreshCw size={11}/>Atualizar</button>
      </div>
    </div>
  )
}
