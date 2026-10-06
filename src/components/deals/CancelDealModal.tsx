'use client'

// Cancelamento de negociação (venda, troca, compra, consignação) — motivo +
// o que acontece com o carro e com o dinheiro. Usado na lista e no detalhe.

import { useEffect, useState } from 'react'
import { Ban, Loader2 } from 'lucide-react'

export interface CancelDealPayload { reason: string; returnEntering: boolean }

interface Props {
  title?: string
  dealNumber?: string | null
  /** VENDA | TROCA | COMPRA | CONSIGNACAO */
  dealType?: string | null
  status?: string | null
  /** Só motivo (ex.: desaprovar): sem os avisos de cancelamento. */
  reasonOnly?: boolean
  /** Tamanho mínimo do motivo (reabrir exige 10). */
  minLength?: number
  loading?: boolean
  onConfirm: (p: CancelDealPayload) => void
  onClose: () => void
}

export default function CancelDealModal({ title, dealNumber, dealType, status, reasonOnly, minLength = 3, loading, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const type = String(dealType ?? '').toUpperCase()
  const hasEntering = type === 'TROCA' || type === 'COMPRA' || type === 'CONSIGNACAO'
  const [returnEntering, setReturnEntering] = useState(true)

  // Motivos cadastrados em Configurações da Fila › Negociação (opção rápida).
  useEffect(() => {
    fetch('/api/seller-queue/reasons', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.success) setSuggestions(j.data?.negotiationReasons ?? []) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [loading, onClose])

  const ok = reason.trim().length >= minLength
  const enteringLabel = type === 'TROCA' ? 'O carro da troca foi devolvido ao cliente' : type === 'CONSIGNACAO' ? 'O carro consignado foi devolvido ao proprietário' : 'O carro comprado foi devolvido ao vendedor'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          {!reasonOnly && <Ban size={18} className="text-red-500" />}
          {title ?? 'Cancelar negociação'}{dealNumber ? <span className="text-gray-400">· {dealNumber}</span> : null}
        </h3>

        {!reasonOnly && status === 'FINALIZADA' && <p className="mt-2 text-sm text-red-700">A venda será desfeita.</p>}

        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setReason(s)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${reason === s ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300'}`}>{s}</button>
            ))}
          </div>
        )}

        <label className="mt-3 block text-xs font-medium text-gray-600">
          Motivo <span className="text-red-500">*</span>
          <textarea autoFocus
            className="mt-1 min-h-24 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
           
            value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </label>

        {!reasonOnly && hasEntering && (
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={returnEntering} onChange={(e) => setReturnEntering(e.target.checked)} />
            <span>{enteringLabel}</span>
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Voltar</button>
          <button type="button" disabled={!ok || loading}
            onClick={() => onConfirm({ reason: reason.trim(), returnEntering: hasEntering && returnEntering })}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${reasonOnly ? 'bg-brand-600 hover:bg-brand-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {loading && <Loader2 size={13} className="animate-spin" />}
            {reasonOnly ? 'Confirmar' : 'Cancelar negociação'}
          </button>
        </div>
      </div>
    </div>
  )
}
