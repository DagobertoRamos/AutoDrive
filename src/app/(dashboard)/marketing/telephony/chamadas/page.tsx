'use client'

// =============================================================================
// Marketing > Telefonia > Chamadas — histórico (read-only) via
// /api/marketing/telephony/calls. Gate: marketing.telephony.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { PhoneCall, PhoneIncoming, PhoneOutgoing, RefreshCw, Disc } from 'lucide-react'
import { cn } from '@/lib/utils'

const dt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR') : '—')
const dur = (n: number | null) => { if (n == null) return '—'; const m = Math.floor(n / 60); const s = n % 60; return `${m}:${String(s).padStart(2, '0')}` }
const STATUS_CLS: Record<string, string> = { COMPLETED: 'bg-green-100 text-green-700', ANSWERED: 'bg-green-100 text-green-700', MISSED: 'bg-red-100 text-red-600', FAILED: 'bg-red-100 text-red-600', BUSY: 'bg-amber-100 text-amber-700', RINGING: 'bg-blue-100 text-blue-700', VOICEMAIL: 'bg-purple-100 text-purple-700', CANCELED: 'bg-gray-100 text-gray-500' }

interface Call { id: string; direction: string; status: string; fromNumber: string | null; toNumber: string | null; leadId: string | null; source: string | null; durationSec: number | null; hasRecording: boolean; recordingStatus: string | null; createdAt: string }

export default function TelephonyCallsPage() {
  const [items, setItems] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [direction, setDirection] = useState('')
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setDenied(false)
    try {
      const qs = new URLSearchParams()
      if (direction) qs.set('direction', direction)
      if (status) qs.set('status', status)
      const res = await fetch(`/api/marketing/telephony/calls?${qs}`, { credentials: 'include' })
      if (res.status === 403) { setDenied(true); return }
      setItems((await res.json())?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [direction, status])
  useEffect(() => { load() }, [load])

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Seu perfil não tem acesso à telefonia.</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><PhoneCall size={20} className="text-brand-600" />Chamadas</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} chamada(s)`}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"><option value="">Todas direções</option><option value="INBOUND">Entrada</option><option value="OUTBOUND">Saída</option><option value="INTERNAL">Interna</option></select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"><option value="">Todos status</option>{['RINGING', 'ANSWERED', 'COMPLETED', 'MISSED', 'BUSY', 'FAILED', 'VOICEMAIL', 'CANCELED'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Quando', 'Direção', 'De', 'Para', 'Origem', 'Duração', 'Status', 'Gravação'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 5 }).map((_, i) => (<tr key={i}>{Array.from({ length: 8 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={8} className="py-14 text-center"><PhoneCall size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma chamada registrada.</p></td></tr>)
              : items.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(c.createdAt)}</td>
                  <td className="px-4 py-3">{c.direction === 'INBOUND' ? <span className="inline-flex items-center gap-1 text-green-700"><PhoneIncoming size={13} />Entrada</span> : c.direction === 'OUTBOUND' ? <span className="inline-flex items-center gap-1 text-blue-700"><PhoneOutgoing size={13} />Saída</span> : <span className="text-gray-500">Interna</span>}</td>
                  <td className="px-4 py-3 text-gray-700">{c.fromNumber || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{c.toNumber || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.source || '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">{dur(c.durationSec)}</td>
                  <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[c.status] ?? 'bg-gray-100 text-gray-500')}>{c.status}</span></td>
                  <td className="px-4 py-3">{c.hasRecording ? <span className="inline-flex items-center gap-1 text-xs text-brand-700"><Disc size={13} />{c.recordingStatus}</span> : <span className="text-xs text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
