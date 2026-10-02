// =============================================================================
// Vídeo do carro (servidor): baixa o arquivo do link (Drive, Dropbox, .mp4)
// com proteção de endereço interno, e ajusta para Reels (9:16, H.264, até
// 90 s, com o áudio original). Só na rotina agendada (ffmpeg).
// =============================================================================

import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { spawn } from 'node:child_process'
import { assertSafeUrl, safeLookup, UnsafeUrlError } from '../safe-fetch'
import { classifyVideo, parseProbe, VERTICAL_FILTER } from './video-core'

const MAX_BYTES = 300 * 1024 * 1024

/** Baixa para um arquivo temporário (sem carregar tudo na memória). */
async function download(raw: string, file: string, redirects = 5): Promise<void> {
  let url = assertSafeUrl(raw)
  for (let hop = 0; hop <= redirects; hop++) {
    const r = await new Promise<{ status: number; location?: string; type?: string }>((resolve, reject) => {
      const mod = url.protocol === 'https:' ? https : http
      const req = mod.get(url, { lookup: safeLookup, timeout: 60_000, headers: { 'User-Agent': 'AutoDrive-Publicacoes/1.0', Accept: 'video/*,application/octet-stream,*/*' } }, (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400) { res.resume(); return resolve({ status, location: res.headers.location }) }
        if (status !== 200) { res.resume(); return resolve({ status }) }
        const type = String(res.headers['content-type'] ?? '').toLowerCase()
        // Página HTML (ex.: arquivo do Drive não compartilhado) não é vídeo.
        if (type.startsWith('text/html')) { res.resume(); return resolve({ status: 415, type }) }
        let size = 0
        const out = createWriteStream(file)
        res.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BYTES) req.destroy(new UnsafeUrlError('Vídeo maior que 300 MB.')) })
        res.pipe(out)
        out.on('finish', () => resolve({ status: 200, type }))
        out.on('error', reject)
        res.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao baixar o vídeo.')))
      req.on('error', reject)
    })
    if (r.location) { url = assertSafeUrl(new URL(r.location, url).toString()); continue }
    if (r.status === 415) throw new Error('O link abriu uma página, não o arquivo. No Google Drive, compartilhe como "Qualquer pessoa com o link".')
    if (r.status !== 200) throw new Error(`O link do vídeo respondeu HTTP ${r.status}.`)
    return
  }
  throw new Error('Redirecionamentos demais no link do vídeo.')
}

function ffmpeg(args: string[], timeoutMs: number): Promise<void> {
  return (async () => {
    const mod = (await import('ffmpeg-static')) as unknown as { default?: string } | string
    const bin = typeof mod === 'string' ? mod : mod.default
    if (!bin) throw new Error('ffmpeg indisponível neste servidor.')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      child.stderr.on('data', (d) => { err = (err + String(d)).slice(-3000) })
      const t = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Tempo esgotado ao ajustar o vídeo.')) }, timeoutMs)
      child.on('error', (e) => { clearTimeout(t); reject(e) })
      child.on('close', (code) => { clearTimeout(t); if (code === 0) resolve(); else reject(new Error(`Não foi possível ler o vídeo (ffmpeg ${code}): ${err.split('\n').filter(Boolean).slice(-2).join(' ')}`)) })
    })
  })()
}

/** Medidas do vídeo (largura/altura como aparece, já girado, e duração) lidas pelo ffmpeg. */
export async function probeVideo(input: string): Promise<{ width: number; height: number; duration: number } | null> {
  const mod = (await import('ffmpeg-static')) as unknown as { default?: string } | string
  const bin = typeof mod === 'string' ? mod : mod.default
  if (!bin) return null
  const err = await new Promise<string>((resolve) => {
    const child = spawn(bin, ['-hide_banner', '-i', input], { stdio: ['ignore', 'ignore', 'pipe'] })
    let out = ''
    child.stderr.on('data', (d) => { out += String(d) })
    const t = setTimeout(() => child.kill('SIGKILL'), 20_000)
    child.on('error', () => { clearTimeout(t); resolve(out) })
    child.on('close', () => { clearTimeout(t); resolve(out) })
  })
  return parseProbe(err)
}

/** Extras do Reels: camada da marca por cima e encerramento (PNG 1080×1920) no fim. */
export interface ReelsExtras { overlay?: string; endCard?: string; /** Duração do vídeo de entrada (s) — necessária para o encerramento. */ duration?: number }

export const END_CARD_SECONDS = 2.5

