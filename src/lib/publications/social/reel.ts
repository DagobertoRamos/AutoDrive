// =============================================================================
// Estúdio social — Reels (vídeo vertical) a partir das fotos do carro.
// Cada foto vira um quadro com a arte (preço, modelo, WhatsApp), zoom suave e
// transição em fade; termina num quadro com a chamada para o WhatsApp.
// MP4 H.264 720×1280 30 fps com trilha de áudio muda (aceito por Instagram e
// Facebook; a rede converte). Arquivo leve (~2–4 MB) para caber na resposta.
// =============================================================================

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { renderArt, type RenderArtInput } from './art'

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
    child.stderr.on('data', (d) => { err = (err + String(d)).slice(-4000) })
    const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Tempo esgotado ao gerar o vídeo.')) }, timeoutMs)
    child.on('error', (e) => { clearTimeout(t); reject(e) })
    child.on('close', (code) => { clearTimeout(t); if (code === 0) resolve(); else reject(new Error(`ffmpeg saiu com código ${code}: ${err.split('\n').slice(-4).join(' ')}`)) })
  })
}

export type ReelInput = Omit<RenderArtInput, 'photo' | 'format' | 'forVideo' | 'endCard'> & { photos: Buffer[] }

/** Gera o MP4 do Reels. Lança erro se não houver foto. */
export async function renderReel(i: ReelInput, opts: { timeoutMs?: number } = {}): Promise<{ mp4: Buffer; seconds: number }> {
  const photos = i.photos.slice(0, REEL.maxPhotos)
  if (!photos.length) throw new Error('O Reels precisa de pelo menos uma foto.')
  const dir = await mkdtemp(path.join(tmpdir(), 'reel-'))
  try {
    const frames: string[] = []
    for (const [n, photo] of photos.entries()) {
      // Selo só no primeiro quadro; os demais mostram o carro com preço e contato.
      const jpg = await renderArt({ ...i, template: n === 0 ? i.template : 'LIMPA', photo, format: 'REELS', forVideo: true }, { quality: 90 })
      const f = path.join(dir, `f${n}.jpg`); await writeFile(f, jpg); frames.push(f)
    }
    const end = await renderArt({ ...i, photo: photos[0], format: 'REELS', forVideo: true, endCard: true }, { quality: 90 })
    const fe = path.join(dir, 'end.jpg'); await writeFile(fe, end); frames.push(fe)

    const durations = [...photos.map(() => REEL.secondsPerPhoto), REEL.endSeconds]
    const { filter, out, total } = reelFilter(durations)
    const mp4 = path.join(dir, 'reel.mp4')
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      ...frames.flatMap((f, n) => ['-loop', '1', '-t', String(durations[n]), '-i', f]),
      '-f', 'lavfi', '-t', total.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex', filter, '-map', `[${out}]`, '-map', `${frames.length}:a`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-crf', '24', '-maxrate', '1800k', '-bufsize', '3600k', '-pix_fmt', 'yuv420p', '-r', String(REEL.fps),
      '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', mp4,
    ]
    await run(await ffmpegPath(), args, opts.timeoutMs ?? 120_000)
    return { mp4: await readFile(mp4), seconds: Math.round(total * 10) / 10 }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
