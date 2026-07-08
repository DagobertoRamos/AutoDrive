'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { CRM_STAGE_OPTIONS, crmSourceLabel, crmStageLabel } from '@/lib/crm/shared'
import { cn } from '@/lib/utils'

interface LeadRow {
  id: string
  name: string | null
  phone: string | null
  source: string | null
  status: string
  assignedToUserName: string | null
  unitName: string | null
}

const STAGES = CRM_STAGE_OPTIONS.map((item) => item.value)

export default function CrmKanbanPage() {
  const [rows, setRows] = useState<LeadRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crm/leads?perPage=100', { credentials: 'include' })
      const json = await res.json().catch(() => null) as { data?: LeadRow[] } | null
      setRows(json?.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const moveLead = async (leadId: string, nextStatus: string) => {
    await fetch(`/api/crm/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: nextStatus, lostReason: nextStatus === 'LOST' ? 'Movido no Kanban' : undefined }),
    })
    await load()
  }

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

      <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-8">
        {STAGES.map((stage, index) => {
          const stageRows = rows.filter((row) => row.status === stage)
          return (
            <section key={stage} className="rounded-xl border border-gray-200 bg-white p-3 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{crmStageLabel(stage)}</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">{stageRows.length}</span>
              </div>
              <div className="space-y-2">
                {stageRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="font-medium text-gray-900">{row.name ?? row.phone ?? 'Lead sem nome'}</p>
                    <p className="mt-1 text-xs text-gray-500">{crmSourceLabel(row.source)} · {row.assignedToUserName ?? 'Sem responsável'}</p>
                    <p className="text-xs text-gray-400">{row.unitName ?? 'Sem unidade'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/crm/leads/${row.id}`} className="rounded-lg border border-sky-200 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-white">
                        Ver detalhe
                      </Link>
                      {index < STAGES.length - 1 && (
                        <button onClick={() => void moveLead(row.id, STAGES[index + 1])} className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white">
                          <ArrowRight size={12} className="mr-1 inline" />
                          Avançar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!loading && stageRows.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">Sem leads</div>}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
