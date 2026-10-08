'use client'

// Confirmação de exclusão de lead (soft delete com motivo e auditoria).
// Usado no Kanban e na lista de Leads. Gate no servidor: crm.lead.delete.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { RequiredMark } from '@/components/ui/field'

export interface DeleteLeadTarget { id: string; leadNumber?: number | null; name: string | null }

export function DeleteLeadModal({ lead, onClose, onDeleted }: { lead: DeleteLeadTarget; onClose: () => void; onDeleted: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState('')
  const confirm = async () => {
    if (reason.trim().length < 5) { setErr('Informe o motivo (mín. 5 caracteres).'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const j = await res.json().catch(() => null) as { success?: boolean; error?: string } | null
      // Só some da tela se o servidor confirmou a exclusão.
      if (!res.ok || !j?.success) { setErr(j?.error ?? 'Falha ao excluir.'); return }
      onDeleted()
    } catch {
      setErr('Sem conexão com o servidor. Tente de novo.')
    } finally { setBusy(false) }
  }
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [busy, onClose])
  // Portal no <body>: dentro do card (que tem transform no hover) o
  // position:fixed ficava preso ao card e o modal saía cortado/travado.
  return createPortal(
    <div className="fixed inset-0 z-[99] flex items-center justify-center bg-black/50 p-4" onMouseDown={() => { if (!busy) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            Excluir lead{lead.leadNumber ? ` #${lead.leadNumber}` : ''}?
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={16} /></button>
        </div>
        {lead.name && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{lead.name}</p>}
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Histórico e negociações vinculadas são preservados.</p>
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">Motivo <RequiredMark /></span>
          <textarea
            value={reason} onChange={e => setReason(e.target.value)}
            rows={2} autoFocus maxLength={300}
            placeholder="Motivo da exclusão"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-white/20 dark:bg-slate-700 dark:text-white"
          />
        </label>
        {err && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} disabled={busy} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-300">Cancelar</button>
          <button onClick={confirm} disabled={busy} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Excluindo…' : 'Excluir lead'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
