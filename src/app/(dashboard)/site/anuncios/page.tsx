'use client'
/* eslint-disable @next/next/no-img-element -- capas vindas do estoque */

// =============================================================================
// Painel do Site — Anúncios: todo carro do estoque com a situação no site
// (Publicado / Em breve / Fora do site e o motivo). Destaque e "esconder" num
// clique; editor do anúncio (título, descrição, opcionais, vídeo, SEO).
// Fotos são geridas no estoque (é o que tira o carro do "Em breve").
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Camera, Eye, EyeOff, ExternalLink, Loader2, Megaphone, Pencil, RefreshCw, Search, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type State = 'PUBLICADO' | 'EM_BREVE' | 'HIDDEN'
interface Listing { featured: boolean; hidden: boolean; title: string; description: string; options: string[]; videoUrl: string; seoTitle: string; seoDescription: string }
interface Row {
  id: string; title: string; slug: string; plate: string | null; year: number | null; modelYear: number | null; km: number | null
  cover: string | null; photos: number; state: State; why: string | null; price: number | null; oldPrice: number | null; listing: Listing
}

const STATE: Record<State, { label: string; cls: string }> = {
  PUBLICADO: { label: 'Publicado', cls: 'bg-green-50 text-green-700 border-green-200' },
  EM_BREVE: { label: 'Em breve', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  HIDDEN: { label: 'Fora do site', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}
const money = (v: number | null) => (v == null ? 'Consulte' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function SiteListingsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<State, number>>({ PUBLICADO: 0, EM_BREVE: 0, HIDDEN: 0 })
  const [filter, setFilter] = useState<State | ''>('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [slug, setSlug] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams(); if (q.trim()) p.set('q', q.trim())
      const [l, c] = await Promise.all([
        fetch(`/api/site-admin/listings?${p}`, { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/site-admin/config', { credentials: 'include' }).then((r) => r.json()).catch(() => null),
      ])
      setRows(l?.data ?? []); setCounts(l?.counts ?? { PUBLICADO: 0, EM_BREVE: 0, HIDDEN: 0 })
      if (c?.data?.config?.enabled) setSlug(c.data.config.slug)
    } finally { setLoading(false) }
  }, [q])
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t) }, [load])

  const save = async (row: Row, listing: Listing) => {
    setBusy(row.id); setErr(null)
    try {
      const r = await fetch(`/api/site-admin/listings/${row.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(listing) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j?.error ?? 'Não foi possível salvar.'); return false }
      await load(); return true
    } finally { setBusy(null) }
  }

  const shown = filter ? rows.filter((r) => r.state === filter) : rows

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Megaphone size={20} className="text-brand-600" />Anúncios do site</h1>
          <p className="text-sm text-gray-500">Todo carro Disponível do estoque entra no site. Com fotos é publicado; sem fotos aparece como “Em breve”.</p>
        </div>
        <button onClick={() => void load()} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['', 'Todos', rows.length], ['PUBLICADO', 'Publicados', counts.PUBLICADO], ['EM_BREVE', 'Em breve', counts.EM_BREVE], ['HIDDEN', 'Fora do site', counts.HIDDEN]] as const).map(([k, l, n]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', filter === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>{l} <span className="opacity-70">{n}</span></button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar marca, modelo ou placa" className={cn(input, 'pl-9')} />
        </div>
      </div>
      {err && !editing && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

      {loading && !rows.length ? <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>
        : shown.length === 0 ? <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">Nenhum carro aqui. Os carros cadastrados no Estoque aparecem nesta lista.</p>
        : (
        <ul className="space-y-2">
          {shown.map((r) => {
            const st = STATE[r.state]
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-card">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100">{r.cover ? <img src={r.cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] text-gray-400">sem foto</div>}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-gray-900">{r.listing.title || r.title}</span>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', st.cls)}>{st.label}</span>
                    {r.listing.featured && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><Star size={10} />Destaque</span>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {[r.plate, r.year || r.modelYear ? `${r.year ?? '—'}/${r.modelYear ?? '—'}` : null, r.km != null ? `${r.km.toLocaleString('pt-BR')} km` : null].filter(Boolean).join(' · ')}
                    {' · '}{r.oldPrice != null && <s className="mr-1 text-gray-400">{money(r.oldPrice)}</s>}<b className="text-gray-700">{money(r.price)}</b>
                    {' · '}<span className={cn(r.photos === 0 && 'text-amber-700')}>{r.photos} foto(s)</span>
                  </p>
                  {r.why && <p className="text-[11px] text-gray-400">Fora do site: {r.why}</p>}
                  {r.state === 'EM_BREVE' && <p className="text-[11px] text-amber-700">Envie as fotos no estoque para publicar.</p>}
                </div>
                <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                  <button onClick={() => void save(r, { ...r.listing, featured: !r.listing.featured })} disabled={busy === r.id} title={r.listing.featured ? 'Tirar destaque' : 'Destacar'} className={cn('rounded-lg border p-2', r.listing.featured ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-gray-200 text-gray-400 hover:text-amber-600')} aria-label="Destaque"><Star size={14} /></button>
                  <button onClick={() => void save(r, { ...r.listing, hidden: !r.listing.hidden })} disabled={busy === r.id} title={r.listing.hidden ? 'Mostrar no site' : 'Esconder do site'} className={cn('rounded-lg border p-2', r.listing.hidden ? 'border-gray-300 bg-gray-100 text-gray-600' : 'border-gray-200 text-gray-400 hover:text-gray-700')} aria-label="Esconder">{r.listing.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  <Link href={`/estoque/${r.id}`} className="btn-secondary px-2 py-1.5 text-xs" title="Fotos no estoque"><Camera size={13} />Fotos</Link>
                  <button onClick={() => { setErr(null); setEditing(r) }} className="btn-secondary px-2 py-1.5 text-xs"><Pencil size={13} />Anúncio</button>
                  {slug && r.state !== 'HIDDEN' && <a href={`/s/${slug}/veiculos/${r.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:text-brand-700" title="Ver no site" aria-label="Ver no site"><ExternalLink size={14} /></a>}
                  {busy === r.id && <Loader2 size={14} className="animate-spin text-gray-400" />}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <ListingEditor row={editing} onClose={() => { setErr(null); setEditing(null) }} onSave={async (l) => { if (await save(editing, l)) setEditing(null) }} busy={busy === editing.id} error={err} />}
    </div>
  )
}

function ListingEditor({ row, onClose, onSave, busy, error }: { row: Row; onClose: () => void; onSave: (l: Listing) => void; busy: boolean; error: string | null }) {
  const [l, setL] = useState<Listing>(row.listing)
  const [optText, setOptText] = useState(row.listing.options.join('\n'))
  const set = (p: Partial<Listing>) => setL((x) => ({ ...x, ...p }))
  const autoSeo = `${row.title}${row.modelYear ? ` ${row.modelYear}` : ''} — ${money(row.price)}`
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-2">
          <div><h2 className="text-lg font-bold text-gray-900">Anúncio no site</h2><p className="text-xs text-gray-500">{row.title}</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={l.featured} onChange={(e) => set({ featured: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Destaque (aparece primeiro)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={l.hidden} onChange={(e) => set({ hidden: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Esconder do site</label>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Título do anúncio <span className="text-gray-400">(vazio = marca, modelo e versão)</span></span><input className={input} value={l.title} placeholder={row.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Descrição</span><textarea rows={6} className={input} value={l.description} placeholder="Ex.: Único dono, revisões na concessionária, IPVA pago, pneus novos." onChange={(e) => set({ description: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Opcionais <span className="text-gray-400">(um por linha ou separados por vírgula)</span></span><textarea rows={4} className={input} value={optText} placeholder={'Ar-condicionado\nCentral multimídia\nCâmera de ré'} onChange={(e) => setOptText(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Vídeo <span className="text-gray-400">(link do YouTube ou .mp4)</span></span><input className={input} value={l.videoUrl} placeholder="https://www.youtube.com/watch?v=..." onChange={(e) => set({ videoUrl: e.target.value })} /></label>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-700">Como aparece no Google</p>
            <label className="block"><span className="mb-1 flex justify-between text-xs text-gray-600">Título <span className="text-gray-400">{l.seoTitle.length}/70</span></span><input maxLength={70} className={input} value={l.seoTitle} placeholder={autoSeo} onChange={(e) => set({ seoTitle: e.target.value })} /></label>
            <label className="mt-2 block"><span className="mb-1 flex justify-between text-xs text-gray-600">Descrição <span className="text-gray-400">{l.seoDescription.length}/170</span></span><textarea rows={2} maxLength={170} className={input} value={l.seoDescription} placeholder="Gerada automaticamente com ano, km e preço." onChange={(e) => set({ seoDescription: e.target.value })} /></label>
            <div className="mt-3 rounded-md bg-gray-50 p-2">
              <p className="truncate text-sm text-[#1a0dab]">{l.seoTitle || autoSeo}</p>
              <p className="line-clamp-2 text-xs text-gray-600">{l.seoDescription || `${row.title}, ${row.km != null ? `${row.km.toLocaleString('pt-BR')} km, ` : ''}${money(row.price)}. Financiamento e atendimento pela loja.`}</p>
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => onSave({ ...l, options: optText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) })} disabled={busy} className="btn-primary text-sm">{busy && <Loader2 size={14} className="animate-spin" />}Salvar anúncio</button>
          </div>
        </div>
      </div>
    </div>
  )
}
