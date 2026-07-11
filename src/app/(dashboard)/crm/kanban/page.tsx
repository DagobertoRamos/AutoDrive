'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
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

export default function CrmKanbanPage() {
  const [rows, setRows] = useState<LeadRow[]>([])
  const [stages, setStages] = useState<StageCfg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [leadsRes, stagesRes] = await Promise.all([
        fetch('/api/crm/leads?perPage=100', { credentials: 'include' }).then((r) => r.json()).catch(() => null),
        fetch('/api/crm/config/stages', { credentials: 'include' }).then((r) => r.json()).catch(() => null),
      ])
      setRows(leadsRes?.data ?? [])
      const st: StageCfg[] = (stagesRes?.data ?? []).filter((s: StageCfg) => s.active).sort((a: StageCfg, b: StageCfg) => a.order - b.order)
      setStages(st)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const moveLead = async (leadId: string, nextStatus: string) => {
    setError(null)
    setMovingId(leadId)
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: nextStatus, lostReason: nextStatus === 'LOST' ? 'Movido no Kanban' : undefined }),
      })
      const json = await res.json().catch(() => null) as { error?: string } | null
      // Transição rejeitada (etapa desativada, pular/retroceder bloqueado ou
      // campo obrigatório faltando) — o card NÃO se move (reload traz a verdade).
      if (!res.ok) { setError(json?.error ?? 'Não foi possível mover o card.'); return }
      await load()
    } finally {
      setMovingId(null)
    }
  }

  const codes = stages.map((s) => s.code)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Kanban CRM</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Atualizando pipeline...' : `${rows.length} lead(s) no pipeline`}</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-8">
        {stages.map((stage, index) => {
          const stageRows = rows.filter((row) => row.status === stage.code)
          return (
            <section key={stage.code} className="rounded-xl border border-gray-200 bg-white p-3 shadow-card">
              <div className="mb-3 flex items-center justify-between border-b-2 pb-2" style={{ borderColor: stage.color }}>
                <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />{stage.displayName}
                </h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">{stageRows.length}</span>
              </div>
              <div className="space-y-2">
                {stageRows.map((row) => {
                  const temp = crmTemperature(row.temperature)
                  return (
                    <div key={row.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-gray-900">{row.name ?? row.phone ?? 'Lead sem nome'}</p>
                        {row.temperature && row.temperature !== 'UNCLASSIFIED' && (
                          <span className="shrink-0 text-sm" title={`Temperatura: ${temp.label}`}>{temp.emoji}</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{crmSourceLabel(row.source)} · {row.assignedToUserName ?? 'Sem responsável'}</p>
                      <p className="text-xs text-gray-400">{row.unitName ?? 'Sem unidade'}</p>
                      {row.tags && row.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.tags.map((t) => (
                            <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color ?? '#9ca3af' }} />{t.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={`/crm/leads/${row.id}`} className="rounded-lg border border-sky-200 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-white">
                          Ver detalhe
                        </Link>
                        {index < codes.length - 1 && (
                          <button onClick={() => void moveLead(row.id, codes[index + 1])} disabled={movingId === row.id} className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50">
                            <ArrowRight size={12} className="mr-1 inline" />
                            {movingId === row.id ? 'Movendo…' : 'Avançar'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {!loading && stageRows.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">Sem leads</div>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
