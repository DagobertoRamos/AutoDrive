'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Visão Geral. Hub enxuto: cards de ação
// (entrar na fila / QR / atender cliente — em MinhaVezPanel), ranking de
// qualidade e a fila atual. Auto-timeout: quando o prazo de aceite estoura, a
// própria tela chama o próximo.
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { ListOrdered, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import MinhaVezPanel from '@/components/seller-queue/MinhaVezPanel'
import QueueRanking from '@/components/seller-queue/QueueRanking'
import { queueStatusLabel } from '@/lib/seller-queue/labels'

interface Entry { id: string; sellerName: string; status: string; position: number; attendanceCount: number }
interface Data { entries: Entry[]; arrivalsPending: number }
interface Att { id: string; status: string; acceptDeadline: string | null }

const STATUS_CLS: Record<string, string> = { WAITING: 'bg-gray-100 text-gray-600', PAUSED: 'bg-amber-100 text-amber-700', CALLED: 'bg-blue-100 text-blue-700', IN_ATTENDANCE: 'bg-green-100 text-green-700', NEXT: 'bg-brand-100 text-brand-700' }

export default function FilaOverviewPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)
  const firedTimeouts = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const [cRes, aRes] = await Promise.all([
        fetch('/api/seller-queue/current', { credentials: 'include' }),
        fetch('/api/seller-queue/attendances?active=true', { credentials: 'include' }),
      ])
      if (cRes.status === 403 || cRes.status === 400) { const j = await cRes.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null)
      setData((await cRes.json())?.data ?? null)
      const atts: Att[] = (await aRes.json())?.data ?? []

      // Auto-timeout: chamado cujo prazo estourou → chama o próximo (1x por id).
      const nowMs = Date.now()
      for (const att of atts) {
        if (att.status === 'CALLED' && att.acceptDeadline && new Date(att.acceptDeadline).getTime() < nowMs && !firedTimeouts.current.has(att.id)) {
          firedTimeouts.current.add(att.id)
          fetch(`/api/seller-queue/attendances/${att.id}/timeout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ reason: 'tempo de aceite esgotado' }) })
            .then(() => { setTimeout(() => { void load() }, 800) }).catch(() => {})
        }
      }
    } catch { /* noop */ } finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i) }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><ListOrdered size={20} className="text-brand-600" />Fila de Atendimento</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${data?.entries?.length ?? 0} na fila · ${data?.arrivalsPending ?? 0} cliente(s) aguardando`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      {/* Ações (entrar na fila / QR / atender cliente) + aceitar/finalizar */}
      <MinhaVezPanel />

      {/* Ranking de qualidade */}
      {!denied && <QueueRanking />}

      {/* Fila atual */}
      {denied ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-gray-700">Fila ({data?.entries?.length ?? 0})</p>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['#', 'Vendedor', 'Status', 'Atend.'].map((h) => (<th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.entries ?? []).length === 0 ? (<tr><td colSpan={4} className="py-10 text-center text-sm text-gray-400">Fila vazia.</td></tr>)
              : data!.entries.map((e, i) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 tabular-nums text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{e.sellerName}</td>
                  <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[e.status] ?? 'bg-gray-100 text-gray-500')}>{queueStatusLabel(e.status)}</span></td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-500">{e.attendanceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
