// =============================================================================
// Reels que prendem a atenção — ROTEIRO (PURO, testado).
// Estrutura dos anúncios de carro que mais engajam em vídeo curto:
//   1. GANCHO (≈2 s): o carro grande na tela, zoom entrando, selo + nome + ano.
//   2. RITMO: muitas fotos em cortes rápidos (≈1,3 s), cada uma com movimento
//      (panorâmica que percorre o carro inteiro ou zoom) e UMA informação por
//      cena — ano, km, câmbio, combustível, opcionais do cadastro, condições.
//   3. PREÇO revelado no fim (gera expectativa e retenção).
//   4. CHAMADA para o WhatsApp.
// Transições curtas e variadas; total entre ~12 e ~25 s (faixa ideal do Reels).
// =============================================================================

import { vehicleName } from '../content-core'

export type Motion = 'zoomin' | 'zoomout' | 'panleft' | 'panright'
export type SegmentKind = 'hook' | 'photo' | 'price' | 'cta'
export interface ReelSegment { kind: SegmentKind; photo: number; seconds: number; motion: Motion; transition: string; chip?: string }
export interface ReelFacts {
  brand?: string | null; model?: string | null; version?: string | null; year?: number | null; modelYear?: number | null
  km?: number | null; gear?: string | null; fuel?: string | null; color?: string | null
  options?: string[]; conditions?: string | null; badge?: string | null
}

export const REEL_TIMING = { hook: 2.1, photo: 1.35, price: 2.6, cta: 3.0, transition: 0.3, maxPhotos: 12 } as const
const TRANSITIONS = ['slideleft', 'smoothleft', 'fade', 'slideup', 'circleopen', 'wipeleft', 'smoothup', 'fadeblack']
const MOTIONS: Motion[] = ['panright', 'zoomin', 'panleft', 'zoomout']

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

/** Roteiro do vídeo a partir do número de fotos e dos dados do carro. */
export function reelPlan(photoCount: number, f: ReelFacts): ReelSegment[] {
  const n = Math.max(1, Math.min(REEL_TIMING.maxPhotos, photoCount))
  const chips = reelChips(f)
  const t = (i: number) => TRANSITIONS[i % TRANSITIONS.length]
  const segs: ReelSegment[] = [{ kind: 'hook', photo: 0, seconds: REEL_TIMING.hook, motion: 'zoomin', transition: t(0) }]
  // Com poucas fotos, reaproveita (com outro movimento) para manter o ritmo.
  const scenes = Math.max(n - 1, Math.min(chips.length, 6), 3)
  for (let k = 0; k < scenes; k++) {
    const photo = n > 1 ? 1 + (k % (n - 1)) : 0
    segs.push({ kind: 'photo', photo, seconds: REEL_TIMING.photo, motion: MOTIONS[(k + (photo === 0 ? 1 : 0)) % MOTIONS.length], transition: t(k + 1), chip: chips[k] })
  }
  segs.push({ kind: 'price', photo: 0, seconds: REEL_TIMING.price, motion: 'zoomout', transition: t(scenes + 1) })
  segs.push({ kind: 'cta', photo: 0, seconds: REEL_TIMING.cta, motion: 'zoomin', transition: 'fade' })
  return segs
}

export const reelTotal = (segs: ReelSegment[]) => segs.reduce((a, s) => a + s.seconds, 0) - REEL_TIMING.transition * (segs.length - 1)

/** Título curto do gancho ("HONDA ADV 160"), sem repetir a marca. */
export const hookTitle = (f: ReelFacts) => up(vehicleName(f.brand, f.model, null) || 'CONFIRA')

/** Filtro do ffmpeg (PURO): movimento de cada cena + transições encadeadas. Entradas: [2i]=imagem, [2i+1]=texto (PNG). */
export function reelGraph(segs: ReelSegment[], fps = 30): { filter: string; out: string; total: number } {
  const parts: string[] = []
  segs.forEach((s, i) => {
    const n = Math.round(s.seconds * fps)
    const img = `[${2 * i}:v]`
    // Imagem já preparada: 1440×2560 (zoom) ou altura 1280 com sobra lateral (panorâmica).
    const motion = s.motion === 'panleft' || s.motion === 'panright'
      ? `${img}crop=720:1280:x='(iw-720)*${s.motion === 'panright' ? '' : '(1-'}min(1,t/${s.seconds.toFixed(2)})${s.motion === 'panright' ? '' : ')'}':y=(ih-1280)/2,fps=${fps}`
      : `${img}zoompan=z='${s.motion === 'zoomin' ? `1+0.14*on/${n}` : `1.14-0.14*on/${n}`}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=${fps}`
    parts.push(`${motion},setsar=1,trim=duration=${s.seconds.toFixed(2)},setpts=PTS-STARTPTS[m${i}]`)
    parts.push(`[${2 * i + 1}:v]format=rgba,fade=in:st=0.12:d=0.28:alpha=1,trim=duration=${s.seconds.toFixed(2)},setpts=PTS-STARTPTS[o${i}]`)
    parts.push(`[m${i}][o${i}]overlay=0:0:format=auto,format=yuv420p[v${i}]`)
  })
  let last = 'v0'
  let offset = segs[0].seconds
  const tr = REEL_TIMING.transition
  for (let i = 1; i < segs.length; i++) {
    offset -= tr
    const out = i === segs.length - 1 ? 'vout' : `x${i}`
    parts.push(`[${last}][v${i}]xfade=transition=${segs[i - 1].transition}:duration=${tr}:offset=${offset.toFixed(3)}[${out}]`)
    last = out
    offset += segs[i].seconds
  }
  if (segs.length === 1) parts.push('[v0]null[vout]')
  return { filter: parts.join(';'), out: 'vout', total: reelTotal(segs) }
}
