'use client'

// Busca global do financeiro (CPF/CNPJ, placa, cliente, fornecedor, contrato,
// documento ou valor). /api/finance/center/search

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DealPeekLink } from '@/components/deals/DealPeek'
import { EntryDrawer } from '@/components/finance/EntryDrawer'

interface Res {
  entries: { id: string; type: string; status: string; description: string; amount: number; dueDate: string | null; counterparty: string | null }[]
  deals: { id: string; dealNumber: string | null; type: string; status: string; customer: string | null; plate: string | null }[]
  vehicles: { id: string; plate: string | null; brand: string | null; model: string | null; modelYear: number | null; stockStatus: string }[]
  contracts: { id: string; bank: string | null; contractNumber: string | null; value: number; status: string | null; dealId: string; dealNumber: string | null }[]
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dBR = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')

export default function FinanceSearch() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Res | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [entryId, setEntryId] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return }
    const n = ++seq.current
    const t = setTimeout(async () => {
      setLoading(true)
      const j = await fetch(`/api/finance/center/search?q=${encodeURIComponent(q.trim())}`, { credentials: 'include' }).then((r) => r.json()).catch(() => null)
      if (n === seq.current) { setRes(j?.success ? j.data : null); setLoading(false); setOpen(true) }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const empty = res && !res.entries.length && !res.deals.length && !res.vehicles.length && !res.contracts.length
  const group = 'px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400'
  const item = 'flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-gray-50'

  return (
    <div ref={box} className="relative w-full sm:w-80">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => res && setOpen(true)} placeholder="Buscar no financeiro"
        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
      {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
      {open && res && (
        <div className="absolute right-0 z-40 mt-1 max-h-[70vh] w-full min-w-[22rem] overflow-y-auto rounded-xl border border-gray-200 bg-white pb-2 shadow-xl">
          {empty && <p className="p-4 text-center text-sm text-gray-400">Nada encontrado.</p>}
          {!!res.entries.length && <p className={group}>Lançamentos</p>}
          {res.entries.map((e) => (
            <button key={e.id} type="button" onClick={() => { setEntryId(e.id); setOpen(false) }} className={cn(item, 'w-full text-left')}>
              <span className="min-w-0"><span className="block truncate text-gray-900">{e.description}</span><span className="text-xs text-gray-500">{[e.counterparty, dBR(e.dueDate), e.status.toLowerCase()].filter(Boolean).join(' · ')}</span></span>
              <span className={cn('shrink-0 tabular-nums', e.type === 'DESPESA' ? 'text-orange-700' : 'text-teal-700')}>{brl(e.amount)}</span>
            </button>
          ))}
          {!!res.deals.length && <p className={group}>Negociações</p>}
          {res.deals.map((d) => (
            <DealPeekLink key={d.id} dealId={d.id} className={cn(item, 'w-full')} asButton>
              <span className="min-w-0 text-left"><span className="block truncate text-gray-900">{d.customer ?? '—'}</span><span className="text-xs text-gray-500">{[d.dealNumber, d.plate, d.status.toLowerCase().replace(/_/g, ' ')].filter(Boolean).join(' · ')}</span></span>
            </DealPeekLink>
          ))}
          {!!res.contracts.length && <p className={group}>Contratos de financiamento</p>}
          {res.contracts.map((c) => (
            <DealPeekLink key={c.id} dealId={c.dealId} className={cn(item, 'w-full')} asButton>
              <span className="min-w-0 text-left"><span className="block truncate text-gray-900">{[c.bank, c.contractNumber].filter(Boolean).join(' · ')}</span><span className="text-xs text-gray-500">{c.dealNumber}</span></span>
              <span className="shrink-0 tabular-nums">{brl(c.value)}</span>
            </DealPeekLink>
          ))}
          {!!res.vehicles.length && <p className={group}>Veículos</p>}
          {res.vehicles.map((v) => (
            <Link key={v.id} href={`/financeiro/veiculos/${v.id}`} className={item}>
              <span className="truncate text-gray-900">{[v.brand, v.model, v.modelYear].filter(Boolean).join(' ')}</span>
              <span className="shrink-0 font-mono text-xs text-gray-500">{v.plate}</span>
            </Link>
          ))}
        </div>
      )}
      {entryId && <EntryDrawer entryId={entryId} onClose={() => setEntryId(null)} />}
    </div>
  )
}
