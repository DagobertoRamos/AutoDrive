'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Calendar, Car, ChevronLeft, ChevronRight, Loader2, MoreVertical, RefreshCw, Search, Trash2, User, X } from 'lucide-react'
import { crmSourceLabel, crmTemperature, CRM_TEMPERATURES } from '@/lib/crm/shared'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface LeadTag { id: string; name: string; color: string | null }
interface LeadVehicle { brand: string | null; model: string | null; version: string | null; plate: string | null; year: number | null }
interface LeadDeal { id: string; dealNumber: string | null; status: string }
interface LeadNextTask { id: string; type: string; dueAt: string; isToday: boolean; isOverdue: boolean }
interface LeadRow {
  id: string; leadNumber: number | null; name: string | null; phone: string | null; source: string | null
  status: string; assignedToUserName: string | null; unitName: string | null
  temperature: string | null; tags: LeadTag[]; vehicle: LeadVehicle | null; vehicleLabel: string | null
  deal: LeadDeal | null; nextTask: LeadNextTask | null; createdAt: string
}
interface StageCfg { code: string; displayName: string; color: string; order: number; active: boolean }
interface CrmCtx {
  scope: string; sellers: { id: string; name: string | null }[]; units: { id: string; name: string }[]
  canDelete?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtTask(iso: string, isToday: boolean, isOverdue: boolean) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (isOverdue) return `Atrasada desde ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`
  if (isToday)   return `Hoje às ${time}`
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `Amanhã às ${time}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`
}
function plateDisplay(plate: string | null | undefined) {
  if (!plate) return null
  const p = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return p.length === 7 ? p.slice(0, 3) + '-' + p.slice(3) : p
}

// ── Temperature badge ─────────────────────────────────────────────────────────
function TempBadge({ value }: { value: string | null }) {
  if (!value || value === 'UNCLASSIFIED') return null
  const t = CRM_TEMPERATURES.find(x => x.value === value)
  if (!t) return null
  return (
    <span
      className={cn('rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', t.badge)}
      style={{ fontSize: '9px' }}
    >
      {t.label}
    </span>
  )
}

