'use client'

// =============================================================================
// Publicações › Ficha — origem do carro (tag do site) e opcionais em checkbox
// pesquisável, por grupo, separando equipamento / acessório / estado.
// API: /api/publications/profile/[vehicleId]
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ExternalLink, Loader2, Plus, Save, Search, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { foldText, OPTION_CATALOG, OPTION_KIND_LABEL, optionInfo, searchOptions, type OptionKind } from '@/lib/stock/options-catalog'
import { ORIGIN_LABEL, type OriginType } from '@/lib/stock/origin-core'

interface Profile {
  originType: OriginType; originDefined: boolean; partnerStoreId: string | null
  options: string[]; suggested: string[]
  partners: Array<{ id: string; name: string; city: string | null; active: boolean }>
}

const ORIGIN_HINT: Record<OriginType, string> = {
  OWN: 'Carro da loja. Tag no site: “Estoque <sua loja>”.',
  PARTNER: 'Carro de lojista parceiro. Tag no site: “Lojista parceiro”.',
  PRIVATE: 'Carro de particular intermediado (consignação). Tag: “Particular intermediado”.',
}
const KIND_TONE: Record<OptionKind, string> = { EQUIPAMENTO: 'bg-sky-50 text-sky-700', ACESSORIO: 'bg-violet-50 text-violet-700', HISTORICO: 'bg-amber-50 text-amber-800' }

