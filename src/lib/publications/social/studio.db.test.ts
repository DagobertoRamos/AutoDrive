// =============================================================================
// Estúdio social — integração com BANCO REAL (local) e rede SIMULADA.
//   PUBLICATIONS_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/publications/social/studio.db.test.ts
// Cria uma loja de teste (cores, logo, contatos), conexão de Instagram
// SIMULADA e um carro com foto; a fila publica Post, Story e Reels. O
// "Instagram" simulado BAIXA a arte e o vídeo pela nossa rota pública (como a
// Meta faz) e o teste confere que são JPEG/MP4 válidos. Apaga tudo no fim.
// Com SOCIAL_ART_OUT=<pasta> grava o que a rede baixou, para conferência.
// =============================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHttpClient, type FetchLike } from '../connectors/http'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.PUBLICATIONS_DB_TEST === '1' && URL_OK
if (process.env.PUBLICATIONS_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any, svc: any, worker: any, mediaRoute: any
const tag = randomUUID().slice(0, 8)
const T: Record<string, any> = {}
const OUT = process.env.SOCIAL_ART_OUT
const downloads: Array<{ kind: string; url: string; type: string; bytes: Buffer }> = []

/** Baixa pela NOSSA rota pública (como a Meta faria), sem servidor HTTP. */
async function download(url: string) {
  const file = url.split('/media/')[1]
  const res: Response = await mediaRoute.GET(new Request(url), { params: Promise.resolve({ file }) })
  const bytes = Buffer.from(await res.arrayBuffer())
  return { status: res.status, type: res.headers.get('content-type') ?? '', bytes }
}

// ── Instagram SIMULADO (Content Publishing documentado) ─────────────────────
const ig = { containers: new Map<string, { type: string; url: string; status: string }>(), n: 0, published: [] as string[] }
const metaFetch: FetchLike = async (url, init) => {
  const u = new URL(url); const method = String(init.method ?? 'GET')
  const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s })
  const body = new URLSearchParams(init.body instanceof URLSearchParams ? init.body.toString() : String(init.body ?? ''))
  if (u.pathname.endsWith('/content_publishing_limit')) return json(200, { data: [{ quota_usage: 0, config: { quota_total: 100 } }] })
  if (u.pathname.endsWith('/IGT/media') && method === 'POST') {
    const type = body.get('media_type') ?? (body.get('is_carousel_item') ? 'ITEM' : 'IMAGE')
    const mediaUrl = body.get('video_url') ?? body.get('image_url')
    const id = `C${++ig.n}`
    if (mediaUrl) {
      const d = await download(mediaUrl) // a rede baixa a mídia na criação do contêiner
      downloads.push({ kind: type, url: mediaUrl, type: d.type, bytes: d.bytes })
      if (d.status !== 200) return json(400, { error: { code: 9004, message: `Mídia inacessível (${d.status})` } })
    }
    ig.containers.set(id, { type, url: mediaUrl ?? '', status: type === 'REELS' ? 'IN_PROGRESS' : 'FINISHED' })
    return json(200, { id })
  }
  if (u.pathname.endsWith('/IGT/media_publish')) { const id = `M${body.get('creation_id')}`; ig.published.push(id); return json(200, { id }) }
  const last = u.pathname.split('/').pop()!
  if (ig.containers.has(last)) return json(200, { status_code: ig.containers.get(last)!.status })
  if (last.startsWith('M')) return json(200, { id: last, permalink: `https://www.instagram.com/p/${last}/` })
  if (last === 'IGT') return json(200, { id: 'IGT', username: 'loja_teste' })
  return json(404, { error: { code: 100, message: 'Unsupported get request' } })
}
const http = createHttpClient(metaFetch)
const run = (heavy: boolean) => worker.runWorker({ http, onlyTenantIds: [T.t.id], maxJobs: 20, deadlineMs: 120_000, origin: 'https://app.test', heavy })

