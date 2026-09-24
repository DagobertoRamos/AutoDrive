'use client'
/* eslint-disable @next/next/no-img-element -- capas vindas do estoque */

// =============================================================================
// Painel do Site — Promoções (porta de /admin/promocoes do dagobertoeasycar).
// Preço "de/por" com início e fim: o site mostra o preço riscado enquanto a
// promoção vale. Grava pela precificação do estoque (/api/vehicles/[id]/pricing),
// que guarda o histórico de preço.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BadgePercent, CalendarClock, Images, Loader2, Pencil, Search, Star, Tag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { discountPct, type PromoState } from '@/lib/site/listing-core'

interface Row {
  id: string; title: string; plate: string | null; cover: string | null; state: 'PUBLICADO' | 'EM_BREVE' | 'HIDDEN'
  listing: { featured: boolean }
  promo: { state: PromoState; salePrice: number | null; promoPrice: number | null; startsAt: string | null; endsAt: string | null }
}

const PROMO: Record<PromoState, { label: string; cls: string }> = {
  ATIVA: { label: 'Em promoção', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  AGENDADA: { label: 'Agendada', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  ENCERRADA: { label: 'Encerrada', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  NENHUMA: { label: 'Sem promoção', cls: 'bg-white text-gray-500 border-gray-200' },
}
const brl = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))
const when = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null)
const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