// ── Context menu (3 dots) ─────────────────────────────────────────────────────
function CardMenu({ lead, canDelete, onDelete }: { lead: LeadRow; canDelete: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const escape  = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', escape) }
  }, [])
  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        aria-label={`Mais ações do lead${lead.leadNumber ? ` #${lead.leadNumber}` : ''}`}
        aria-haspopup="menu" aria-expanded={open}
        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-600 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-7 z-30 min-w-[140px] rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-slate-800"
        >
          <Link
            href={`/crm/leads/${lead.id}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-slate-700"
          >
            Ver lead
          </Link>
          {canDelete && (
            <button
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete() }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 size={12} />Excluir lead
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────
function DeleteModal({ lead, onClose, onDeleted }: { lead: LeadRow; onClose: () => void; onDeleted: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState('')
  const confirm = async () => {
    if (reason.trim().length < 5) { setErr('Informe o motivo (mín. 5 caracteres).'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error ?? 'Falha ao excluir.'); return }
      onDeleted()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            Excluir lead{lead.leadNumber ? ` #${lead.leadNumber}` : ''}?
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={16} /></button>
        </div>
        {lead.name && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{lead.name}</p>}
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">O histórico e as atividades serão preservados para auditoria. Esta ação não apaga negociações vinculadas.</p>
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Motivo *</span>
          <textarea
            value={reason} onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder="Informe o motivo da exclusão"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/20 dark:bg-slate-700 dark:text-white"
          />
        </label>
        {err && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300">Cancelar</button>
          <button onClick={confirm} disabled={busy} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Excluindo…' : 'Excluir lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────────────────────────
function LeadCard({ row, canDelete, onRefresh }: { row: LeadRow; canDelete: boolean; onRefresh: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const vehicleLine = row.vehicle
    ? [row.vehicle.brand, row.vehicle.model, row.vehicle.version].filter(Boolean).join(' ') || null
    : null
  const plate = plateDisplay(row.vehicle?.plate)
  const hasTask = !!row.nextTask

  return (
    <div className="lead-card group relative rounded-xl border border-gray-100 bg-white p-3 dark:border-white/8 dark:bg-slate-800">
      {deleting && <DeleteModal lead={row} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); onRefresh() }} />}

      {/* Cabeçalho: número + temperatura + menu */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-mono font-medium text-gray-400 dark:text-gray-500">
          {row.leadNumber ? `#${row.leadNumber}` : `…${row.id.slice(-6)}`}
        </span>
        <div className="flex items-center gap-1">
          <TempBadge value={row.temperature} />
          <CardMenu lead={row} canDelete={canDelete} onDelete={() => setDeleting(true)} />
        </div>
      </div>

      {/* Nome do cliente */}
      <p className="mt-1.5 line-clamp-2 font-semibold leading-snug text-gray-900 dark:text-white" style={{ fontSize: '13px' }} title={row.name ?? undefined}>
        {row.name ?? <span className="font-normal text-gray-400 dark:text-gray-500 italic">Cliente não identificado</span>}
      </p>

      {/* Veículo */}
      {vehicleLine ? (
        <div className="mt-2 flex items-start gap-1.5">
          <Car size={11} className="mt-0.5 shrink-0 text-gray-400" />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-300" title={vehicleLine}>{vehicleLine}</p>
            {plate && <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{plate}</p>}
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] italic text-gray-300 dark:text-gray-600">Sem veículo informado</p>
      )}

      {/* Próxima tarefa / visita */}
      {hasTask && (
        <div className={cn('mt-2 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium',
          row.nextTask!.isOverdue ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' :
          row.nextTask!.isToday   ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' :
                                    'bg-gray-50 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
        )}>
          <Calendar size={10} className="shrink-0" />
          {fmtTask(row.nextTask!.dueAt, row.nextTask!.isToday, row.nextTask!.isOverdue)}
        </div>
      )}

      {/* Data de criação */}
      <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
        Criado {fmtDate(row.createdAt)}
      </p>

      {/* Etiquetas */}
      {row.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {row.tags.slice(0, 2).map(t => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300" title={t.name}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.color ?? '#9ca3af' }} />
              <span className="max-w-[70px] truncate">{t.name}</span>
            </span>
          ))}
          {row.tags.length > 2 && (
            <span className="rounded-full border border-gray-100 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-400 dark:border-white/10 dark:bg-slate-700"
              title={row.tags.slice(2).map(t => t.name).join(', ')}>
              +{row.tags.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Responsável e origem */}
      <p className="mt-2 truncate text-[10px] text-gray-500 dark:text-gray-400" title={[row.assignedToUserName, crmSourceLabel(row.source)].filter(Boolean).join(' · ')}>
        {row.assignedToUserName && <><User size={9} className="inline mr-0.5" />{row.assignedToUserName}</>}
        {row.assignedToUserName && row.source && ' · '}
        {crmSourceLabel(row.source)}
      </p>

      {/* Ações */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Link href={`/crm/leads/${row.id}`}
          className="flex-1 rounded-lg border border-sky-200 bg-sky-50 py-1.5 text-center text-[10px] font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300">
          Ver detalhes
        </Link>
        {row.deal && (
          <Link href={`/negociacoes/${row.deal.id}`}
            className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 py-1.5 text-center text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
            title={`Negociação ${row.deal.dealNumber ?? ''}`}
          >
            {row.deal.dealNumber ? `${row.deal.dealNumber}` : 'Ver negociação'}
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CrmKanbanPage() {
  const [ctx, setCtx]           = useState<CrmCtx | null>(null)
  const [rows, setRows]         = useState<LeadRow[]>([])
  const [stages, setStages]     = useState<StageCfg[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [debSearch, setDebSearch] = useState('')
  const [fSeller, setFSeller]   = useState('')
  const [fUnit, setFUnit]       = useState('')
  const boardRef = useRef<HTMLDivElement>(null)
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = (v: string) => {
    setSearch(v)
    if (debTimer.current) clearTimeout(debTimer.current)
    debTimer.current = setTimeout(() => setDebSearch(v), 350)
  }

  useEffect(() => {
    fetch('/api/crm/context', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j?.data) {
          // crm.lead.delete: verifica via scope (gerente+ já tem; permissão fina via UserModule)
          setCtx({ ...j.data, canDelete: ['all'].includes(j.data.scope) })
        }
      }).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ perPage: '200' })
      if (debSearch) params.set('search', debSearch)
      if (fSeller)   params.set('assignedToUserId', fSeller)
      if (fUnit)     params.set('unitId', fUnit)
      const [leadsRes, stagesRes] = await Promise.all([
        fetch(`/api/crm/leads?${params}`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
        fetch('/api/crm/config/stages', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      ])
      setRows(leadsRes?.data ?? [])
      const st: StageCfg[] = (stagesRes?.data ?? []).filter((s: StageCfg) => s.active).sort((a: StageCfg, b: StageCfg) => a.order - b.order)
      setStages(st)
    } finally { setLoading(false) }
  }, [debSearch, fSeller, fUnit])

  useEffect(() => { void load() }, [load])

  const moveLead = async (leadId: string, nextStatus: string) => {
    setError(null); setMovingId(leadId)
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: nextStatus, lostReason: nextStatus === 'LOST' ? 'Movido no Kanban' : undefined }),
      })
      const json = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) { setError(json?.error ?? 'Não foi possível mover o card.'); return }
      await load()
    } finally { setMovingId(null) }
  }

  const scrollBoard = (dir: -1 | 1) => boardRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  const codes = stages.map(s => s.code)
  const canDelete = !!ctx?.canDelete

  return (
    <div className="kanban-root flex flex-col" style={{ margin: '-0.75rem', height: 'calc(100dvh - 56px)' }}>
      <style>{`
        @media (min-width: 640px) { .kanban-root { margin: -1rem; } }
        @media (min-width: 1024px) { .kanban-root { margin: -1.5rem; height: calc(100dvh - 64px); } }
        .kanban-board::-webkit-scrollbar { height: 6px; }
        .kanban-board::-webkit-scrollbar-thumb { background: #c1c7d0; border-radius: 3px; }
        .dark .kanban-board::-webkit-scrollbar-thumb { background: #3d4555; }
        .col-cards::-webkit-scrollbar { width: 4px; }
        .col-cards::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
        .dark .col-cards::-webkit-scrollbar-thumb { background: #374151; }
        .lead-card { transition: box-shadow 0.15s, transform 0.15s; }
        .lead-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-1px); }
        .dark .lead-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
      `}</style>

      {/* Barra superior */}
      <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-gray-200/70 bg-white/80 px-4 py-2 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-[15px] font-semibold text-gray-900 dark:text-white">Pipeline CRM</h1>
            <p className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
              {loading ? 'Carregando…' : `${rows.length} leads · ${stages.length} etapas`}
            </p>
          </div>

          {ctx && ctx.sellers.length > 0 && (
            <div className="flex items-center gap-1">
              <User size={12} className="text-gray-400" />
              <select value={fSeller} onChange={e => setFSeller(e.target.value)}
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-gray-200">
                <option value="">Todos</option>
                {ctx.sellers.map(s => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
              </select>
            </div>
          )}
          {ctx && ctx.units.length > 0 && (
            <select value={fUnit} onChange={e => setFUnit(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-gray-200">
              <option value="">Todas unidades</option>
              {ctx.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>

        {/* Busca unificada */}
        <div className="relative w-full sm:max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          {loading && debSearch && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
          {search && !loading && (
            <button onClick={() => { setSearch(''); setDebSearch('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>
          )}
          <input
            value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar leads…"
            className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-8 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {error && <span className="max-w-[300px] truncate rounded-md bg-red-50 px-3 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</span>}
          <button onClick={() => scrollBoard(-1)} className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-400">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => scrollBoard(1)} className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-400">
            <ChevronRight size={15} />
          </button>
          <button onClick={() => void load()} disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-300">
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />Atualizar
          </button>
        </div>
      </div>

      {/* Board */}
      <div ref={boardRef} className="kanban-board flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-4 py-3"
        style={{ background: 'var(--kb-bg,#EDF0F5)' }}>
        <style>{`
          @media (prefers-color-scheme:dark){:root{--kb-bg:#0f1117}}
          :root[data-theme="dark"]{--kb-bg:#0f1117}
          :root[data-theme="light"]{--kb-bg:#EDF0F5}
        `}</style>

        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex w-[260px] flex-none flex-col rounded-xl bg-white shadow-sm dark:bg-slate-800" style={{ minHeight: 160 }}>
              <div className="border-t-[3px] rounded-t-xl p-3 pb-2" style={{ borderTopColor: '#e5e7eb' }}>
                <div className="h-2 w-20 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
              </div>
              <div className="flex-1 space-y-2 p-2">
                {Array.from({ length: i === 2 ? 3 : 1 }).map((_, j) => (
                  <div key={j} className="rounded-xl bg-gray-100 p-3 dark:bg-slate-700/60">
                    <div className="mb-1.5 h-3 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-slate-600" />
                    <div className="h-2 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-slate-600/60" />
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          stages.map((stage) => {
            const stageRows = rows.filter(r => r.status === stage.code)
            return (
              <div key={stage.code} className="flex flex-none flex-col rounded-xl shadow-sm"
                style={{ flex: '1 1 0', minWidth: 240, maxWidth: 320, background: 'white' }}>
                {/* Cabeçalho */}
                <div className="kanban-col-header flex-none rounded-t-xl border-t-[3px] bg-white/95 px-3 pt-3 pb-2 dark:bg-slate-800/95"
                  style={{ borderTopColor: stage.color }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white" style={{ background: stage.color }}>
                        {stageRows.length}
                      </span>
                      <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-700 dark:text-gray-300" title={stage.displayName}>
                        {stage.displayName}
                      </h2>
                    </div>
                  </div>
                </div>

                {/* Lista de cards */}
                <div className="col-cards flex-1 space-y-2 overflow-y-auto rounded-b-xl bg-gray-50/60 p-2 dark:bg-slate-800/60" style={{ minHeight: 0 }}>
                  {stageRows.length === 0 ? (
                    <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-white/10">
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">Sem leads</p>
                    </div>
                  ) : stageRows.map(row => (
                    <LeadCard key={row.id} row={row} canDelete={canDelete} onRefresh={load} />
                  ))}
                </div>
              </div>
            )
          })
        )}
        <div className="flex-none w-1" aria-hidden />
      </div>
    </div>
  )
}
