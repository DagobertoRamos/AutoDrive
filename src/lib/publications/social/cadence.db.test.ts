// =============================================================================
// Agenda inteligente + Post avulso em lote — integração com BANCO REAL (local).
//   PUBLICATIONS_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/publications/social/cadence.db.test.ts
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
  pubAuth: async () => ({ tenantId: T.t.id, user: { id: null, name: 'Teste' }, actor: { id: null, name: 'Teste', role: 'ADMIN' } }),
  audit: async () => undefined,
}))

describe.skipIf(!RUN)('Agenda inteligente — banco local', () => {
  let prisma: any, batch: any, slots: any
  const tag = randomUUID().slice(0, 8)
  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/prisma'))
    batch = await import('@/app/api/publications/avulsa/batch/route')
    slots = await import('@/app/api/publications/social/slots/route')
    const sharp = (await import('sharp')).default
    T.t = await prisma.tenant.create({ data: { publicId: `AD-CAD${tag}`.slice(0, 20), slug: `cadtest-${tag}`, name: 'Loja Teste Agenda' } })
    T.ig = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'INSTAGRAM', externalAccountId: 'IGC', label: '@loja', status: 'CONECTADO' } })
    T.fb = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'META_PAGE', externalAccountId: 'PGC', label: 'Loja', status: 'CONECTADO' } })
    const jpg = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#335577' } }).jpeg().toBuffer()
    T.img = (await prisma.siteAsset.create({ data: { tenantId: T.t.id, kind: 'SOCIAL_UPLOAD', mimeType: 'image/jpeg', fileSize: jpg.length, sha256: `${tag}c`, data: jpg } })).id
    // Já agendado: um post avulso amanhã às 10:00 (UTC-3 → 13:00 UTC).
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    T.startLocal = `${tomorrow}T09:30`
    T.busy = await prisma.socialPost.create({ data: { tenantId: T.t.id, format: 'POST', media: [{ type: 'image', assetId: T.img }], connectionIds: [T.ig.id, T.fb.id], status: 'AGENDADO', scheduledAt: new Date(`${tomorrow}T13:00:00Z`) } })
  }, 60_000)
  afterAll(async () => {
    if (!prisma || !T.t) return
    const where = { tenantId: T.t.id }
    await prisma.socialPost.deleteMany({ where }); await prisma.siteAsset.deleteMany({ where }); await prisma.publicationConnection.deleteMany({ where })
    await prisma.tenant.delete({ where: { id: T.t.id } }); await prisma.$disconnect()
  }, 60_000)

  it('lote de posts variados: todos agendados, entre 07:00 e 20:00, nenhum no mesmo horário (nem do já agendado)', async () => {
    const media = [{ type: 'image', assetId: T.img }]
    const items = [
      { title: 'Entrega 1', format: 'POST', caption: 'Mais um cliente feliz', media },
      { title: 'Bastidores', format: 'STORY', caption: '', media },
      { title: 'Promo', format: 'POST', caption: 'Promoção do mês', media },
      { title: 'Vídeo link', format: 'LINK', caption: 'Veja o vídeo', media: [{ type: 'link', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }] },
    ]
    const r = await (await batch.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ items, connectionIds: [T.ig.id, T.fb.id], startLocal: T.startLocal }) }))).json()
    expect(r.results.every((x: any) => x.ok)).toBe(true)
    const posts = await prisma.socialPost.findMany({ where: { tenantId: T.t.id, status: 'AGENDADO' }, orderBy: { scheduledAt: 'asc' } })
    expect(posts).toHaveLength(5)
    const times = posts.map((p: any) => p.scheduledAt.getTime())
    expect(new Set(times).size).toBe(times.length)
    const sorted = [...times].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(15 * 60_000)
    for (const l of r.results.map((x: any) => x.local)) { const h = Number(l.slice(11, 13)); expect(h).toBeGreaterThanOrEqual(7); expect(h).toBeLessThanOrEqual(20) }
    // Link só na Página do Facebook.
    const link = posts.find((p: any) => p.format === 'LINK')
    expect(link.connectionIds).toEqual([T.fb.id])
    // Nunca mais de 2 posts de feed por dia na mesma conta.
    const feedPerDay = new Map<string, number>()
    for (const p of posts.filter((x: any) => x.format !== 'STORY')) for (const c of p.connectionIds) { const k = `${c}|${p.scheduledAt.toISOString().slice(0, 10)}`; feedPerDay.set(k, (feedPerDay.get(k) ?? 0) + 1) }
    expect(Math.max(...feedPerDay.values())).toBeLessThanOrEqual(2)
  })

  it('API da agenda devolve horários diferentes para vários carros × contas', async () => {
    const reqs = ['v1', 'v2'].flatMap((v) => [T.ig.id, T.fb.id].flatMap((c) => ['POST', 'REELS'].map((f) => ({ key: `${v}|${c}|${f}`, connectionId: c, format: f }))))
    const j = await (await slots.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ requests: reqs, startLocal: T.startLocal }) }))).json()
    const vals = Object.values(j.slots) as string[]
    expect(vals).toHaveLength(8)
    expect(new Set(vals).size).toBe(8)
    expect(j.notice).toMatch(/bloquear/)
  })

  it('Post avulso "Automático": um horário livre que serve para as duas contas ao mesmo tempo', async () => {
    const j = await (await slots.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ requests: [{ key: 'post', connectionId: T.ig.id, also: [T.fb.id], format: 'POST' }], startLocal: T.startLocal }) }))).json()
    const h = Number(j.slots.post.slice(11, 13))
    expect(h).toBeGreaterThanOrEqual(7); expect(h).toBeLessThanOrEqual(20)
    const busy = await prisma.socialPost.findMany({ where: { tenantId: T.t.id, status: 'AGENDADO' }, select: { scheduledAt: true } })
    const at = new Date(`${j.slots.post}:00-03:00`).getTime()
    for (const b of busy) expect(Math.abs(b.scheduledAt.getTime() - at)).toBeGreaterThanOrEqual(15 * 60_000)
  })
})
