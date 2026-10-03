'use client'
/* eslint-disable @next/next/no-img-element -- prévias geradas pelo servidor */

// =============================================================================
// Estúdio para Instagram e Facebook (Nova publicação › Canais):
//   formatos (Post, Carrossel, Story, Reels), modelo da arte com prévia real,
//   legenda por formato (escrita pela loja ou pela IA) e opção de espalhar os
//   envios nos horários de pico. Cada formato vira uma publicação na fila.
// =============================================================================

import { useState } from 'react'
import { Clapperboard, Eye, Images, Layers, Loader2, Shuffle, ShieldAlert, Smartphone, Sparkles, Square, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, inputCls } from '@/components/publications/ui'
import { pool } from '@/components/publications/BatchContent'
import { ART_TEMPLATES, FORMAT_INFO, SOCIAL_FORMATS, TEMPLATE_INFO, type ArtTemplate, type SocialFormat } from '@/lib/publications/social/formats'
import { CAPTION_TONES, TONE_LABEL, type CaptionTone } from '@/lib/publications/social/caption-core'
import type { MusicChoice } from '@/lib/publications/social/music-core'
import { MusicPicker } from '@/components/publications/MusicPicker'
import { CADENCE_NOTICE } from '@/lib/publications/social/cadence-core'
import { SocialPreviewModal } from '@/components/publications/SocialPreviewModal'
import { PhotoEnhanceToggle } from '@/components/publications/PhotoEnhanceToggle'
import { DesignPicker, VideoSecondsPicker } from '@/components/publications/DesignPicker'
import type { DesignStyle, VideoSeconds } from '@/lib/publications/social/design-styles'
import { limitDesigns, MAX_DESIGNS } from '@/lib/publications/social/variety-core'

export interface SocialChoice {
  formats: SocialFormat[]
  template: ArtTemplate
  tone: CaptionTone
  /** Legenda por `${vehicleId}:${formato}`; vazio = legenda automática. */
  captions: Record<string, string>
  spread: boolean
  /** Trilha dos vídeos (null = sem música). */
  music: MusicChoice | null
  /** Modelo visual (12 estilos) do vídeo e das artes. */
  design: DesignStyle
  /** Até 2 modelos: cada carro sai com um deles, sorteado. */
  designs?: DesignStyle[]
  /** Variar por carro a chamada da arte e o clima da música (sorteio). */
  vary?: boolean
  /** Duração do Reels (30 s já marcado). */
  seconds: VideoSeconds
}

export const DEFAULT_SOCIAL: SocialChoice = { formats: ['POST', 'REELS'], template: 'OFERTA', tone: 'VENDEDOR', captions: {}, spread: true, music: { mode: 'AUTO', mood: 'ANIMADA' }, design: 'CLASSICO', designs: ['CLASSICO'], vary: true, seconds: 30 }

const ICON: Record<SocialFormat, typeof Square> = { POST: Square, CARROSSEL: Images, STORY: Smartphone, REELS: Clapperboard, VIDEO: Video }

