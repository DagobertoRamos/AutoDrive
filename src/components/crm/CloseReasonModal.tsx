'use client'

// Pede o motivo ao encerrar um lead (perdido/desqualificado/reciclado) usando a
// lista configurada em Configurações do CRM → Motivos de encerramento.

import { useState } from 'react'
import { X } from 'lucide-react'
import { useCrmSettings } from '@/hooks/useCrmSettings'
import { reasonsFor, type CloseOutcome } from '@/lib/crm/settings-core'

const TITLES: Record<CloseOutcome, string> = { LOST: 'Motivo da perda', DISCARDED: 'Motivo da desqualificação', RECYCLED: 'Motivo da reciclagem' }

export default function CloseReasonModal({ outcome, leadName, onClose, onConfirm }: {
  outcome: CloseOutcome
  leadName?: string | null
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const { settings } = useCrmSettings()
  const reasons = reasonsFor(settings, outcome)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const confirm = () => {
    if (!reason) { setErr('Escolha o motivo.'); return }
    onConfirm([reason, note.trim()].filter(Boolean).join(' | '))
  }

  return (
    <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={TITLES[outcome]} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{TITLES[outcome]}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Fechar"><X size={16} /></button>
        </div>
        {leadName && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{leadName}</p>}
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Motivo *</span>
          <select value={reason} onChange={(e) => { setReason(e.target.value); setErr('') }} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white">
            <option value="">Selecione…</option>
            {reasons.map((r) => <option key={r.id} value={r.label}>{r.label}</option>)}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Observação</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-slate-700 dark:text-white" />
        </label>
        {err && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300">Cancelar</button>
          <button onClick={confirm} className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700">Confirmar</button>
        </div>
      </div>
    </div>
  )
}
