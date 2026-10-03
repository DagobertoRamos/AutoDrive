// =============================================================================
// Painel (kanban) — integração com BANCO REAL (local).
//   PUBLICATIONS_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/publications/board.db.test.ts
// Monta posts em todas as situações e confere coluna, agrupamento por
// veículo × formato, indicadores e as ações Excluir/Tentar de novo.
// Com BOARD_OUT=<arquivo> grava a resposta (para conferir a tela).
// =============================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'node:fs'
import { columnOf, columnOfPost, successRate } from './board-core'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.PUBLICATIONS_DB_TEST === '1' && URL_OK
if (process.env.PUBLICATIONS_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

/* eslint-disable @typescript-eslint/no-explicit-any */
const T: Record<string, any> = {}
vi.mock('@/lib/publications/api', async (orig) => ({
  ...(await orig<any>()),
  pubAuth: async () => ({ tenantId: T.t.id, user: { id: T.userId, name: 'Teste', role: 'ADMIN' }, actor: { id: T.userId, name: 'Teste', role: 'ADMIN' } }),
  permissions: async () => ({ prepare: true, approve: true, publish: true, connections: true }),
  kickWorker: () => undefined,
}))

describe('Painel — regras das colunas', () => {
  it('o canal que mais pede ação decide a coluna', () => {
    expect(columnOf(['PUBLICADO', 'REJEITADO'])).toBe('atencao')
    expect(columnOf(['PUBLICADO', 'EM_ANALISE'])).toBe('publicando')
    expect(columnOf(['AGENDADO', 'AGENDADO'])).toBe('agendados')
    expect(columnOf(['RASCUNHO', 'PRONTO'])).toBe('rascunhos')
    expect(columnOf(['PUBLICADO'])).toBe('publicados')
    expect(columnOf(['PAUSADO'])).toBeNull()
    expect(columnOf(['ACAO_MANUAL', 'PUBLICADO'])).toBe('atencao')
  })
  it('post avulso e taxa de sucesso', () => {
    expect(columnOfPost('PARCIAL')).toBe('atencao'); expect(columnOfPost('CANCELADO')).toBeNull(); expect(columnOfPost('ENVIANDO')).toBe('publicando')
    expect(successRate(9, 1)).toBe(90); expect(successRate(0, 0)).toBeNull()
  })
})

describe.skipIf(!RUN)('Painel — banco local', () => {
  let prisma: any, board: any, actions: any, avulsaDel: any
  const tag = randomUUID().slice(0, 8)
  beforeAll(async () => {
    ;({ prisma } = await import('@/lib/prisma'))
    board = await import('@/app/api/publications/board/route')
    actions = await import('@/app/api/publications/actions/route')
    avulsaDel = await import('@/app/api/publications/avulsa/[id]/route')
    T.userId = `user-${tag}`
    T.t = await prisma.tenant.create({ data: { publicId: `AD-BRD${tag}`.slice(0, 20), slug: `brdtest-${tag}`, name: 'Loja Teste Painel' } })
    T.unit = await prisma.unit.create({ data: { tenantId: T.t.id, name: 'Loja Matriz', cnpj: `96${Date.now()}`.slice(0, 14) } })
    T.ig = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'INSTAGRAM', externalAccountId: 'IGB', label: '@loja_painel', status: 'CONECTADO' } })
    T.fb = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'META_PAGE', externalAccountId: 'PGB', label: 'Loja Painel', status: 'CONECTADO' } })
    T.site = await prisma.publicationConnection.create({ data: { tenantId: T.t.id, channel: 'SITE', externalAccountId: 'default', label: 'Site', status: 'CONECTADO' } })
    const car = (model: string, plate: string) => prisma.vehicle.create({ data: { tenantId: T.t.id, unitId: T.unit.id, brand: 'HONDA', model, version: `${model} 160`, year: 2024, modelYear: 2024, km: 500, plate, salePrice: 26890, stockStatus: 'DISPONIVEL', active: true, mainPhotoUrl: 'https://example.test/moto.jpg' } })
    T.adv = await car('ADV', `ADV${tag.slice(0, 4)}`.toUpperCase())
    T.biz = await car('BIZ 125', `BIZ${tag.slice(0, 4)}`.toUpperCase())
    const pub = (vehicleId: string, conn: any, campaignKey: string, status: string, extra: Record<string, unknown> = {}) => prisma.publication.create({ data: { tenantId: T.t.id, unitId: T.unit.id, vehicleId, channel: conn.channel, connectionId: conn.id, connectionKey: conn.id, campaignKey, externalRef: `b${randomUUID().slice(0, 10)}`, status, ...extra } })
    const soon = new Date(Date.now() + 3 * 3600_000)
    T.story = [await pub(T.adv.id, T.ig, 'story-2026-09-28', 'AGENDADO', { scheduledAt: soon, overrides: { social: { format: 'STORY', template: 'OFERTA' } } }), await pub(T.adv.id, T.fb, 'story-2026-09-28', 'AGENDADO', { scheduledAt: soon, overrides: { social: { format: 'STORY', template: 'OFERTA' } } })]
    T.reelsBad = [await pub(T.biz.id, T.ig, 'reels-2026-09-27', 'PUBLICADO', { remoteId: 'M9', publishedAt: new Date(), overrides: { social: { format: 'REELS', template: 'OFERTA' } } }), await pub(T.biz.id, T.fb, 'reels-2026-09-27', 'REJEITADO', { lastError: 'Reels (envio do vídeo): HTTP 422', overrides: { social: { format: 'REELS', template: 'OFERTA' } } })]
    T.sitePub = await pub(T.biz.id, T.site, 'principal', 'PUBLICADO', { remoteId: 'S1', publishedAt: new Date(), remoteUrl: 'https://loja.test/biz' })
    T.draft = await pub(T.biz.id, T.ig, 'post', 'RASCUNHO', { overrides: { social: { format: 'POST', template: 'CHEGOU' } } })
    T.working = await pub(T.adv.id, T.ig, 'reels-2026-09-28', 'EM_ANALISE', { pendingToken: 'C1', overrides: { social: { format: 'REELS', template: 'OFERTA' } } })
    await pub(T.adv.id, T.site, 'principal', 'PAUSADO', { remoteId: 'S2' })
    T.post = await prisma.socialPost.create({ data: { tenantId: T.t.id, title: 'Entrega da semana', format: 'POST', caption: 'Mais um cliente feliz', media: [], connectionIds: [T.ig.id, T.fb.id], status: 'RASCUNHO' } })
    T.postFail = await prisma.socialPost.create({ data: { tenantId: T.t.id, title: 'Promo sábado', format: 'STORY', media: [], connectionIds: [T.ig.id], status: 'FALHA', results: { [T.ig.id]: { state: 'FALHA', error: 'Instagram recusou a mídia' } } } })
    await prisma.systemSetting.create({ data: { key: `u:${T.userId}:t:${T.t.id}:pubwizard:v1`, tenantId: T.t.id, value: JSON.stringify({ step: 3, selected: [T.adv.id] }) } })
  }, 60_000)

  afterAll(async () => {
    if (!prisma || !T.t) return
    const where = { tenantId: T.t.id }
    await prisma.publicationEvent.deleteMany({ where }); await prisma.publicationJob.deleteMany({ where }); await prisma.publication.deleteMany({ where })
    await prisma.socialPost.deleteMany({ where }); await prisma.publicationConnection.deleteMany({ where }); await prisma.systemSetting.deleteMany({ where })
    await prisma.vehicle.deleteMany({ where }); await prisma.unit.deleteMany({ where }); await prisma.auditLog?.deleteMany?.({ where }).catch(() => undefined)
    await prisma.tenant.delete({ where: { id: T.t.id } }).catch(() => undefined); await prisma.$disconnect()
  }, 60_000)

  const get = async () => (await board.GET(new Request('http://x/api/publications/board'))).json()

  it('cada post na sua coluna, agrupado por veículo × formato, com indicadores', async () => {
    const j = await get()
    if (process.env.BOARD_OUT) writeFileSync(process.env.BOARD_OUT, JSON.stringify(j))
    const titles = (col: string) => j.columns[col].map((c: any) => `${c.title}|${c.format}`)
    expect(titles('agendados')).toEqual(['HONDA ADV 160|Story'])
    expect(j.columns.agendados[0].channels).toHaveLength(2)
    expect(titles('atencao')).toEqual(expect.arrayContaining(['HONDA BIZ 125 160|Reels', 'Promo sábado|Story (foto ou vídeo)']))
    expect(titles('publicando')).toEqual(['HONDA ADV 160|Reels'])
    expect(titles('publicados')).toEqual(['HONDA BIZ 125 160|Anúncio'])
    expect(titles('rascunhos')).toEqual(expect.arrayContaining(['HONDA BIZ 125 160|Post', 'Entrega da semana|Post / Carrossel (fotos)', 'Nova publicação em andamento|Continuar de onde parou']))
    expect(j.kpis).toMatchObject({ publicados7: 2, agendados7: 2, publicando: 1, atencao: 2, pausados: 1, conectados: 3 })
    expect(j.kpis.proximo.title).toBe('HONDA ADV 160')
  })

  it('Retomar remonta o rascunho exatamente (veículo, contas, formato, modelo, música e legenda) na Revisão', async () => {
    await prisma.publication.update({ where: { id: T.draft.id }, data: { overrides: { social: { format: 'POST', template: 'CHEGOU', music: { mode: 'AUTO', mood: 'ROCK' } }, caption: 'Legenda que eu escrevi' } } })
    const resume = await import('@/app/api/publications/resume/route')
    const j = await (await resume.GET(new Request(`http://x/api/publications/resume?ids=${T.draft.id}`))).json()
    expect(j.data).toMatchObject({ step: 5, selected: [T.biz.id], targets: [T.ig.id], social: { formats: ['POST'], template: 'CHEGOU', music: { mode: 'AUTO', mood: 'ROCK' }, captions: { [`${T.biz.id}:POST`]: 'Legenda que eu escrevi' } } })
  })

  it('Tentar de novo tira o post da atenção; Excluir apaga rascunho e retira o que está no ar', async () => {
    const post = (json: unknown) => actions.POST(new Request('http://x/api/publications/actions', { method: 'POST', body: JSON.stringify(json) }))
    const r1 = await (await post({ ids: [T.reelsBad[1].id], action: 'REENVIAR' })).json()
    expect(r1.results[0].ok).toBe(true)
    expect((await get()).columns.atencao.map((c: any) => c.title)).not.toContain('HONDA BIZ 125 160')
    const r2 = await (await post({ ids: [T.draft.id, T.sitePub.id], action: 'EXCLUIR' })).json()
    expect(r2.results.map((r: any) => r.message)).toEqual(['Excluído.', expect.stringContaining('retirando')])
    expect(await prisma.publication.findUnique({ where: { id: T.draft.id } })).toBeNull()
    expect((await prisma.publication.findUnique({ where: { id: T.sitePub.id } })).desiredState).toBe('REMOVIDO')
    // 2º Excluir com a remoção sem concluir (ficava em "Publicando" para sempre): apaga o registro.
    const r3 = await (await post({ ids: [T.sitePub.id], action: 'EXCLUIR' })).json()
    expect(r3.results[0]).toMatchObject({ ok: true, message: expect.stringContaining('Registro apagado') })
    expect(await prisma.publication.findUnique({ where: { id: T.sitePub.id } })).toBeNull()
    // Story no ar: não há o que retirar (some em 24 h) — apaga direto.
    const story = await prisma.publication.create({ data: { tenantId: T.t.id, unitId: T.unit.id, vehicleId: T.adv.id, channel: T.ig.channel, connectionId: T.ig.id, connectionKey: T.ig.id, campaignKey: 'story-no-ar', externalRef: `s${randomUUID().slice(0, 10)}`, status: 'EM_ANALISE', remoteId: 'ST1', publishedAt: new Date(), overrides: { social: { format: 'STORY', template: 'OFERTA' } } } })
    const r4 = await (await post({ ids: [story.id], action: 'EXCLUIR' })).json()
    expect(r4.results[0].message).toContain('Story some sozinho')
    expect(await prisma.publication.findUnique({ where: { id: story.id } })).toBeNull()
    // Post avulso: rascunho vira cancelado (sai do quadro); com erro é apagado.
    const del = (id: string) => avulsaDel.DELETE(new Request(`http://x/api/publications/avulsa/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
    expect((await del(T.post.id)).status).toBe(200)
    expect((await del(T.postFail.id)).status).toBe(200)
    expect(await prisma.socialPost.findUnique({ where: { id: T.postFail.id } })).toBeNull()
    const j = await get()
    expect(j.columns.rascunhos.map((c: any) => c.title)).toEqual(['Nova publicação em andamento'])
  })
})
