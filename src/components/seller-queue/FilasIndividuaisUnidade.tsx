'use client'

// =============================================================================
// FilasIndividuaisUnidade — visão da GESTÃO das filas individuais da unidade.
// Lista, agrupado por responsável, os agendamento/retorno/pós-venda aguardando,
// e permite Iniciar (em nome do responsável), Transferir (outro colaborador) e
// Cancelar. Reusa GET /personal-queue?all=1, /callable e POST /personal-queue/:id.
// Só a gestão enxerga (a API restringe ?all=1 a sellerQueue.manage).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { ListChecks, PlayCircle, ArrowRightLeft, X, RefreshCw, Clock, ChevronUp, ChevronDown, History } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Item {
  id: string; itemType: string; itemTypeLabel: string; status: string; priority: number
  customerName: string | null; customerPhone: string | null; waitingSeconds: number
  agentUserId: string; agentName?: string
}
interface Seller { sellerId: string; name: string }

const TYPE_CLS: Record<string, string> = {
  RETORNO: 'bg-purple-100 text-purple-700', AGENDAMENTO: 'bg-blue-100 text-blue-700',
  POS_VENDA: 'bg-amber-100 text-amber-700', OUTRO: 'bg-gray-100 text-gray-600',
}
function waitLabel(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${m % 60}min`
}

export default function FilasIndividuaisUnidade({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch('/api/seller-queue/personal-queue?all=1', { credentials: 'include' }),
        fetch('/api/seller-queue/callable', { credentials: 'include' }),
      ])
      const pj = await pRes.json().catch(() => ({}))
      if (pRes.ok) setItems(pj?.data ?? [])
      const cj = await cRes.json().catch(() => ({}))
      if (cRes.ok) setSellers((cj?.data ?? []).map((s: { sellerId: string; name: string }) => ({ sellerId: s.sellerId, name: s.name })))
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i) }, [load])

  const act = async (id: string, body: Record<string, unknown>) => {
    setBusy(id); setError('')
    try {
      const res = await fetch(`/api/seller-queue/personal-queue/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Falha na ação.'); return }
      onChanged?.()
      await load()
    } finally { setBusy(null) }
  }

  if (loading) return null

  // Agrupa por responsável.
  const groups = new Map<string, { name: string; items: Item[] }>()
  for (const it of items) {
    const g = groups.get(it.agentUserId) ?? { name: it.agentName ?? '—', items: [] }
    g.items.push(it); groups.set(it.agentUserId, g)
  }

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700"><ListChecks size={15} className="text-brand-600" />Filas individuais da unidade ({items.length})</p>
        <button onClick={load} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="Atualizar"><RefreshCw size={13} /></button>
      </div>
      {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma fila individual pendente na unidade.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {[...groups.entries()].map(([agentId, g]) => (
            <div key={agentId} className="px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.name} · {g.items.length}</p>
              <ul className="space-y-2">
                {g.items.map((it) => (
                  <li key={it.id} className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center sm:gap-2 sm:px-3 sm:py-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0', TYPE_CLS[it.itemType] ?? 'bg-gray-100 text-gray-600')}>{it.itemTypeLabel}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{it.customerName ?? 'Cliente'}</p>
                        <p className="flex items-center gap-1 text-xs text-gray-400"><Clock size={11} />{waitLabel(it.waitingSeconds)} · prioridade {it.priority}</p>
                      </div>
                      <div className="flex items-center gap-1 sm:hidden shrink-0">
                        <button onClick={() => act(it.id, { action: 'priority', priority: it.priority + 10 })} disabled={busy === it.id} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="Subir prioridade"><ChevronUp size={16} /></button>
                        <button onClick={() => act(it.id, { action: 'priority', priority: Math.max(0, it.priority - 10) })} disabled={busy === it.id} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="Baixar prioridade"><ChevronDown size={16} /></button>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1.5 sm:shrink-0">
                      <div className="hidden sm:flex sm:flex-col">
                        <button onClick={() => act(it.id, { action: 'priority', priority: it.priority + 10 })} disabled={busy === it.id} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Subir prioridade"><ChevronUp size={13} /></button>
                        <button onClick={() => act(it.id, { action: 'priority', priority: Math.max(0, it.priority - 10) })} disabled={busy === it.id} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Baixar prioridade"><ChevronDown size={13} /></button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={pick[it.id] ?? ''}
                          onChange={(e) => setPick((p) => ({ ...p, [it.id]: e.target.value }))}
                          disabled={busy === it.id}
                          className="flex-1 sm:max-w-[8.5rem] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-base sm:text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          title="Transferir para…"
                        >
                          <option value="">Transferir p/…</option>
                          {sellers.filter((s) => s.sellerId !== it.agentUserId).map((s) => <option key={s.sellerId} value={s.sellerId}>{s.name}</option>)}
                        </select>
                        <button
                          onClick={() => pick[it.id] && act(it.id, { action: 'transfer', toUserId: pick[it.id] })}
                          disabled={busy === it.id || !pick[it.id]}
                          className="flex h-9 w-9 sm:h-auto sm:w-auto items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 shrink-0"
                          title="Transferir"
                        ><ArrowRightLeft size={14} className="sm:h-[13px] sm:w-[13px]" /></button>
                      </div>
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => act(it.id, { action: 'start' })} disabled={busy === it.id} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 sm:px-2.5 sm:py-1.5 text-sm sm:text-xs font-semibold text-white hover:bg-brand-700"><PlayCircle size={15} className="sm:h-[13px] sm:w-[13px]" />Iniciar</button>
                        <button onClick={() => act(it.id, { action: 'reschedule' })} disabled={busy === it.id} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 border border-gray-200 sm:border-0" title="Reagendar (manda para o fim)"><History size={16} /></button>
                        <button onClick={() => act(it.id, { action: 'cancel' })} disabled={busy === it.id} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 border border-gray-200 sm:border-0" title="Cancelar"><X size={16} /></button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
