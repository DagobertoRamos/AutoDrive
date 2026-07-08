'use client'

import { useEffect, useState } from 'react'
import { Activity, Clock3, Columns3, Handshake, Inbox, RefreshCw, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CockpitData {
  scope: string
  cards: {
    totalLeads: number
    newLeads: number
    delayedLeads: number
    convertedLeads: number
    lostLeads: number
    autoconfLeads: number
    totalAttendances: number
    openAttendances: number
    todayAttendances: number
  }
  bySource: Array<{ source: string; total: number }>
  byStage: Array<{ stage: string; label: string; total: number }>
  bySeller: Array<{ sellerId: string | null; sellerName: string; total: number }>
}

const CARD_META = [
  { key: 'totalLeads', label: 'Leads no CRM', icon: Inbox, tone: 'text-brand-700 bg-brand-50 border-brand-100' },
  { key: 'newLeads', label: 'Leads novos', icon: Activity, tone: 'text-blue-700 bg-blue-50 border-blue-100' },
  { key: 'delayedLeads', label: 'Leads atrasados', icon: Clock3, tone: 'text-amber-700 bg-amber-50 border-amber-100' },
  { key: 'convertedLeads', label: 'Convertidos', icon: Handshake, tone: 'text-green-700 bg-green-50 border-green-100' },
  { key: 'lostLeads', label: 'Perdidos', icon: Columns3, tone: 'text-red-700 bg-red-50 border-red-100' },
  { key: 'autoconfLeads', label: 'Vindos do AutoConf', icon: Columns3, tone: 'text-violet-700 bg-violet-50 border-violet-100' },
  { key: 'totalAttendances', label: 'Atendimentos', icon: Users, tone: 'text-slate-700 bg-slate-50 border-slate-100' },
  { key: 'openAttendances', label: 'Em atendimento', icon: Activity, tone: 'text-indigo-700 bg-indigo-50 border-indigo-100' },
  { key: 'todayAttendances', label: 'Hoje', icon: Clock3, tone: 'text-cyan-700 bg-cyan-50 border-cyan-100' },
] as const

export default function CrmCockpitPage() {
  const [data, setData] = useState<CockpitData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crm/cockpit', { credentials: 'include' })
      const json = await res.json().catch(() => null) as { data?: CockpitData } | null
      setData(json?.data ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cockpit CRM</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Atualizando indicadores...' : `Escopo atual: ${data?.scope ?? 'crm'}`}
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CARD_META.map((card) => {
          const Icon = card.icon
          const value = data?.cards?.[card.key] ?? 0
          return (
            <div key={card.key} className={cn('rounded-xl border p-4 shadow-card', card.tone)}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide">{card.label}</p>
                <Icon size={16} />
              </div>
              <p className="mt-3 text-3xl font-black">{loading ? '...' : value}</p>
            </div>
          )
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <h2 className="text-sm font-semibold text-gray-900">Leads por origem</h2>
          <div className="mt-4 space-y-2">
            {(data?.bySource ?? []).map((item) => (
              <div key={item.source} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">{item.source}</span>
                <span className="text-sm font-bold text-gray-900">{item.total}</span>
              </div>
            ))}
            {!loading && !(data?.bySource?.length) && <p className="text-sm text-gray-400">Nenhuma origem registrada ainda.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <h2 className="text-sm font-semibold text-gray-900">Leads por etapa</h2>
          <div className="mt-4 space-y-2">
            {(data?.byStage ?? []).map((item) => (
              <div key={item.stage} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">{item.label}</span>
                <span className="text-sm font-bold text-gray-900">{item.total}</span>
              </div>
            ))}
            {!loading && !(data?.byStage?.length) && <p className="text-sm text-gray-400">Nenhuma etapa registrada ainda.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <h2 className="text-sm font-semibold text-gray-900">Leads por responsável</h2>
          <div className="mt-4 space-y-2">
            {(data?.bySeller ?? []).map((item) => (
              <div key={`${item.sellerId ?? 'none'}-${item.sellerName}`} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">{item.sellerName}</span>
                <span className="text-sm font-bold text-gray-900">{item.total}</span>
              </div>
            ))}
            {!loading && !(data?.bySeller?.length) && <p className="text-sm text-gray-400">Nenhum responsável com lead neste escopo.</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