/** Ajusta um arquivo de vídeo para Reels: 1080×1920, 30 fps, até 90 s, áudio AAC (mudo se não tiver). */
export async function toReels(input: string, output: string, timeoutMs = 200_000, extras?: string | ReelsExtras): Promise<void> {
  const x: ReelsExtras = typeof extras === 'string' ? { overlay: extras } : extras ?? {}
  // Encerramento: o vídeo vai até ~87 s e ganha 2,5 s com o logo da loja (entra com fade).
  const card = x.endCard && x.duration && x.duration > 1 ? { file: x.endCard, at: Math.min(x.duration, 90 - END_CARD_SECONDS - 0.5) } : null
  const inputs = ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']
  let n = 2
  const chain: string[] = [VERTICAL_FILTER.replace(/\[v\]$/, '[v0]')]
  let last = 'v0'
  if (x.overlay) {
    // Identidade da loja (PNG 1080×1920 transparente) por cima do vídeo já em 9:16.
    inputs.push('-i', x.overlay)
    chain.push(`[${last}][${n}:v]overlay=0:0:format=auto[v1]`); last = 'v1'; n++
  }
  if (card) {
    inputs.push('-loop', '1', '-t', String(END_CARD_SECONDS), '-i', card.file)
    chain.push(`[${last}]tpad=stop_mode=clone:stop_duration=${END_CARD_SECONDS}[v2]`)
    chain.push(`[${n}:v]scale=1080:1920,fps=30,format=rgba,fade=t=in:st=0:d=0.45:alpha=1,setpts=PTS-STARTPTS+${card.at.toFixed(3)}/TB[c]`)
    chain.push('[v2][c]overlay=0:0:eof_action=pass[v3]'); last = 'v3'; n++
  }
  chain.push(`[${last}]format=yuv420p[v]`)
  const video = chain.join(';')
  const total = card ? card.at + END_CARD_SECONDS : 90
  // O som some suave junto com a entrada do encerramento.
  const fadeA = card ? `,afade=t=out:st=${Math.max(0, card.at - 0.3).toFixed(3)}:d=0.8` : ''
  const trimIn = card ? ['-t', card.at.toFixed(3)] : []
  await ffmpeg([
    '-hide_banner', '-loglevel', 'error', '-y', ...trimIn, '-i', input,
    ...inputs,
    '-filter_complex', `${video};[0:a]aresample=44100[a0];[1:a][a0]amix=inputs=2:duration=longest:normalize=0${fadeA}[a]`,
    '-map', '[v]', '-map', '[a]',
    '-t', total.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '6M', '-bufsize', '12M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-shortest', '-movflags', '+faststart', output,
  ], timeoutMs).catch(async (e) => {
    // Vídeo sem faixa de áudio: [0:a] não existe — refaz só com áudio mudo.
    if (!/0:a|Stream specifier|matches no streams/i.test(String((e as Error).message))) throw e
    await ffmpeg([
      '-hide_banner', '-loglevel', 'error', '-y', ...trimIn, '-i', input, ...inputs,
      '-filter_complex', video, '-map', '[v]', '-map', '1:a',
      '-t', total.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '6M', '-bufsize', '12M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', output,
    ], timeoutMs)
  })
}

/** Baixa um arquivo de vídeo (endereço https direto, ex.: armazenamento da loja) para `file`. */
export async function downloadToFile(url: string, file: string): Promise<void> {
  await download(url, file)
  if ((await stat(file)).size < 10_000) throw new Error('O arquivo do vídeo veio vazio.')
}

/** Baixa o vídeo do link (Drive, Dropbox, .mp4) para `file`. */
export async function downloadVideoLink(link: string, file: string): Promise<void> {
  const v = classifyVideo(link)
  if (!v) throw new Error('Link de vídeo inválido.')
  if (!v.downloadUrl) throw new Error(`Vídeo do ${v.label} não pode ser baixado (termos do serviço). Use Google Drive, Dropbox ou .mp4 para publicar como Reels.`)
  await download(v.downloadUrl, file)
  if ((await stat(file)).size < 10_000) throw new Error('O arquivo do vídeo veio vazio.')
}

/** Vídeo do carro pronto para Reels (bytes do MP4). */
export async function carVideoForReels(link: string, overlayPng?: string): Promise<Uint8Array> {
  const dir = await mkdtemp(path.join(tmpdir(), 'carvid-'))
  try {
    const src = path.join(dir, 'in'); const out = path.join(dir, 'out.mp4')
    await downloadVideoLink(link, src)
    await toReels(src, out, undefined, overlayPng)
    return new Uint8Array(await readFile(out))
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