/** ISO → valor de <input type="datetime-local"> no fuso do navegador. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function SitePromotionsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [banners, setBanners] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<PromoState>('ATIVA')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Row | null>(null)

  const load = useCallback(async () => {
    const [l, c] = await Promise.all([
      fetch('/api/site-admin/listings', { credentials: 'include' }).then((r) => r.json()).catch(() => null),
      fetch('/api/site-admin/config', { credentials: 'include' }).then((r) => r.json()).catch(() => null),
    ])
    // Só carros que podem estar no site (os fora do site por venda/inatividade não entram).
    setRows(((l?.data ?? []) as Row[]).filter((r) => r.state !== 'HIDDEN' || r.promo.state !== 'NENHUMA'))
    const cfg = c?.data?.config
    setBanners(cfg?.services?.banners ? (cfg.banners.items as { active: boolean }[]).filter((b) => b.active).length : 0)
    setLoading(false)
  }, [])
  useEffect(() => {
    let alive = true
    void Promise.resolve().then(() => { if (alive) void load() })
    return () => { alive = false }
  }, [load])

  const count = useMemo(() => {
    const c: Record<PromoState, number> = { ATIVA: 0, AGENDADA: 0, ENCERRADA: 0, NENHUMA: 0 }
    for (const r of rows) c[r.promo.state]++
    return c
  }, [rows])
  const featured = rows.filter((r) => r.listing.featured && r.state !== 'HIDDEN').length
  const needle = q.trim().toLowerCase()
  const shown = rows.filter((r) => r.promo.state === tab && (!needle || `${r.title} ${r.plate ?? ''}`.toLowerCase().includes(needle)))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><BadgePercent size={20} className="text-brand-600" />Promoções</h1>
        <p className="text-sm text-gray-500">Preço “de/por” com início e fim. Enquanto a promoção vale, o site mostra o preço anterior riscado e o selo de oferta.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: 'Em promoção agora', v: count.ATIVA, n: `${count.AGENDADA} agendada(s)`, icon: Tag, on: () => setTab('ATIVA') },
          { l: 'Agendadas', v: count.AGENDADA, n: 'começam sozinhas na data', icon: CalendarClock, on: () => setTab('AGENDADA') },
          { l: 'Carros em destaque', v: featured, n: 'aparecem primeiro na vitrine', icon: Star, href: '/site/anuncios' },
          { l: 'Banners ativos', v: banners, n: 'carrossel da página inicial', icon: Images, href: '/site/banners' },
        ].map((c) => {
          const body = <><p className="flex items-center gap-1.5 text-xs text-gray-500"><c.icon size={13} />{c.l}</p><p className="text-2xl font-bold tabular-nums text-gray-900">{c.v}</p><p className="text-[11px] text-gray-400">{c.n}</p></>
          const cls = 'rounded-xl border border-gray-200 bg-white p-4 text-left shadow-card hover:border-brand-300'
          return c.href ? <Link key={c.l} href={c.href} className={cls}>{body}</Link> : <button key={c.l} onClick={c.on} className={cls}>{body}</button>
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['ATIVA', 'AGENDADA', 'ENCERRADA', 'NENHUMA'] as PromoState[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', tab === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
            {k === 'NENHUMA' ? 'Criar promoção' : PROMO[k].label} <span className="opacity-70">{count[k]}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar carro ou placa" className={cn(input, 'pl-9')} />
        </div>
      </div>

      {loading ? <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div>
        : shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
            {tab === 'ATIVA' ? 'Nenhum carro em promoção agora. Abra “Criar promoção” para escolher um carro.' : tab === 'NENHUMA' ? 'Todos os carros do site já têm promoção.' : 'Nada por aqui.'}
          </p>
        ) : (
        <ul className="space-y-2">
          {shown.map((r) => {
            const p = r.promo
            const off = discountPct(p.salePrice, p.promoPrice)
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-card">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">{r.cover ? <img src={r.cover} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[10px] text-gray-400">sem foto</div>}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-gray-900">{r.title}</span>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', PROMO[p.state].cls)}>{PROMO[p.state].label}</span>
                    {off != null && p.state !== 'NENHUMA' && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">-{off}%</span>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {p.state === 'NENHUMA' ? <>Preço de venda <b className="text-gray-700">{brl(p.salePrice)}</b></>
                      : <><s className="text-gray-400">{brl(p.salePrice)}</s> por <b className="text-gray-800">{brl(p.promoPrice)}</b></>}
                    {r.plate && ` · ${r.plate}`}
                  </p>
                  {p.state !== 'NENHUMA' && (p.startsAt || p.endsAt) && (
                    <p className="text-[11px] text-gray-400">{p.startsAt ? `De ${when(p.startsAt)}` : 'Desde já'}{p.endsAt ? ` até ${when(p.endsAt)}` : ', sem data para acabar'}</p>
                  )}
                  {r.state === 'EM_BREVE' && <p className="text-[11px] text-amber-700">Carro ainda sem fotos: a promoção aparece quando ele for publicado.</p>}
                </div>
                <button onClick={() => setEditing(r)} className="btn-secondary px-2 py-1.5 text-xs">
                  {p.state === 'NENHUMA' ? <><Tag size={13} />Criar promoção</> : <><Pencil size={13} />Editar</>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <PromoEditor row={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load() }} />}
    </div>
  )
}

function PromoEditor({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const sale = row.promo.salePrice
  const [price, setPrice] = useState(row.promo.promoPrice && row.promo.state !== 'ENCERRADA' ? String(Math.round(row.promo.promoPrice)) : '')
  const [start, setStart] = useState(row.promo.state === 'ENCERRADA' ? '' : toLocalInput(row.promo.startsAt))
  const [end, setEnd] = useState(row.promo.state === 'ENCERRADA' ? '' : toLocalInput(row.promo.endsAt))
  const [busy, setBusy] = useState<'save' | 'end' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const value = Number(price.replace(/\D/g, '')) || null
  const off = discountPct(sale, value)
  const hasPromo = row.promo.state === 'ATIVA' || row.promo.state === 'AGENDADA'

  const send = async (kind: 'save' | 'end', body: Record<string, unknown>) => {
    setBusy(kind); setErr(null)
    try {
      const r = await fetch(`/api/vehicles/${row.id}/pricing`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j?.error ?? 'Não foi possível salvar.'); return }
      onSaved()
    } catch { setErr('Erro de rede.') } finally { setBusy(null) }
  }
  const save = () => {
    if (!sale) { setErr('Defina o preço de venda do carro no estoque antes de criar a promoção.'); return }
    if (!value) { setErr('Informe o preço promocional.'); return }
    void send('save', {
      isPromo: true, promoPrice: value,
      promoStartsAt: start ? new Date(start).toISOString() : null,
      promoEndsAt: end ? new Date(end).toISOString() : null,
      reason: 'Promoção pelo painel do site',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-2">
          <div><h2 className="text-lg font-bold text-gray-900">{hasPromo ? 'Editar promoção' : 'Criar promoção'}</h2><p className="text-xs text-gray-500">{row.title}</p></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Preço de venda: <b>{brl(sale)}</b></p>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Preço promocional (R$)</span>
            <input inputMode="numeric" className={input} value={price} placeholder="Ex.: 89900" onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
          </label>
          {sale != null && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500">Desconto rápido:</span>
              {[3, 5, 10, 15].map((pc) => (
                <button key={pc} type="button" onClick={() => setPrice(String(Math.round((sale * (100 - pc)) / 100 / 100) * 100))} className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-700 hover:border-rose-300 hover:bg-rose-50">-{pc}%</button>
              ))}
              {off != null && <span className="ml-auto text-xs font-semibold text-rose-600">{off}% de desconto · {brl((sale ?? 0) - (value ?? 0))} a menos</span>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Começa <span className="text-gray-400">(vazio = agora)</span></span><input type="datetime-local" className={input} value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-gray-600">Termina <span className="text-gray-400">(vazio = sem data)</span></span><input type="datetime-local" className={input} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {hasPromo && <button onClick={() => void send('end', { isPromo: false, reason: 'Promoção encerrada pelo painel do site' })} disabled={!!busy} className="mr-auto rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">{busy === 'end' && <Loader2 size={14} className="mr-1 inline animate-spin" />}Encerrar promoção</button>}
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={save} disabled={!!busy} className="btn-primary text-sm">{busy === 'save' && <Loader2 size={14} className="animate-spin" />}Salvar promoção</button>
          </div>
        </div>
      </div>
    </div>
  )
}
