'use client'

// =============================================================================
// Painel do Site — organização do site pelo lojista:
//   • Menu do topo: ordem (setas), nome, mostrar/ocultar, links próprios.
//   • Página inicial em blocos: ordem, liga/desliga e textos de cada bloco.
// Tudo entra no rascunho da página; "Pré-visualizar" mostra antes de salvar.
// =============================================================================

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SiteConfig } from '@/lib/site/config-core'
import { ACTION_DEFS, HOME_BLOCKS, MENU_PAGES, SITE_MAX_MENU, type HomeBlock, type SiteMenuItem } from '@/lib/site/layout-core'

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50'
const small = 'mb-1 block text-[11px] font-medium text-gray-600'

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

function OrderButtons({ i, n, onMove, disabled }: { i: number; n: number; onMove: (dir: -1 | 1) => void; disabled: boolean }) {
  return (
    <span className="flex shrink-0 flex-col">
      <button type="button" disabled={disabled || i === 0} onClick={() => onMove(-1)} className="text-gray-400 hover:text-brand-700 disabled:opacity-30" aria-label="Subir"><ArrowUp size={14} /></button>
      <button type="button" disabled={disabled || i === n - 1} onClick={() => onMove(1)} className="text-gray-400 hover:text-brand-700 disabled:opacity-30" aria-label="Descer"><ArrowDown size={14} /></button>
    </span>
  )
}

