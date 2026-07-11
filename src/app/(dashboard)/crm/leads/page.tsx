'use client'

// =============================================================================
// CRM — Lista de Leads profissional. Busca unificada (nome/tel/e-mail/placa/
// carro/notas) + filtros rápidos como chips. Escopo: cada vendedor só vê os
// próprios leads (enforçado no servidor). Gestor vê a unidade; ADM vê tudo.
// =============================================================================

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  Flame, Loader2, Phone, Plus, RefreshCw, Search, X, XCircle,
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

// ── Filtros rápidos ──────────────────────────────────────────────────────────
const STATUS_CHIPS = CRM_STAGE_OPTIONS.map(s => ({ value: s.value, label: s.label }))
const SOURCE_CHIPS = [
  { value: 'MANUAL',             label: 'Manual' },
  { value: 'FILA_ATENDIMENTO',   label: 'Fila' },
  { value: 'SDR',                label: 'SDR' },
  { value: 'WHATSAPP',           label: 'WhatsApp' },
  { value: 'WEBMOTORS',          label: 'Webmotors' },
  { value: 'AUTOCONF',           label: 'AutoConf' },
  { value: 'WEBSITE',            label: 'Website' },
]
const PRIORITY_CHIPS = [
  { value: 'URGENT', label: 'Urgente', cls: 'text-red-700 bg-red-50 border-red-200' },
  { value: 'HIGH',   label: 'Alta',    cls: 'text-amber-700 bg-amber-50 border-amber-200' },
]
const TEMP_CHIPS = CRM_TEMPERATURES.filter(t => t.value !== 'UNCLASSIFIED')

