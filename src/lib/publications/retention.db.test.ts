// =============================================================================
// Rascunhos, retenção de 2 dias e histórico — integração com BANCO REAL (local).
//   PUBLICATIONS_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/publications/retention.db.test.ts
// Continua um rascunho de post avulso (mesmo registro), roda a retenção com o
// relógio 3 dias à frente e confere que só o histórico ficou; o histórico
// filtra por placa, canal e unidade e exporta CSV. Apaga tudo no fim.
// =============================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.PUBLICATIONS_DB_TEST === '1' && URL_OK
if (process.env.PUBLICATIONS_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

/* eslint-disable @typescript-eslint/no-explicit-any */
const T: Record<string, any> = {}
vi.mock('@/lib/publications/api', async (orig) => ({
  ...(await orig<any>()),
  pubAuth: async () => ({ tenantId: T.t.id, user: { id: T.userId, name: 'Teste' }, actor: { id: T.userId, name: 'Teste', role: 'ADMIN' } }),
}))

let prisma: any, av: any, ret: any, history: any, wizard: any
const tag = randomUUID().slice(0, 8)
const later = () => new Date(Date.now() + 3 * 86_400_000)

describe.skipIf(!RUN)('Retenção e histórico — banco local', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/prisma'))
    av = await import('./social/avulsa'); ret = await import('./retention')
    history = await import('@/app/api/publications/history/route'); wizard = await import('@/app/api/publications/wizard/route')
    const sharp = (await import('sharp')).default
    T.userId = `user-${tag}`
    T.t = await prisma.tenant.create({ data: { publicId: `AD-RET${tag}`.slice(0, 20), slug: `rettest-${tag}`, name: 'Loja Teste Retenção' } })
    T.unit = await prisma.unit.create({ data: { tenantId: T.t.id, name: 'Unidade Centro', cnpj: `98${Date.now()}`.slice(0, 14) } })
    T.unit2 = await prisma.unit.create({ data: { tenantId: T.t.id, name: 'Unidade Norte', cnpj: `97${Date.now()}`.slice(0, 14) } })
    T.ig = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'INSTAGRAM', externalAccountId: 'IGR', label: '@loja_ret', status: 'CONECTADO' } })
    T.fb = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'META_PAGE', externalAccountId: 'PGR', label: 'Página Ret', status: 'CONECTADO' } })
    const jpg = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#335577' } }).jpeg().toBuffer()
    T.img = []
    for (let n = 0; n < 2; n++) T.img.push((await prisma.siteAsset.create({ data: { tenantId: T.t.id, kind: 'SOCIAL_UPLOAD', mimeType: 'image/jpeg', fileSize: jpg.length, sha256: `${tag}r${n}`, data: jpg } })).id)
    const car = (unitId: string, plate: string, model: string) => prisma.vehicle.create({ data: { tenantId: T.t.id, unitId, brand: 'HONDA', model, version: `${model} EX`, year: 2022, modelYear: 2022, km: 1000, plate, salePrice: 50000, stockStatus: 'DISPONIVEL', active: true } })
    T.v1 = await car(T.unit.id, `RET${tag.slice(0, 4)}`.toUpperCase(), 'CIVIC')
    T.v2 = await car(T.unit2.id, `NOR${tag.slice(0, 4)}`.toUpperCase(), 'CITY')
    const pub = (vehicleId: string, unitId: string, conn: any, status: string, extra: Record<string, unknown> = {}) => prisma.publication.create({ data: { tenantId: T.t.id, unitId, vehicleId, channel: conn.channel, connectionId: conn.id, connectionKey: conn.id, externalRef: `r${randomUUID().slice(0, 10)}`, status, ...extra } })
    T.pubOk = await pub(T.v1.id, T.unit.id, T.ig, 'PUBLICADO', { remoteId: 'M1', remoteUrl: 'https://www.instagram.com/p/1/', publishedAt: new Date(), overrides: { social: { format: 'REELS' } } })
    T.pubDraft = await pub(T.v2.id, T.unit2.id, T.fb, 'RASCUNHO')
  }, 60_000)

  afterAll(async () => {
    if (!prisma || !T.t) return
    const where = { tenantId: T.t.id }
    await prisma.publicationEvent.deleteMany({ where }); await prisma.publicationJob.deleteMany({ where }); await prisma.publication.deleteMany({ where })
    await prisma.socialPost.deleteMany({ where }); await prisma.siteAsset.deleteMany({ where }); await prisma.publicationConnection.deleteMany({ where })
    await prisma.systemSetting.deleteMany({ where }); await prisma.vehicle.deleteMany({ where }); await prisma.unit.deleteMany({ where })
    await prisma.tenant.delete({ where: { id: T.t.id } }); await prisma.$disconnect()
  }, 60_000)

  it('rascunho de post avulso: continuar editando atualiza o MESMO registro', async () => {
    const actor = { id: null, name: 'Teste' }
    const d = await av.createAvulsa(T.t.id, { format: 'POST', caption: 'primeira versão', media: [{ type: 'image', assetId: T.img[0] }], connectionIds: [T.ig.id], scheduledAt: null, draft: true }, actor)
    const d2 = await av.createAvulsa(T.t.id, { id: d.id, title: 'Entrega', format: 'POST', caption: 'versão final', media: [{ type: 'image', assetId: T.img[0] }, { type: 'image', assetId: T.img[1] }], connectionIds: [T.ig.id, T.fb.id], scheduledAt: null, draft: true }, actor)
    expect(d2.id).toBe(d.id)
    expect(await prisma.socialPost.count({ where: { tenantId: T.t.id } })).toBe(1)
    expect(d2.caption).toBe('versão final'); expect(d2.connectionIds).toEqual([T.ig.id, T.fb.id])
    T.draft = d.id
    // Publicado também (vai virar só histórico).
    T.sent = (await prisma.socialPost.create({ data: { tenantId: T.t.id, format: 'POST', caption: 'x'.repeat(400), media: [{ type: 'image', assetId: T.img[1] }], connectionIds: [T.ig.id], status: 'PUBLICADO', publishedAt: new Date(), results: { [T.ig.id]: { state: 'PUBLICADO', remoteUrl: 'https://www.instagram.com/p/av/' } } } })).id
    await expect(av.createAvulsa(T.t.id, { id: T.sent, format: 'POST', caption: 'y', media: [{ type: 'image', assetId: T.img[0] }], connectionIds: [T.ig.id], scheduledAt: null, draft: true }, actor)).rejects.toThrow(/não existe mais/)
  })

  it('progresso da Nova publicação: salva, lê e descarta', async () => {
    const put = await wizard.PUT(new Request('http://x/api/publications/wizard', { method: 'PUT', body: JSON.stringify({ step: 3, selected: [T.v1.id], targets: [T.ig.id], campaign: 'principal', social: { format: 'REELS' } }) }))
    expect(put.status).toBe(200)
    const got = await (await wizard.GET(new Request('http://x/api/publications/wizard'))).json()
    expect(got.data).toMatchObject({ step: 3, selected: [T.v1.id], targets: [T.ig.id], social: { format: 'REELS' } })
  })

  it('retenção (2 dias depois): rascunhos somem, enviados viram só histórico', async () => {
    const r = await ret.applyRetention(later(), [T.t.id])
    expect(r).toMatchObject({ rascunhos: 1, enviados: 1, anuncios: 1, progresso: 1 })
    expect(await prisma.socialPost.findUnique({ where: { id: T.draft } })).toBeNull()
    const sent = await prisma.socialPost.findUnique({ where: { id: T.sent } })
    expect(sent.media).toEqual([]); expect(sent.caption.length).toBeLessThanOrEqual(141); expect(sent.results[T.ig.id].remoteUrl).toContain('instagram')
    expect(await prisma.publication.findUnique({ where: { id: T.pubDraft.id } })).toBeNull()
    expect(await prisma.publication.findUnique({ where: { id: T.pubOk.id } })).not.toBeNull()
    expect((await (await wizard.GET(new Request('http://x/api/publications/wizard'))).json()).data).toBeNull()
  })

  it('histórico: filtra por placa, canal e unidade; exporta CSV', async () => {
    const get = async (qs: string) => (await history.GET(new Request(`http://x/api/publications/history?${qs}`))).json()
    const all = await get('type=veiculos')
    expect(all.total).toBe(1)
    expect(all.data[0]).toMatchObject({ title: 'HONDA CIVIC EX', plate: T.v1.plate, unit: 'Unidade Centro', channelName: 'Instagram', account: '@loja_ret', format: 'Reels', status: 'PUBLICADO' })
    expect((await get(`type=veiculos&q=${T.v1.plate.slice(0, 5).toLowerCase()}`)).total).toBe(1)
    expect((await get('type=veiculos&q=ZZZ9999')).total).toBe(0)
    expect((await get('type=veiculos&channel=META_PAGE')).total).toBe(0)
    expect((await get(`type=veiculos&unitId=${T.unit2.id}`)).total).toBe(0)
    expect(all.units.map((u: any) => u.name)).toEqual(['Unidade Centro', 'Unidade Norte'])
    const av1 = await get('type=avulsos&channel=INSTAGRAM')
    expect(av1.total).toBe(1); expect(av1.data[0]).toMatchObject({ kind: 'AVULSO', status: 'PUBLICADO', url: 'https://www.instagram.com/p/av/' })
    expect((await get('type=avulsos&channel=META_PAGE')).total).toBe(0)
    const csv = await (await history.GET(new Request('http://x/api/publications/history?type=veiculos&format=csv'))).text()
    expect(csv).toContain('Placa'); expect(csv).toContain(T.v1.plate); expect(csv).toContain('Unidade Centro')
  })
})
