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
import { classifyVideo, VERTICAL_FILTER } from './video-core'

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

/** Ajusta um arquivo de vídeo para Reels: 1080×1920, 30 fps, até 90 s, áudio AAC (mudo se não tiver). */
export async function toReels(input: string, output: string, timeoutMs = 200_000): Promise<void> {
  await ffmpeg([
    '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', `${VERTICAL_FILTER};[0:a]aresample=44100[a0];[1:a][a0]amix=inputs=2:duration=longest:normalize=0[a]`,
    '-map', '[v]', '-map', '[a]',
    '-t', '90', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '6M', '-bufsize', '12M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-shortest', '-movflags', '+faststart', output,
  ], timeoutMs).catch(async (e) => {
    // Vídeo sem faixa de áudio: [0:a] não existe — refaz só com áudio mudo.
    if (!/0:a|Stream specifier|matches no streams/i.test(String((e as Error).message))) throw e
    await ffmpeg([
      '-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex', VERTICAL_FILTER, '-map', '[v]', '-map', '1:a',
      '-t', '90', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '6M', '-bufsize', '12M', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', output,
    ], timeoutMs)
  })
}

/** Vídeo do carro pronto para Reels (bytes do MP4). */
export async function carVideoForReels(link: string): Promise<Uint8Array> {
  const v = classifyVideo(link)
  if (!v) throw new Error('Link de vídeo inválido.')
  if (!v.downloadUrl) throw new Error(`Vídeo do ${v.label} não pode ser baixado (termos do serviço). Use Google Drive, Dropbox ou .mp4 para publicar como Reels.`)
  const dir = await mkdtemp(path.join(tmpdir(), 'carvid-'))
  try {
    const src = path.join(dir, 'in'); const out = path.join(dir, 'out.mp4')
    await download(v.downloadUrl, src)
    if ((await stat(src)).size < 10_000) throw new Error('O arquivo do vídeo veio vazio.')
    await toReels(src, out)
    return new Uint8Array(await readFile(out))
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
