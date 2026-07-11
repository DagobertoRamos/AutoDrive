'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw, User } from 'lucide-react'
import { crmSourceLabel, crmTemperature } from '@/lib/crm/shared'
import { cn } from '@/lib/utils'

interface LeadTag { id: string; name: string; color: string | null }
interface LeadRow {
  id: string
  name: string | null
  phone: string | null
  source: string | null
  status: string
  assignedToUserName: string | null
  unitName: string | null
  temperature?: string | null
  tags?: LeadTag[]
}
interface StageCfg { code: string; displayName: string; color: string; order: number; active: boolean }

// Temperature dot (subtle, não emoji)
const TEMP_COLORS: Record<string, string> = { HOT: '#ef4444', WARM: '#f59e0b', COLD: '#3b82f6' }

export default function CrmKanbanPage() {
  const [rows, setRows]       = useState<LeadRow[]>([])
  const [stages, setStages]   = useState<StageCfg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [leadsRes, stagesRes] = await Promise.all([
        fetch('/api/crm/leads?perPage=200', { credentials: 'include' }).then(r => r.json()).catch(() => null),
        fetch('/api/crm/config/stages', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      ])
      setRows(leadsRes?.data ?? [])
      const st: StageCfg[] = (stagesRes?.data ?? [])
        .filter((s: StageCfg) => s.active)
        .sort((a: StageCfg, b: StageCfg) => a.order - b.order)
      setStages(st)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

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

  const scrollBoard = (dir: -1 | 1) => {
    boardRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  const codes = stages.map(s => s.code)
  const totalLeads = rows.length

  return (
    // O wrapper ocupa o espaço restante usando flex col + sai da padding do shell com margens negativas
    <div className="kanban-root flex flex-col" style={{ margin: '-0.75rem', height: 'calc(100dvh - 56px)' }}>
      <style>{`
        @media (min-width: 640px) { .kanban-root { margin: -1rem; } }
        @media (min-width: 1024px) { .kanban-root { margin: -1.5rem; height: calc(100dvh - 64px); } }

        .kanban-board::-webkit-scrollbar { height: 6px; }
        .kanban-board::-webkit-scrollbar-track { background: transparent; }
        .kanban-board::-webkit-scrollbar-thumb { background: #c1c7d0; border-radius: 3px; }
        .dark .kanban-board::-webkit-scrollbar-thumb { background: #3d4555; }

        .col-cards::-webkit-scrollbar { width: 4px; }
        .col-cards::-webkit-scrollbar-track { background: transparent; }
        .col-cards::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
        .dark .col-cards::-webkit-scrollbar-thumb { background: #374151; }

        .lead-card { transition: box-shadow 0.15s, transform 0.15s; }
        .lead-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.10); transform: translateY(-1px); }
        .dark .lead-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.4); }

        .kanban-col-header { backdrop-filter: blur(8px); }
      `}</style>

      {/* ── Barra superior ── */}
      <div className="kanban-topbar flex flex-none items-center justify-between gap-3 border-b border-gray-200/70 bg-white/80 px-4 py-2.5 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/80">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h1 className="text-[15px] font-semibold text-gray-900 dark:text-white">Pipeline CRM</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
              {loading ? 'Carregando…' : `${totalLeads} leads · ${stages.length} etapas`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="max-w-[360px] truncate rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </span>
          )}
          <button onClick={() => scrollBoard(-1)} className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-400">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => scrollBoard(1)} className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-400">
            <ChevronRight size={15} />
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-gray-300"
          >
            <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Board ── */}
      <div
        ref={boardRef}
        className="kanban-board flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-4 py-3"
        style={{ background: 'var(--kb-bg, #EDF0F5)' }}
      >
        <style>{`
          @media (prefers-color-scheme: dark) { :root { --kb-bg: #0f1117; } }
          :root[data-theme="dark"] { --kb-bg: #0f1117; }
          :root[data-theme="light"] { --kb-bg: #EDF0F5; }
        `}</style>

        {loading ? (
          // Skeletons com o mesmo layout real
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex w-[260px] flex-none flex-col rounded-xl bg-white shadow-sm dark:bg-slate-800" style={{ minHeight: 200 }}>
              <div className="p-3 pb-2">
                <div className="h-2.5 w-24 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
              </div>
              <div className="flex-1 space-y-2 p-2">
                {Array.from({ length: i === 2 ? 3 : 1 }).map((_, j) => (
                  <div key={j} className="rounded-lg bg-gray-100 p-3 dark:bg-slate-700/60">
                    <div className="mb-1.5 h-3 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-slate-600" />
                    <div className="h-2 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-slate-600/60" />
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          stages.map((stage, index) => {
            const stageRows = rows.filter(r => r.status === stage.code)
            const isLast = index === codes.length - 1
            const nextCode = !isLast ? codes[index + 1] : null

            return (
              <div
                key={stage.code}
                className="flex flex-none flex-col rounded-xl shadow-sm"
                style={{
                  // Preenche o espaço disponível igualmente; colapsa p/ min se muitas colunas
                  flex: '1 1 0',
                  minWidth: 240,
                  maxWidth: 360,
                  background: 'white',
                }}
              >
                {/* Cabeçalho da coluna */}
                <div
                  className="kanban-col-header flex-none rounded-t-xl border-t-[3px] bg-white/95 px-3 pt-3 pb-2 dark:bg-slate-800/95"
                  style={{ borderTopColor: stage.color }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white"
                        style={{ background: stage.color }}
                      >
                        {stageRows.length}
                      </span>
                      <h2
                        className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-700 dark:text-gray-300"
                        title={stage.displayName}
                      >
                        {stage.displayName}
                      </h2>
                    </div>
                  </div>
                </div>

                {/* Lista de cards — scroll independente */}
                <div
                  className="col-cards flex-1 space-y-2 overflow-y-auto rounded-b-xl bg-gray-50/60 p-2 dark:bg-slate-800/60"
                  style={{ minHeight: 0 }}
                >
                  {stageRows.length === 0 ? (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-white/10">
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">Sem leads</p>
                    </div>
                  ) : (
                    stageRows.map(row => {
                      const temp = crmTemperature(row.temperature)
                      const hasTemp = row.temperature && row.temperature !== 'UNCLASSIFIED'
                      const tempColor = hasTemp ? TEMP_COLORS[row.temperature as string] ?? null : null
                      const isBusy = movingId === row.id

                      return (
                        <div
                          key={row.id}
                          className={cn(
                            'lead-card group relative rounded-lg border bg-white px-3 py-2.5 dark:bg-slate-800',
                            isBusy
                              ? 'border-brand-200 opacity-60 dark:border-brand-900'
                              : 'border-gray-100 dark:border-white/8'
                          )}
                        >
                          {/* Temperatura como traço lateral */}
                          {tempColor && (
                            <span
                              className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
                              style={{ background: tempColor }}
                              title={`Temperatura: ${temp.label}`}
                            />
                          )}

                          <div className="flex items-start justify-between gap-1.5">
                            <p className="text-[13px] font-semibold leading-snug text-gray-900 dark:text-white">
                              {row.name ?? row.phone ?? 'Lead sem nome'}
                            </p>
                            {hasTemp && (
                              <span className="shrink-0 text-xs" title={temp.label}>{temp.emoji}</span>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                            <User size={10} className="shrink-0" />
                            <span className="truncate">{row.assignedToUserName ?? 'Sem responsável'}</span>
                          </div>

                          {row.source && (
                            <p className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-gray-500">
                              {crmSourceLabel(row.source)}{row.unitName ? ` · ${row.unitName}` : ''}
                            </p>
                          )}

                          {row.tags && row.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {row.tags.slice(0, 3).map(t => (
                                <span
                                  key={t.id}
                                  className="inline-flex items-center gap-0.5 rounded-full border border-gray-100 bg-white px-1.5 py-px text-[9px] font-medium text-gray-600 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300"
                                >
                                  <span className="h-1.5 w-1.5 rounded-full flex-none" style={{ background: t.color ?? '#9ca3af' }} />
                                  {t.name}
                                </span>
                              ))}
                              {row.tags.length > 3 && (
                                <span className="text-[9px] text-gray-400">+{row.tags.length - 3}</span>
                              )}
                            </div>
                          )}

                          {/* Ações — always visible (mobile) ou visíveis no hover (desktop) */}
                          <div className="mt-2.5 flex items-center gap-1.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                            <Link
                              href={`/crm/leads/${row.id}`}
                              className="flex-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-center text-[10px] font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"
                            >
                              Ver detalhe
                            </Link>
                            {nextCode && (
                              <button
                                onClick={() => void moveLead(row.id, nextCode)}
                                disabled={isBusy}
                                className="flex items-center gap-0.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-700 dark:text-gray-300"
                              >
                                <ArrowRight size={10} />
                                {isBusy ? '…' : 'Avançar'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })
        )}

        {/* Breathing room no final do scroll */}
        <div className="flex-none w-1" aria-hidden />
      </div>
    </div>
  )
}
