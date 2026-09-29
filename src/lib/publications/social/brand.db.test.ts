// =============================================================================
// Identidade da loja no Post avulso + textos por ocasião — banco REAL (local).
//   PUBLICATIONS_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/publications/social/brand.db.test.ts
// =============================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { OCCASIONS, occasionTemplate } from './avulsa-text-core'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.PUBLICATIONS_DB_TEST === '1' && URL_OK
if (process.env.PUBLICATIONS_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

describe('Textos do Post avulso por ocasião (sem IA)', () => {
  it('8 ocasiões, todas com o nome da loja, contatos e hashtags — e o detalhe digitado', () => {
    const s = { storeName: 'AutoDrive Veículos', city: 'Barueri', whatsapp: '(11) 93471-8276', instagram: '@autodrive' }
    const texts = OCCASIONS.map((o) => occasionTemplate(o, s))
    expect(texts.length).toBeGreaterThanOrEqual(5)
    expect(new Set(texts).size).toBe(texts.length)
    for (const t of texts) { expect(t).toMatch(/AutoDrive/i); expect(t).toContain('93471-8276'); expect(t).toMatch(/#autodriveveiculos/) }
    expect(occasionTemplate('ENTREGA', s, 'Entrega do Compass para a família Souza')).toContain('família Souza')
  })
})

/* eslint-disable @typescript-eslint/no-explicit-any */
describe.skipIf(!RUN)('Identidade da loja — banco local', () => {
  let prisma: any, av: any, video: any, frame: any
  const T: Record<string, any> = {}
  const tag = randomUUID().slice(0, 8)
  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/prisma'))
    av = await import('./avulsa'); video = await import('./video'); frame = await import('./brand-frame')
    const sharp = (await import('sharp')).default
    T.t = await prisma.tenant.create({ data: { publicId: `AD-BRA${tag}`.slice(0, 20), slug: `bratest-${tag}`, name: 'Loja Marca' } })
    T.ig = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'INSTAGRAM', externalAccountId: 'IGM', label: '@loja', status: 'CONECTADO' } })
    T.jpg = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#88aacc' } }).jpeg().toBuffer()
    T.img = (await prisma.siteAsset.create({ data: { tenantId: T.t.id, kind: 'SOCIAL_UPLOAD', mimeType: 'image/jpeg', fileSize: T.jpg.length, sha256: `${tag}m`, data: T.jpg } })).id
  }, 60_000)
  afterAll(async () => {
    if (!prisma || !T.t) return
    const where = { tenantId: T.t.id }
    await prisma.socialPost.deleteMany({ where }); await prisma.siteAsset.deleteMany({ where }); await prisma.publicationConnection.deleteMany({ where })
    await prisma.tenant.delete({ where: { id: T.t.id } }); await prisma.$disconnect()
  }, 60_000)

  it('sem a caixa marcada: a foto vai como foi enviada', async () => {
    const p = await av.createAvulsa(T.t.id, { format: 'POST', caption: 'x', media: [{ type: 'image', assetId: T.img }], connectionIds: [T.ig.id], scheduledAt: null, draft: true }, { id: null, name: null })
    expect(p.media[0].assetId).toBe(T.img)
  })
  it('com a caixa marcada: a foto ganha a identidade (nova imagem; a original fica) e o vídeo é marcado', async () => {
    const p = await av.createAvulsa(T.t.id, { format: 'POST', caption: 'x', media: [{ type: 'image', assetId: T.img }], connectionIds: [T.ig.id], scheduledAt: null, draft: true, brand: 'COMPLETO' }, { id: null, name: null })
    expect(p.media[0]).toMatchObject({ type: 'image', branded: 'COMPLETO' })
    expect(p.media[0].assetId).not.toBe(T.img)
    const branded = await prisma.siteAsset.findUnique({ where: { id: p.media[0].assetId } })
    expect(Buffer.from(branded.data).equals(T.jpg)).toBe(false)
    // Salvar de novo não aplica duas vezes.
    const again = await av.createAvulsa(T.t.id, { id: p.id, format: 'POST', caption: 'x', media: p.media, connectionIds: [T.ig.id], scheduledAt: null, draft: true, brand: 'COMPLETO' }, { id: null, name: null })
    expect(again.media[0].assetId).toBe(p.media[0].assetId)
  })
  it('vídeo: a camada da loja entra por cima ao montar o 9:16', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'brand-')); const src = path.join(dir, 'in.mp4'); const out = path.join(dir, 'out.mp4'); const png = path.join(dir, 'o.png')
    spawnSync(ffmpegStatic as unknown as string, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', src])
    writeFileSync(png, await frame.brandOverlay(1080, 1920, { storeName: 'Loja Marca', primaryColor: '#16a34a', darkColor: '#061b29', whatsapp: '(11) 90000-0000', instagram: '@loja', logo: null }, 'COMPLETO'))
    await video.toReels(src, out, undefined, png)
    const probe = spawnSync(ffmpegStatic as unknown as string, ['-i', out], { encoding: 'utf8' }).stderr
    expect(probe).toMatch(/1080x1920/)
    expect(readFileSync(out).length).toBeGreaterThan(10_000)
  }, 60_000)
})
