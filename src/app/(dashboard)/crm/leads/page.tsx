'use client'

// =============================================================================
// CRM — Lista de Leads. Filtros adaptam ao escopo do usuário:
//   'own'  → vendedor vê só os próprios; sem filtro de responsável ou unidade.
//   'unit' → gerente / líder habilitado vê a unidade; filtra por responsável.
//   'all'  → ADM/GG vê tudo; filtra por responsável E unidade.
// Escopo enforçado no SERVIDOR; a UI só exibe o que o scope permite.
// =============================================================================

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2, ChevronLeft, ChevronRight, Clock, Filter, Loader2,
  Phone, Plus, RefreshCw, Search, Sliders, X, XCircle,
} from 'lucide-react'
import { CRM_TEMPERATURES, CRM_STAGE_OPTIONS, crmPriorityLabel, crmPriorityTone, crmSourceLabel, crmTemperature } from '@/lib/crm/shared'
import { cn } from '@/lib/utils'

interface LeadTag { id: string; name: string; color: string | null }
interface LeadRow {
  id: string; name: string | null; phone: string | null; email: string | null
  source: string | null; status: string; unitName: string | null
  assignedToUserName: string | null; convertedDealId: string | null
  lastContactAt: string | null; priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'
  temperature: string | null; tags: LeadTag[]; vehicleLabel: string | null
  createdAt: string
}
interface Meta { total: number; page: number; perPage: number; totalPages: number; scope: string }
interface CrmCtx {
  scope: 'own' | 'unit' | 'all'
  userId: string; userName: string | null; unitId: string | null
  sellers: { id: string; name: string | null; role: string }[]
  units: { id: string; name: string }[]
}

const SOURCE_OPTIONS = [
  { value: 'MANUAL',           label: 'Manual' },
  { value: 'FILA_ATENDIMENTO', label: 'Fila de atendimento' },
  { value: 'SDR',              label: 'SDR' },
  { value: 'WHATSAPP',         label: 'WhatsApp' },
  { value: 'WEBSITE',          label: 'Website' },
  { value: 'WEBMOTORS',        label: 'Webmotors' },
  { value: 'AUTOCONF',         label: 'AutoConf' },
  { value: 'EMAIL',            label: 'E-mail' },
]

const PRIORITY_OPTIONS = [
  { value: 'URGENT', label: 'Urgente', tone: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'HIGH',   label: 'Alta',    tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'NORMAL', label: 'Normal',  tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'LOW',    label: 'Baixa',   tone: 'bg-gray-50 text-gray-600 border-gray-200' },
]

const TEMP_OPTIONS = CRM_TEMPERATURES.filter(t => t.value !== 'UNCLASSIFIED')

// ─ Chip de filtro rápido ─────────────────────────────────────────────────────
function Chip({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all',
        active
          ? 'border-gray-800 bg-gray-800 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-white/15 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
      )}
      style={active && color ? { background: color, borderColor: color } : {}}
    >
      {label}
    </button>
  )
}

