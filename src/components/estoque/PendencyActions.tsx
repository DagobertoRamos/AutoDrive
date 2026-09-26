'use client'

// =============================================================================
// Ações de uma pendência de estoque na ficha do veículo.
//   Perícia     → escolhe o status da cautelar (pendente já vale; "sem perícia" não)
//   Recebimento → confirma data e km de chegada
//   Demais      → Resolver / Reabrir
// =============================================================================

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { GATE_INSPECTION, GATE_RECEIVE, sameLabel } from '@/lib/stock/intake-core'

const CAUTELAR_OPTS = [
  ['SEM_CAUTELAR', 'Sem perícia'], ['PENDENTE', 'Pendente (laudo em andamento)'], ['APROVADA', 'Aprovada'],
  ['COM_APONTAMENTO', 'Com apontamento'], ['REPROVADA', 'Reprovada'],
] as const

const btn = 'rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50'

export function PendencyActions({ label, resolved, cautelarStatus, km, onSubmit }: {
  label: string
  resolved: boolean
  cautelarStatus: string | null
  km: number | null
  onSubmit: (body: Record<string, unknown>) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [cs, setCs] = useState(cautelarStatus ?? 'SEM_CAUTELAR')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [kmIn, setKmIn] = useState(km != null ? String(km) : '')
  const [note, setNote] = useState('')

  const run = async (body: Record<string, unknown>) => {
    setBusy(true)
    try { await onSubmit(body); setOpen(false) } finally { setBusy(false) }
  }

  if (sameLabel(label, GATE_INSPECTION)) {
    return (
      <div className="flex items-center gap-1.5">
        <select value={cs} onChange={(e) => setCs(e.target.value)} disabled={busy} className="rounded-md border border-gray-300 bg-white px-1.5 py-1 text-[11px]">
          {CAUTELAR_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" disabled={busy || cs === (cautelarStatus ?? 'SEM_CAUTELAR')} onClick={() => run({ cautelarStatus: cs })} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
          {busy ? <Loader2 size={11} className="animate-spin" /> : 'Salvar'}
        </button>
      </div>
    )
  }

  if (sameLabel(label, GATE_RECEIVE) && !resolved) {
    if (!open) return <button type="button" onClick={() => setOpen(true)} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Confirmar recebimento</button>
    return (
      <div className="w-64 space-y-1.5 rounded-lg border border-emerald-200 bg-white p-2 text-left">
        <label className="block text-[11px] text-gray-600">Data da chegada
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-1.5 py-1 text-xs" />
        </label>
        <label className="block text-[11px] text-gray-600">Km na chegada
          <input inputMode="numeric" value={kmIn} onChange={(e) => setKmIn(e.target.value.replace(/\D/g, ''))} className="mt-0.5 w-full rounded border border-gray-300 px-1.5 py-1 text-xs" />
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Obs.: chaves, manual, documentos…" className="w-full rounded border border-gray-300 px-1.5 py-1 text-xs" />
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={() => setOpen(false)} className={`${btn} border border-gray-300 bg-white text-gray-600`}>Cancelar</button>
          <button type="button" disabled={busy} onClick={() => run({ resolved: true, receivedAt: `${date}T12:00:00`, km: kmIn ? Number(kmIn) : undefined, note })} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
            {busy ? <Loader2 size={11} className="animate-spin" /> : 'Confirmar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button type="button" disabled={busy} onClick={() => run({ resolved: !resolved })}
      className={resolved ? `${btn} border border-gray-300 bg-white font-medium text-gray-600 hover:bg-gray-50` : `${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
      {busy ? '...' : resolved ? 'Reabrir' : 'Resolver'}
    </button>
  )
}
