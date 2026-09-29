'use client'
/* eslint-disable @next/next/no-img-element -- prévias locais e geradas pelo servidor */

// =============================================================================
// Pré-visualização do post como aparece no celular: Instagram (feed,
// carrossel, Story, Reels) e Facebook (post, Story, Reels). Só aparência —
// a legenda e as mídias são as mesmas que vão ser enviadas.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { Bookmark, ChevronLeft, ChevronRight, Globe, Heart, MessageCircle, MoreHorizontal, Music2, Pause, Play, Send, Share2, ThumbsUp, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PreviewMedia { type: 'image' | 'video'; url: string; note?: string; /** Camada por cima (ex.: identidade da loja no vídeo). */ overlay?: string }
export interface PreviewAudio { url: string; title: string; artist?: string }

/**
 * Tocador da prévia: passa os quadros no tempo do vídeo (zoom suave, como o
 * vídeo gerado) e toca a música escolhida. Sem `slides`, só a música.
 */
function usePlayer(count: number, slides: number[] | null | undefined, audioUrl: string | null | undefined) {
  const [playing, setPlaying] = useState(false)
  const [idx, setIdx] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [muted, setMuted] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const timed = !!slides?.length && count > 0
  useEffect(() => {
    if (!playing || !timed) return
    const d = (slides![Math.min(idx, slides!.length - 1)] ?? 3) * 1000
    const t = setTimeout(() => {
      if (idx + 1 >= Math.min(count, slides!.length)) { setIdx(0); setCycle((c) => c + 1); if (audio.current) audio.current.currentTime = 0 } else setIdx(idx + 1)
    }, d)
    return () => clearTimeout(t)
  }, [playing, timed, idx, slides, count])
  useEffect(() => {
    const a = audio.current
    if (!a) return
    a.muted = muted
    if (playing) void a.play().catch(() => undefined); else a.pause()
  }, [playing, muted, audioUrl])
  useEffect(() => { const a = audio.current; return () => { a?.pause() } }, [])
  const el = audioUrl ? <audio ref={audio} src={audioUrl} loop preload="auto" /> : null
  return { playing, toggle: () => setPlaying((p) => !p), idx: timed ? idx : null, cycle, muted, setMuted, el, total: slides?.slice(0, count).reduce((a, b) => a + b, 0) ?? 0 }
}

const KEYFRAMES = '@keyframes pp-kb{from{transform:scale(1)}to{transform:scale(1.08)}}@keyframes pp-bar{from{width:0%}to{width:100%}}'

function PlayLayer({ p, label }: { p: ReturnType<typeof usePlayer>; label: string }) {
  return (
    <>
      {p.el}
      {!p.playing
        ? <button type="button" onClick={p.toggle} className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/25 text-white"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60"><Play size={26} className="ml-1" /></span><span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px]">{label}</span></button>
        : <button type="button" onClick={p.toggle} aria-label="Pausar" className="absolute inset-0 z-10" />}
      {p.el && <button type="button" onClick={() => p.setMuted(!p.muted)} aria-label={p.muted ? 'Ligar som' : 'Tirar som'} className="absolute bottom-16 left-2 z-20 rounded-full bg-black/50 p-1.5 text-white">{p.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>}
      {p.playing && <span className="pointer-events-none absolute right-2 top-9 z-20 rounded-full bg-black/50 p-1 text-white"><Pause size={12} /></span>}
    </>
  )
}
export type PreviewFormat = 'POST' | 'CARROSSEL' | 'STORY' | 'REELS' | 'VIDEO' | 'LINK'

const initial = (s: string) => (s.replace(/^@/, '').trim()[0] ?? 'A').toUpperCase()

function Media({ m, className, kb }: { m: PreviewMedia; className?: string; kb?: number }) {
  if (m.overlay) return <div className="relative h-full w-full"><Media m={{ ...m, overlay: undefined }} className={className} kb={kb} /><img src={m.overlay} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" /></div>
  return m.type === 'video'
    ? <video src={m.url} className={cn('h-full w-full object-cover', className)} loop autoPlay playsInline controls />
    : <img src={m.url} alt="" className={cn('h-full w-full object-cover', className)} style={kb ? { animation: `pp-kb ${kb}s linear both` } : undefined} />
}

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 font-bold text-white ring-2 ring-white', small ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs')}>{initial(name)}</span>
}

function Caption({ account, text, dark }: { account: string; text: string; dark?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <p className={cn('whitespace-pre-line text-[12px] leading-snug', dark ? 'text-white' : 'text-gray-900', !open && 'line-clamp-2')}>
      <b>{account.replace(/^@/, '')}</b> {text}
      {!open && text.length > 80 && <button type="button" onClick={() => setOpen(true)} className={cn('ml-1', dark ? 'text-white/70' : 'text-gray-500')}>… mais</button>}
    </p>
  )
}