export function SocialStudio({ vehicles, value, onChange, hasInstagram = true, targets = [] }: { vehicles: Array<{ id: string; title: string }>; value: SocialChoice; onChange: (v: SocialChoice) => void; hasInstagram?: boolean; targets?: Array<{ id: string; channel: string; label: string }> }) {
  const [preview, setPreview] = useState(false)
  // Muda ao ligar/desligar o tratamento das fotos: recarrega as prévias da arte.
  const [artRev, setArtRev] = useState(0)
  const [current, setCurrent] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const vid = current && vehicles.some((v) => v.id === current) ? current : vehicles[0]?.id ?? null
  const set = (p: Partial<SocialChoice>) => onChange({ ...value, ...p })
  const toggle = (f: SocialFormat) => set({ formats: value.formats.includes(f) ? value.formats.filter((x) => x !== f) : SOCIAL_FORMATS.filter((x) => x === f || value.formats.includes(x)) })

  const generate = async (format: SocialFormat) => {
    if (!vid) return
    setBusy(format); setNote(null)
    try {
      const j = await api('/api/publications/social/caption', { method: 'POST', json: { vehicleId: vid, format, tone: value.tone } })
      set({ captions: { ...value.captions, [`${vid}:${format}`]: j.text } })
      setNote({ ok: true, text: j.ai ? `Legenda escrita pela IA (${j.source}). Revise antes de publicar.` : 'Nenhuma IA configurada: usei o modelo automático de legenda.' })
    } catch (e) { setNote({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  // Lote: legenda própria para cada carro × formato, com o tom girando (nenhuma sai igual).
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null)
  const generateAll = async (overwrite: boolean) => {
    const formats = value.formats.filter((f) => f !== 'STORY')
    const jobs = vehicles.flatMap((v, i) => formats.map((f, k) => ({ v, f, tone: CAPTION_TONES[(i + k) % CAPTION_TONES.length] })))
      .filter((j) => overwrite || !value.captions[`${j.v.id}:${j.f}`]?.trim())
    if (!jobs.length) { setNote({ ok: true, text: 'Todos os carros já têm legenda.' }); return }
    setBatch({ done: 0, total: jobs.length }); setNote(null)
    const acc = { ...value.captions }
    let fails = 0; let ai = 0
    await pool(jobs, 3, async (j) => {
      try {
        const r = await api('/api/publications/social/caption', { method: 'POST', json: { vehicleId: j.v.id, format: j.f, tone: j.tone } })
        acc[`${j.v.id}:${j.f}`] = r.text; if (r.ai) ai++
      } catch { fails++ } finally { setBatch((b) => (b ? { ...b, done: b.done + 1 } : b)) }
    })
    onChange({ ...value, captions: acc })
    setBatch(null)
    setNote({ ok: !fails, text: `${jobs.length - fails} legenda(s) escrita(s)${ai ? ` (${ai} pela IA)` : ' com o modelo automático'}${fails ? ` · ${fails} com erro` : ''}. Confira carro a carro abaixo.` })
  }

  return (
    <section className="space-y-4 rounded-xl border border-brand-200 bg-brand-50/30 p-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Sparkles size={15} className="text-brand-700" />Estúdio Instagram e Facebook</h3>
        <p className="text-xs text-gray-600">A arte sai pronta com a foto do carro, o preço, o ano/km e o seu WhatsApp, nas cores da loja. Cada formato vira um envio próprio.</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Formatos">
        {SOCIAL_FORMATS.map((f) => {
          const Icon = ICON[f]; const on = value.formats.includes(f)
          return (
            <button key={f} type="button" aria-pressed={on} onClick={() => toggle(f)}
              className={cn('flex items-start gap-2 rounded-xl border bg-white p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600', on ? 'border-brand-600 ring-1 ring-brand-600' : 'border-gray-200 hover:border-gray-300')}>
              <Icon size={18} className={on ? 'text-brand-700' : 'text-gray-400'} />
              <span><span className="block text-sm font-semibold text-gray-900">{FORMAT_INFO[f].label}</span><span className="block text-[11px] text-gray-500">{FORMAT_INFO[f].hint}</span></span>
            </button>
          )
        })}
      </div>
      {!value.formats.length && <p className="text-xs text-amber-700">Sem formato marcado: vai um post comum com as fotos, sem arte.</p>}
      {value.formats.includes('STORY') && targets.some((t) => t.channel === 'TIKTOK') && <p className="text-xs text-gray-500">O TikTok não tem Story pela API: no TikTok saem só os outros formatos marcados (Post e Carrossel no modo foto; Reels e Vídeo como vídeo).</p>}

      {value.formats.length > 0 && (
        <>
          <DesignPicker value={value.design} onChange={(design) => set({ design })} many={{ values: value.designs?.length ? value.designs : [value.design], max: MAX_DESIGNS, onChange: (designs) => set({ designs: limitDesigns(designs), design: designs[0] }) }} />
          {value.formats.includes('REELS') && <VideoSecondsPicker value={value.seconds} onChange={(seconds) => set({ seconds })} />}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chamada da arte">
            <span className="mr-1 text-xs font-medium text-gray-600">Chamada:</span>
            <button type="button" aria-pressed={!!value.vary} onClick={() => set({ vary: true })} title="Cada carro sai com uma chamada e um clima de música diferentes"
              className={cn('rounded-full border px-2.5 py-0.5 text-xs', value.vary ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 bg-white text-gray-600')}><Shuffle size={11} className="mr-1 inline" />Variar (aleatório)</button>
            {ART_TEMPLATES.map((t) => (
              <button key={t} type="button" aria-pressed={!value.vary && value.template === t} onClick={() => set({ template: t, vary: false })}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs', !value.vary && value.template === t ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 bg-white text-gray-600')}>{TEMPLATE_INFO[t].label}</button>
            ))}
            {value.vary && <span className="w-full text-[11px] text-gray-500">Variar: cada carro sai com uma chamada, um modelo (entre os escolhidos) e um clima de música sorteados — e a legenda também muda. Música escolhida a dedo não é trocada.</span>}
          </div>

          {vehicles.length > 1 && value.formats.some((f) => f !== 'STORY') && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-white p-2">
              <button type="button" onClick={() => void generateAll(false)} disabled={!!batch} className="btn-primary px-2.5 py-1 text-xs">{batch ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />}{batch ? `Escrevendo ${batch.done} de ${batch.total}…` : `Escrever as legendas dos ${vehicles.length} carros (variadas)`}</button>
              <button type="button" onClick={() => void generateAll(true)} disabled={!!batch} className="text-xs text-brand-700 hover:underline">Refazer todas</button>
              <span className="text-[11px] text-gray-500">Vazio = legenda automática, que também varia de carro para carro.</span>
            </div>
          )}

          {vehicles.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Veículo">
              {vehicles.map((v) => <button key={v.id} role="tab" aria-selected={vid === v.id} onClick={() => setCurrent(v.id)} className={cn('rounded-lg border px-2 py-1 text-xs', vid === v.id ? 'border-brand-600 bg-white text-brand-900' : 'border-gray-200 text-gray-600')}>{v.title}</button>)}
            </div>
          )}

          {vid && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {value.formats.map((f) => {
                const key = `${vid}:${f}`
                const src = `/api/publications/social/preview?vehicleId=${encodeURIComponent(vid)}&format=${f}&template=${value.template}&design=${value.design}&r=${artRev}`
                return (
                  <div key={f} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3">
                    <div className={cn('shrink-0 overflow-hidden rounded-lg bg-gray-100', FORMAT_INFO[f].canvas === 'FEED' ? 'h-40 w-32' : 'h-44 w-[99px]')}>
                      <img src={src} alt={`Prévia ${FORMAT_INFO[f].label}`} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-xs font-semibold text-gray-800">{FORMAT_INFO[f].label}{f === 'REELS' && <span className="font-normal text-gray-500"> · capa do vídeo ({value.seconds} s: gancho, fotos com as informações do carro, preço e chamada)</span>}</p>
                      {f === 'STORY' ? (
                        <p className="text-[11px] text-gray-500">Story não leva legenda: a arte já traz preço e WhatsApp.</p>
                      ) : (
                        <>
                          <textarea rows={5} className={cn(inputCls, 'text-xs')} value={value.captions[key] ?? ''} placeholder="Vazio = legenda automática com modelo, preço e contatos." onChange={(e) => set({ captions: { ...value.captions, [key]: e.target.value.slice(0, 2200) } })} />
                          <button type="button" onClick={() => generate(f)} disabled={busy === f} className="btn-secondary px-2 py-1 text-xs">{busy === f ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}Escrever com IA</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <label className="flex items-center gap-1.5">Tom da IA
              <select className={cn(inputCls, 'w-auto py-1 text-xs')} value={value.tone} onChange={(e) => set({ tone: e.target.value as CaptionTone })}>
                {CAPTION_TONES.map((t) => <option key={t} value={t}>{TONE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.spread} onChange={(e) => set({ spread: e.target.checked })} className="rounded border-gray-300 text-brand-600" />Espalhar automaticamente no horário de disparo da loja (2 a 3 h entre posts, sem horários repetidos)</label>
            <PhotoEnhanceToggle onChanged={() => setArtRev((n) => n + 1)} />
          </div>
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"><ShieldAlert size={14} className="mt-0.5 shrink-0" /><span><b>Anti-spam:</b> {CADENCE_NOTICE} {value.spread ? 'Com “Espalhar” ligado, o sistema já agenda dentro desse limite, no horário configurado em Canais conectados, com 2 a 3 h entre posts da mesma conta e sem encostar no que já está na agenda.' : 'Sem “Espalhar”, tudo sai de uma vez — use só para poucos posts.'}</span></p>
          <MusicPicker value={value.music} onChange={(music) => set({ music })} hasInstagram={hasInstagram} />
          {vid && targets.length > 0 && (
            <button type="button" onClick={() => setPreview(true)} className="btn-primary px-3 py-1.5 text-xs"><Eye size={14} />Pré-visualizar como fica no celular</button>
          )}
          {preview && vid && <SocialPreviewModal vehicleId={vid} vehicleTitle={vehicles.find((v) => v.id === vid)?.title ?? ''} targets={targets} formats={value.formats} template={value.template} design={value.design} seconds={value.seconds} music={value.music} captions={value.captions} onClose={() => setPreview(false)} />}
          {note && <p role="status" className={cn('text-xs', note.ok ? 'text-green-700' : 'text-red-700')}>{note.text}</p>}
        </>
      )}
    </section>
  )
}
