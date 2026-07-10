'use client'

// =============================================================================
// PendencyCriticalBanner — banner FIXO no topo (nível 1 do nagging da Crítica).
// Enquanto o responsável tiver pendência CRÍTICA aberta, mostra um alerta
// persistente com o tempo em atraso e atalho para a Central. Não fecha sozinho.
// O nível 2+ vira modal bloqueante (PendencySlaWatcher).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Flame, ChevronRight } from 'lucide-react'

interface Pendency { id: string; customerName: string; plate: string | null; type: string | null }
interface CriticalItem { pendency: Pendency; level: number; since: string | null }

const POLL_MS = 60_000

function humanizeSince(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `há ${mins}min`
  const h = Math.floor(mins / 60)
  return `há ${h}h${mins % 60 ? ` ${mins % 60}min` : ''}`
}

export default function PendencyCriticalBanner() {
  const { status } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<CriticalItem[]>([])

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/pendencies/action-required', { credentials: 'include' })
      const j = await res.json().catch(() => null)
      setItems((j?.data?.critical ?? []) as CriticalItem[])
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetchItems()
    const t = setInterval(fetchItems, POLL_MS)
    const onFocus = () => fetchItems()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [status, fetchItems])

  if (items.length === 0) return null
  const first = items[0]

  return (
    <button
      onClick={() => router.push(`/pendencias/central?id=${first.pendency.id}`)}
      className="flex w-full items-center gap-2 border-b border-red-700 bg-red-600 px-4 py-2 text-left text-sm font-semibold text-white hover:bg-red-700"
    >
      <Flame size={16} className="shrink-0 animate-pulse" />
      <span className="min-w-0 flex-1 truncate">
        {items.length > 1 ? `${items.length} pendências CRÍTICAS` : 'Pendência CRÍTICA'} sem tratamento
        {first.since ? ` — ${first.pendency.customerName}${first.pendency.plate ? ' · ' + first.pendency.plate : ''} ${humanizeSince(first.since)}` : ''}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-xs opacity-90">Resolver <ChevronRight size={14} /></span>
    </button>
  )
}
