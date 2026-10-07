'use client'

// =============================================================================
// Busca de negociação para vincular ao lead: digite número, nome do cliente,
// CPF, placa ou veículo — as opções aparecem enquanto digita.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DealOption {
  id: string
  number: string
  status: string
  type: string
  customer: string | null
  cpf: string | null
  vehicle: string | null
  plate: string | null
}

const statusLabel = (s: string) => { const t = s.toLowerCase().replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1) }

export function DealSearchPicker({ leadId, onSelect, disabled, placeholder = 'Buscar por número, cliente, CPF, placa ou veículo', className }: {
  leadId: string
  onSelect: (deal: DealOption) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<DealOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { const t = setTimeout(() => setItems([]), 0); return () => clearTimeout(t) }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/crm/leads/${leadId}/deals/search?q=${encodeURIComponent(term)}`, { credentials: 'include', signal: ctrl.signal })
        const j = await res.json().catch(() => ({}))
        setItems(res.ok && Array.isArray(j.data) ? j.data : [])
        setActive(0)
      } catch { /* digitação nova cancelou a busca */ } finally { setLoading(false) }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, leadId])

  useEffect(() => {
    const close = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [])

  const pick = (d: DealOption) => { onSelect(d); setQ(''); setItems([]); setOpen(false) }
  const term = q.trim()

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!items.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(items[active]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-8 text-sm focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-slate-700 dark:text-white"
      />
      {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
      {open && term.length >= 2 && !loading && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-800">
          {items.length === 0 && <p className="px-3 py-2.5 text-sm text-gray-500">Nenhuma negociação encontrada.</p>}
          {items.map((d, i) => (
            <button key={d.id} type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(d)}
              className={cn('flex w-full flex-col gap-0.5 px-3 py-2 text-left', i === active ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5')}>
              <span className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-gray-900 dark:text-white">{d.number}</span>
                <span className="truncate text-gray-700 dark:text-gray-200">{d.customer ?? 'Sem cliente'}</span>
                <span className="ml-auto shrink-0 text-[11px] text-gray-400">{statusLabel(d.status)}</span>
              </span>
              <span className="truncate text-xs text-gray-500">{[d.vehicle, d.plate, d.cpf && `CPF ${d.cpf}`].filter(Boolean).join(' · ') || statusLabel(d.type)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
