'use client'

// =============================================================================
// PendencyAckWatcher — ao ENTRAR no sistema, se o colaborador tem pendências
// abertas que ainda não leu, abre um popup listando-as. O botão "Ciente"
// confirma a leitura (registra na linha do tempo da pendência) e some do popup.
// Mostra uma vez por sessão (não reabre a cada navegação).
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X, Check, CheckCheck } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

interface AckItem {
  id: string
  customerName: string
  plate: string | null
  type: string | null
  description: string | null
  priority: string
  status: string
  dueDate: string | null
  unit?: { name: string } | null
}

const PRI_COLOR: Record<string, string> = {
  URGENTE: 'bg-red-100 text-red-700', ALTA: 'bg-orange-100 text-orange-700',
  MEDIA: 'bg-yellow-100 text-yellow-700', BAIXA: 'bg-gray-100 text-gray-600',
}

export default function PendencyAckWatcher() {
  const { status } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<AckItem[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const shownRef = useRef(false)

  // Busca uma única vez por sessão, ao autenticar.
  useEffect(() => {
    if (status !== 'authenticated' || shownRef.current) return
    shownRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/pendencies/mine/pending-ack', { credentials: 'include' })
        const j = await res.json().catch(() => null)
        const list: AckItem[] = j?.data ?? []
        if (list.length > 0) { setItems(list); setOpen(true) }
      } catch { /* silencioso */ }
    })()
  }, [status])

  const ack = async (id: string) => {
    setBusy(id)
    try {
      await fetch(`/api/pendencies/${id}/acknowledge`, { method: 'POST', credentials: 'include' })
      setItems((prev) => {
        const next = prev.filter((p) => p.id !== id)
        if (next.length === 0) setOpen(false)
        return next
      })
    } catch { /* silencioso */ } finally { setBusy(null) }
  }

  const ackAll = async () => {
    setBusy('__all__')
    try {
      await Promise.all(items.map((p) => fetch(`/api/pendencies/${p.id}/acknowledge`, { method: 'POST', credentials: 'include' }).catch(() => {})))
      setItems([]); setOpen(false)
    } finally { setBusy(null) }
  }

  if (!open || items.length === 0) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle size={16} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-gray-800">Você tem {items.length} pendência{items.length > 1 ? 's' : ''} para ler</h2>
              <p className="text-xs text-gray-500">Dê ciência para confirmar que está a par.</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" title="Fechar">
            <X size={16} />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {items.map((p) => {
            const overdue = p.dueDate && new Date(p.dueDate) < new Date()
            return (
              <div key={p.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', PRI_COLOR[p.priority] ?? PRI_COLOR.MEDIA)}>{p.priority}</span>
                      {p.type && <span className="text-xs font-medium text-gray-600">{p.type}</span>}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-gray-800">
                      {p.customerName}{p.plate ? ` — ${p.plate}` : ''}
                    </p>
                    {p.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{p.description}</p>}
                    <p className="mt-1 text-[11px] text-gray-400">
                      {p.unit?.name ? `${p.unit.name} · ` : ''}
                      {p.dueDate ? <span className={overdue ? 'font-semibold text-red-600' : ''}>vence {formatDate(new Date(p.dueDate))}</span> : 'sem vencimento'}
                    </p>
                  </div>
                  <button
                    onClick={() => ack(p.id)}
                    disabled={busy === p.id}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {busy === p.id ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Check size={13} />}
                    Ciente
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => { setOpen(false); router.push('/pendencias/central') }}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Abrir a Central de Pendências
          </button>
          <button
            onClick={ackAll}
            disabled={busy === '__all__'}
            className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
          >
            {busy === '__all__' ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-green-600 border-t-transparent" /> : <CheckCheck size={14} />}
            Ciente em todas
          </button>
        </div>
      </div>
    </div>
  )
}
