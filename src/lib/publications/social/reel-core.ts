// =============================================================================
// Reels profissionais — ROTEIRO (PURO, testado).
// Estrutura dos anúncios de carro que mais engajam em vídeo curto:
//   1. GANCHO (≈3,5 s): o carro inteiro na tela, chamada do modelo visual.
//   2. FOTOS (≈3 s cada): uma informação por cena — ano, km, câmbio,
//      combustível, opcionais do cadastro, condições. Movimento SUAVE
//      (zoom leve ou deslize curto); o carro aparece sempre inteiro.
//   3. PREÇO revelado no fim (gera expectativa e retenção).
//   4. CHAMADA para o WhatsApp com o logo da loja.
// Duração escolhida pela loja: 30 (padrão), 40, 50 ou 60 s.
// =============================================================================

import { vehicleName } from '../content-core'

export type Motion = 'zoomin' | 'zoomout' | 'panleft' | 'panright' | 'shake'
export type SegmentKind = 'hook' | 'photo' | 'price' | 'cta'
export interface ReelSegment { kind: SegmentKind; photo: number; seconds: number; motion: Motion; transition: string; chip?: string }
export interface ReelFacts {
  brand?: string | null; model?: string | null; version?: string | null; year?: number | null; modelYear?: number | null
  km?: number | null; gear?: string | null; fuel?: string | null; color?: string | null
  options?: string[]; conditions?: string | null; badge?: string | null
}

/** Tempos fixos das cenas (s) e o ritmo alvo das fotos por jeito de vídeo. */
export const REEL_TIMING = { hook: 3.5, price: 4.5, cta: 4.5, transition: 0.5, maxPhotos: 20, photoCalm: 3.2, photoFast: 2.6 } as const
/** Onde o carro fica no quadro do vídeo (frações): sobra margem para o zoom não cortar. */
export const VIDEO_CAR_BOX = { x: 0.06, y: 0.2, w: 0.88, h: 0.46 } as const
const DEFAULT_TRANSITIONS = ['fade', 'smoothleft', 'fade', 'circleopen']

export interface ReelOptions {
  /** Duração total do vídeo em segundos (30, 40, 50 ou 60; padrão 30). */
  seconds?: number
  /** Ritmo: suave (padrão), dinamico (TikTok) ou tremido (celular). */
  motion?: 'suave' | 'dinamico' | 'tremido'
  /** Transições do modelo visual, usadas em sequência. */
  transitions?: string[]
}

const up = (s: string) => s.toLocaleUpperCase('pt-BR')
const km = (v: number) => `${new Intl.NumberFormat('pt-BR').format(v)} KM`

/** Chamadas curtas (uma por cena), na ordem de importância para quem compra. */
export function reelChips(f: ReelFacts): string[] {
  const out: string[] = []
  const y = f.year && f.modelYear && f.year !== f.modelYear ? `${f.year}/${f.modelYear}` : f.modelYear ?? f.year
  if (y) out.push(`ANO ${y}`)
  if (f.km != null) out.push(f.km <= 0 ? 'ZERO KM' : f.km < 20_000 ? `SÓ ${km(f.km)}` : km(f.km))
  if (f.gear) out.push(/autom/i.test(f.gear) ? `CÂMBIO ${up(f.gear)}` : up(f.gear))
  if (f.fuel) out.push(up(f.fuel))
  for (const o of (f.options ?? []).map((x) => x.trim()).filter((x) => x && x.length <= 34).slice(0, 6)) out.push(up(o))
  // Condições comerciais (financiamento, troca, garantia...) — linhas curtas.
  for (const line of String(f.conditions ?? '').split(/\n|•|;/).map((x) => x.replace(/^[-–✅✔️\s]+/u, '').trim()).filter((x) => x && x.length <= 34).slice(0, 3)) out.push(up(line))
  return [...new Set(out)]
}

/** Quantas cenas de foto cabem na duração pedida, no ritmo do modelo. */
export function photoScenes(seconds: number, fast = false): number {
  const T = REEL_TIMING
  const fixed = T.hook + T.price + T.cta
  const per = (fast ? T.photoFast : T.photoCalm) - T.transition
  return Math.max(3, Math.min(24, Math.round((seconds - fixed + 2 * T.transition) / per)))
}

/**
 * Roteiro do vídeo a partir do número de fotos, dos dados do carro e da
 * duração pedida. O tempo de cada foto é ajustado para fechar a duração.
 */
