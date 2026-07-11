'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, Sliders, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AttRow {
  id: string; sellerId: string; sellerName: string; unitId: string | null
  customerName: string | null; customerPhone: string | null; recurring: boolean
  status: string; result: string | null; type: string | null; visitType: string | null
  leadId: string | null; dealId: string | null
  calledAt: string; acceptedAt: string | null; finishedAt: string | null
}
interface Meta { scope: string; total: number; page: number; perPage: number; totalPages: number }
interface CrmCtx {
  scope: string; attendanceScope: string
  userId: string; unitId: string | null
  sellers: { id: string; name: string | null; role: string }[]
  units: { id: string; name: string }[]
}

const STATUS_OPTS: { value: string; label: string }[] = [
  { value: 'CALLED',        label: 'Chamado' },
  { value: 'ACCEPTED',      label: 'Aceito' },
  { value: 'IN_ATTENDANCE', label: 'Em atendimento' },
  { value: 'FINISHED',      label: 'Finalizado' },
  { value: 'REJECTED',      label: 'Recusado' },
  { value: 'EXPIRED',       label: 'Expirado' },
]
const STATUS_LABEL: Record<string,string> = Object.fromEntries(STATUS_OPTS.map(s => [s.value, s.label]))

const RESULT_OPTS: { value: string; label: string }[] = [
  { value: 'CONVERTED_TO_NEGOTIATION',  label: 'Convertido em negociação' },
  { value: 'SCHEDULED_RETURN',          label: 'Retorno agendado' },
  { value: 'NO_INTEREST',               label: 'Sem interesse' },
  { value: 'LOST',                      label: 'Perdido' },
  { value: 'DUPLICATED',                label: 'Duplicado' },
  { value: 'FORWARDED_TO_RESPONSIBLE',  label: 'Encaminhado ao responsável' },
  { value: 'INVALID_ATTENDANCE',        label: 'Atendimento inválido' },
]
const RESULT_LABEL: Record<string,string> = Object.fromEntries(RESULT_OPTS.map(r => [r.value, r.label]))

const STATUS_TONE: Record<string,string> = {
  FINISHED:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  IN_ATTENDANCE: 'bg-blue-50 text-blue-700 border-blue-200',
  ACCEPTED:      'bg-sky-50 text-sky-700 border-sky-200',
  CALLED:        'bg-amber-50 text-amber-700 border-amber-200',
  REJECTED:      'bg-red-50 text-red-700 border-red-200',
  EXPIRED:       'bg-gray-100 text-gray-500 border-gray-200',
}