export function LayoutSection({ cfg, dis, onChange }: { cfg: SiteConfig; dis: boolean; onChange: (patch: Partial<SiteConfig>) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const menu = cfg.menu
  const blocks = cfg.homeBlocks
  const svcOn = (k: string | null) => !k || !!cfg.services[k as keyof SiteConfig['services']]
  const blockVisible = (t: string) => !!blocks.find((b) => b.type === t)?.visible

  const setMenu = (next: SiteMenuItem[]) => onChange({ menu: next })
  const setBlock = (i: number, patch: Partial<HomeBlock>) => onChange({ homeBlocks: blocks.map((b, k) => (k === i ? { ...b, ...patch } : b)) })

  const menuNote = (m: SiteMenuItem): string | null => {
    if (m.href) return null
    const page = MENU_PAGES.find((p) => p.key === m.key)
    if (page?.service && !svcOn(page.service)) return 'serviço desligado: não aparece'
    if (page?.needsBlock && !blockVisible(page.needsBlock)) return 'bloco “Parceiros” desligado: não aparece'
    return null
  }
  const shown = menu.filter((m) => m.visible && !menuNote(m)).length

  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">Menu do topo</h2>
        <p className="mb-3 text-xs text-gray-500">Escolha o que aparece no menu, a ordem (setas) e o nome de cada item. Todos os itens marcados ficam visíveis no topo; no celular viram o menu ☰. Hoje aparecem <b>{shown}</b> itens.</p>
        <ul className="space-y-1.5">
          {menu.map((m, i) => {
            const note = menuNote(m)
            const page = MENU_PAGES.find((p) => p.key === m.key)
            return (
              <li key={m.key} className={cn('flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5', (!m.visible || note) && 'bg-gray-50')}>
                <OrderButtons i={i} n={menu.length} disabled={dis} onMove={(d) => setMenu(move(menu, i, d))} />
                <button type="button" disabled={dis} onClick={() => setMenu(menu.map((x, k) => (k === i ? { ...x, visible: !x.visible } : x)))} className={cn('shrink-0', m.visible ? 'text-brand-700' : 'text-gray-400')} aria-label={m.visible ? 'Ocultar do menu' : 'Mostrar no menu'} title={m.visible ? 'Aparece no menu' : 'Oculto'}>
                  {m.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <input disabled={dis} className={cn(input, 'py-1.5')} value={m.label} maxLength={40} onChange={(e) => setMenu(menu.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                {m.href !== undefined
                  ? <input disabled={dis} className={cn(input, 'py-1.5')} placeholder="https://… ou /pagina" value={m.href} maxLength={300} onChange={(e) => setMenu(menu.map((x, k) => (k === i ? { ...x, href: e.target.value } : x)))} />
                  : <span className="hidden w-48 shrink-0 truncate text-[11px] text-gray-400 md:block">{note ?? page?.path}</span>}
                {m.key.startsWith('link-') && !dis && <button type="button" onClick={() => setMenu(menu.filter((_, k) => k !== i))} className="shrink-0 text-gray-400 hover:text-red-600" aria-label="Remover link"><Trash2 size={14} /></button>}
              </li>
            )
          })}
        </ul>
        {!dis && menu.length < SITE_MAX_MENU && (
          <button type="button" onClick={() => setMenu([...menu, { key: `link-${Date.now().toString(36)}`, label: 'Novo link', visible: true, href: '' }])} className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus size={12} />Adicionar link próprio</button>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-gray-900">Página inicial em blocos</h2>
        <p className="mb-3 text-xs text-gray-500">Monte a página inicial: ligue ou desligue cada bloco, mude a ordem com as setas e edite os textos em “Editar”. Use <b>Pré-visualizar</b> (embaixo) para ver antes de salvar.</p>
        <ul className="space-y-1.5">
          {blocks.map((b, i) => {
            const def = HOME_BLOCKS.find((d) => d.type === b.type)
            if (!def) return null
            const expanded = open === b.type
            const editable = def.fields.length > 0
            return (
              <li key={b.type} className={cn('rounded-lg border border-gray-100', !b.visible && 'bg-gray-50')}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <OrderButtons i={i} n={blocks.length} disabled={dis} onMove={(d) => onChange({ homeBlocks: move(blocks, i, d) })} />
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="checkbox" disabled={dis} checked={b.visible} onChange={(e) => setBlock(i, { visible: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                    <span className="min-w-0"><span className={cn('block text-sm font-medium', b.visible ? 'text-gray-900' : 'text-gray-500')}>{def.label}</span><span className="block truncate text-[11px] text-gray-500">{def.hint}</span></span>
                  </label>
                  {editable && <button type="button" onClick={() => setOpen(expanded ? null : b.type)} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700">Editar<ChevronDown size={13} className={cn('transition', expanded && 'rotate-180')} /></button>}
                </div>
                {expanded && editable && (
                  <div className="grid gap-2 border-t border-gray-100 px-3 py-3 md:grid-cols-2">
                    {def.fields.includes('eyebrow') && <label><span className={small}>Chamada pequena</span><input disabled={dis} className={input} value={b.eyebrow} maxLength={80} onChange={(e) => setBlock(i, { eyebrow: e.target.value })} /></label>}
                    {def.fields.includes('title') && <label><span className={small}>Título</span><input disabled={dis} className={input} value={b.title} maxLength={120} onChange={(e) => setBlock(i, { title: e.target.value })} /></label>}
                    {def.fields.includes('text') && <label className="md:col-span-2"><span className={small}>Texto</span><textarea disabled={dis} rows={2} className={input} value={b.text} maxLength={500} onChange={(e) => setBlock(i, { text: e.target.value })} /></label>}
                    {def.fields.includes('eyebrow2') && <p className="md:col-span-2 mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Quadro “Venda seu carro”</p>}
                    {def.fields.includes('eyebrow2') && <label><span className={small}>Chamada pequena</span><input disabled={dis} className={input} value={b.eyebrow2} maxLength={80} onChange={(e) => setBlock(i, { eyebrow2: e.target.value })} /></label>}
                    {def.fields.includes('title2') && <label><span className={small}>Título</span><input disabled={dis} className={input} value={b.title2} maxLength={120} onChange={(e) => setBlock(i, { title2: e.target.value })} /></label>}
                    {def.fields.includes('text2') && <label className="md:col-span-2"><span className={small}>Texto</span><textarea disabled={dis} rows={2} className={input} value={b.text2} maxLength={500} onChange={(e) => setBlock(i, { text2: e.target.value })} /></label>}
                    {def.fields.includes('bullets') && <label className="md:col-span-2"><span className={small}>Tópicos (um por linha, até 6)</span><textarea disabled={dis} rows={3} className={input} value={b.bullets.join('\n')} onChange={(e) => setBlock(i, { bullets: e.target.value.split('\n').slice(0, 6) })} /></label>}
                    {def.fields.includes('cards') && (
                      <div className="md:col-span-2">
                        <span className={small}>Cartões (marque os que aparecem; setas mudam a ordem)</span>
                        <ul className="space-y-1.5">
                          {b.cards.map((c, ci) => {
                            const ad = ACTION_DEFS.find((a) => a.kind === c.kind)
                            const off = ad && ((ad.service && !svcOn(ad.service)) || (ad.needsBlock && !blockVisible(ad.needsBlock)))
                            return (
                              <li key={c.kind} className="flex items-start gap-2 rounded-lg border border-gray-100 p-2">
                                <OrderButtons i={ci} n={b.cards.length} disabled={dis} onMove={(d) => setBlock(i, { cards: move(b.cards, ci, d) })} />
                                <input type="checkbox" disabled={dis} checked={c.visible} onChange={(e) => setBlock(i, { cards: b.cards.map((x, k) => (k === ci ? { ...x, visible: e.target.checked } : x)) })} className="mt-2 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                                <div className="grid min-w-0 flex-1 gap-1 md:grid-cols-2">
                                  <input disabled={dis} className={cn(input, 'py-1.5')} value={c.title} maxLength={60} onChange={(e) => setBlock(i, { cards: b.cards.map((x, k) => (k === ci ? { ...x, title: e.target.value } : x)) })} />
                                  <input disabled={dis} className={cn(input, 'py-1.5')} value={c.text} maxLength={200} onChange={(e) => setBlock(i, { cards: b.cards.map((x, k) => (k === ci ? { ...x, text: e.target.value } : x)) })} />
                                  {off && <span className="text-[11px] text-amber-700 md:col-span-2">Não aparece: {ad?.needsBlock ? 'ligue o bloco “Parceiros”' : 'ligue o serviço correspondente'}.</span>}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
