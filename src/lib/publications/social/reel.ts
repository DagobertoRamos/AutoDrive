// =============================================================================
// Estúdio social — Reels (vídeo vertical) a partir das fotos do carro, no
// roteiro dos anúncios que engajam (reel-core.ts): gancho, fotos com uma
// informação por cena, preço e chamada — no modelo visual escolhido
// (design-styles.ts) e na duração pedida (30/40/50/60 s). O carro aparece
// sempre inteiro; o logo vai sobre placa que contrasta.
// MP4 H.264 720×1280 30 fps (aceito por Instagram e Facebook).
// =============================================================================

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { type RenderArtInput } from './art'
import { TEMPLATE_INFO } from './formats'
import { chainFilter, REEL_TIMING, reelChips, reelPlan, sceneFilter, VIDEO_CAR_BOX, type ReelFacts, type ReelSegment } from './reel-core'
import { DESIGNS, type DesignStyle } from './design-styles'
import { designBase, designOverlay, type DesignCtx } from './design-render'
import { vehicleName } from '../content-core'
import { audioFilter } from './music-core'

export const REEL = { secondsPerPhoto: 2.6, endSeconds: 3.2, fade: 0.5, maxPhotos: 7, fps: 30 } as const

/** Filtro do ffmpeg (PURO, testado): zoom suave em cada quadro + fades encadeados. */
export function reelFilter(durations: number[], fps: number = REEL.fps, fade: number = REEL.fade): { filter: string; out: string; total: number } {
  const parts: string[] = []
  durations.forEach((d, i) => {
    const frames = Math.round(d * fps)
    parts.push(`[${i}:v]scale=1440:2560,zoompan=z='min(zoom+0.0007,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=${fps},setsar=1,format=yuv420p[v${i}]`)
  })
  let last = 'v0'
  let offset = durations[0]
  for (let i = 1; i < durations.length; i++) {
    offset -= fade
    const out = i === durations.length - 1 ? 'vout' : `x${i}`
    parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}[${out}]`)
    last = out
    offset += durations[i]
  }
  if (durations.length === 1) parts.push('[v0]null[vout]')
  const total = durations.reduce((a, b) => a + b, 0) - fade * (durations.length - 1)
  return { filter: parts.join(';'), out: 'vout', total }
}

async function ffmpegPath(): Promise<string> {
  const mod = (await import('ffmpeg-static')) as unknown as { default?: string } | string
  const p = typeof mod === 'string' ? mod : mod.default
  if (!p) throw new Error('ffmpeg indisponível neste servidor.')
  return p
}

function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => { err = (err + String(d)).slice(-8000) })
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Tempo esgotado ao gerar o vídeo.')) }, timeoutMs)
    child.on('error', (e) => { clearTimeout(t); reject(e) })
    child.on('close', (code) => {
      clearTimeout(t)
      if (code === 0) return resolve()
      console.error('[reel] ffmpeg', code, err)
      reject(new Error(`ffmpeg saiu com código ${code}: ${err.split('\n').filter((l) => l.trim()).slice(-12).join(' | ')}`))
    })
  })
}

export type ReelInput = Omit<RenderArtInput, 'photo' | 'format' | 'forVideo' | 'endCard'> & {
  photos: Buffer[]; audio?: Buffer | null; fuel?: string | null; options?: string[]; conditions?: string | null
  /** Modelo visual (padrão: Clássico premium). */
  design?: DesignStyle | null
  /** Duração em segundos: 30 (padrão), 40, 50 ou 60. */
  seconds?: number | null
}

/** Dados que o motor de design usa nas cenas (título, preço, contatos...). */
export function designCtxOf(i: Omit<ReelInput, 'photos'>, style: DesignStyle): DesignCtx {
  const facts = reelFactsOf(i)
  const y = i.year && i.modelYear && i.year !== i.modelYear ? `${i.year}/${i.modelYear}` : String(i.modelYear ?? i.year ?? '')
  const condition = String(i.conditions ?? '').split(/\n|•|;/).map((x) => x.replace(/^[-–✅✔️\s]+/u, '').trim()).find((x) => x && x.length <= 40) ?? null
  return {
    spec: DESIGNS[style], brandColor: i.primaryColor || '#16a34a', darkColor: i.darkColor || '#061b29', storeName: i.storeName,
    whatsapp: i.whatsapp ?? '', instagram: i.instagram ?? '', logo: i.logo ?? null,
    title: vehicleName(i.brand, i.model, i.version) || 'Confira', year: y, km: i.km ?? null, gear: i.gear ?? null,
    price: i.price ?? null, oldPrice: i.oldPrice ?? null, chips: reelChips(facts), condition,
  }
}

/** Roteiro do vídeo para estes dados, no modelo e na duração pedidos. */
export function planFor(photoCount: number, i: Omit<ReelInput, 'photos'>): ReelSegment[] {
  const spec = DESIGNS[i.design ?? 'CLASSICO']
  return reelPlan(photoCount, reelFactsOf(i), { seconds: i.seconds ?? 30, motion: spec.motion, transitions: spec.transitions })
}

/** Quadro da cena: fundo do modelo + carro inteiro (1080×1920) — um por foto. */
export function sceneBases(photos: Buffer[], style: DesignStyle, brandColor: string) {
  const cache = new Map<number, Promise<Buffer>>()
  return (k: number) => {
    const idx = photos[k] ? k : 0
    if (!cache.has(idx)) cache.set(idx, designBase(style, photos[idx], 1080, 1920, brandColor, { ...VIDEO_CAR_BOX }))
    return cache.get(idx)!
  }
}

const overlayKind = (s: ReelSegment) => (s.kind === 'photo' ? 'info' : s.kind)

/** Quadro parado de uma cena (prévia na tela), igual ao vídeo. */
export async function sceneStillOf(seg: ReelSegment, base: Buffer, ctx: DesignCtx, index: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const frame = await sharp(base).resize(720, 1280).png().toBuffer()
  return sharp(frame).composite([{ input: await designOverlay(overlayKind(seg), ctx, seg.chip, index), left: 0, top: 0 }]).jpeg({ quality: 82 }).toBuffer()
}

/** Monta o MP4 a partir de quadros prontos (JPEG 720×1280); com `audio`, a trilha entra com fade. */
export async function framesToVideo(frames: Buffer[], durations: number[], audio: Buffer | null | undefined, opts: { timeoutMs?: number } = {}): Promise<{ mp4: Buffer; seconds: number }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vid-'))
  try {
    const files: string[] = []
    for (const [n, f] of frames.entries()) { const p = path.join(dir, `f${n}.jpg`); await writeFile(p, f); files.push(p) }
    const { filter, out, total } = reelFilter(durations)
    let audioIn: string[]
    let audioMap: string
    let filterAll = filter
    if (audio?.length) {
      const a = path.join(dir, 'music'); await writeFile(a, audio)
      audioIn = ['-stream_loop', '-1', '-i', a]
      filterAll = `${filter};[${files.length}:a]${audioFilter(total)},atrim=0:${total.toFixed(2)}[aout]`
      audioMap = '[aout]'
    } else {
      audioIn = ['-f', 'lavfi', '-t', total.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']
      audioMap = `${files.length}:a`
    }
    const mp4 = path.join(dir, 'out.mp4')
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      ...files.flatMap((f, n) => ['-loop', '1', '-t', String(durations[n]), '-i', f]),
      ...audioIn,
      '-filter_complex', filterAll, '-map', `[${out}]`, '-map', audioMap,
      '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-crf', '24', '-maxrate', '1800k', '-bufsize', '3600k', '-pix_fmt', 'yuv420p', '-r', String(REEL.fps),
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-t', total.toFixed(2), '-movflags', '+faststart', mp4,
    ]
    await run(await ffmpegPath(), args, opts.timeoutMs ?? 120_000)
    return { mp4: await readFile(mp4), seconds: Math.round(total * 10) / 10 }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Gera o MP4 do Reels: gancho, fotos com uma informação por cena, preço e
 * chamada, no modelo visual e na duração pedidos. Lança erro se não houver foto.
 */
export async function renderReel(i: ReelInput, opts: { timeoutMs?: number } = {}): Promise<{ mp4: Buffer; seconds: number }> {
  const photos = i.photos.slice(0, REEL_TIMING.maxPhotos)
  if (!photos.length) throw new Error('O Reels precisa de pelo menos uma foto.')
  const style: DesignStyle = i.design ?? 'CLASSICO'
  const segs = planFor(photos.length, i)
  const ctx = designCtxOf(i, style)
  const baseOf = sceneBases(photos, style, ctx.brandColor)
  const dir = await mkdtemp(path.join(tmpdir(), 'reel-'))
  try {
    // 1) Cada cena vira um vídeo curto (2 entradas por vez: pouca memória).
    const clips: string[] = []
    const bin = await ffmpegPath()
    const written = new Set<number>()
    for (const [n, seg] of segs.entries()) {
      const base = path.join(dir, `b${seg.photo}.jpg`); const over = path.join(dir, `o${n}.png`); const clip = path.join(dir, `c${n}.mp4`)
      if (!written.has(seg.photo)) { await writeFile(base, await baseOf(seg.photo)); written.add(seg.photo) }
      await writeFile(over, await designOverlay(overlayKind(seg), ctx, seg.chip, n))
      const t = seg.seconds.toFixed(2)
      await run(bin, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-loop', '1', '-framerate', String(REEL.fps), '-t', t, '-i', base, '-loop', '1', '-framerate', String(REEL.fps), '-t', t, '-i', over,
        '-filter_complex', sceneFilter(seg, REEL.fps), '-map', '[v]', '-an',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(REEL.fps), '-t', t, clip,
      ], 90_000)
      clips.push(clip)
    }
    // 2) Junta as cenas com as transições e a música.
    const g = chainFilter(segs, REEL.fps)
    return await encode(dir, clips.flatMap((c) => ['-i', c]), clips.length, g.filter, g.out, g.total, i.audio, opts.timeoutMs ?? 240_000)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Dados do carro para o roteiro (gancho, cenas e preço). */
export function reelFactsOf(i: Pick<ReelInput, 'brand' | 'model' | 'version' | 'year' | 'modelYear' | 'km' | 'gear' | 'template'> & { fuel?: string | null; options?: string[]; conditions?: string | null }): ReelFacts {
  return { brand: i.brand, model: i.model, version: i.version, year: i.year, modelYear: i.modelYear, km: i.km, gear: i.gear, fuel: i.fuel ?? null, options: i.options ?? [], conditions: i.conditions ?? null, badge: TEMPLATE_INFO[i.template].badge ?? 'CONFIRA' }
}

/** Codifica o MP4 (H.264 + AAC) a partir das entradas e do filtro montados. */
async function encode(dir: string, inputs: string[], inputCount: number, filter: string, out: string, total: number, audio: Buffer | null | undefined, timeoutMs: number): Promise<{ mp4: Buffer; seconds: number }> {
  let audioIn: string[]
  let audioMap: string
  let filterAll = filter
  if (audio?.length) {
    const a = path.join(dir, 'music'); await writeFile(a, audio)
    audioIn = ['-stream_loop', '-1', '-i', a]
    filterAll = `${filter};[${inputCount}:a]${audioFilter(total)},atrim=0:${total.toFixed(2)}[aout]`
    audioMap = '[aout]'
  } else {
    audioIn = ['-f', 'lavfi', '-t', total.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']
    audioMap = `${inputCount}:a`
  }
  const mp4 = path.join(dir, 'out.mp4')
  await run(await ffmpegPath(), [
    '-hide_banner', '-loglevel', 'error', '-y', ...inputs, ...audioIn,
    '-filter_complex', filterAll, '-map', `[${out}]`, '-map', audioMap,
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-crf', '23', '-maxrate', '2500k', '-bufsize', '5000k', '-pix_fmt', 'yuv420p', '-r', String(REEL.fps),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-t', total.toFixed(2), '-movflags', '+faststart', mp4,
  ], timeoutMs)
  return { mp4: await readFile(mp4), seconds: Math.round(total * 10) / 10 }
}

/**
 * Vídeo curto com UMA arte (zoom suave) — Story, capa de Carrossel e Post
 * com música. Formato do quadro: vertical (Story) ou 4:5 ampliado para 9:16.
 */
export async function renderArtClip(art: Buffer, seconds: number, audio: Buffer | null | undefined, opts: { timeoutMs?: number } = {}): Promise<{ mp4: Buffer; seconds: number }> {
  const sharp = (await import('sharp')).default
  // Arte de feed (4:5) vai centralizada num quadro 9:16 com fundo desfocado dela mesma.
  const meta = await sharp(art).metadata()
  let frame = art
  if ((meta.height ?? 0) / (meta.width ?? 1) < 1.7) {
    const bg = await sharp(art).resize(720, 1280, { fit: 'cover' }).blur(30).modulate({ brightness: 0.5 }).toBuffer()
    const fg = await sharp(art).resize(720, 1280, { fit: 'inside' }).toBuffer({ resolveWithObject: true })
    frame = await sharp(bg).composite([{ input: fg.data, left: Math.round((720 - fg.info.width) / 2), top: Math.round((1280 - fg.info.height) / 2) }]).jpeg({ quality: 90 }).toBuffer()
  } else {
    frame = await sharp(art).resize(720, 1280, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer()
  }
  return framesToVideo([frame], [seconds], audio, opts)
}
