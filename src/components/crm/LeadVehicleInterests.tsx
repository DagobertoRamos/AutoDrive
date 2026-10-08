'use client'

// Veículos de interesse do lead: busca no estoque; se a loja não tiver o carro,
// registra o interesse (marca/modelo/ano). O carro que veio com o lead (site,
// portais) já aparece aqui automaticamente.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Car, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RequiredMark } from '@/components/ui/field'
import { photoSrc } from '@/lib/partner-photo'

export interface LeadVehicle {
  id: string; vehicleId: string | null; brand: string | null; model: string | null; version: string | null
  year?: number | null; plate: string | null; priceViewed?: number | string | null; isPrimary: boolean; role: string; removedAt: string | null
}
interface StockCar { id: string; brand: string | null; model: string | null; version: string | null; modelYear: number | null; plate: string | null; salePrice: number | null; mainPhotoUrl: string | null }

const brl = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
const title = (v: { brand: string | null; model: string | null; version?: string | null }) => [v.brand, v.model, v.version].filter(Boolean).join(' ') || 'Veículo'
const input = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-white/20 dark:bg-slate-700 dark:text-white'

export function LeadVehicleInterests({ leadId, items, onChange, iconSize = 14 }: { leadId: string; items: LeadVehicle[]; onChange: () => void; iconSize?: number }) {
  const [mode, setMode] = useState<'closed' | 'search' | 'manual'>('closed')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<StockCar[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState({ brand: '', model: '', year: '' })
  const seq = useRef(0)
  const active = items.filter((v) => !v.removedAt)

  useEffect(() => {
    if (mode !== 'search') return
    const n = ++seq.current
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const j = await fetch(`/api/crm/stock-search?q=${encodeURIComponent(q)}`, { credentials: 'include' }).then((r) => r.json())
        if (n === seq.current) setResults(j?.success ? j.data : [])
      } catch { if (n === seq.current) setResults([]) } finally { if (n === seq.current) setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, mode])

  const close = () => { setMode('closed'); setQ(''); setError(''); setManual({ brand: '', model: '', year: '' }) }

  const add = async (body: Record<string, unknown>) => {
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/crm/leads/${leadId}/vehicles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.success === false) { setError(j?.error ?? 'Não foi possível adicionar.'); return }
      close(); onChange()
    } finally { setBusy(false) }
  }

  const remove = async (v: LeadVehicle) => {
    if (!window.confirm(`Remover ${title(v)}?`)) return
    await fetch(`/api/crm/leads/${leadId}/vehicles/${v.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    onChange()
  }

  const inList = new Set(active.map((v) => v.vehicleId).filter(Boolean))

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><Car size={iconSize} />Veículos de interesse</h3>
        {mode === 'closed'
          ? <button onClick={() => setMode('search')} className="flex items-center gap-1 text-[11px] text-brand-600 hover:underline"><Plus size={11} />Adicionar</button>
          : <button onClick={close} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Fechar"><X size={13} /></button>}
      </div>

      {mode === 'search' && (
        <div className="mb-3">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no estoque" className={cn(input, 'py-2 pl-8')} />
            {searching && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {results.map((c) => {
              const already = inList.has(c.id)
              return (
                <button key={c.id} type="button" disabled={busy || already} onClick={() => add({ vehicleId: c.id })}
                  className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-slate-800">
                  {c.mainPhotoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={photoSrc(c.mainPhotoUrl, 320)} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
                    : <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded bg-gray-100 dark:bg-slate-800"><Car size={14} className="text-gray-400" /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-gray-900 dark:text-white">{title(c)}</span>
                    <span className="block text-[10px] text-gray-500">{[c.modelYear, c.plate, brl(c.salePrice)].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              )
            })}
            {!searching && results.length === 0 && <p className="px-1.5 py-2 text-[12px] text-gray-400">Nenhum carro encontrado.</p>}
          </div>
          <button type="button" onClick={() => { setMode('manual'); setManual((m) => ({ ...m, model: q })) }} className="mt-1 text-[11px] font-medium text-brand-600 hover:underline">Não temos no estoque</button>
        </div>
      )}

      {mode === 'manual' && (
        <div className="mb-3 space-y-2">
          <div className="grid grid-cols-[1fr_1.4fr_5rem] gap-2">
            <input placeholder="Marca" value={manual.brand} onChange={(e) => setManual((m) => ({ ...m, brand: e.target.value }))} className={input} />
            <div className="relative">
              <input autoFocus placeholder="Modelo" value={manual.model} onChange={(e) => setManual((m) => ({ ...m, model: e.target.value }))} className={cn(input, 'pr-5')} />
              <RequiredMark className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
            </div>
            <input placeholder="Ano" inputMode="numeric" maxLength={4} value={manual.year} onChange={(e) => setManual((m) => ({ ...m, year: e.target.value.replace(/\D/g, '') }))} className={input} />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMode('search')} className="text-[11px] text-gray-500 hover:text-gray-700">Voltar à busca</button>
            <button type="button" disabled={busy || !manual.model.trim()} onClick={() => add({ brand: manual.brand, model: manual.model, year: manual.year ? Number(manual.year) : null })}
              className="ml-auto rounded-lg bg-brand-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader2 size={11} className="inline animate-spin" /> : 'Salvar'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mb-2 text-[11px] text-red-600">{error}</p>}

      {active.map((v) => (
        <div key={v.id} className="group mb-2 flex items-center gap-2 rounded-lg border border-gray-100 p-2.5 dark:border-white/5">
          <Car size={14} className="shrink-0 text-gray-400" />
          <div className="min-w-0 flex-1">
            {v.vehicleId
              ? <Link href={`/estoque/${v.vehicleId}`} className="block truncate text-[12px] font-medium text-gray-900 hover:text-brand-700 hover:underline dark:text-white">{title(v)}</Link>
              : <p className="truncate text-[12px] font-medium text-gray-900 dark:text-white">{title(v)}</p>}
            <p className="text-[10px] text-gray-400">{[v.year, v.plate, brl(v.priceViewed)].filter(Boolean).join(' · ') || null}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!v.vehicleId && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-500 dark:bg-slate-800">Fora do estoque</span>}
            {v.isPrimary && <span className="rounded bg-brand-100 px-1 py-0.5 text-[9px] font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">Principal</span>}
            <button onClick={() => remove(v)} className="rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" title="Remover"><Trash2 size={12} /></button>
          </div>
        </div>
      ))}
      {active.length === 0 && mode === 'closed' && <p className="text-[12px] italic text-gray-400">Nenhum veículo.</p>}
    </div>
  )
}