export default function CrmAttendancesPage() {
  const [ctx, setCtx]           = useState<CrmCtx | null>(null)
  const [rows, setRows]         = useState<AttRow[]>([])
  const [meta, setMeta]         = useState<Meta | null>(null)
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)

  const [search, setSearch]     = useState('')
  const [debSearch, setDebSearch] = useState('')
  const [fStatus, setFStatus]   = useState('')
  const [fResult, setFResult]   = useState('')
  const [fSeller, setFSeller]   = useState('')
  const [fUnit, setFUnit]       = useState('')
  const [fFrom, setFFrom]       = useState('')
  const [fTo, setFTo]           = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = (v: string) => {
    setSearch(v)
    if (debTimer.current) clearTimeout(debTimer.current)
    debTimer.current = setTimeout(() => setDebSearch(v), 350)
  }

  useEffect(() => {
    fetch('/api/crm/context', { credentials: 'include' })
      .then(r => r.json()).then(j => { if (j?.data) setCtx(j.data) }).catch(() => {})
  }, [])

  const load = useCallback(async (p: number = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), perPage: '50' })
      if (debSearch) params.set('search', debSearch)
      if (fStatus) params.set('status', fStatus)
      if (fResult) params.set('result', fResult)
      if (fSeller) params.set('sellerId', fSeller)
      if (fUnit)   params.set('unitId', fUnit)
      if (fFrom)   params.set('from', fFrom)
      if (fTo)     params.set('to', fTo)
      const res  = await fetch(`/api/crm/attendances?${params}`, { credentials: 'include' })
      const json = await res.json().catch(() => null) as { data?: AttRow[]; meta?: Meta } | null
      setRows(json?.data ?? [])
      setMeta(json?.meta ?? null)
    } finally { setLoading(false) }
  }, [debSearch, fStatus, fResult, fSeller, fUnit, fFrom, fTo])

  useEffect(() => { setPage(1); void load(1) }, [load])
  const goPage = (p: number) => { setPage(p); void load(p) }

  const scope = ctx?.attendanceScope ?? ctx?.scope ?? 'own'
  const canFilterSeller = scope !== 'own'
  const canFilterUnit   = scope === 'all'
  const activeCount = [fStatus, fResult, fSeller, fUnit, fFrom, fTo].filter(Boolean).length
  const clearAll = () => { setFStatus(''); setFResult(''); setFSeller(''); setFUnit(''); setFFrom(''); setFTo('') }

  return (
    <div className="space-y-4">

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Atendimentos</h1>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {scope === 'all' ? 'Todos os atendimentos' : scope === 'unit' ? 'Da sua unidade' : 'Os seus atendimentos'}
            {meta && <> · <span className="tabular-nums">{meta.total.toLocaleString('pt-BR')}</span></>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load(page)} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />Atualizar
          </button>
        </div>
      </div>

      {/* Busca + Filtros */}
      <div className="space-y-2">
        {/* Busca unificada */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          {loading && debSearch && <Loader2 size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
          {search && !loading && <button onClick={() => { setSearch(''); setDebSearch('') }} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
          <input
            value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por cliente, telefone…"
            className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/15 dark:bg-slate-800 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {/* Linha de chips rápidos + botão painel */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setPanelOpen(v => !v)}
            className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition',
              panelOpen || activeCount > 0
                ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/60 dark:text-brand-300'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/15 dark:bg-slate-800 dark:text-gray-300'
            )}>
            <Sliders size={13} />Filtros
            {activeCount > 0 && <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">{activeCount}</span>}
          </button>

          {/* Status como chips de acesso rápido — em português */}
          {[{ value: '', label: 'Todos' }, ...STATUS_OPTS].map(s => (
            <button key={s.value || 'all'} onClick={() => setFStatus(s.value)}
              className={cn('rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition',
                fStatus === s.value
                  ? s.value ? cn(STATUS_TONE[s.value] ?? '', 'border-current') : 'border-gray-800 bg-gray-800 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 dark:border-white/15 dark:bg-slate-800 dark:text-gray-400'
              )}>
              {s.label}
            </button>
          ))}
          {activeCount > 0 && <button onClick={clearAll} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500"><X size={11} />Limpar</button>}
        </div>

        {panelOpen && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-800">
            <div className={cn('grid gap-4', canFilterUnit ? 'sm:grid-cols-2 lg:grid-cols-4' : canFilterSeller ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2')}>

              {/* Resultado */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Resultado</p>
                <div className="flex flex-wrap gap-1">
                  {RESULT_OPTS.map(r => (
                    <button key={r.value} onClick={() => setFResult(v => v === r.value ? '' : r.value)}
                      className={cn('rounded-md border px-2 py-1 text-[11px] font-medium transition',
                        fResult === r.value ? 'border-indigo-400 bg-indigo-600 text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300'
                      )}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Período */}
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Período</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] text-gray-400">De</label>
                    <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-700 dark:text-gray-200" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] text-gray-400">Até</label>
                    <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-700 dark:text-gray-200" />
                  </div>
                </div>
              </div>

              {canFilterSeller && ctx && ctx.sellers.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Vendedor</p>
                  <select value={fSeller} onChange={e => setFSeller(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-700 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-700 dark:text-gray-200">
                    <option value="">Todos</option>
                    {ctx.sellers.map(s => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
                  </select>
                </div>
              )}

              {canFilterUnit && ctx && ctx.units.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Unidade</p>
                  <select value={fUnit} onChange={e => setFUnit(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[12px] text-gray-700 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-700 dark:text-gray-200">
                    <option value="">Todas</option>
                    {ctx.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/5 dark:bg-slate-800/60">
                {['Data/Hora', 'Cliente', ...(canFilterSeller ? ['Vendedor'] : []), 'Tipo', 'Status', 'Resultado', 'Lead / Negociação'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/5">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: canFilterSeller ? 7 : 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className={cn('h-3 animate-pulse rounded bg-gray-100 dark:bg-slate-700', j === 0 ? 'w-24' : 'w-16')} /></td>
                  ))}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={canFilterSeller ? 7 : 6} className="px-4 py-14 text-center">
                  <Search size={24} className="mx-auto mb-2 text-gray-200" strokeWidth={1.5} />
                  <p className="text-sm text-gray-400">Nenhum atendimento encontrado</p>
                </td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                    {new Date(row.calledAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{row.customerName ?? '—'}</p>
                    {row.customerPhone && <p className="text-[10px] text-gray-400">{row.customerPhone}</p>}
                    {row.recurring && <span className="text-[9px] font-semibold text-purple-600">Recorrente</span>}
                  </td>
                  {canFilterSeller && (
                    <td className="px-4 py-3 text-[11px] text-gray-600 dark:text-gray-300">{row.sellerName}</td>
                  )}
                  <td className="px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">{row.visitType ?? row.type ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_TONE[row.status] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">
                    {row.result ? (RESULT_LABEL[row.result] ?? row.result) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      {row.leadId && <Link href={`/crm/leads/${row.leadId}`} className="text-[10px] font-medium text-sky-600 hover:underline dark:text-sky-400">Ver lead</Link>}
                      {row.dealId && <Link href={`/negociacoes/${row.dealId}`} className="text-[10px] font-medium text-emerald-600 hover:underline dark:text-emerald-400">Ver negociação</Link>}
                      {!row.leadId && !row.dealId && <span className="text-[10px] text-gray-300">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2.5 dark:border-white/5">
            <p className="text-[11px] tabular-nums text-gray-400">
              {((page-1)*meta.perPage)+1}–{Math.min(page*meta.perPage,meta.total)} de {meta.total.toLocaleString('pt-BR')}
            </p>
            <div className="flex gap-1">
              <button onClick={() => goPage(page-1)} disabled={page<=1} className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-white/10">
                <ChevronLeft size={13} />
              </button>
              {Array.from({ length: Math.min(meta.totalPages, 7) }, (_, i) => {
                const p = meta.totalPages<=7 ? i+1 : i===0 ? 1 : i===6 ? meta.totalPages : Math.max(2,Math.min(meta.totalPages-1,page-2+i))
                return <button key={p} onClick={() => goPage(p)}
                  className={cn('flex h-7 min-w-[28px] items-center justify-center rounded-lg border px-1.5 text-[11px] font-medium tabular-nums',
                    p===page ? 'border-brand-400 bg-brand-600 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:text-gray-400'
                  )}>{p}</button>
              })}
              <button onClick={() => goPage(page+1)} disabled={page>=meta.totalPages} className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-white/10">
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
