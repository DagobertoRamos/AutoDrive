'use client'

// =============================================================================
// DealHistory — histórico da negociação em português (linha do tempo).
// Recebe os eventos de /api/negotiations/[id]/timeline (frases prontas) e
// agrupa por dia: "Hoje", "Ontem" ou a data. Edições de valores/pagamentos
// só chegam para a gerência (filtro no servidor).
// =============================================================================

import { useEffect, useState } from 'react'
import { AlertCircle, Car, CircleDollarSign, FileEdit, Flag, Loader2, Package, Receipt, ShieldCheck, Wallet, History } from 'lucide-react'

export interface HistoryEvent {
  kind: string
  title: string
  text: string
  user: string | null
  date: string
}

const KIND: Record<string, { icon: React.ElementType; cls: string }> = {
  STATUS: { icon: Flag, cls: 'bg-blue-50 text-blue-700 ring-blue-100' },
  VALOR: { icon: CircleDollarSign, cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
  PAGAMENTO: { icon: Wallet, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  DEBITO: { icon: Receipt, cls: 'bg-rose-50 text-rose-700 ring-rose-100' },
  DADOS: { icon: FileEdit, cls: 'bg-gray-50 text-gray-600 ring-gray-100' },
  SERVICO: { icon: Package, cls: 'bg-violet-50 text-violet-700 ring-violet-100' },
  VEICULO: { icon: Car, cls: 'bg-sky-50 text-sky-700 ring-sky-100' },
  PENDENCIA: { icon: AlertCircle, cls: 'bg-orange-50 text-orange-700 ring-orange-100' },
  GARANTIA: { icon: ShieldCheck, cls: 'bg-teal-50 text-teal-700 ring-teal-100' },
}

const TZ = 'America/Sao_Paulo'
const dayKey = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ })
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (dayKey(d) === dayKey(today)) return 'Hoje'
  if (dayKey(d) === dayKey(yesterday)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' })
}
const hour = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

/** Carrega o histórico; `refreshKey` muda quando a negociação é salva de novo. */
export function useDealHistory(dealId: string | null | undefined, refreshKey?: unknown) {
  const [items, setItems] = useState<HistoryEvent[] | null>(null)
  useEffect(() => {
    if (!dealId) return
    let alive = true
    fetch(`/api/negotiations/${dealId}/timeline`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => { if (alive) setItems(Array.isArray(d?.data) ? d.data : []) })
      .catch(() => { if (alive) setItems([]) })
    return () => { alive = false }
  }, [dealId, refreshKey])
  return items
}

export default function DealHistory({ items, limit, onShowAll }: { items: HistoryEvent[] | null; limit?: number; onShowAll?: () => void }) {
  if (items === null) return <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-brand-600" /></div>
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-8 text-gray-400">
        <History size={22} />
        <p className="text-sm">Nenhuma movimentação registrada ainda.</p>
      </div>
    )
  }
  const newest = [...items].reverse()
  const shown = limit ? newest.slice(0, limit) : newest
  const groups: Array<{ label: string; list: HistoryEvent[] }> = []
  for (const ev of shown) {
    const label = dayLabel(ev.date)
    const g = groups[groups.length - 1]
    if (g && g.label === label) g.list.push(ev)
    else groups.push({ label, list: [ev] })
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.label}>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</h4>
          <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-gray-100">
            {g.list.map((ev, i) => {
              const k = KIND[ev.kind] ?? KIND.DADOS
              const Icon = k.icon
              return (
                <li key={`${ev.date}-${i}`} className="relative flex gap-3">
                  <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${k.cls}`}><Icon size={15} /></span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-semibold text-gray-900">{ev.title}</p>
                      <time className="shrink-0 text-xs tabular-nums text-gray-400" dateTime={ev.date}>{hour(ev.date)}</time>
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{ev.text}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
      {onShowAll && limit && items.length > limit && (
        <button type="button" onClick={onShowAll} className="w-full rounded-lg border border-gray-200 py-2 text-xs font-medium text-brand-700 hover:bg-gray-50">
          Ver histórico completo ({items.length} registros)
        </button>
      )}
    </div>
  )
}
