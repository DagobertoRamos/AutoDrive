// =============================================================================
// Testes de integração da Central de Publicações com BANCO REAL (local).
// Rodam só com PUBLICATIONS_DB_TEST=1 e DATABASE_URL apontando para o
// Postgres LOCAL (porta 5433) — nunca contra a Neon/produção.
//   PUBLICATIONS_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/publications/flows.db.test.ts
// Cria duas empresas de teste e apaga tudo o que criou no fim.
// Canais externos usam servidor SIMULADO (não comprova integração real).
// =============================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'crypto'
import { createHttpClient, type FetchLike } from './connectors/http'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.PUBLICATIONS_DB_TEST === '1' && URL_OK
if (process.env.PUBLICATIONS_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any, svc: any, worker: any, webhooks: any, media: any, token: any
const tag = randomUUID().slice(0, 8)
const T: Record<string, any> = {}

// ── Servidor SIMULADO do Chaves na Mão (comportamento documentado) ──────────
type Mode = { post?: 'ok' | 'timeout-after-create' | '429' | 'quota' | '401'; }
const cnm = { vehicles: new Map<string, { published: boolean }>(), posts: 0, mode: {} as Mode }
const cnmFetch: FetchLike = async (url, init) => {
  const u = new URL(url); const method = String(init.method ?? 'GET'); const json = (s: number, b: unknown, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status: s, headers: h })
  if (u.pathname.endsWith('/clients/jwt')) return cnm.mode.post === '401' ? json(401, {}) : json(200, { token: 'JWT', expiration: '1d' })
  if (u.pathname.endsWith('/vehicles/brands')) return json(200, [{ id: 1, name: 'FIAT' }])
  if (u.pathname.endsWith('/brands/1/models')) return json(200, [{ id: 2, name: 'ARGO' }])
  if (u.pathname.endsWith('/models/2/trims')) return json(200, [{ id: 476, name: 'DRIVE 1.0' }])
  const ref = decodeURIComponent(u.pathname.split('/').pop() ?? '')
  if (u.pathname.endsWith('/vehicles') && method === 'POST') {
    const body = JSON.parse(String(init.body)); cnm.posts++
    if (cnm.mode.post === '429') return json(429, {}, { 'retry-after': '10' })
    cnm.vehicles.set(body.reference, { published: cnm.mode.post !== 'quota' })
    if (cnm.mode.post === 'timeout-after-create') {
      // Criou do lado do portal, mas a resposta "se perdeu".
      return new Promise((_r, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    }
    return json(200, {})
  }
  if (u.pathname.includes('/publications/')) {
    const v = cnm.vehicles.get(ref); if (!v) return json(422, { message: `Não existe um anúncio com a referencia: '${ref}'` })
    if (method === 'DELETE') { v.published = false; return json(200, {}) }
    if (method === 'POST') { if (cnm.mode.post === 'quota') return json(422, { message: 'Plano sem espaço' }); v.published = true; return json(200, {}) }
  }
  if (u.pathname.includes('/vehicles/')) {
    const v = cnm.vehicles.get(ref)
    if (method === 'DELETE') { cnm.vehicles.delete(ref); return json(200, {}) }
    if (method === 'PUT') return v ? json(200, {}) : json(422, { message: 'Não existe' })
    return v ? json(200, { reference: ref, publication: v.published ? { highlighted: false } : null }) : json(422, { message: `Não existe um anúncio com a referencia: '${ref}'` })
  }
  return json(404, {})
}
const http = createHttpClient((u, i) => cnmFetch(u, { ...i, signal: i.signal }))
const run = (tenants: string[]) => worker.runWorker({ http, onlyTenantIds: tenants, maxJobs: 50, deadlineMs: 60_000, origin: 'https://app.test' })

async function makeTenant(key: string) {
  const sharp = (await import('sharp')).default
  const t = await prisma.tenant.create({ data: { publicId: `AD-TST${tag}${key}`.slice(0, 20), slug: `pubtest-${tag}-${key}`.toLowerCase(), name: `Loja Teste ${key}`, zipCode: '06454000', city: 'Barueri', state: 'SP', phone: '(11) 99999-0000' } })
  const unit = await prisma.unit.create({ data: { tenantId: t.id, name: `Unidade ${key}`, cnpj: `99${Date.now()}${Math.floor(Math.random() * 1e6)}`.slice(0, 14) } })
  await prisma.systemSetting.create({ data: { key: `t:${t.id}:site:v1`, tenantId: t.id, value: JSON.stringify({ enabled: true, slug: `pubtest-${tag}-${key}`.toLowerCase() }) } })
  await prisma.systemSetting.create({ data: { key: `t:${t.id}:publications:v1`, tenantId: t.id, value: JSON.stringify({ contacts: { whatsapp: '(11) 93471-8276', instagram: '@dagobertoautodriveveiculos', site: 'www.appautodrive.com.br' } }) } })
  const jpg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#8899aa' } }).jpeg().toBuffer()
  const mk = async (n: number) => {
    const asset = await prisma.siteAsset.create({ data: { tenantId: t.id, kind: 'VEHICLE_PHOTO', mimeType: 'image/jpeg', fileSize: jpg.length, width: 1600, height: 1200, sha256: `${tag}${key}${n}`, data: jpg } })
    return `/api/site/assets/${asset.id}`
  }
  const vehicle = async (extra: Record<string, unknown> = {}) => {
    const p1 = await mk(1); const p2 = await mk(2)
    return prisma.vehicle.create({ data: { tenantId: t.id, unitId: unit.id, brand: 'FIAT', model: 'ARGO', version: 'DRIVE 1.0', year: 2021, modelYear: 2022, km: 35000, color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', doors: 4, plate: `TST${Math.floor(1000 + Math.random() * 8999)}`, salePrice: 72900, stockStatus: 'DISPONIVEL', active: true, mainPhotoUrl: p1, photos: { create: [{ url: p1, order: 0, isMain: true }, { url: p2, order: 1 }] }, ...extra } })
  }
  return { t, unit, vehicle }
}

describe.skipIf(!RUN)('Central de Publicações — banco local', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/prisma'))
    svc = await import('./service'); worker = await import('./worker'); webhooks = await import('./webhooks'); media = await import('./media'); token = await import('./media-token')
    T.A = await makeTenant('a'); T.B = await makeTenant('b')
    T.siteA = await svc.ensureSiteConnection(T.A.t.id)
    T.siteB = await svc.ensureSiteConnection(T.B.t.id)
    T.cnmA = await prisma.publicationConnection.create({ data: { tenantId: T.A.t.id, channel: 'CHAVES_NA_MAO', externalAccountId: `cnm-${tag}`, label: 'CNM teste (SIMULADO)', status: 'CONECTADO', secretsEncrypted: svc.sealSecrets({ token: 'TOK' }) } })
    T.actor = { id: null, name: 'Teste automatizado' }
  }, 60_000)

  afterAll(async () => {
    if (!prisma) return
    const ids = [T.A?.t.id, T.B?.t.id].filter(Boolean)
    await prisma.publicationEvent.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.publicationJob.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.publication.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.publicationRevision.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.publicationDraft.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.publicationMapping.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.publicationConnection.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.publicationWebhookEvent.deleteMany({ where: { dedupKey: { startsWith: 'x' }, tenantId: { in: ids } } })
    await prisma.publicationWebhookEvent.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.siteListing.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.vehiclePhoto.deleteMany({ where: { vehicle: { tenantId: { in: ids } } } })
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.siteAsset.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.systemSetting.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.unit.deleteMany({ where: { tenantId: { in: ids } } })
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  }, 60_000)

  it('fluxo completo: fotos tratadas → aprovação (capa/ordem) → publicar no site → confirmado pelo site', async () => {
    const v = await T.A.vehicle()
    const photos = (await prisma.vehiclePhoto.findMany({ where: { vehicleId: v.id }, orderBy: { order: 'asc' } })).map((p: any) => p.url)
    await svc.proposeMedia(T.A.t.id, v.id, photos, 'ESTUDIO', T.actor)
    const ap = await svc.approveMedia(T.A.t.id, v.id, [photos[1], photos[0]], T.actor) // capa trocada
    expect(ap.revisionId).toBeTruthy()
    const res = await svc.createPublications(T.A.t.id, [{ vehicleId: v.id, connectionId: T.siteA.id }], { mode: 'AGORA', actor: T.actor })
    expect(res[0].status).toBe('ENFILEIRADO')
    await run([T.A.t.id])
    const pub = await prisma.publication.findFirst({ where: { vehicleId: v.id, channel: 'SITE' } })
    expect(pub.status).toBe('PUBLICADO')
    expect(pub.confirmedState).toBe('PUBLICADO')
    expect(pub.remoteUrl).toMatch(/\/veiculos\/.+--/)
    const cover = await prisma.vehicle.findUnique({ where: { id: v.id }, select: { mainPhotoUrl: true } })
    expect(cover.mainPhotoUrl).toBe(photos[1]) // capa aprovada aplicada no site
    T.vSite = v; T.pubSite = pub
  }, 60_000)

  it('imagem para o canal: variante JPEG sem ampliar, só da própria loja', async () => {
    const url = (await prisma.vehiclePhoto.findFirst({ where: { vehicleId: T.vSite.id } })).url
    const assetId = url.split('/').pop()
    const sharp = (await import('sharp')).default
    const out = await media.renderVariant({ t: T.A.t.id, a: assetId, w: 1200 })
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg'); expect(meta.width).toBe(1200); expect(meta.height).toBe(900) // proporção preservada
    await expect(media.renderVariant({ t: T.B.t.id, a: assetId, w: 1200 })).rejects.toThrow() // outra loja
    const signed = token.mediaUrlFor('https://app.test', T.A.t.id, url)
    expect(token.verifyMedia(signed.split('/media/')[1].replace('.jpg', ''))).toMatchObject({ t: T.A.t.id, a: assetId })
  }, 30_000)

  it('sucesso parcial entre canais + clique duplo não duplica tarefas', async () => {
    const v = await T.A.vehicle()
    const photos = (await prisma.vehiclePhoto.findMany({ where: { vehicleId: v.id }, orderBy: { order: 'asc' } })).map((p: any) => p.url)
    await svc.approveMedia(T.A.t.id, v.id, photos, T.actor)
    cnm.mode = {}
    const key = randomUUID()
    const targets = [{ vehicleId: v.id, connectionId: T.siteA.id }, { vehicleId: v.id, connectionId: T.cnmA.id }]
    const [a, b] = await Promise.all([
      svc.createPublications(T.A.t.id, targets, { mode: 'AGORA', actor: T.actor, requestKey: key }),
      svc.createPublications(T.A.t.id, targets, { mode: 'AGORA', actor: T.actor, requestKey: key }),
    ])
    expect([...a, ...b].filter((r: any) => r.status === 'ENFILEIRADO')).toHaveLength(2)
    const jobs = await prisma.publicationJob.count({ where: { vehicleId: v.id, op: 'PUBLICAR' } })
    expect(jobs).toBe(2) // 1 por destino, mesmo com 2 cliques simultâneos
    await run([T.A.t.id])
    const pubs = await prisma.publication.findMany({ where: { vehicleId: v.id } })
    const { summarize } = await import('./states')
    expect(summarize(pubs.map((p: any) => p.status))).toBe('2 publicados')
    expect(cnm.posts).toBe(1)
    T.vMulti = v
  }, 60_000)

  it('venda: negociação pausa (site esconde; CNM despublica); finalização retira e arquiva como Vendido; agendamento cancelado', async () => {
    const v = T.vMulti
    // Agendamento pendente de outra campanha não pode sobreviver à venda.
    const sched = new Date(Date.now() + 3_600_000)
    await prisma.vehicle.update({ where: { id: v.id }, data: { stockStatus: 'EM_NEGOCIACAO' } })
    const r1 = await svc.onVehicleStockChanged(T.A.t.id, v.id, T.actor)
    expect(r1.action).toBe('PAUSE')
    await run([T.A.t.id])
    let pubs = await prisma.publication.findMany({ where: { vehicleId: v.id }, orderBy: { channel: 'asc' } })
    expect(pubs.map((p: any) => [p.channel, p.status])).toEqual([['CHAVES_NA_MAO', 'PAUSADO'], ['SITE', 'PAUSADO']])
    const ref = pubs.find((p: any) => p.channel === 'CHAVES_NA_MAO').externalRef
    expect(cnm.vehicles.get(ref)?.published).toBe(false)

    // Venda cancelada → reativa.
    await prisma.vehicle.update({ where: { id: v.id }, data: { stockStatus: 'DISPONIVEL' } })
    expect((await svc.onVehicleStockChanged(T.A.t.id, v.id, T.actor)).action).toBe('RESUME')
    await run([T.A.t.id])
    pubs = await prisma.publication.findMany({ where: { vehicleId: v.id } })
    expect(pubs.every((p: any) => p.status === 'PUBLICADO')).toBe(true)

    // Agenda algo e depois finaliza a venda.
    const s = await svc.createPublications(T.A.t.id, [{ vehicleId: T.vSite.id, connectionId: T.cnmA.id }], { mode: 'AGENDAR', scheduledAt: sched, actor: T.actor })
    expect(s[0].status).toBe('AGENDADO')
    await prisma.vehicle.update({ where: { id: v.id }, data: { stockStatus: 'EM_NEGOCIACAO' } }); await svc.onVehicleStockChanged(T.A.t.id, v.id, T.actor)
    await prisma.vehicle.update({ where: { id: v.id }, data: { stockStatus: 'VENDIDO' } })
    expect((await svc.onVehicleStockChanged(T.A.t.id, v.id, T.actor)).action).toBe('REMOVE')
    await run([T.A.t.id])
    pubs = await prisma.publication.findMany({ where: { vehicleId: v.id } })
    expect(pubs.every((p: any) => p.status === 'REMOVIDO' && p.archiveReason === 'VENDIDO' && p.archivedAt)).toBe(true)
    expect(cnm.vehicles.has(ref)).toBe(false)

    // Vende o carro do agendamento → agendamento cancelado, nada publicado.
    await prisma.vehicle.update({ where: { id: T.vSite.id }, data: { stockStatus: 'VENDIDO' } }); await svc.onVehicleStockChanged(T.A.t.id, T.vSite.id, T.actor)
    const scheduled = await prisma.publication.findFirst({ where: { vehicleId: T.vSite.id, channel: 'CHAVES_NA_MAO' } })
    expect(scheduled.status).toBe('REMOVIDO'); expect(scheduled.scheduledAt).toBeNull()
    expect(await prisma.publicationJob.count({ where: { publicationId: scheduled.id, status: 'PENDENTE' } })).toBe(0)
  }, 90_000)

  it('tarefa antiga não republica veículo vendido (gancho perdido)', async () => {
    const v = await T.A.vehicle()
    const photos = (await prisma.vehiclePhoto.findMany({ where: { vehicleId: v.id }, orderBy: { order: 'asc' } })).map((p: any) => p.url)
    await svc.approveMedia(T.A.t.id, v.id, photos, T.actor)
    await svc.createPublications(T.A.t.id, [{ vehicleId: v.id, connectionId: T.cnmA.id }], { mode: 'AGORA', actor: T.actor })
    await prisma.vehicle.update({ where: { id: v.id }, data: { stockStatus: 'VENDIDO' } }) // sem chamar o gancho
    const before = cnm.posts
    await run([T.A.t.id])
    expect(cnm.posts).toBe(before)
    const job = await prisma.publicationJob.findFirst({ where: { vehicleId: v.id, op: 'PUBLICAR' } })
    expect(job.status).toBe('BLOQUEADO')
    const pub = await prisma.publication.findFirst({ where: { vehicleId: v.id } })
    expect(pub.archiveReason).toBe('VENDIDO')
  }, 60_000)

  it('timeout depois da criação: reconsulta e NÃO cria de novo', async () => {
    const v = await T.A.vehicle()
    await svc.approveMedia(T.A.t.id, v.id, (await prisma.vehiclePhoto.findMany({ where: { vehicleId: v.id } })).map((p: any) => p.url), T.actor)
    await svc.createPublications(T.A.t.id, [{ vehicleId: v.id, connectionId: T.cnmA.id }], { mode: 'AGORA', actor: T.actor })
    cnm.mode = { post: 'timeout-after-create' }
    const httpFast = createHttpClient((u, i) => cnmFetch(u, i))
    const origRequest = httpFast.request
    httpFast.request = (r) => origRequest({ ...r, timeoutMs: r.creates ? 50 : r.timeoutMs })
    const before = cnm.posts
    await worker.runWorker({ http: httpFast, onlyTenantIds: [T.A.t.id], maxJobs: 5, origin: 'https://app.test' })
    let job = await prisma.publicationJob.findFirst({ where: { vehicleId: v.id, op: 'PUBLICAR' } })
    expect(job.status).toBe('PENDENTE'); expect(job.outcomeUnknown).toBe(true)
    expect(cnm.posts).toBe(before + 1)
    cnm.mode = {}
    await prisma.publicationJob.update({ where: { id: job.id }, data: { runAt: new Date() } })
    await run([T.A.t.id])
    job = await prisma.publicationJob.findUnique({ where: { id: job.id } })
    expect(job.status).toBe('CONCLUIDO')
    expect(cnm.posts).toBe(before + 1) // sem segundo POST
    const pub = await prisma.publication.findFirst({ where: { vehicleId: v.id } })
    expect(pub.status).toBe('PUBLICADO')
    expect(await prisma.publicationEvent.count({ where: { publicationId: pub.id, type: 'RECONSULTA' } })).toBe(1)
  }, 60_000)

  it('429: conta aguarda o tempo pedido e a tarefa volta à fila; cota esgotada não repete', async () => {
    const v = await T.A.vehicle()
    await svc.approveMedia(T.A.t.id, v.id, (await prisma.vehiclePhoto.findMany({ where: { vehicleId: v.id } })).map((p: any) => p.url), T.actor)
    await svc.createPublications(T.A.t.id, [{ vehicleId: v.id, connectionId: T.cnmA.id }], { mode: 'AGORA', actor: T.actor })
    cnm.mode = { post: '429' }
    await run([T.A.t.id])
    const conn = await prisma.publicationConnection.findUnique({ where: { id: T.cnmA.id } })
    expect(conn.throttledUntil.getTime()).toBeGreaterThan(Date.now())
    const job = await prisma.publicationJob.findFirst({ where: { vehicleId: v.id, op: 'PUBLICAR' } })
    expect(job.status).toBe('PENDENTE'); expect(job.lastErrorKind).toBe('RATE_LIMIT')
    await prisma.publicationConnection.update({ where: { id: T.cnmA.id }, data: { throttledUntil: null } })
    await prisma.publicationJob.update({ where: { id: job.id }, data: { runAt: new Date() } })
    cnm.mode = { post: 'quota' }
    await run([T.A.t.id])
    const pub = await prisma.publication.findFirst({ where: { vehicleId: v.id } })
    expect(pub.status).toBe('FALHA'); expect(pub.lastErrorCode).not.toBeNull()
    expect(pub.lastErrorHint).toMatch(/plano|pacote/i)
    expect((await prisma.publicationJob.findUnique({ where: { id: job.id } })).status).toBe('FALHOU')
    cnm.mode = {}
  }, 60_000)

  it('token revogado: conta "Reconectar", envios travados; reconectar libera', async () => {
    const v = await T.A.vehicle()
    await svc.approveMedia(T.A.t.id, v.id, (await prisma.vehiclePhoto.findMany({ where: { vehicleId: v.id } })).map((p: any) => p.url), T.actor)
    await svc.createPublications(T.A.t.id, [{ vehicleId: v.id, connectionId: T.cnmA.id }], { mode: 'AGORA', actor: T.actor })
    cnm.mode = { post: '401' }
    await prisma.publicationConnection.update({ where: { id: T.cnmA.id }, data: { secretsEncrypted: svc.sealSecrets({ token: 'TOK' }) } }) // sem JWT em cache
    await run([T.A.t.id])
    expect((await prisma.publicationConnection.findUnique({ where: { id: T.cnmA.id } })).status).toBe('RECONECTAR')
    const job = await prisma.publicationJob.findFirst({ where: { vehicleId: v.id, op: 'PUBLICAR' } })
    expect(job.status).toBe('BLOQUEADO')
    cnm.mode = {}
    await prisma.publicationConnection.update({ where: { id: T.cnmA.id }, data: { status: 'CONECTADO' } })
    await svc.releaseBlockedJobs(T.A.t.id, T.cnmA.id)
    await run([T.A.t.id])
    expect((await prisma.publication.findFirst({ where: { vehicleId: v.id } })).status).toBe('PUBLICADO')
  }, 60_000)

  it('recuperação após reinício: tarefa presa volta à fila como "resultado desconhecido"', async () => {
    const v = await T.A.vehicle()
    await svc.approveMedia(T.A.t.id, v.id, (await prisma.vehiclePhoto.findMany({ where: { vehicleId: v.id } })).map((p: any) => p.url), T.actor)
    await svc.createPublications(T.A.t.id, [{ vehicleId: v.id, connectionId: T.cnmA.id }], { mode: 'AGORA', actor: T.actor })
    const job = await prisma.publicationJob.findFirst({ where: { vehicleId: v.id } })
    await prisma.publicationJob.update({ where: { id: job.id }, data: { status: 'EXECUTANDO', lockedBy: 'morto', lockedUntil: new Date(Date.now() - 1000) } })
    expect(await worker.recoverStaleJobs([T.A.t.id])).toBe(1)
    const back = await prisma.publicationJob.findUnique({ where: { id: job.id } })
    expect(back.status).toBe('PENDENTE'); expect(back.outcomeUnknown).toBe(true)
    await run([T.A.t.id])
    expect((await prisma.publication.findFirst({ where: { vehicleId: v.id } })).status).toBe('PUBLICADO')
  }, 60_000)

  it('dois workers ao mesmo tempo nunca executam a mesma publicação', async () => {
    const vs = await Promise.all([T.A.vehicle(), T.A.vehicle(), T.A.vehicle()])
    for (const v of vs) await svc.approveMedia(T.A.t.id, v.id, (await prisma.vehiclePhoto.findMany({ where: { vehicleId: v.id } })).map((p: any) => p.url), T.actor)
    await svc.createPublications(T.A.t.id, vs.flatMap((v: any) => [{ vehicleId: v.id, connectionId: T.siteA.id }, { vehicleId: v.id, connectionId: T.cnmA.id }]), { mode: 'AGORA', actor: T.actor })
    const [w1, w2] = await Promise.all([run([T.A.t.id]), run([T.A.t.id])])
    const ids = [...w1.processed, ...w2.processed].map((p: any) => p.jobId)
    expect(new Set(ids).size).toBe(ids.length) // nenhuma tarefa processada duas vezes
    const pubs = await prisma.publication.findMany({ where: { vehicleId: { in: vs.map((v: any) => v.id) } } })
    expect(pubs.every((p: any) => p.status === 'PUBLICADO')).toBe(true)
  }, 90_000)

  it('webhook: repetido e fora de ordem são ignorados; só afeta a loja dona da conta', async () => {
    process.env.ML_CLIENT_ID = 'APP-TESTE'; process.env.ML_CLIENT_SECRET = 'SEGREDO-TESTE'
    const conn = await prisma.publicationConnection.create({ data: { tenantId: T.A.t.id, channel: 'MERCADO_LIVRE', externalAccountId: `ml${tag}`, label: 'ML teste', status: 'CONECTADO' } })
    const pub = await prisma.publication.create({ data: { tenantId: T.A.t.id, vehicleId: T.vMulti.id, channel: 'MERCADO_LIVRE', connectionId: conn.id, connectionKey: conn.id, externalRef: `ml${tag}`, status: 'PUBLICADO', confirmedState: 'PUBLICADO', remoteId: 'MLB999', desiredState: 'PUBLICADO' } })
    const n = { resource: '/items/MLB999', user_id: `ml${tag}`, topic: 'items', application_id: 'APP-TESTE', sent: '2026-09-25T12:00:00.000Z' }
    expect((await webhooks.handleMercadoLivre(n)).status).toBe('PROCESSADO')
    expect((await webhooks.handleMercadoLivre(n)).status).toBe('IGNORADO') // repetido
    expect((await webhooks.handleMercadoLivre({ ...n, sent: '2026-09-25T11:00:00.000Z' })).reason).toMatch(/antigo/) // fora de ordem
    expect((await webhooks.handleMercadoLivre({ ...n, application_id: 'OUTRO', sent: '2026-09-25T13:00:00.000Z' })).status).toBe('IGNORADO')
    expect(await prisma.publicationJob.count({ where: { publicationId: pub.id, op: 'VERIFICAR' } })).toBe(1)
  }, 30_000)

  it('isolamento entre empresas: B não vê nem altera publicações/veículos de A', async () => {
    const pubA = T.pubSite
    const r = await svc.applyIntent(T.B.t.id, pubA.id, 'RETIRAR', T.actor)
    expect(r.ok).toBe(false)
    expect(await svc.loadVehicle(T.B.t.id, pubA.vehicleId)).toBeNull()
    const res = await svc.createPublications(T.B.t.id, [{ vehicleId: pubA.vehicleId, connectionId: T.siteB.id }], { mode: 'AGORA', actor: T.actor })
    expect(res[0].status).toBe('ERRO')
    const res2 = await svc.createPublications(T.B.t.id, [{ vehicleId: T.vSite.id, connectionId: T.cnmA.id }], { mode: 'AGORA', actor: T.actor })
    expect(res2[0].status).toBe('ERRO') // conta de outra loja
    const vB = await T.B.vehicle()
    await svc.approveMedia(T.B.t.id, vB.id, (await prisma.vehiclePhoto.findMany({ where: { vehicleId: vB.id } })).map((p: any) => p.url), T.actor)
    await svc.createPublications(T.B.t.id, [{ vehicleId: vB.id, connectionId: T.siteB.id }], { mode: 'AGORA', actor: T.actor })
    const w = await run([T.B.t.id])
    expect(w.processed.every((p: any) => p.channel === 'SITE')).toBe(true)
    expect(await prisma.publicationJob.count({ where: { tenantId: T.B.t.id, publication: { tenantId: T.A.t.id } } })).toBe(0)
  }, 60_000)

  it('desconectar: cancela pendentes e informa anúncios que continuam no portal', async () => {
    const v = await T.A.vehicle()
    await svc.approveMedia(T.A.t.id, v.id, (await prisma.vehiclePhoto.findMany({ where: { vehicleId: v.id } })).map((p: any) => p.url), T.actor)
    await svc.createPublications(T.A.t.id, [{ vehicleId: v.id, connectionId: T.cnmA.id }], { mode: 'AGENDAR', scheduledAt: new Date(Date.now() + 3_600_000), actor: T.actor })
    const r = await svc.disconnectConnection(T.A.t.id, T.cnmA.id, T.actor)
    expect(r.ok).toBe(true); expect(r.cancelledJobs).toBeGreaterThanOrEqual(1); expect(r.liveAds).toBeGreaterThanOrEqual(1)
    const live = await prisma.publication.findFirst({ where: { connectionId: T.cnmA.id, status: 'ACAO_MANUAL' } })
    expect(live.manualAction).toMatch(/continua/)
    expect((await prisma.publicationConnection.findUnique({ where: { id: T.cnmA.id } })).secretsEncrypted).toBeNull()
  }, 30_000)
})
