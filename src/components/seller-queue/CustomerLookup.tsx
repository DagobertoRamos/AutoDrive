'use client'

// =============================================================================
// CustomerLookup — busca anti-duplicação. Conforme o usuário digita (nome /
// telefone / e-mail), procura nas bases (clientes + leads) e mostra um dropdown
// para REAPROVEITAR o cadastro existente em vez de criar um novo. Renderiza
// ABSOLUTO logo abaixo do campo (o container pai precisa ser `relative`).
// =============================================================================

import { useState, useEffect } from 'react'
import { Search, UserCheck } from 'lucide-react'

export interface CustomerMatch {
  source: 'customer' | 'lead'
  customerId: string | null
  leadId: string | null
  name: string | null
  phone: string | null
  email: string | null
  status: string | null
}

export default function CustomerLookup({ query, onPick }: { query: string; onPick: (m: CustomerMatch) => void }) {
  const [items, setItems] = useState<CustomerMatch[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) { setItems([]); setOpen(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/seller-queue/customer-search?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        const j = await r.json().catch(() => ({}))
        const data: CustomerMatch[] = j?.success ? (j.data ?? []) : []
        setItems(data); setOpen(data.length > 0)
      } catch { /* noop */ } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  if (!open || items.length === 0) return null
  return (
    <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
      <p className="flex items-center gap-1 border-b border-gray-100 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"><Search size={11} />{loading ? 'Buscando…' : 'Já cadastrado? selecione para não duplicar'}</p>
      <div className="max-h-56 overflow-y-auto">
        {items.map((m, i) => (
          <button type="button" key={i} onClick={() => { onPick(m); setOpen(false) }} className="flex w-full flex-col items-start gap-0.5 border-b border-gray-50 px-3 py-2 text-left hover:bg-brand-50">
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
              <UserCheck size={13} className="text-brand-600" />{m.name || '(sem nome)'}
              <span className={`rounded px-1 text-[10px] ${m.source === 'customer' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{m.source === 'customer' ? 'cliente' : 'lead'}</span>
            </span>
            <span className="text-xs text-gray-400">{[m.phone, m.email].filter(Boolean).join(' · ') || 'sem contato'}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="w-full bg-gray-50 px-3 py-1 text-center text-[11px] text-gray-400 hover:text-gray-600">É um novo cliente — continuar digitando</button>
    </div>
  )
}