// ─ Componente principal ───────────────────────────────────────────────────────
export default function CrmLeadsPage() {
  const [ctx, setCtx] = useState<CrmCtx | null>(null)
  const [rows, setRows]       = useState<LeadRow[]>([])
  const [meta, setMeta]       = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [ctxLoading, setCtxLoading] = useState(true)
  const [page, setPage]       = useState(1)

  // Filtros
  const [search, setSearch]       = useState('')
  const [debSearch, setDebSearch] = useState('')
  const [fStatus, setFStatus]     = useState('')
  const [fSource, setFSource]     = useState('')
  const [fPriority, setFPriority] = useState('')
  const [fTemp, setFTemp]         = useState('')
  const [fSeller, setFSeller]     = useState('')
  const [fUnit, setFUnit]         = useState('')
  const [panelOpen, setPanelOpen] = useState(false)

  // Criação rápida
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving]   = useState(false)

  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = (v: string) => {
    setSearch(v)
    if (debTimer.current) clearTimeout(debTimer.current)
    debTimer.current = setTimeout(() => setDebSearch(v), 350)
  }

  // Carrega contexto (scope + listas de filtros) uma vez
  useEffect(() => {
    fetch('/api/crm/context', { credentials: 'include' })
      .then(r => r.json()).then((j) => { if (j?.data) setCtx(j.data) }).catch(() => {})
      .finally(() => setCtxLoading(false))
  }, [])

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), perPage: '25' })
      if (debSearch)  params.set('search', debSearch)
      if (fStatus)    params.set('status', fStatus)
      if (fSource)    params.set('source', fSource)
      if (fPriority)  params.set('priority', fPriority)
      if (fTemp)      params.set('temperature', fTemp)
      if (fSeller)    params.set('assignedToUserId', fSeller)
      if (fUnit)      params.set('unitId', fUnit)
      const res  = await fetch(`/api/crm/leads?${params}`, { credentials: 'include' })
      const json = await res.json().catch(() => null) as { data?: LeadRow[]; meta?: Meta } | null
      setRows(json?.data ?? [])
      setMeta(json?.meta ?? null)
    } finally { setLoading(false) }
  }, [debSearch, fStatus, fSource, fPriority, fTemp, fSeller, fUnit])

  useEffect(() => { setPage(1); void load(1) }, [load])

  const goPage = (p: number) => { setPage(p); void load(p) }

  const activeCount = [fStatus, fSource, fPriority, fTemp, fSeller, fUnit].filter(Boolean).length
  const clearAll = () => { setFStatus(''); setFSource(''); setFPriority(''); setFTemp(''); setFSeller(''); setFUnit('') }

  const patchLead = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/crm/leads/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(body),
    })
    void load(page)
  }

  const createLead = async () => {
    if (!newName && !newPhone) return
    setSaving(true)
    try {
      await fetch('/api/crm/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: newName || null, phone: newPhone || null, source: 'MANUAL' }),
      })
      setNewName(''); setNewPhone(''); setShowNew(false); setPage(1); void load(1)
    } finally { setSaving(false) }
  }

  const scope = ctx?.scope ?? 'own'
  const canFilterSeller = scope !== 'own'
  const canFilterUnit   = scope === 'all'

  // ─ Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Leads CRM</h1>
          <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
            {!ctxLoading && (
              scope === 'all'  ? 'Todos os leads da empresa' :
              scope === 'unit' ? 'Leads da sua unidade' :
                                 'Seus leads'
            )}
            {!loading && meta && <> · <span className="tabular-nums">{meta.total.toLocaleString('pt-BR')}</span> {activeCount > 0 ? 'com filtros ativos' : 'total'}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load(page)} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />Atualizar
          </button>
          <button onClick={() => setShowNew(v => !v)} className="btn-primary text-xs">
            <Plus size={13} />Novo lead
          </button>
        </div>
      </div>

      {/* Criação rápida */}
      {showNew && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 dark:border-brand-900/50 dark:bg-brand-950/40">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Nome</label>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nome do cliente"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/20 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Telefone</label>
            <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void createLead()}
              placeholder="(11) 9.9999-9999"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/20 dark:bg-slate-800 dark:text-white" />
          </div>
          <button onClick={() => void createLead()} disabled={saving || (!newName && !newPhone)} className="btn-primary text-sm">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Criar
          </button>
          <button onClick={() => setShowNew(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"><X size={15} /></button>
        </div>
      )}

      {/* ── Área de busca + filtros ── */}
      <div className="space-y-2">

        {/* Linha 1: busca + botão de filtros */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            {loading && debSearch && (
              <Loader2 size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
            )}
            {search && !loading && (
              <button onClick={() => { setSearch(''); setDebSearch('') }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
            <input
              value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Buscar por nome, telefone, e-mail, placa, carro, notas…"
              className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/15 dark:bg-slate-800 dark:text-white dark:placeholder-gray-500 dark:focus:ring-brand-900"
            />
          </div>

          <button
            onClick={() => setPanelOpen(v => !v)}
            className={cn(
              'flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition',
              panelOpen || activeCount > 0
                ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/15 dark:bg-slate-800 dark:text-gray-300'
            )}
          >
            <Sliders size={15} />
            <span className="hidden sm:inline">Filtros</span>
            {activeCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Linha 2: chips de etapa (acesso rápido — sempre visível) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip label="Todos" active={!fStatus} onClick={() => setFStatus('')} />
          {CRM_STAGE_OPTIONS.map(s => (
            <Chip key={s.value} label={s.label} active={fStatus === s.value} onClick={() => setFStatus(v => v === s.value ? '' : s.value)} />
          ))}
          {activeCount > 0 && (
            <button onClick={clearAll} className="ml-1 flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 dark:hover:text-red-400">
              <X size={11} />Limpar tudo
            </button>
          )}
        </div>

        {/* Painel de filtros avançados */}
        {panelOpen && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800">
            <div className={cn('grid gap-5', canFilterUnit ? 'sm:grid-cols-2 lg:grid-cols-4' : canFilterSeller ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2')}>

              {/* Origem */}
              <div>
                <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  <Filter size={10} />Origem
                </p>
                <div className="flex flex-wrap gap-1">
                  {SOURCE_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setFSource(v => v === o.value ? '' : o.value)}
                      className={cn('rounded-md border px-2 py-1 text-[11px] font-medium transition',
                        fSource === o.value
                          ? 'border-indigo-400 bg-indigo-600 text-white'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300'
                      )}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prioridade */}
              <div>
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Prioridade</p>
                <div className="flex flex-wrap gap-1">
                  {PRIORITY_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setFPriority(v => v === o.value ? '' : o.value)}
                      className={cn('rounded-md border px-2 py-1 text-[11px] font-medium transition',
                        fPriority === o.value ? o.tone : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300'
                      )}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Temperatura */}
              <div>
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Temperatura</p>
                <div className="flex flex-wrap gap-1">
                  {TEMP_OPTIONS.map(t => (
                    <button key={t.value} onClick={() => setFTemp(v => v === t.value ? '' : t.value)}
                      className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition',
                        fTemp === t.value ? 'text-white border-transparent' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300'
                      )}
                      style={fTemp === t.value ? { background: t.color, borderColor: t.color } : {}}
                    >
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Responsável — só para quem vê mais de um vendedor */}
              {canFilterSeller && ctx && ctx.sellers.length > 0 && (
                <div>
                  <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Responsável</p>
                  <select
                    value={fSeller} onChange={e => setFSeller(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-700 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-700 dark:text-gray-200"
                  >
                    <option value="">Todos</option>
                    {ctx.sellers.map(s => (
                      <option key={s.id} value={s.id}>{s.name ?? s.id}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Unidade — só para quem vê multi-unidade */}
              {canFilterUnit && ctx && ctx.units.length > 0 && (
                <div>
                  <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Unidade</p>
                  <select
                    value={fUnit} onChange={e => setFUnit(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-700 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-700 dark:text-gray-200"
                  >
                    <option value="">Todas</option>
                    {ctx.units.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {activeCount > 0 && (
              <div className="mt-4 flex items-center justify-end border-t border-gray-100 pt-3 dark:border-white/5">
                <button onClick={clearAll} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500">
                  <X size={12} />Limpar todos os filtros
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabela ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/5 dark:bg-slate-800/60">
                {['Cliente', 'Contato / Veículo', 'Origem', 'Etapa', 'Temp.', ...(canFilterSeller ? ['Responsável'] : []), 'Último contato', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: canFilterSeller ? 8 : 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className={cn('h-3 animate-pulse rounded bg-gray-100 dark:bg-slate-700', j === 0 ? 'w-28' : j >= (canFilterSeller ? 7 : 6) ? 'w-10' : 'w-16')} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={canFilterSeller ? 8 : 7} className="px-4 py-16 text-center">
                    <Search size={28} className="mx-auto mb-3 text-gray-200 dark:text-gray-700" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nenhum lead encontrado</p>
                    {(activeCount > 0 || debSearch) && (
                      <button onClick={() => { setSearch(''); setDebSearch(''); clearAll() }} className="mt-2 text-xs text-brand-600 hover:underline dark:text-brand-400">
                        Limpar filtros e busca
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map(row => {
                  const temp = crmTemperature(row.temperature)
                  const hasTemp = row.temperature && row.temperature !== 'UNCLASSIFIED'
                  const contactLine = [row.phone, row.email].filter(Boolean).join(' · ')

                  return (
                    <tr key={row.id} className="group hover:bg-gray-50/80 dark:hover:bg-slate-800/40">
                      {/* Cliente */}
                      <td className="px-4 py-3">
                        <Link href={`/crm/leads/${row.id}`}
                          className="block font-medium text-gray-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400">
                          {row.name ?? row.phone ?? row.email ?? '—'}
                        </Link>
                        {/* Tags */}
                        {row.tags?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.tags.slice(0, 2).map(t => (
                              <span key={t.id}
                                className="inline-flex items-center gap-0.5 rounded-full border border-gray-100 bg-white px-1.5 py-px text-[9px] font-medium text-gray-500 dark:border-white/10 dark:bg-slate-700 dark:text-gray-400">
                                <span className="h-1.5 w-1.5 rounded-full flex-none" style={{ background: t.color ?? '#9ca3af' }} />
                                {t.name}
                              </span>
                            ))}
                            {row.tags.length > 2 && <span className="text-[9px] text-gray-400">+{row.tags.length - 2}</span>}
                          </div>
                        )}
                      </td>

                      {/* Contato / Veículo */}
                      <td className="px-4 py-3">
                        {contactLine && (
                          <p className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                            <Phone size={10} className="shrink-0" />{contactLine}
                          </p>
                        )}
                        {row.vehicleLabel && (
                          <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">{row.vehicleLabel}</p>
                        )}
                      </td>

                      {/* Origem */}
                      <td className="px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">
                        {crmSourceLabel(row.source)}
                      </td>

                      {/* Etapa */}
                      <td className="px-4 py-3">
                        <select value={row.status} onChange={e => void patchLead(row.id, { status: e.target.value })}
                          className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-700 dark:text-gray-200">
                          {CRM_STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>

                      {/* Temperatura */}
                      <td className="px-4 py-3">
                        {hasTemp
                          ? <span className="flex items-center gap-1.5" title={temp.label}><span className="h-2 w-2 rounded-full flex-none" style={{ background: temp.color }} /><span className="text-[11px] text-gray-600 dark:text-gray-300">{temp.label}</span></span>
                          : <span className="text-gray-200 dark:text-gray-600">—</span>
                        }
                      </td>

                      {/* Responsável — só quando o scope permite */}
                      {canFilterSeller && (
                        <td className="px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">
                          {row.assignedToUserName ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                      )}

                      {/* Último contato */}
                      <td className="px-4 py-3">
                        {row.lastContactAt
                          ? <span className="flex items-center gap-1 text-[11px] tabular-nums text-gray-500 dark:text-gray-400"><Clock size={10} />{new Date(row.lastContactAt).toLocaleDateString('pt-BR')}</span>
                          : <span className="text-[11px] font-medium text-amber-500">Sem contato</span>
                        }
                      </td>

                      {/* Ações hover */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Link href={`/crm/leads/${row.id}`}
                            className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300">
                            Ver
                          </Link>
                          <button onClick={() => void patchLead(row.id, { status: 'CONVERTED' })}
                            title="Converter em negociação"
                            className="rounded-md border border-emerald-200 bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                            <CheckCircle2 size={13} />
                          </button>
                          <button onClick={() => void patchLead(row.id, { status: 'LOST', lostReason: 'Marcado na lista' })}
                            title="Marcar como perdido"
                            className="rounded-md border border-red-200 bg-red-50 p-1 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                            <XCircle size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 dark:border-white/5">
            <p className="text-[11px] tabular-nums text-gray-400">
              {((page - 1) * meta.perPage) + 1}–{Math.min(page * meta.perPage, meta.total)} de {meta.total.toLocaleString('pt-BR')}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => goPage(page - 1)} disabled={page <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-slate-700">
                <ChevronLeft size={13} />
              </button>
              {Array.from({ length: Math.min(meta.totalPages, 7) }, (_, i) => {
                const p = meta.totalPages <= 7 ? i + 1
                  : i === 0 ? 1
                  : i === 6 ? meta.totalPages
                  : Math.max(2, Math.min(meta.totalPages - 1, page - 2 + i))
                return (
                  <button key={p} onClick={() => goPage(p)}
                    className={cn('flex h-7 min-w-[28px] items-center justify-center rounded-lg border px-1.5 text-[11px] font-medium tabular-nums',
                      p === page
                        ? 'border-brand-400 bg-brand-600 text-white'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-slate-700'
                    )}
                  >{p}</button>
                )
              })}
              <button onClick={() => goPage(page + 1)} disabled={page >= meta.totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-white/10 dark:hover:bg-slate-700">
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
