'use client'

// =============================================================================
// Trilha sonora do estúdio: sem música, automática por clima ou faixa
// escolhida (músicas livres CC0 do Freesound ou biblioteca oficial do
// Instagram). Toca a prévia antes de escolher.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { Loader2, Music, Pause, Play, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, inputCls } from '@/components/publications/ui'
import { MOOD_LABEL, MUSIC_MOODS, type MusicChoice, type MusicMood, type MusicSource, type MusicTrack } from '@/lib/publications/social/music-core'

export function MusicPicker({ value, onChange, hasInstagram }: { value: MusicChoice | null; onChange: (m: MusicChoice | null) => void; hasInstagram: boolean }) {
  const mode = !value ? 'NONE' : value.mode
  const mood: MusicMood = value?.mood ?? 'ANIMADA'
  const [source, setSource] = useState<MusicSource>('FREESOUND')
  const [q, setQ] = useState('')
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [configured, setConfigured] = useState(true)
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const search = async (src = source, m = mood, text = q) => {
    setBusy(true); setWarn(null)
    try {
      const j = await api(`/api/publications/social/music?${new URLSearchParams({ source: src, mood: m, q: text })}`)
      setTracks(j.tracks); setConfigured(j.freesoundConfigured); if (j.warning) setWarn(j.warning)
    } catch (e) { setWarn((e as Error).message); setTracks([]) } finally { setBusy(false) }
  }
  // Consulta inicial só para saber se as músicas livres estão configuradas.
  useEffect(() => { api('/api/publications/social/music?check=1').then((j) => setConfigured(j.freesoundConfigured)).catch(() => undefined) }, [])
  useEffect(() => () => { audio.current?.pause() }, [])

  const toggle = (t: MusicTrack) => {
    if (!t.previewUrl) return
    if (playing === t.id) { audio.current?.pause(); setPlaying(null); return }
    audio.current?.pause()
    audio.current = new Audio(t.previewUrl)
    audio.current.onended = () => setPlaying(null)
    void audio.current.play().then(() => setPlaying(t.id)).catch(() => setPlaying(null))
  }

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-800"><Music size={14} className="text-brand-700" />Música</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Música">
        {([['NONE', 'Sem música'], ['AUTO', 'Automática'], ['TRACK', 'Escolher faixa']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => { if (k === 'NONE') onChange(null); else if (k === 'AUTO') onChange({ mode: 'AUTO', mood }); else void search() }}
            className={cn('rounded-full border px-2.5 py-0.5 text-xs', mode === k ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-600')}>{l}</button>
        ))}
      </div>

      {value && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Clima">
          <span className="text-[11px] text-gray-500">Clima:</span>
          {MUSIC_MOODS.map((m) => (
            <button key={m} type="button" aria-pressed={mood === m} onClick={() => { onChange(value.mode === 'AUTO' ? { mode: 'AUTO', mood: m } : { ...value, mood: m }); if (tracks) void search(source, m) }}
              className={cn('rounded-full border px-2 py-0.5 text-[11px]', mood === m ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-gray-200 text-gray-600')}>{MOOD_LABEL[m]}</button>
          ))}
        </div>
      )}

      {value?.mode === 'TRACK' && <p className="text-xs text-gray-700">Escolhida: <b>{value.title ?? value.id}</b>{value.artist ? ` · ${value.artist}` : ''} <span className="text-gray-500">({value.source === 'IG' ? 'biblioteca do Instagram' : 'livre CC0'})</span></p>}

      {tracks && (
        <div className="space-y-2 border-t border-gray-100 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="tablist" aria-label="Fonte">
              <button type="button" role="tab" aria-selected={source === 'FREESOUND'} onClick={() => { setSource('FREESOUND'); void search('FREESOUND') }} className={cn('rounded-lg border px-2 py-0.5 text-xs', source === 'FREESOUND' ? 'border-brand-600 text-brand-900' : 'border-gray-200 text-gray-600')}>Músicas livres (CC0)</button>
              {hasInstagram && <button type="button" role="tab" aria-selected={source === 'IG'} onClick={() => { setSource('IG'); void search('IG') }} className={cn('rounded-lg border px-2 py-0.5 text-xs', source === 'IG' ? 'border-brand-600 text-brand-900' : 'border-gray-200 text-gray-600')}>Biblioteca do Instagram</button>}
            </div>
            <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); void search() }}>
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className={cn(inputCls, 'py-1 pl-7 text-xs')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar (em inglês funciona melhor: piano, funk, pop…)" aria-label="Buscar música" />
            </form>
          </div>
          {busy ? <Loader2 size={16} className="animate-spin text-gray-400" /> : (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {tracks.map((t) => {
                const on = value?.mode === 'TRACK' && value.id === t.id && value.source === t.source
                return (
                  <li key={`${t.source}:${t.id}`} className={cn('flex items-center gap-2 rounded-lg border px-2 py-1', on ? 'border-brand-600 bg-brand-50' : 'border-gray-100')}>
                    <button type="button" onClick={() => toggle(t)} disabled={!t.previewUrl} aria-label={playing === t.id ? 'Pausar' : 'Ouvir'} className="rounded-full p-1 text-brand-700 hover:bg-brand-50 disabled:opacity-40">{playing === t.id ? <Pause size={14} /> : <Play size={14} />}</button>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-gray-900">{t.title}</span><span className="block truncate text-[10px] text-gray-500">{[t.artist, t.seconds ? `${t.seconds}s` : '', t.license].filter(Boolean).join(' · ')}</span></span>
                    <button type="button" onClick={() => onChange({ mode: 'TRACK', source: t.source, id: t.id, title: t.title.slice(0, 120), artist: t.artist.slice(0, 80), mood, ...(t.previewUrl ? { previewUrl: t.previewUrl } : {}) })} className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', on ? 'bg-brand-700 text-white' : 'border border-gray-200 text-gray-700')}>{on ? 'Escolhida' : 'Usar'}</button>
                  </li>
                )
              })}
              {!tracks.length && <li className="text-xs text-gray-500">{source === 'FREESOUND' && !configured ? 'Músicas livres ainda não configuradas.' : 'Nenhuma música encontrada.'}</li>}
            </ul>
          )}
        </div>
      )}

      {warn && <p className="text-[11px] text-amber-700">{warn}</p>}
      {value && !configured && (value.mode === 'AUTO' || value.source === 'FREESOUND') && <p className="text-[11px] text-amber-700">As músicas livres (Freesound) ainda não foram configuradas: o MASTER cadastra a chave em Master › Integrações Globais. Até lá, os vídeos saem sem trilha.</p>}
      {value && (
        <ul className="list-disc space-y-0.5 pl-4 text-[10px] text-gray-500">
          <li>Só músicas sem risco de direito autoral: domínio público (CC0) ou a biblioteca oficial do Instagram.</li>
          <li>Faixa da biblioteca do Instagram vale para Reels e Post do Instagram; nos outros formatos vai uma música livre do mesmo clima.</li>
          <li>Com música, Story e Post viram vídeo curto da arte; no Carrossel do Instagram a capa vira vídeo. No Facebook, o Carrossel (álbum) segue sem música.</li>
        </ul>
      )}
    </div>
  )
}
