// =============================================================================
// Posts avulsos — integração com BANCO REAL (local) e Meta SIMULADA.
//   PUBLICATIONS_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/publications/social/avulsa.db.test.ts
// Post com 2 fotos (carrossel no Instagram, álbum no Facebook) e Reels com
// vídeo enviado EM PEDAÇOS (montado, ajustado para 9:16 e enviado em bytes).
// =============================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHttpClient, type FetchLike } from '../connectors/http'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.PUBLICATIONS_DB_TEST === '1' && URL_OK
if (process.env.PUBLICATIONS_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any, svc: any, av: any, mediaRoute: any
const tag = randomUUID().slice(0, 8)
const T: Record<string, any> = {}
const calls: Array<{ url: string; method: string; body: string; headers: Record<string, string>; bytes?: Uint8Array }> = []
let igStatus = 'IN_PROGRESS'; let fbVideo = 'processing'
const downloaded: string[] = []

const meta: FetchLike = async (url, init) => {
  const u = new URL(url); const method = String(init.method ?? 'GET')
  const raw = init.body
  const body = raw instanceof URLSearchParams ? raw.toString() : typeof raw === 'string' ? raw : ''
  calls.push({ url, method, body, headers: (init.headers ?? {}) as Record<string, string>, bytes: raw instanceof Uint8Array ? raw : undefined })
  const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s })
  const p = new URLSearchParams(body)
  if (u.hostname === 'rupload.facebook.com') return json(200, { success: true })
  // Instagram
  if (u.pathname.endsWith('/IGA/media') && method === 'POST') {
    const img = p.get('image_url')
    if (img) { const file = img.split('/media/')[1]; const r: Response = await mediaRoute.GET(new Request(img), { params: Promise.resolve({ file }) }); downloaded.push(`${r.status} ${r.headers.get('content-type')}`) }
    return json(200, { id: p.get('media_type') === 'CAROUSEL' ? 'CAR' : p.get('upload_type') === 'resumable' ? 'RC' : `I${calls.length}` })
  }
  if (u.pathname.endsWith('/IGA/media_publish')) return json(200, { id: `M-${p.get('creation_id')}` })
  if (u.pathname.endsWith('/RC')) return json(200, { status_code: igStatus })
  if (/\/(I\d+|CAR)$/.test(u.pathname)) return json(200, { status_code: 'FINISHED' })
  if (/\/M-/.test(u.pathname)) return json(200, { permalink: 'https://www.instagram.com/p/x/' })
  // Página
  if (u.pathname.endsWith('/PGA/photos')) return json(200, { id: `F${calls.length}` })
  if (u.pathname.endsWith('/PGA/feed')) return json(200, { id: p.get('link') ? 'PG_LINK' : 'PG_POST' })
  if (u.pathname.endsWith('/PG_LINK')) return json(200, { permalink_url: 'https://www.facebook.com/p/link' })
  if (u.pathname.endsWith('/ig_audio')) return u.searchParams.get('access_token') === 'UT' ? json(200, { data: [{ audio_id: '42', title: 'Hit', display_artist: 'Banda', duration_in_ms: 30000, download_url: 'https://x/p.mp3' }] }) : json(400, { error: { code: 100, message: 'Page access token not supported' } })
  if (u.pathname.endsWith('/me/accounts')) return json(200, { data: [{ id: 'PGX', name: 'Pagina X', access_token: 'PAGE_TOKEN', instagram_business_account: { id: 'IGX', username: 'loja_x' } }] })
  if (u.pathname.endsWith('/debug_token')) return json(200, { data: { expires_at: 0 } })
  if (u.pathname.endsWith('/PG_POST')) return json(200, { permalink_url: 'https://www.facebook.com/p/1' })
  if (u.pathname.endsWith('/PGA/video_reels')) return json(200, p.get('upload_phase') === 'start' ? { video_id: 'FBV' } : { success: true })
  if (u.pathname.endsWith('/FBV')) return json(200, { permalink_url: '/reel/9', status: { video_status: fbVideo } })
  return json(404, { error: { code: 100, message: `rota não simulada ${u.pathname}` } })
}
const http = createHttpClient(meta)
const ffmpeg = () => ffmpegStatic as unknown as string