async function carPhoto(): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  try {
    // Foto real de carro do estoque local (se houver internet); senão, sintética.
    const row = await prisma.vehiclePhoto.findFirst({ where: { url: { startsWith: 'https://autoconf-production.s3' } }, select: { url: true } })
    if (row) { const r = await fetch(row.url, { signal: AbortSignal.timeout(10_000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()) }
  } catch { /* offline */ }
  return sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#8899aa' } }).jpeg().toBuffer()
}

describe.skipIf(!RUN)('Estúdio social — banco local + Instagram simulado', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/prisma'))
    svc = await import('../service'); worker = await import('../worker')
    mediaRoute = await import('@/app/api/integrations/publications/media/[file]/route')
    if (OUT) mkdirSync(OUT, { recursive: true })
    const sharp = (await import('sharp')).default
    T.t = await prisma.tenant.create({ data: { publicId: `AD-SOC${tag}`.slice(0, 20), slug: `soctest-${tag}`, name: 'Loja Teste Social', zipCode: '06454000', city: 'Barueri', state: 'SP' } })
    T.unit = await prisma.unit.create({ data: { tenantId: T.t.id, name: 'Unidade', cnpj: `98${Date.now()}`.slice(0, 14) } })
    const logo = await sharp({ create: { width: 400, height: 160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect x="10" y="30" width="380" height="100" rx="20" fill="#ffffff"/></svg>') }]).png().toBuffer()
    const logoAsset = await prisma.siteAsset.create({ data: { tenantId: T.t.id, kind: 'LOGO', mimeType: 'image/png', fileSize: logo.length, width: 400, height: 160, sha256: `logo${tag}`, data: logo } })
    await prisma.systemSetting.create({ data: { key: `t:${T.t.id}:site:v1`, tenantId: T.t.id, value: JSON.stringify({ enabled: true, slug: `soctest-${tag}`, identity: { name: 'AutoDrive Teste', primaryColor: '#0ea5e9', darkColor: '#0b1b2b', logoUrl: `/api/site/assets/${logoAsset.id}` } }) } })
    await prisma.systemSetting.create({ data: { key: `t:${T.t.id}:publications:v1`, tenantId: T.t.id, value: JSON.stringify({ contacts: { whatsapp: '(11) 93471-8276', instagram: '@loja_teste' } }) } })
    const jpg = await carPhoto()
    const photos: string[] = []
    for (let n = 0; n < 3; n++) {
      const a = await prisma.siteAsset.create({ data: { tenantId: T.t.id, kind: 'VEHICLE_PHOTO', mimeType: 'image/jpeg', fileSize: jpg.length, sha256: `${tag}${n}`, data: jpg } })
      photos.push(`/api/site/assets/${a.id}`)
    }
    T.v = await prisma.vehicle.create({ data: { tenantId: T.t.id, unitId: T.unit.id, brand: 'Volkswagen', model: 'Polo', version: 'GTS 1.4 TSI', year: 2020, modelYear: 2020, km: 75000, fuel: 'FLEX', transmission: 'AUTOMATICO', plate: `SOC${tag.slice(0, 4)}`.toUpperCase(), salePrice: 100900, stockStatus: 'DISPONIVEL', active: true, mainPhotoUrl: photos[0], photos: { create: photos.map((url, i) => ({ url, order: i, isMain: i === 0 })) } } })
    T.ig = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'INSTAGRAM', externalAccountId: 'IGT', label: '@loja_teste (SIMULADO)', status: 'CONECTADO', secretsEncrypted: svc.sealSecrets({ page_access_token: 'PT', page_id: 'PG' }) } })
    T.actor = { id: null, name: 'Teste automatizado' }
    await svc.approveMedia(T.t.id, T.v.id, photos, T.actor)
  }, 90_000)

  afterAll(async () => {
    if (!prisma || !T.t) return
    const where = { tenantId: T.t.id }
    await prisma.publicationEvent.deleteMany({ where }); await prisma.publicationJob.deleteMany({ where }); await prisma.publication.deleteMany({ where })
    await prisma.publicationRevision.deleteMany({ where }); await prisma.publicationDraft.deleteMany({ where }); await prisma.publicationMapping.deleteMany({ where })
    await prisma.publicationConnection.deleteMany({ where }); await prisma.siteListing.deleteMany({ where })
    await prisma.vehiclePhoto.deleteMany({ where: { vehicle: where } }); await prisma.vehicle.deleteMany({ where })
    await prisma.siteAsset.deleteMany({ where }); await prisma.systemSetting.deleteMany({ where }); await prisma.unit.deleteMany({ where })
    await prisma.tenant.delete({ where: { id: T.t.id } })
    await prisma.$disconnect()
  }, 60_000)

  it('Post, Story e Reels: a fila publica e a rede baixa arte (JPEG) e vídeo (MP4) pela rota pública', async () => {
    const sharp = (await import('sharp')).default
    const mk = (format: string) => ({ vehicleId: T.v.id, connectionId: T.ig.id, campaignKey: format === 'POST' ? 'post' : `${format.toLowerCase()}-2026-01-01`, overrides: { social: { format, template: 'OFERTA' } } })
    const res = await svc.createPublications(T.t.id, [mk('POST'), mk('STORY'), mk('REELS')], { mode: 'AGORA', actor: T.actor })
    expect(res.map((r: any) => r.status)).toEqual(['ENFILEIRADO', 'ENFILEIRADO', 'ENFILEIRADO'])

    // Execução logo após o clique (sem ffmpeg): Post e Story vão; Reels fica para a rotina.
    await run(false)
    const byKey = async () => Object.fromEntries((await prisma.publication.findMany({ where: { tenantId: T.t.id } })).map((p: any) => [p.campaignKey.split('-')[0], p]))
    let pubs = await byKey()
    expect(pubs.post.status).toBe('PUBLICADO')
    expect(pubs.story.status).toBe('PUBLICADO')
    expect(pubs.reels.status).not.toBe('PUBLICADO')
    expect(downloads.some((d) => d.kind === 'REELS')).toBe(false)

    // Rotina agendada (com ffmpeg): gera o vídeo, a rede baixa e começa a processar.
    await prisma.publicationJob.updateMany({ where: { tenantId: T.t.id, status: 'PENDENTE' }, data: { runAt: new Date() } })
    await run(true)
    pubs = await byKey()
    expect(pubs.reels.status).toBe('EM_ANALISE')
    expect(pubs.reels.pendingToken).toBeTruthy()

    // Instagram terminou de processar → a conferência publica o Reels.
    for (const c of ig.containers.values()) c.status = 'FINISHED'
    await prisma.publicationJob.updateMany({ where: { tenantId: T.t.id, status: 'PENDENTE' }, data: { runAt: new Date() } })
    await run(true)
    pubs = await byKey()
    expect(pubs.reels.status).toBe('PUBLICADO')
    expect(pubs.reels.remoteUrl).toMatch(/instagram\.com/)

    // O que a "rede" baixou: arte 4:5 do Post, arte 9:16 do Story e MP4 vertical.
    const post = downloads.find((d) => d.kind === 'IMAGE')!; const story = downloads.find((d) => d.kind === 'STORIES')!; const reel = downloads.find((d) => d.kind === 'REELS')!
    expect(post.type).toBe('image/jpeg'); expect(story.type).toBe('image/jpeg'); expect(reel.type).toBe('video/mp4')
    expect(await sharp(post.bytes).metadata()).toMatchObject({ width: 1080, height: 1350 })
    expect(await sharp(story.bytes).metadata()).toMatchObject({ width: 1080, height: 1920 })
    expect(reel.bytes.subarray(4, 8).toString('ascii')).toBe('ftyp')
    if (OUT) { writeFileSync(path.join(OUT, 'db-post.jpg'), post.bytes); writeFileSync(path.join(OUT, 'db-story.jpg'), story.bytes); writeFileSync(path.join(OUT, 'db-reel.mp4'), reel.bytes) }

    // Link adulterado não abre nada.
    const bad = await download(post.url.replace(/\.jpg$/, 'x.jpg'))
    expect(bad.status).toBe(404)
  }, 240_000)

  it('piloto automático: aprovar fotos agenda os formatos nos horários de pico, sem duplicar', async () => {
    await prisma.systemSetting.update({ where: { key: `t:${T.t.id}:publications:v1` }, data: { value: JSON.stringify({ contacts: { whatsapp: '(11) 93471-8276' }, autoPublish: { enabled: true, connectionIds: [T.ig.id], enabledById: null, enabledByName: 'Teste', social: { formats: ['STORY', 'CARROSSEL'], template: 'CHEGOU' } } }) } })
    const photos = (await prisma.vehiclePhoto.findMany({ where: { vehicleId: T.v.id }, orderBy: { order: 'asc' } })).map((p: any) => p.url)
    const r1 = await svc.approveMedia(T.t.id, T.v.id, photos, T.actor)
    const scheduled = r1.autoPublished.filter((x: any) => x.status === 'AGENDADO')
    expect(scheduled.length).toBe(2)
    const pubs = await prisma.publication.findMany({ where: { tenantId: T.t.id, status: 'AGENDADO' } })
    for (const p of pubs) {
      expect(['carrossel', expect.stringMatching(/^story-\d{4}-\d{2}-\d{2}$/)]).toContainEqual(p.campaignKey)
      expect(p.scheduledAt.getTime()).toBeGreaterThan(Date.now())
      expect(p.overrides.social.template).toBe('CHEGOU')
    }
    const r2 = await svc.approveMedia(T.t.id, T.v.id, photos, T.actor)
    expect(r2.autoPublished.filter((x: any) => x.status === 'AGENDADO')).toHaveLength(0)
  }, 60_000)
})
