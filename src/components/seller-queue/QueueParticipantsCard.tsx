'use client'

// =============================================================================
// QueueParticipantsCard — Vendedores na fila (GESTÃO). Fase 2.
// Grid por colaborador com toggles de participação. Junta /callable (lista +
// cargo + status) com /participants (flags salvas). Salva por colaborador na
// hora (PUT). Backend valida queue.sellers.manage + tenant + unidade.
// "Participa" barra o check-in; os demais toggles ficam salvos (enforcement no
// engine é incremental — ver README).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Users, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Flags {
  participates: boolean
  canBeVez: boolean
  canReceivePorta: boolean
  canReceiveAgendamento: boolean
  canReceiveRetorno: boolean
  canReceivePosVenda: boolean
  canReceiveRetiradaEntrega: boolean
  individualQueue: boolean
  escalatable: boolean
}
interface Seller { sellerId: string; name: string; role?: string; positionName?: string | null; queueStatus?: string | null; inQueue?: boolean }

const COLS: { key: keyof Flags; label: string; title: string }[] = [
  { key: 'participates', label: 'Participa', title: 'Entra na fila (barra o check-in se desligado)' },
  { key: 'canBeVez', label: 'Pode ser vez', title: 'Pode ser o vendedor da vez' },
  { key: 'canReceivePorta', label: 'Porta', title: 'Recebe cliente de porta' },
  { key: 'canReceiveAgendamento', label: 'Agend.', title: 'Recebe agendamento' },
  { key: 'canReceiveRetorno', label: 'Retorno', title: 'Recebe retorno' },
  { key: 'canReceivePosVenda', label: 'Pós-venda', title: 'Recebe pós-venda' },
  { key: 'canReceiveRetiradaEntrega', label: 'Retirada', title: 'Recebe retirada/entrega de carro' },
  { key: 'individualQueue', label: 'Fila indiv.', title: 'Participa da fila individual' },
  { key: 'escalatable', label: 'Escalona', title: 'Pode ser escalonado' },
]

const STATUS_LABEL: Record<string, string> = {
  WAITING: 'Aguardando', NEXT: 'Próximo', CALLED: 'Chamado', ACCEPTED: 'Aceitou',
  IN_ATTENDANCE: 'Atendendo', PAUSED: 'Pausado', LEFT: 'Fora', BLOCKED: 'Bloqueado',
}

export default function QueueParticipantsCard() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [flags, setFlags] = useState<Record<string, Flags>>({})
  const [defaults, setDefaults] = useState<Flags | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [sRes, pRes] = await Promise.all([
        fetch('/api/seller-queue/callable', { credentials: 'include' }),
        fetch('/api/seller-queue/participants', { credentials: 'include' }),
      ])
      const pj = await pRes.json().catch(() => ({}))
      if (!pRes.ok) throw new Error(pj.error ?? 'Erro ao carregar participação')
      const def: Flags = pj.data.defaults
      const map: Record<string, Partial<Flags>> = pj.data.participants ?? {}
      setDefaults(def)
      const list: Seller[] = sRes.ok ? ((await sRes.json())?.data ?? []) : []
      setSellers(list)
      const merged: Record<string, Flags> = {}
      for (const s of list) merged[s.sellerId] = { ...def, ...(map[s.sellerId] ?? {}) }
      setFlags(merged)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const toggle = async (sellerId: string, key: keyof Flags, value: boolean) => {
    const current = flags[sellerId] ?? defaults
    if (!current) return
    const next = { ...current, [key]: value }
    setFlags((f) => ({ ...f, [sellerId]: next }))
    setSavingId(sellerId); setError(''); setOk('')
    try {
      const res = await fetch('/api/seller-queue/participants', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ sellerId, flags: next }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao salvar')
      setOk('Salvo.'); setTimeout(() => setOk(''), 1500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
      setFlags((f) => ({ ...f, [sellerId]: current })) // reverte no erro
    } finally { setSavingId(null) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Users size={17} className="text-brand-600" />Vendedores na fila</h2>
          <p className="mt-0.5 text-xs text-gray-500">Quem participa e o que cada um pode receber. "Participa" desligado barra a entrada na fila.</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {error && <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={15} />{error}</div>}
      {ok && <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"><CheckCircle2 size={15} />{ok}</div>}

      {loading ? <div className="mt-4 h-40 animate-pulse rounded-lg bg-gray-100" /> : sellers.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Colaborador</th>
                {COLS.map((c) => <th key={c.key} title={c.title} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sellers.map((s) => {
                const f = flags[s.sellerId] ?? defaults
                return (
                  <tr key={s.sellerId} className={cn(savingId === s.sellerId && 'opacity-60')}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <div className="font-medium text-gray-900">{s.name}</div>
                      <div className="text-[11px] text-gray-400">
                        {s.positionName ?? s.role ?? ''}{s.queueStatus ? ` · ${STATUS_LABEL[s.queueStatus] ?? s.queueStatus}` : (s.inQueue === false ? ' · fora da fila' : '')}
                      </div>
                    </td>
                    {COLS.map((c) => (
                      <td key={c.key} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!f?.[c.key]}
                          onChange={(e) => toggle(s.sellerId, c.key, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm text-gray-500">Nenhum colaborador elegível encontrado nesta unidade.</p>}
    </div>
  )
}