// ── Componente principal ─────────────────────────────────────────────────────
export default function CrmLeadsPage() {
  const { data: session } = useSession()
  const scope = (session as { scope?: string })?.scope
  const isManager = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER'].includes(
    (session?.user as { role?: string })?.role ?? ''
  )

  const [rows, setRows]         = useState<LeadRow[]>([])
  const [meta, setMeta]         = useState<Meta | null>(null)
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)

  // Filtros
  const [search, setSearch]           = useState('')
  const [debouncedSearch, setDebounced] = useState('')
  const [activeStatus, setStatus]     = useState<string>('')
  const [activeSource, setSource]     = useState<string>('')
  const [activePriority, setPriority] = useState<string>('')
  const [activeTemp, setTemp]         = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  // Criação rápida
  const [newPhone, setNewPhone]       = useState('')
  const [newName, setNewName]         = useState('')
  const [saving, setSaving]           = useState(false)
  const [showNew, setShowNew]         = useState(false)

  // Debounce da busca
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = (v: string) => {
    setSearch(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(v), 380)
  }

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), perPage: '25' })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (activeStatus)    params.set('status', activeStatus)
      if (activeSource)    params.set('source', activeSource)
      if (activePriority)  params.set('priority', activePriority)
      if (activeTemp)      params.set('temperature', activeTemp)
      const res  = await fetch(`/api/crm/leads?${params}`, { credentials: 'include' })
      const json = await res.json().catch(() => null) as { data?: LeadRow[]; meta?: Meta } | null
      setRows(json?.data ?? [])
      setMeta(json?.meta ?? null)
    } finally { setLoading(false) }
  }, [debouncedSearch, activeStatus, activeSource, activePriority, activeTemp])

  useEffect(() => { setPage(1); void load(1) }, [load])

  const goPage = (p: number) => { setPage(p); void load(p) }

  const hasFilters = !!(activeStatus || activeSource || activePriority || activeTemp)
  const clearFilters = () => { setStatus(''); setSource(''); setPriority(''); setTemp('') }

  const patchLead = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/crm/leads/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(body),
    })
    void load(page)
  }

  const createLead = async () => {
    if (!newPhone && !newName) return
    setSaving(true)
    try {
      await fetch('/api/crm/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: newName || null, phone: newPhone || null, source: 'MANUAL' }),
      })
      setNewName(''); setNewPhone(''); setShowNew(false)
      void load(1)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Leads</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Atualizando…' : meta ? `${meta.total.toLocaleString('pt-BR')} leads` : ''}
            {!isManager && ' · apenas os seus'}
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

      {/* ── Criação rápida ── */}
      {showNew && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 dark:border-brand-900 dark:bg-brand-950/40">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Nome</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do cliente" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-white/20 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Telefone</label>
            <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && void createLead()} placeholder="(11) 9.9999-9999" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-white/20 dark:bg-slate-800 dark:text-white" />
          </div>
          <button onClick={() => void createLead()} disabled={saving || (!newName && !newPhone)} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Criar
          </button>
          <button onClick={() => setShowNew(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"><X size={16} /></button>
        </div>
      )}

      {/* ── Barra de busca + filtros ── */}
      <div className="space-y-3">
        {/* Busca unificada */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          {search && (
            <button onClick={() => { setSearch(''); setDebounced('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={15} />
            </button>
          )}
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, e-mail, placa, carro, origem…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/15 dark:bg-slate-800 dark:text-white dark:placeholder-gray-500 dark:focus:ring-brand-900"
          />
          {loading && debouncedSearch && (
            <Loader2 size={14} className="absolute right-10 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
          )}
        </div>

        {/* Filtros rápidos como chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setShowFilters(v => !v)}
            className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
              showFilters || hasFilters
                ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-300'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/15 dark:bg-slate-800 dark:text-gray-300'
            )}
          >
            <ArrowUpDown size={12} />Filtros
            {hasFilters && <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">{[activeStatus, activeSource, activePriority, activeTemp].filter(Boolean).length}</span>}
          </button>

          {/* Chips de etapa */}
          {STATUS_CHIPS.map(c => (
            <button
              key={c.value}
              onClick={() => setStatus(v => v === c.value ? '' : c.value)}
              className={cn('rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
                activeStatus === c.value
                  ? 'border-gray-700 bg-gray-800 text-white dark:border-white dark:bg-white dark:text-gray-900'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/15 dark:bg-slate-800 dark:text-gray-300'
              )}
            >
              {c.label}
            </button>
          ))}

          {hasFilters && (
            <button onClick={clearFilters} className="ml-1 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400">
              <X size={12} />Limpar
            </button>
          )}
        </div>

        {/* Painel de filtros expandido */}
        {showFilters && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Origem</p>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCE_CHIPS.map(c => (
                    <button key={c.value} onClick={() => setSource(v => v === c.value ? '' : c.value)}
                      className={cn('rounded-md border px-2 py-1 text-[11px] font-medium transition',
                        activeSource === c.value ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950 dark:text-indigo-300' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300'
                      )}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Prioridade</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITY_CHIPS.map(c => (
                    <button key={c.value} onClick={() => setPriority(v => v === c.value ? '' : c.value)}
                      className={cn('rounded-md border px-2 py-1 text-[11px] font-medium transition',
                        activePriority === c.value ? c.cls + ' dark:opacity-90' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300'
                      )}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Temperatura</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMP_CHIPS.map(c => (
                    <button key={c.value} onClick={() => setTemp(v => v === c.value ? '' : c.value)}
                      className={cn('rounded-md border px-2 py-1 text-[11px] font-medium transition',
                        activeTemp === c.value ? 'border-gray-700 text-white dark:border-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300'
                      )}
                      style={activeTemp === c.value ? { background: c.color, borderColor: c.color } : {}}
                    >
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Tabela ── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/5 dark:bg-slate-800/60">
                {['Cliente', 'Contato / Veículo', 'Origem', 'Etapa', 'Temperatura', 'Responsável', 'Último contato', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className={cn('h-3 animate-pulse rounded bg-gray-100 dark:bg-slate-700', j === 0 ? 'w-32' : j === 7 ? 'w-12' : 'w-20')} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <Search size={28} className="mx-auto mb-3 text-gray-300" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Nenhum lead encontrado</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Tente ajustar os filtros ou a busca</p>
                  </td>
                </tr>
              ) : (
                rows.map(row => {
                  const temp = crmTemperature(row.temperature)
                  const hasTemp = row.temperature && row.temperature !== 'UNCLASSIFIED'
                  const contact = [row.phone, row.email].filter(Boolean).join(' · ')
                  return (
                    <tr key={row.id} className="group hover:bg-gray-50/80 dark:hover:bg-slate-800/40">
                      {/* Cliente */}
                      <td className="px-4 py-3">
                        <Link href={`/crm/leads/${row.id}`} className="font-medium text-gray-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400">
                          {row.name ?? row.phone ?? row.email ?? 'Sem identificação'}
                        </Link>
                        <p className="mt-0.5 text-[10px] text-gray-400 font-mono tabular-nums">{row.id.slice(-8)}</p>
                      </td>
                      {/* Contato / Veículo */}
                      <td className="px-4 py-3">
                        {contact && (
                          <p className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                            <Phone size={10} className="shrink-0 text-gray-400" />
                            {contact}
                          </p>
                        )}
                        {row.vehicleLabel && (
                          <p className="mt-0.5 text-[10px] text-gray-400">{row.vehicleLabel}</p>
                        )}
                      </td>
                      {/* Origem */}
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{crmSourceLabel(row.source)}</td>
                      {/* Etapa */}
                      <td className="px-4 py-3">
                        <select
                          value={row.status}
                          onChange={e => void patchLead(row.id, { status: e.target.value })}
                          className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700 focus:border-brand-400 focus:outline-none dark:border-white/15 dark:bg-slate-700 dark:text-gray-200"
                        >
                          {CRM_STAGE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      {/* Temperatura */}
                      <td className="px-4 py-3">
                        {hasTemp ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                            <span className="h-2 w-2 rounded-full" style={{ background: temp.color }} />
                            {temp.label}
                          </span>
                        ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      {/* Responsável */}
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{row.assignedToUserName ?? '—'}</td>
                      {/* Último contato */}
                      <td className="px-4 py-3">
                        {row.lastContactAt ? (
                          <span className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                            <Clock size={10} />
                            {new Date(row.lastContactAt).toLocaleDateString('pt-BR')}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-500">Sem contato</span>
                        )}
                      </td>
                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Link
                            href={`/crm/leads/${row.id}`}
                            className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"
                          >
                            Ver
                          </Link>
                          <button
                            onClick={() => void patchLead(row.id, { status: 'CONVERTED' })}
                            className="rounded-md border border-emerald-200 bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                            title="Converter"
                          >
                            <CheckCircle2 size={13} />
                          </button>
                          <button
                            onClick={() => void patchLead(row.id, { status: 'LOST', lostReason: 'Marcado na lista' })}
                            className="rounded-md border border-red-200 bg-red-50 p-1 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                            title="Marcar como perdido"
                          >
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
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-white/5">
            <p className="text-[11px] text-gray-400 tabular-nums">
              {((page - 1) * meta.perPage) + 1}–{Math.min(page * meta.perPage, meta.total)} de {meta.total.toLocaleString('pt-BR')}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goPage(page - 1)} disabled={page <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-slate-700"
              >
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
                      p === page ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-950 dark:text-brand-300' : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-slate-700'
                    )}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => goPage(page + 1)} disabled={page >= meta.totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:hover:bg-slate-700"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