describe.skipIf(!RUN)('Posts avulsos — banco local + Meta simulada', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/prisma'))
    svc = await import('../service'); av = await import('./avulsa')
    mediaRoute = await import('@/app/api/integrations/publications/media/[file]/route')
    const sharp = (await import('sharp')).default
    T.t = await prisma.tenant.create({ data: { publicId: `AD-AVU${tag}`.slice(0, 20), slug: `avutest-${tag}`, name: 'Loja Teste Avulso' } })
    T.ig = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'INSTAGRAM', externalAccountId: 'IGA', label: '@loja_teste', status: 'CONECTADO', secretsEncrypted: svc.sealSecrets({ page_access_token: 'PT' }) } })
    T.fb = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'META_PAGE', externalAccountId: 'PGA', label: 'Loja Teste', status: 'CONECTADO', secretsEncrypted: svc.sealSecrets({ page_access_token: 'PT' }) } })
    const jpg = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: '#557799' } }).jpeg().toBuffer()
    T.imgs = []
    for (let n = 0; n < 2; n++) T.imgs.push((await prisma.siteAsset.create({ data: { tenantId: T.t.id, kind: 'SOCIAL_UPLOAD', mimeType: 'image/jpeg', fileSize: jpg.length, sha256: `${tag}${n}`, data: jpg } })).id)
    // Vídeo horizontal real, enviado em 2 pedaços.
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'avu-')), 'v.mp4')
    spawnSync(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=3', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', f])
    const video = readFileSync(f); const half = Math.ceil(video.length / 2)
    T.uploadId = randomUUID()
    await av.storeVideoPart(T.t.id, T.uploadId, 0, video.subarray(0, half))
    await av.storeVideoPart(T.t.id, T.uploadId, 1, video.subarray(half))
    T.videoSize = video.length
  }, 90_000)

  afterAll(async () => {
    if (!prisma || !T.t) return
    const where = { tenantId: T.t.id }
    await prisma.socialPost.deleteMany({ where }); await prisma.siteAsset.deleteMany({ where }); await prisma.publicationConnection.deleteMany({ where })
    await prisma.tenant.delete({ where: { id: T.t.id } }); await prisma.$disconnect()
  }, 60_000)

  it('valida: post sem foto, reels sem vídeo e vídeo que não terminou de subir são recusados', async () => {
    const base = { connectionIds: [T.ig.id], scheduledAt: null, draft: false, caption: '' }
    await expect(av.createAvulsa(T.t.id, { ...base, format: 'POST', media: [] }, { id: null, name: 'x' })).rejects.toThrow(/ao menos uma foto/)
    await expect(av.createAvulsa(T.t.id, { ...base, format: 'REELS', media: [{ type: 'image', assetId: T.imgs[0] }] }, { id: null, name: 'x' })).rejects.toThrow(/1 vídeo/)
    await expect(av.createAvulsa(T.t.id, { ...base, format: 'REELS', media: [{ type: 'video', uploadId: 'nao-subiu-123', parts: 2, size: 1000 }] }, { id: null, name: 'x' })).rejects.toThrow(/não terminou de subir/)
  })

  it('Post com 2 fotos e Reels com vídeo em pedaços: publica nas duas redes; vídeo processa e sai na rodada seguinte', async () => {
    const actor = { id: null, name: 'Teste' }
    const post = await av.createAvulsa(T.t.id, { format: 'POST', caption: 'Entrega da semana! 🚗', media: T.imgs.map((assetId: string) => ({ type: 'image', assetId })), connectionIds: [T.ig.id, T.fb.id], scheduledAt: null, draft: false }, actor)
    const reel = await av.createAvulsa(T.t.id, { format: 'REELS', caption: 'Bastidores', media: [{ type: 'video', uploadId: T.uploadId, parts: 2, size: T.videoSize }], connectionIds: [T.ig.id, T.fb.id], scheduledAt: null, draft: false }, actor)
    await av.processSocialPosts({ http, origin: 'https://app.test' })

    const p1 = await prisma.socialPost.findUnique({ where: { id: post.id } })
    expect(p1.status).toBe('PUBLICADO')
    expect(p1.results[T.ig.id]).toMatchObject({ state: 'PUBLICADO', remoteUrl: 'https://www.instagram.com/p/x/' })
    expect(p1.results[T.fb.id]).toMatchObject({ state: 'PUBLICADO', remoteUrl: 'https://www.facebook.com/p/1' })
    expect(calls.some((c) => c.body.includes('media_type=CAROUSEL'))).toBe(true)
    expect(downloaded.every((d) => d === '200 image/jpeg')).toBe(true)

    let r1 = await prisma.socialPost.findUnique({ where: { id: reel.id } })
    expect(r1.status).toBe('ENVIANDO')
    // O vídeo que chegou às redes é MP4 vertical montado dos pedaços.
    const up = calls.filter((c) => c.url.includes('rupload') && c.bytes)
    expect(up.length).toBe(2)
    for (const c of up) expect(Buffer.from(c.bytes!).subarray(4, 8).toString('ascii')).toBe('ftyp')
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'avu-out-')), 'o.mp4'); writeFileSync(f, up[0].bytes!)
    expect(spawnSync(ffmpeg(), ['-hide_banner', '-i', f], { encoding: 'utf8' }).stderr).toMatch(/1080x1920/)

    igStatus = 'FINISHED'; fbVideo = 'ready'
    await prisma.socialPost.update({ where: { id: reel.id }, data: { scheduledAt: new Date(Date.now() - 1000) } })
    await av.processSocialPosts({ http, origin: 'https://app.test' })
    r1 = await prisma.socialPost.findUnique({ where: { id: reel.id } })
    expect(r1.status).toBe('PUBLICADO')
    expect(r1.results[T.fb.id].remoteUrl).toBe('https://www.facebook.com/reel/9')
  }, 180_000)

  it('link de vídeo (YouTube): só na Página do Facebook, com o link no post; Instagram sozinho é recusado', async () => {
    const actor = { id: null, name: 'Teste' }
    await expect(av.createAvulsa(T.t.id, { format: 'LINK', caption: 'Vídeo novo!', media: [{ type: 'link', url: 'https://youtu.be/dQw4w9WgXcQ' }], connectionIds: [T.ig.id], scheduledAt: null, draft: false }, actor)).rejects.toThrow(/Instagram não aceita links/)
    const post = await av.createAvulsa(T.t.id, { format: 'LINK', caption: 'Vídeo novo!', media: [{ type: 'link', url: 'https://youtu.be/dQw4w9WgXcQ' }], connectionIds: [T.ig.id, T.fb.id], scheduledAt: null, draft: false }, actor)
    expect(post.connectionIds).toEqual([T.fb.id])
    await av.processSocialPosts({ http, origin: 'https://app.test' })
    const p1 = await prisma.socialPost.findUnique({ where: { id: post.id } })
    expect(p1.status).toBe('PUBLICADO')
    const feed = calls.find((c) => c.url.endsWith('/PGA/feed') && c.body.includes('link='))!
    expect(new URLSearchParams(feed.body).get('link')).toBe('https://youtu.be/dQw4w9WgXcQ')
  }, 60_000)

  it('espaço: pedaços do vídeo somem ao publicar; fotos órfãs e de posts antigos são limpas; contador por tipo', async () => {
    expect(await prisma.siteAsset.count({ where: { tenantId: T.t.id, kind: 'SOCIAL_VPART' } })).toBe(0)
    const sharp = (await import('sharp')).default
    const jpg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).jpeg().toBuffer()
    const old = new Date(Date.now() - 2 * 86_400_000)
    const orphan = await prisma.siteAsset.create({ data: { tenantId: T.t.id, kind: 'SOCIAL_UPLOAD', mimeType: 'image/jpeg', fileSize: jpg.length, sha256: `orf${tag}`, data: jpg, createdAt: old } })
    await prisma.siteAsset.updateMany({ where: { id: { in: T.imgs } }, data: { createdAt: old } })
    const st = await av.socialStorage(T.t.id)
    expect(st.fotos).toBeGreaterThan(0)
    await av.pruneSocialUploads()
    expect(await prisma.siteAsset.count({ where: { id: orphan.id } })).toBe(0)
    // Fotos de post publicado há pouco ficam (prévia de "como ficou").
    expect(await prisma.siteAsset.count({ where: { id: { in: T.imgs } } })).toBe(2)
    await prisma.socialPost.updateMany({ where: { tenantId: T.t.id }, data: { updatedAt: new Date(Date.now() - 31 * 86_400_000) } })
    await av.pruneSocialUploads()
    expect(await prisma.siteAsset.count({ where: { id: { in: T.imgs } } })).toBe(0)
  }, 60_000)

  it('músicas do Instagram: conexão por token guarda o token de USUÁRIO e a busca usa ele; sem ele, explica', async () => {
    const { connectMetaByToken } = await import('../oauth')
    const { searchIgLibrary } = await import('./music')
    await expect(searchIgLibrary(T.t.id, '', http)).rejects.toThrow(/nova conexão/)
    await connectMetaByToken(T.t.id, { token: 'UT' }, { id: null, name: 'Teste' }, http)
    const ig = await prisma.publicationConnection.findFirst({ where: { tenantId: T.t.id, externalAccountId: 'IGX' } })
    expect(svc.readSecrets(ig.secretsEncrypted)).toMatchObject({ page_access_token: 'PAGE_TOKEN', user_access_token: 'UT' })
    await prisma.publicationConnection.updateMany({ where: { tenantId: T.t.id, externalAccountId: { in: ['IGA'] } }, data: { status: 'RECONECTAR' } })
    const tracks = await searchIgLibrary(T.t.id, '', http)
    expect(tracks[0]).toMatchObject({ source: 'IG', id: '42', title: 'Hit' })
  }, 60_000)
})
