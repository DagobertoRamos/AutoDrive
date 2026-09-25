'use client'
/* eslint-disable @next/next/no-img-element -- prévias das artes enviadas */

// =============================================================================
// Painel do Site — Banners e depoimentos da página inicial (porta de
// /admin/banners e /admin/depoimentos do dagobertoeasycar). Grava via PATCH:
// não mexe no resto da configuração do site.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Images, Loader2, Plus, Quote, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SITE_MAX_BANNERS, SITE_MAX_TESTIMONIALS, type SiteBanner, type SiteConfig, type SiteTestimonial } from '@/lib/site/config-core'
import { compressPhoto } from '@/lib/stock/photo-compress'

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50'
const label = 'mb-1 block text-xs font-medium text-gray-600'
const newId = () => Math.random().toString(36).slice(2, 10)

interface Draft { bannersOn: boolean; testimonialsOn: boolean; intervalSeconds: number; banners: SiteBanner[]; testimonials: SiteTestimonial[] }

function fromConfig(c: SiteConfig): Draft {
  return { bannersOn: c.services.banners, testimonialsOn: c.services.depoimentos, intervalSeconds: c.banners.intervalSeconds, banners: c.banners.items, testimonials: c.testimonials }
}

export default function SiteBannersPage() {
  const [d, setD] = useState<Draft | null>(null)
  const [slug, setSlug] = useState('')
  const [canManage, setCanManage] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/site-admin/config', { credentials: 'include' }).then((r) => r.json()).catch(() => null).then((j) => {
      if (alive && j?.data) { setD(fromConfig(j.data.config)); setSlug(j.data.config.enabled ? j.data.config.slug : ''); setCanManage(j.data.canManage) }
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!d) return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
  const dis = !canManage
  const set = (p: Partial<Draft>) => { setD({ ...d, ...p }); setDirty(true); setMsg(null) }
  const setBanner = (i: number, p: Partial<SiteBanner>) => set({ banners: d.banners.map((b, j) => (j === i ? { ...b, ...p } : b)) })
  const move = (i: number, dir: -1 | 1) => { const a = [...d.banners]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ banners: a }) }
  const setTesti = (i: number, p: Partial<SiteTestimonial>) => set({ testimonials: d.testimonials.map((t, j) => (j === i ? { ...t, ...p } : t)) })

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true); setMsg(null)
    const added: SiteBanner[] = []
    try {
      for (const f of Array.from(files).slice(0, SITE_MAX_BANNERS - d.banners.length)) {
        const blob = await compressPhoto(f, 1920)
        const fd = new FormData(); fd.append('file', blob, 'banner.webp'); fd.append('kind', 'BANNER')
        const r = await fetch('/api/site-admin/assets', { method: 'POST', body: fd, credentials: 'include' })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j?.error ?? 'Falha no envio.')
        added.push({ id: newId(), title: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 120), imageUrl: j.data.url, linkUrl: '', newTab: false, active: true, showText: false, eyebrow: '', text: '', buttonLabel: '' })
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha no envio.' })
    } finally {
      if (added.length) set({ banners: [...d.banners, ...added], bannersOn: d.bannersOn || d.banners.length === 0 })
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/site-admin/config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          services: { banners: d.bannersOn, depoimentos: d.testimonialsOn },
          banners: { intervalSeconds: d.intervalSeconds, items: d.banners },
          testimonials: d.testimonials.filter((t) => t.name.trim() && t.text.trim()),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao salvar.' }); return }
      setD(fromConfig(j.data)); setDirty(false); setMsg({ ok: true, text: 'Página inicial atualizada.' })
    } catch { setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setSaving(false) }
  }

  const incompleteTesti = d.testimonials.some((t) => !t.name.trim() || !t.text.trim())

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Images size={20} className="text-brand-600" />Banners e depoimentos</h1>
          <p className="text-sm text-gray-500">O que aparece na página inicial do site, além do estoque.</p>
        </div>
        {slug && <a href={`/s/${slug}`} target="_blank" rel="noreferrer" className="btn-secondary text-xs"><ExternalLink size={13} />Ver site</a>}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Banners da home</h2>
            <p className="text-xs text-gray-500">Carrossel ao lado do título da página inicial. Use artes na proporção 2:1 (ex.: 1916×821 px), com o texto já na imagem.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" disabled={dis} checked={d.bannersOn} onChange={(e) => set({ bannersOn: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Mostrar no site
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block w-40"><span className={label}>Troca a cada (segundos)</span>
            <input type="number" min={2} max={30} disabled={dis} className={input} value={d.intervalSeconds} onChange={(e) => set({ intervalSeconds: Math.min(30, Math.max(2, parseInt(e.target.value, 10) || 2)) })} />
          </label>
          {canManage && d.banners.length < SITE_MAX_BANNERS && (
            <>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary text-sm">{uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}Enviar banner</button>
            </>
          )}
          <span className="text-xs text-gray-400">{d.banners.length}/{SITE_MAX_BANNERS}</span>
        </div>

        {d.banners.length === 0
          ? <p className="mt-3 rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">Nenhum banner. Sem banners, a home mostra só o título e os botões.</p>
          : (
          <ul className="mt-3 space-y-2">
            {d.banners.map((b, i) => (
              <li key={b.id} className={cn('flex flex-col gap-3 rounded-lg border p-3 sm:flex-row', b.active ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70')}>
                <img src={b.imageUrl} alt="" className="aspect-[2/1] w-full shrink-0 rounded-md bg-gray-900 object-contain sm:w-56" />
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <label className="block"><span className={label}>Título {b.showText ? '(aparece sobre a imagem)' : '(texto alternativo)'}</span><input disabled={dis} className={input} value={b.title} maxLength={120} onChange={(e) => setBanner(i, { title: e.target.value })} /></label>
                  <label className="block"><span className={label}>Link ao clicar <span className="text-gray-400">(opcional)</span></span><input disabled={dis} className={input} value={b.linkUrl} placeholder="/veiculos ou https://wa.me/..." onChange={(e) => setBanner(i, { linkUrl: e.target.value })} /></label>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 sm:col-span-2"><input type="checkbox" disabled={dis} checked={b.showText} onChange={(e) => setBanner(i, { showText: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Mostrar texto e botão sobre a imagem <span className="font-normal text-gray-400">(use em artes sem texto; como no modelo “Oportunidades de vários parceiros”)</span></label>
                  {b.showText && (
                    <>
                      <label className="block"><span className={label}>Etiqueta</span><input disabled={dis} className={input} value={b.eyebrow} maxLength={60} placeholder="Ex.: Estoque atualizado" onChange={(e) => setBanner(i, { eyebrow: e.target.value })} /></label>
                      <label className="block"><span className={label}>Texto do botão</span><input disabled={dis} className={input} value={b.buttonLabel} maxLength={40} placeholder="Ex.: Ver veículos (leva ao link acima)" onChange={(e) => setBanner(i, { buttonLabel: e.target.value })} /></label>
                      <label className="block sm:col-span-2"><span className={label}>Texto</span><textarea disabled={dis} rows={2} className={input} value={b.text} maxLength={240} placeholder="Ex.: Compare modelos e encontre uma opção que combine com o seu momento." onChange={(e) => setBanner(i, { text: e.target.value })} /></label>
                    </>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-700 sm:col-span-2">
                    <label className="flex items-center gap-1.5"><input type="checkbox" disabled={dis} checked={b.active} onChange={(e) => setBanner(i, { active: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Ativo</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" disabled={dis} checked={b.newTab} onChange={(e) => setBanner(i, { newTab: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Abrir link em nova aba</label>
                    {canManage && (
                      <span className="ml-auto flex gap-1">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-gray-200 p-1.5 text-gray-500 disabled:opacity-30" aria-label="Subir"><ArrowUp size={13} /></button>
                        <button onClick={() => move(i, 1)} disabled={i === d.banners.length - 1} className="rounded border border-gray-200 p-1.5 text-gray-500 disabled:opacity-30" aria-label="Descer"><ArrowDown size={13} /></button>
                        <button onClick={() => set({ banners: d.banners.filter((_, j) => j !== i) })} className="rounded border border-gray-200 p-1.5 text-red-500 hover:bg-red-50" aria-label="Excluir banner"><Trash2 size={13} /></button>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Depoimentos de clientes</h2>
            <p className="text-xs text-gray-500">Cadastre só avaliações autorizadas pelos clientes. Até {SITE_MAX_TESTIMONIALS}.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" disabled={dis} checked={d.testimonialsOn} onChange={(e) => set({ testimonialsOn: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Mostrar no site
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {d.testimonials.map((t, i) => (
            <fieldset key={i} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between"><legend className="flex items-center gap-1 text-xs font-semibold text-gray-700"><Quote size={12} />Depoimento {i + 1}</legend>
                {canManage && <button onClick={() => set({ testimonials: d.testimonials.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500" aria-label="Remover depoimento"><Trash2 size={13} /></button>}</div>
              <input disabled={dis} className={input} value={t.name} maxLength={80} placeholder="Nome do cliente" onChange={(e) => setTesti(i, { name: e.target.value })} />
              <textarea disabled={dis} className={input} rows={3} value={t.text} maxLength={360} placeholder="O que o cliente disse" onChange={(e) => setTesti(i, { text: e.target.value })} />
              <input disabled={dis} className={input} value={t.vehicle} maxLength={100} placeholder="Veículo ou contexto (ex.: Compra de um Corolla)" onChange={(e) => setTesti(i, { vehicle: e.target.value })} />
            </fieldset>
          ))}
        </div>
        {canManage && d.testimonials.length < SITE_MAX_TESTIMONIALS && (
          <button onClick={() => set({ testimonials: [...d.testimonials, { name: '', text: '', vehicle: '' }], testimonialsOn: d.testimonialsOn || d.testimonials.length === 0 })} className="btn-secondary mt-3 text-sm"><Plus size={14} />Adicionar depoimento</button>
        )}
        {incompleteTesti && <p className="mt-2 text-xs text-amber-700">Depoimentos sem nome ou texto não são salvos.</p>}
      </section>

      {canManage && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64 pr-24">
          <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
            {msg && <span className={cn('text-sm', msg.ok ? 'text-green-700' : 'text-red-600')}>{msg.text}</span>}
            {dirty && !msg && <span className="text-xs text-gray-500">Alterações não salvas</span>}
            <button onClick={() => void save()} disabled={saving || !dirty} className="btn-primary text-sm">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar</button>
          </div>
        </div>
      )}
    </div>
  )
}
