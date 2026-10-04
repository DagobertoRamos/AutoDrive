'use client'

// =============================================================================
// Escolha do modelo visual (12 estilos: Clássico, Telejornal, TikTok, Amador,
// Anos 80/90/2000, Luxo, Esportivo, Feirão, Família, Revista) e da duração do
// vídeo (30 s já marcado; 40, 50 ou 60 s). Vale para o Reels e para as artes.
// =============================================================================

import { useId } from 'react'
import { cn } from '@/lib/utils'
import { DESIGN_STYLES, DESIGNS, VIDEO_SECONDS, type DesignStyle, type VideoSeconds } from '@/lib/publications/social/design-styles'

/** Miniatura de cada estilo (cores e letra de cada um). */
const SWATCH: Record<DesignStyle, { bg: string; fg: string; font: string; tag: string }> = {
  CLASSICO: { bg: 'linear-gradient(160deg,#1f2937,#0b1220)', fg: '#ffffff', font: 'Impact, sans-serif', tag: 'CONFIRA' },
  TELEJORNAL: { bg: 'linear-gradient(160deg,#0a2a66,#03112e)', fg: '#ffffff', font: 'Impact, sans-serif', tag: 'PLANTÃO' },
  TIKTOK: { bg: 'linear-gradient(160deg,#111,#000)', fg: '#fe2c55', font: 'Impact, sans-serif', tag: 'VIRAL' },
  AMADOR: { bg: 'linear-gradient(160deg,#6b7280,#374151)', fg: '#ffe14d', font: '"Comic Sans MS", cursive', tag: '● REC' },
  ANOS80: { bg: 'linear-gradient(180deg,#12002b,#5b0a7a 55%,#ff5f9e 62%,#1a0033 63%)', fg: '#1ff4ff', font: 'Verdana, sans-serif', tag: 'NEON' },
  ANOS90: { bg: 'linear-gradient(160deg,#3a0a5a,#111)', fg: '#ffd400', font: '"Courier New", monospace', tag: 'PLAY ▶' },
  ANOS2000: { bg: 'radial-gradient(circle at 50% 35%,#4fa3ff,#0a3fa8 60%,#021a4a)', fg: '#ff7a00', font: 'Verdana, sans-serif', tag: 'SUPER' },
  LUXO: { bg: 'radial-gradient(circle at 50% 45%,#262018,#000)', fg: '#c9a54c', font: 'Georgia, serif', tag: 'EXCLUSIVO' },
  ESPORTIVO: { bg: 'repeating-linear-gradient(120deg,#101114 0 14px,#ff3b00 14px 20px)', fg: '#ffffff', font: 'Impact, sans-serif', tag: 'SPORT' },
  FEIRAO: { bg: 'repeating-conic-gradient(from 0deg at 50% 45%,#ffd400 0 10deg,#ffb300 10deg 20deg)', fg: '#e50914', font: 'Impact, sans-serif', tag: 'SÓ HOJE' },
  FAMILIA: { bg: 'linear-gradient(180deg,#fff1dc,#ffd3a8)', fg: '#f08a24', font: '"Brush Script MT", cursive', tag: 'Família' },
  REVISTA: { bg: 'linear-gradient(180deg,#c1121f 0 26%,#f4f1ea 26%)', fg: '#111111', font: 'Georgia, serif', tag: 'Revista' },
}

export function DesignPicker({ value, onChange, className, many }: { value: DesignStyle; onChange: (d: DesignStyle) => void; className?: string; /** Escolha de até `max` modelos (sorteados por carro). */ many?: { values: DesignStyle[]; max: number; onChange: (list: DesignStyle[]) => void } }) {
  const chosen = many ? many.values : [value]
  const click = (d: DesignStyle) => {
    if (!many) return onChange(d)
    const has = many.values.includes(d)
    if (has && many.values.length === 1) return
    // Uma única gravação (duas seguidas apagavam a escolha: "travava").
    many.onChange(has ? many.values.filter((x) => x !== d) : [...many.values, d].slice(-many.max))
  }
  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-xs font-medium text-gray-600">Modelo visual (vídeo e artes){many && many.max > 1 ? ` — escolha até ${many.max} (${many.values.length} marcado${many.values.length > 1 ? 's' : ''}); os vídeos se alternam entre eles` : ''}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" role={many ? 'group' : 'radiogroup'} aria-label="Modelo visual">
        {DESIGN_STYLES.map((d) => {
          const sw = SWATCH[d]; const on = chosen.includes(d)
          return (
            <button key={d} type="button" role={many ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => click(d)} title={DESIGNS[d].description}
              className={cn('overflow-hidden rounded-xl border bg-white text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600', on ? 'border-brand-600 ring-2 ring-brand-600' : 'border-gray-200 hover:border-gray-300')}>
              <span className="flex h-14 items-center justify-center" style={{ background: sw.bg }}>
                <span className="rounded px-1.5 text-sm font-bold" style={{ color: sw.fg, fontFamily: sw.font, textShadow: sw.fg === '#ffffff' || sw.fg === '#ffe14d' ? '0 1px 3px #000' : undefined }}>{sw.tag}</span>
              </span>
              <span className="block px-1.5 py-1 text-[11px] font-semibold leading-tight text-gray-800">{DESIGNS[d].label}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-500">{chosen.map((d) => `“${DESIGNS[d].label}”: ${DESIGNS[d].description}`).join(' · ')}</p>
    </div>
  )
}

export function VideoSecondsPicker({ value, onChange }: { value: VideoSeconds; onChange: (s: VideoSeconds) => void }) {
  const name = useId()
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs" role="radiogroup" aria-label="Duração do vídeo">
      <span className="font-medium text-gray-600">Duração do vídeo:</span>
      {VIDEO_SECONDS.map((s) => (
        <label key={s} className="flex items-center gap-1"><input type="radio" name={name} checked={value === s} onChange={() => onChange(s)} className="border-gray-300 text-brand-600" />{s} segundos</label>
      ))}
    </div>
  )
}