function Phone({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={cn('mx-auto w-[300px] overflow-hidden rounded-[2rem] border-[6px] border-gray-900 shadow-xl', dark ? 'bg-black' : 'bg-white')}>
      <style>{KEYFRAMES}</style>
      <div className="flex h-5 items-center justify-center bg-gray-900"><span className="h-1.5 w-16 rounded-full bg-gray-700" /></div>
      {children}
    </div>
  )
}

/** Miniatura pública do YouTube (a mesma que o Facebook mostra no cartão do link). */
function linkThumb(url: string): string | null {
  const id = /(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{6,})/.exec(url)?.[1]
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

export function PostPreview({ network, format, account, media, caption, music, link, audio, slides }: { network: 'INSTAGRAM' | 'FACEBOOK'; format: PreviewFormat; account: string; media: PreviewMedia[]; caption: string; music?: string | null; link?: string; audio?: PreviewAudio | null; slides?: number[] | null }) {
  const [sel, setI] = useState(0)
  const player = usePlayer(media.length, slides, audio?.url)
  const i = player.idx ?? sel
  const kb = player.playing && player.idx !== null ? slides?.[player.idx] : undefined
  const mkey = `${i}-${player.cycle}-${player.playing ? 1 : 0}`
  const playable = !!(slides?.length || audio)
  const playLabel = slides && slides.length > 1 ? `Tocar o vídeo (${Math.round(player.total)} s)` : slides?.length ? 'Tocar como vídeo' : 'Ouvir com a música'
  const name0 = account || 'sua loja'

  // ── Link de vídeo (só Facebook) ───────────────────────────────────────────
  if (format === 'LINK') {
    if (network === 'INSTAGRAM') return <p className="rounded-lg bg-amber-50 p-3 text-center text-xs text-amber-800">O Instagram não publica links em posts (regra da rede). Este formato vai só para a Página do Facebook.</p>
    if (!link) return <p className="text-center text-xs text-gray-500">Cole o link do vídeo para ver a prévia.</p>
    const thumb = linkThumb(link)
    let host = ''; try { host = new URL(link).hostname.replace(/^www\./, '') } catch { /* link inválido */ }
    return (
      <Phone>
        <div className="flex items-center gap-2 px-3 py-2"><Avatar name={name0} /><div className="flex-1 leading-tight"><p className="text-[12px] font-semibold">{name0}</p><p className="flex items-center gap-1 text-[10px] text-gray-500">Agora · <Globe size={9} /></p></div><MoreHorizontal size={16} /></div>
        <p className="line-clamp-4 whitespace-pre-line px-3 pb-2 text-[12px] leading-snug text-gray-900">{caption}</p>
        <div className="border-y border-gray-200 bg-gray-50">
          <div className="relative aspect-video w-full bg-gray-200">{thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-gray-500">Vídeo</span>}<span className="absolute inset-0 m-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">▶</span></div>
          <p className="px-3 pt-1 text-[10px] uppercase text-gray-500">{host}</p><p className="px-3 pb-2 text-[12px] font-semibold text-gray-900">Assista ao vídeo</p>
        </div>
        <div className="flex justify-around py-2 text-[11px] text-gray-600"><span className="flex items-center gap-1"><ThumbsUp size={13} />Curtir</span><span className="flex items-center gap-1"><MessageCircle size={13} />Comentar</span><span className="flex items-center gap-1"><Share2 size={13} />Compartilhar</span></div>
      </Phone>
    )
  }

  const cur = media[Math.min(i, media.length - 1)]
  const vertical = format === 'STORY' || format === 'REELS' || format === 'VIDEO'
  const name = account || 'sua loja'
  if (!cur) return <p className="text-center text-xs text-gray-500">Adicione fotos ou vídeo para ver a prévia.</p>

  // ── Story (Instagram e Facebook) ─────────────────────────────────────────
  if (format === 'STORY') {
    return (
      <Phone dark>
        <div className="relative aspect-[9/16] w-full overflow-hidden">
          <Media key={mkey} m={cur} kb={kb} />
          <div className="absolute inset-x-2 top-2 h-0.5 overflow-hidden rounded bg-white/40"><div key={mkey} className="h-full rounded bg-white" style={player.playing && slides?.[0] ? { animation: `pp-bar ${slides[0]}s linear both` } : { width: '0%' }} /></div>
          {playable && <PlayLayer p={player} label={playLabel} />}
          <div className="absolute left-2 top-4 flex items-center gap-2 text-[11px] font-semibold text-white drop-shadow"><Avatar name={name} small />{name.replace(/^@/, '')} <span className="font-normal text-white/70">agora</span></div>
          {music && <div className="absolute left-2 top-11 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white"><Music2 size={10} />{music}</div>}
          <div className="absolute inset-x-2 bottom-2 flex items-center gap-2"><span className="flex-1 rounded-full border border-white/60 px-3 py-1.5 text-[11px] text-white/80">Enviar mensagem</span><Heart size={18} className="text-white" /><Send size={18} className="text-white" /></div>
        </div>
      </Phone>
    )
  }

  // ── Reels / vídeo vertical ────────────────────────────────────────────────
  if (vertical) {
    return (
      <Phone dark>
        <div className="relative aspect-[9/16] w-full overflow-hidden">
          <Media key={mkey} m={cur} kb={kb} />
          <span className="absolute left-3 top-3 text-sm font-bold text-white drop-shadow">Reels</span>
          {playable && cur.type !== 'video' && <PlayLayer p={player} label={playLabel} />}
          {player.playing && slides && slides.length > 1 && <div className="absolute inset-x-0 bottom-0 z-20 h-0.5 bg-white/30"><div className="h-full bg-white transition-all" style={{ width: `${(((player.idx ?? 0) + 1) / slides.length) * 100}%` }} /></div>}
          <div className="absolute bottom-24 right-2 flex flex-col items-center gap-4 text-white drop-shadow">
            {network === 'INSTAGRAM' ? <><Heart size={22} /><MessageCircle size={22} /><Send size={22} /><MoreHorizontal size={22} /></> : <><ThumbsUp size={22} /><MessageCircle size={22} /><Share2 size={22} /></>}
          </div>
          <div className="absolute inset-x-3 bottom-3 space-y-1.5 pr-10">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-white drop-shadow"><Avatar name={name} small />{name.replace(/^@/, '')}<span className="rounded border border-white/70 px-1.5 text-[10px]">Seguir</span></div>
            <Caption account="" text={caption} dark />
            {music && <p className="flex items-center gap-1 text-[10px] text-white"><Music2 size={10} />{music}</p>}
          </div>
        </div>
        {cur.note && <p className="bg-black px-3 py-1 text-center text-[10px] text-white/60">{cur.note}</p>}
      </Phone>
    )
  }

  const carousel = media.length > 1
  const nav = carousel && (
    <>
      {i > 0 && <button type="button" onClick={() => setI(i - 1)} aria-label="Anterior" className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-0.5"><ChevronLeft size={16} /></button>}
      {i < media.length - 1 && <button type="button" onClick={() => setI(i + 1)} aria-label="Próxima" className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-0.5"><ChevronRight size={16} /></button>}
      <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{i + 1}/{media.length}</span>
    </>
  )

  // ── Instagram feed ────────────────────────────────────────────────────────
  if (network === 'INSTAGRAM') {
    return (
      <Phone>
        <div className="flex items-center gap-2 px-3 py-2"><Avatar name={name} /><span className="flex-1 text-[12px] font-semibold">{name.replace(/^@/, '')}</span><MoreHorizontal size={16} /></div>
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-gray-100"><Media key={mkey} m={cur} kb={kb} />{playable && (i === 0 || !slides) && <PlayLayer p={player} label={playLabel} />}{nav}</div>
        <div className="flex items-center gap-3 px-3 py-2"><Heart size={20} /><MessageCircle size={20} /><Send size={20} /><span className="flex-1" />
          {carousel && <span className="absolute left-1/2 flex -translate-x-1/2 gap-1">{media.map((_, k) => <span key={k} className={cn('h-1.5 w-1.5 rounded-full', k === i ? 'bg-blue-500' : 'bg-gray-300')} />)}</span>}
          <Bookmark size={20} /></div>
        <div className="max-h-40 overflow-y-auto px-3 pb-3"><Caption account={name} text={caption} /></div>
      </Phone>
    )
  }

  // ── Facebook post ─────────────────────────────────────────────────────────
  return (
    <Phone>
      <div className="flex items-center gap-2 px-3 py-2"><Avatar name={name} /><div className="flex-1 leading-tight"><p className="text-[12px] font-semibold">{name}</p><p className="flex items-center gap-1 text-[10px] text-gray-500">Agora · <Globe size={9} /></p></div><MoreHorizontal size={16} /></div>
      <p className="line-clamp-4 max-h-24 whitespace-pre-line px-3 pb-2 text-[12px] leading-snug text-gray-900">{caption}</p>
      {carousel ? (
        <div className="grid grid-cols-2 gap-0.5">
          {media.slice(0, 4).map((m, k) => (
            <div key={k} className={cn('relative bg-gray-100', k === 0 ? 'col-span-2 aspect-[4/3]' : 'aspect-square')}>
              <Media m={m} />
              {k === 3 && media.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-bold text-white">+{media.length - 4}</span>}
            </div>
          ))}
        </div>
      ) : <div className="relative aspect-[4/5] w-full overflow-hidden bg-gray-100"><Media key={mkey} m={cur} kb={kb} />{playable && <PlayLayer p={player} label={playLabel} />}</div>}
      <div className="flex justify-around border-t border-gray-100 py-2 text-[11px] text-gray-600"><span className="flex items-center gap-1"><ThumbsUp size={13} />Curtir</span><span className="flex items-center gap-1"><MessageCircle size={13} />Comentar</span><span className="flex items-center gap-1"><Share2 size={13} />Compartilhar</span></div>
    </Phone>
  )
}
