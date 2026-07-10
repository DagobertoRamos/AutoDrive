'use client'

// =============================================================================
// AttendanceAuthApprovals — painel do LÍDER+/gerência com os pedidos PENDENTES
// de atender agendamento/retorno. Aprovar cria o atendimento; Recusar pede
// motivo. Some quando não há pendências. Poll a cada 15s.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Check, X, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuthReq { id: string; visitType: string; customerName: string | null; customerPhone: string | null; notes: string | null; createdAt: string; requesterName: string }

const dt = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function AttendanceAuthApprovals() {
  const [items, setItems] = useState<AuthReq[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/seller-queue/attendance-auth', { credentials: 'include' })
      if (!r.ok) { setItems([]); return }
      const j = await r.json().catch(() => null)
      setItems(j?.data ?? [])
    } catch { /* noop */ }
  }, [])

  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i) }, [load])

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    let reason = ''
    if (decision === 'reject') {
      const r = window.prompt('Motivo da recusa (mín. 3 caracteres):')
      if (r === null) return
      if (r.trim().length < 3) { alert('Motivo muito curto.'); return }
      reason = r.trim()
    }
    setBusy(id)
    try {
      const res = await fetch(`/api/seller-queue/attendance-auth/${id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ decision, reason: reason || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { alert(j?.error ?? 'Falha ao decidir.'); return }
      await load()
    } catch { alert('Erro de rede.') } finally { setBusy(null) }
  }

  if (items.length === 0) return null

  return (
    <div className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-card">
      <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-4 py-2.5">
        <ShieldCheck size={16} className="text-indigo-600" />
        <p className="text-sm font-bold text-indigo-800">Autorizações pendentes</p>
        <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{items.length}</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((a) => (
          <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                <span className="mr-1 inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700"><CalendarClock size={10} />{a.visitType === 'AGENDAMENTO' ? 'Agendamento' : 'Retorno'}</span>
                {a.requesterName}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">Cliente: {a.customerName ?? '—'}{a.customerPhone ? ` · ${a.customerPhone}` : ''} · {dt(a.createdAt)}</p>
              {a.notes && <p className="mt-0.5 text-[11px] italic text-gray-400">&quot;{a.notes}&quot;</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => decide(a.id, 'reject')} disabled={busy === a.id} className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"><X size={13} />Recusar</button>
              <button onClick={() => decide(a.id, 'approve')} disabled={busy === a.id} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Check size={13} />Aprovar</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
