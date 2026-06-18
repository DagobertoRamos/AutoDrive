'use client'

// =============================================================================
// Comunicação > Avisos — comunicados da plataforma (MASTER) ativos para a loja.
// Consome /api/internal-notices/active e marca como lido em /[id]/read.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Megaphone, Check, ExternalLink, Info, AlertTriangle, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Notice { id: string; title: string; message: string; type: string; displayType: string; required: boolean; dismissible: boolean; actionUrl: string | null; actionLabel: string | null }

const TYPE_STYLE: Record<string, { cls: string; icon: typeof Info }> = {
  INFO: { cls: 'border-blue-200 bg-blue-50 text-blue-800', icon: Info },
  WARNING: { cls: 'border-amber-200 bg-amber-50 text-amber-800', icon: AlertTriangle },
  CRITICAL: { cls: 'border-red-200 bg-red-50 text-red-800', icon: AlertTriangle },
  MAINTENANCE: { cls: 'border-gray-200 bg-gray-50 text-gray-700', icon: Wrench },
}

export default function AvisosPage() {
  const [items, setItems] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/internal-notices/active', { credentials: 'include' }).then((x) => x.json()); setItems(r?.data ?? []) }
    catch { setItems([]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const markRead = async (n: Notice) => {
    setBusy(n.id)
    try {
      await fetch(`/api/internal-notices/${n.id}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ dismissed: true, confirmed: true }) })
      setItems((s) => s.filter((x) => x.id !== n.id))
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Megaphone size={20} className="text-brand-600" />Avisos</h1>
        <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} aviso(s) ativo(s) da plataforma`}</p>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />))}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-14 text-center shadow-card"><Megaphone size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum aviso ativo. 🎉</p></div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const st = TYPE_STYLE[n.type] ?? TYPE_STYLE.INFO
            return (
              <div key={n.id} className={cn('rounded-xl border p-4', st.cls)}>
                <div className="flex items-start gap-3">
                  <st.icon size={18} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{n.title}{n.required && <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold uppercase">Obrigatório</span>}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm opacity-90">{n.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {n.actionUrl && <a href={n.actionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-medium hover:bg-white"><ExternalLink size={13} />{n.actionLabel || 'Saiba mais'}</a>}
                      {n.dismissible && <button onClick={() => markRead(n)} disabled={busy === n.id} className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-medium hover:bg-white disabled:opacity-50"><Check size={13} />{busy === n.id ? 'Marcando...' : 'Marcar como lido'}</button>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