export function reelPlan(photoCount: number, f: ReelFacts, o: ReelOptions = {}): ReelSegment[] {
  const T = REEL_TIMING
  const total = [30, 40, 50, 60].includes(Number(o.seconds)) ? Number(o.seconds) : 30
  const style = o.motion ?? 'suave'
  const trs = o.transitions?.length ? o.transitions : DEFAULT_TRANSITIONS
  const t = (i: number) => trs[i % trs.length]
  const n = Math.max(1, Math.min(T.maxPhotos, photoCount))
  const chips = reelChips(f)
  const scenes = photoScenes(total, style === 'dinamico')
  // Tempo por foto que fecha a duração: total = soma das cenas − transições.
  const photoSec = Math.round(((total - T.hook - T.price - T.cta + T.transition * (scenes + 2)) / scenes) * 100) / 100
  const motions: Motion[] = style === 'tremido' ? ['shake', 'zoomin', 'shake', 'panright'] : ['zoomin', 'panright', 'zoomout', 'panleft']
  const segs: ReelSegment[] = [{ kind: 'hook', photo: 0, seconds: T.hook, motion: style === 'tremido' ? 'shake' : 'zoomin', transition: t(0) }]
  for (let k = 0; k < scenes; k++) {
    // Percorre as fotos; com poucas, repete com outro movimento.
    const photo = n > 1 ? 1 + (k % (n - 1)) : 0
    const chip = chips.length ? chips[k % Math.max(chips.length, scenes)] : undefined
    segs.push({ kind: 'photo', photo, seconds: photoSec, motion: motions[(k + ((n - 1) % motions.length === 0 ? Math.floor(k / Math.max(1, n - 1)) : 0)) % motions.length], transition: t(k + 1), ...(chip ? { chip } : {}) })
  }
  segs.push({ kind: 'price', photo: 0, seconds: T.price, motion: 'zoomout', transition: t(scenes + 1) })
  segs.push({ kind: 'cta', photo: 0, seconds: T.cta, motion: 'zoomin', transition: 'fade' })
  return segs
}

export const reelTotal = (segs: ReelSegment[]) => segs.reduce((a, s) => a + s.seconds, 0) - REEL_TIMING.transition * (segs.length - 1)

/** Título curto do gancho ("HONDA ADV 160"), sem repetir a marca. */
export const hookTitle = (f: ReelFacts) => up(vehicleName(f.brand, f.model, null) || 'CONFIRA')

/**
 * Filtro de UMA cena (PURO): entradas [0:v]=quadro 1080×1920 (imagem única) com o carro
 * inteiro, [1:v]=texto (PNG 720×1280). Movimento suave (zoom até 6% ou
 * deslize curto), sem cortar o carro. Cena por cena = pouca memória.
 */
export function sceneFilter(s: ReelSegment, fps = 30): string {
  const n = Math.max(1, Math.round(s.seconds * fps))
  const d = s.seconds.toFixed(2)
  const Z = 0.06
  const cx = "iw/2-(iw/zoom/2)"; const cy = "ih/2-(ih/zoom/2)"
  const z = s.motion === 'zoomin' ? `1+${Z}*on/${n}` : s.motion === 'zoomout' ? `${1 + Z}-${Z}*on/${n}` : `${1 + Z / 2 + 0.01}`
  const x = s.motion === 'panright' ? `(iw-iw/zoom)*on/${n}` : s.motion === 'panleft' ? `(iw-iw/zoom)*(1-on/${n})` : s.motion === 'shake' ? `${cx}+7*sin(on*0.9)+4*sin(on*2.3)` : cx
  const y = s.motion === 'shake' ? `${cy}+6*cos(on*0.7)+3*sin(on*1.9)` : cy
  // Cada imagem é lida UMA vez e repetida (loop): 3× mais rápido que reler a cada quadro.
  const rep = `loop=loop=${n + fps}:size=1:start=0,setpts=N/${fps}/TB`
  return [
    `[0:v]${rep},zoompan=z='${z}':x='${x}':y='${y}':d=1:s=720x1280:fps=${fps},setsar=1,trim=duration=${d},setpts=PTS-STARTPTS[m]`,
    `[1:v]${rep},format=rgba,fps=${fps},fade=in:st=0.15:d=0.45:alpha=1,trim=duration=${d},setpts=PTS-STARTPTS[o]`,
    `[m][o]overlay=0:0:format=auto:shortest=1,format=yuv420p,fps=${fps},settb=1/${fps}[v]`,
  ].join(';')
}

/**
 * Junta as cenas prontas (PURO): entradas [i:v] = vídeo de cada cena. Taxa de
 * quadros e base de tempo explícitas (o xfade do ffmpeg de produção exige).
 */
export function chainFilter(segs: ReelSegment[], fps = 30): { filter: string; out: string; total: number } {
  const parts = segs.map((_, i) => `[${i}:v]fps=${fps},settb=1/${fps},format=yuv420p,setsar=1[s${i}]`)
  let last = 's0'
  let offset = segs[0].seconds
  const tr = REEL_TIMING.transition
  for (let i = 1; i < segs.length; i++) {
    offset -= tr
    const out = i === segs.length - 1 ? 'vout' : `x${i}`
    parts.push(`[${last}][s${i}]xfade=transition=${segs[i - 1].transition}:duration=${tr}:offset=${offset.toFixed(3)}[${out}]`)
    last = out
    offset += segs[i].seconds
  }
  if (segs.length === 1) parts.push('[s0]null[vout]')
  return { filter: parts.join(';'), out: 'vout', total: reelTotal(segs) }
}