export function ListingProfileStep({ vehicleId, canEdit }: { vehicleId: string; canEdit: boolean }) {
  const [p, setP] = useState<Profile | null>(null)
  const [origin, setOrigin] = useState<OriginType>('OWN')
  const [partnerId, setPartnerId] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [group, setGroup] = useState(OPTION_CATALOG[0].group)
  const [kind, setKind] = useState<OptionKind | 'TODOS'>('TODOS')
  const [custom, setCustom] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const dirty = useRef(false)

  useEffect(() => {
    fetch(`/api/publications/profile/${vehicleId}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (!j.success) throw new Error(j.error ?? 'Falha ao carregar a ficha.')
      setP(j.data); setOrigin(j.data.originType); setPartnerId(j.data.partnerStoreId ?? ''); setPicked(j.data.options)
    }).catch((e) => { setState('error'); setMsg((e as Error).message) })
  }, [vehicleId])

  const pickedKeys = useMemo(() => new Set(picked.map(foldText)), [picked])
  const has = (name: string) => pickedKeys.has(foldText(name))
  const touch = () => { dirty.current = true; setState('idle') }
  const toggle = (name: string) => { touch(); setPicked((l) => (has(name) ? l.filter((x) => foldText(x) !== foldText(name)) : [...l, name])) }
  const add = (names: string[]) => { touch(); setPicked((l) => { const s = new Set(l.map(foldText)); return [...l, ...names.filter((n) => !s.has(foldText(n)))] }) }

  const save = useCallback(async () => {
    if (!dirty.current || !canEdit) return true
    if (origin === 'PARTNER' && !partnerId) { setState('error'); setMsg('Escolha a loja parceira.'); return false }
    setState('saving')
    try {
      const r = await fetch(`/api/publications/profile/${vehicleId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originType: origin, partnerStoreId: origin === 'PARTNER' ? partnerId : null, options: picked }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falha ao salvar.')
      dirty.current = false; setState('saved'); setPicked(j.data.options)
      return true
    } catch (e) { setState('error'); setMsg((e as Error).message); return false }
  }, [canEdit, origin, partnerId, picked, vehicleId])
  // Salva ao sair da etapa / trocar de veículo.
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save }, [save])
  useEffect(() => () => { void saveRef.current() }, [])

  const results = q.trim() ? searchOptions(q, 80) : null
  const current = OPTION_CATALOG.find((g) => g.group === group)!
  const countIn = (g: string) => picked.filter((o) => optionInfo(o)?.group === g).length
  const suggestedNew = (p?.suggested ?? []).filter((s) => !has(s))

  if (!p) return state === 'error' ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{msg}</p> : <Loader2 className="animate-spin text-gray-400" />

  return (
    <section className="space-y-4">
      {/* Origem */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="mb-2 text-sm font-semibold text-gray-900">Origem do carro <span className="font-normal text-gray-500">— vira a tag no site</span></p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['OWN', 'PARTNER', 'PRIVATE'] as OriginType[]).map((o) => (
            <label key={o} className={cn('cursor-pointer rounded-lg border p-2.5 text-xs', origin === o ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300', !canEdit && 'cursor-default')}>
              <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <input type="radio" name="origem" checked={origin === o} disabled={!canEdit} onChange={() => { touch(); setOrigin(o) }} className="text-brand-600" />
                {o === 'OWN' ? 'Estoque próprio' : ORIGIN_LABEL[o]}
              </span>
              <span className="mt-1 block text-gray-500">{ORIGIN_HINT[o]}</span>
            </label>
          ))}
        </div>
        {origin === 'PARTNER' && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={partnerId} disabled={!canEdit} onChange={(e) => { touch(); setPartnerId(e.target.value) }} className="min-w-[240px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="">Escolha a loja parceira…</option>
              {p.partners.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ''}{s.active ? '' : ' (inativa)'}</option>)}
            </select>
            <Link href="/cadastros/lojas-parceiras" target="_blank" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">Cadastrar loja parceira <ExternalLink size={11} /></Link>
          </div>
        )}
        {!p.originDefined && <p className="mt-2 text-[11px] text-amber-700">Origem ainda não confirmada: sugerimos pelo tipo de estoque. Confira e salve.</p>}
      </div>

      {/* Opcionais */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">Opcionais e itens <span className="font-normal text-gray-500">({picked.length} marcado{picked.length === 1 ? '' : 's'})</span></p>
          <div className="flex items-center gap-1 text-[11px]">
            {(['TODOS', 'EQUIPAMENTO', 'ACESSORIO', 'HISTORICO'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn('rounded-full border px-2 py-0.5', kind === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 text-gray-600')}>
                {k === 'TODOS' ? 'Todos' : OPTION_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {suggestedNew.length > 0 && canEdit && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <Sparkles size={13} /> A avaliação registrou {suggestedNew.length} opcional(is): {suggestedNew.slice(0, 6).join(', ')}{suggestedNew.length > 6 ? '…' : ''}
            <button type="button" onClick={() => add(suggestedNew)} className="font-semibold underline">Marcar todos</button>
          </div>
        )}

        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar opcional (ex.: carplay, câmera de ré, teto solar)…" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>

        {!results && (
          <div className="mb-2 flex gap-1 overflow-x-auto pb-1" role="tablist">
            {OPTION_CATALOG.map((g) => {
              const n = countIn(g.group)
              return (
                <button key={g.group} role="tab" aria-selected={group === g.group} type="button" onClick={() => setGroup(g.group)}
                  className={cn('shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium', group === g.group ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                  {g.group}{n > 0 && <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{n}</span>}
                </button>
              )
            })}
          </div>
        )}

        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {results ? (
            results.filter((o) => kind === 'TODOS' || o.kind === kind).length === 0
              ? <p className="text-xs text-gray-500">Nada encontrado. Use “Adicionar item” abaixo.</p>
              : <OptionGrid items={results.filter((o) => kind === 'TODOS' || o.kind === kind).map((o) => ({ name: o.name, kind: o.kind, hint: `${o.group} › ${o.section}` }))} has={has} toggle={toggle} disabled={!canEdit} />
          ) : current.sections.filter((s) => kind === 'TODOS' || s.kind === kind).map((s) => (
            <div key={s.section}>
              <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{s.section}<span className={cn('rounded px-1 text-[10px] normal-case tracking-normal', KIND_TONE[s.kind])}>{OPTION_KIND_LABEL[s.kind]}</span></p>
              <OptionGrid items={s.items.map((name) => ({ name, kind: s.kind }))} has={has} toggle={toggle} disabled={!canEdit} />
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) { add([custom.trim()]); setCustom('') } }}
              placeholder="Item que não está na lista" className="min-w-[220px] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" maxLength={80} />
            <button type="button" disabled={!custom.trim()} onClick={() => { add([custom.trim()]); setCustom('') }} className="btn-secondary px-3 py-1.5 text-xs"><Plus size={13} />Adicionar item</button>
          </div>
        )}

        {picked.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {picked.map((o) => {
              const info = optionInfo(o)
              return (
                <span key={o} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]', info ? KIND_TONE[info.kind] : 'bg-gray-100 text-gray-700')}>
                  {o}{canEdit && <button type="button" onClick={() => toggle(o)} aria-label={`Remover ${o}`}><X size={11} /></button>}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { dirty.current = true; void save() }} className="btn-primary px-3 py-1.5 text-xs">{state === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar ficha</button>
          <span role="status" className={cn('text-xs', state === 'error' ? 'text-red-600' : 'text-gray-500')}>{state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Salvo' : state === 'error' ? msg : 'Salva sozinha ao continuar.'}</span>
        </div>
      )}
    </section>
  )
}

function OptionGrid({ items, has, toggle, disabled }: { items: Array<{ name: string; kind: OptionKind; hint?: string }>; has: (n: string) => boolean; toggle: (n: string) => void; disabled: boolean }) {
  return (
    <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((o) => {
        const on = has(o.name)
        return (
          <li key={o.name}>
            <label className={cn('flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-xs', on ? 'border-brand-400 bg-brand-50/60 text-brand-900' : 'border-gray-100 text-gray-700 hover:bg-gray-50', disabled && 'cursor-default')}>
              <span className={cn('mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 bg-white')}>{on && <Check size={10} />}</span>
              <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={() => toggle(o.name)} />
              <span className="min-w-0">
                <span className="block">{o.name}</span>
                {o.hint && <span className="block text-[10px] text-gray-400">{o.hint}</span>}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}
