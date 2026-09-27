// =============================================================================
// TESTES DE CONTRATO — SIMULAÇÃO do estúdio social na Meta (Post com arte,
// Carrossel, Story e Reels no Instagram e na Página). As respostas são
// SIMULADAS a partir da documentação oficial (Content Publishing e Pages API:
// photo_stories, video_reels). Provam o formato das chamadas e o tratamento
// das respostas; NÃO comprovam publicação real.
// =============================================================================

import { describe, expect, it } from 'vitest'
import { buildPayload, type ListingPayload } from '../content-core'
import { exactMatch } from '../mapping-core'
import { createHttpClient, type FetchLike } from './http'
import { instagramConnector, metaPageConnector } from './meta'
import type { ConnectorContext } from './types'
import type { SocialSpec } from '../social/formats'

type Call = { url: string; method: string; body: string; headers: Record<string, string> }
type Route = (c: Call) => { status: number; body: unknown } | null

function simulated(routes: Route[]) {
  const calls: Call[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const body = init.body instanceof URLSearchParams ? init.body.toString() : String(init.body ?? '')
    const c: Call = { url, method: String(init.method ?? 'GET'), body, headers: (init.headers ?? {}) as Record<string, string> }
    calls.push(c)
    for (const r of routes) { const hit = r(c); if (hit) return new Response(JSON.stringify(hit.body), { status: hit.status }) }
    return new Response('{"error":{"message":"rota não simulada"}}', { status: 599 })
  }
  return { calls, http: createHttpClient(fetchImpl) }
}

const reels: string[] = []
function ctxWith(http: ReturnType<typeof simulated>['http'], account: string): ConnectorContext {
  return {
    connection: { id: 'conn', tenantId: 't1', externalAccountId: account, environment: 'PRODUCAO', config: {} },
    secrets: { page_access_token: 'PT' }, http,
    mapping: { async resolve(_k, _s, label, lookup) { return exactMatch(label, await lookup()) } },
    mediaUrl: (u) => `https://app.test/m/${encodeURIComponent(u)}.jpg`,
    social: {
      artUrl: (u, p, f, k) => `https://app.test/art/${f}-${k}-${p.price}-${encodeURIComponent(u)}.jpg`,
      async reelUrl(p, k) { reels.push(`${p.reference}:${k}`); return 'https://app.test/reel.mp4' },
    },
    async saveSecrets() {},
    now: () => new Date('2026-09-27T12:00:00Z'),
  }
}

const payload = (social: SocialSpec | null): ListingPayload => buildPayload({
  reference: 'adrefsocial000001', storeName: 'AutoDrive Veiculos',
  vehicle: { id: 'v1', brand: 'Volkswagen', model: 'Tiguan', version: '2.0 TSI', year: 2011, modelYear: 2011, km: 160276, transmission: 'AUTOMATICO', salePrice: 43000, isPromo: false },
  gallery: ['/api/site/assets/aaaaaaaaaaaa', '/api/site/assets/bbbbbbbbbbbb', '/api/site/assets/cccccccccccc'],
  overrides: social ? { social } : null,
  contacts: { whatsapp: '(11) 93471-8276' }, location: {},
})

const IG_LIMIT: Route = (c) => c.url.includes('/content_publishing_limit') ? { status: 200, body: { data: [{ quota_usage: 1, config: { quota_total: 100 } }] } } : null

describe('Estúdio social — Instagram — SIMULAÇÃO', () => {
  it('Post: uma única imagem, que é a ARTE (preço aplicado), com legenda', async () => {
    const s = simulated([IG_LIMIT,
      (c) => c.url.includes('/IG/media_publish') ? { status: 200, body: { id: 'M1' } } : null,
      (c) => c.url.includes('/IG/media') && c.method === 'POST' ? { status: 200, body: { id: 'C1' } } : null,
      (c) => c.url.includes('status_code') ? { status: 200, body: { status_code: 'FINISHED' } } : null,
      (c) => c.url.includes('/M1?') ? { status: 200, body: { id: 'M1', permalink: 'https://www.instagram.com/p/x/' } } : null,
    ])
    const r = await instagramConnector.publish!(payload({ format: 'POST', template: 'OFERTA' }), ctxWith(s.http, 'IG'))
    expect(r.state).toBe('PUBLICADO')
    const create = new URLSearchParams(s.calls.find((c) => c.url.includes('/IG/media') && c.method === 'POST')!.body)
    expect(create.get('image_url')).toBe('https://app.test/art/POST-OFERTA-43000-%2Fapi%2Fsite%2Fassets%2Faaaaaaaaaaaa.jpg')
    expect(create.get('caption')).toContain('Tiguan')
    expect(s.calls.filter((c) => c.body.includes('is_carousel_item'))).toHaveLength(0)
  })

  it('Carrossel: 1º item é a arte, os demais são as fotos', async () => {
    const s = simulated([IG_LIMIT,
      (c) => c.url.includes('/IG/media_publish') ? { status: 200, body: { id: 'M2' } } : null,
      (c) => c.url.includes('/IG/media') && c.method === 'POST' ? { status: 200, body: { id: `I${c.body.length}` } } : null,
      (c) => c.url.includes('status_code') ? { status: 200, body: { status_code: 'FINISHED' } } : null,
      (c) => c.url.includes('/M2?') ? { status: 200, body: { id: 'M2' } } : null,
    ])
    await instagramConnector.publish!(payload({ format: 'CARROSSEL', template: 'CHEGOU' }), ctxWith(s.http, 'IG'))
    const items = s.calls.filter((c) => c.body.includes('is_carousel_item=true')).map((c) => new URLSearchParams(c.body).get('image_url')!)
    expect(items).toHaveLength(3)
    expect(items[0]).toContain('/art/CARROSSEL-CHEGOU')
    expect(items[1]).toContain('/m/')
  })

  it('Story: media_type=STORIES com a arte vertical, sem legenda; Story expirado não vira falha', async () => {
    const s = simulated([IG_LIMIT,
      (c) => c.url.includes('/IG/media_publish') ? { status: 200, body: { id: 'ST1' } } : null,
      (c) => c.url.includes('/IG/media') && c.method === 'POST' ? { status: 200, body: { id: 'SC1' } } : null,
      (c) => c.url.includes('status_code') ? { status: 200, body: { status_code: 'FINISHED' } } : null,
    ])
    const ctx = ctxWith(s.http, 'IG')
    const r = await instagramConnector.publish!(payload({ format: 'STORY', template: 'OFERTA' }), ctx)
    expect(r).toMatchObject({ state: 'PUBLICADO', remoteId: 'ST1' })
    const create = new URLSearchParams(s.calls.find((c) => c.url.includes('/IG/media') && c.method === 'POST' && !c.url.includes('publish'))!.body)
    expect(create.get('media_type')).toBe('STORIES')
    expect(create.get('image_url')).toContain('/art/STORY-OFERTA')
    expect(create.get('caption')).toBeNull()
    const n = s.calls.length
    expect(await instagramConnector.get!({ vehicleId: 'v1', remoteId: 'ST1', externalRef: 'x', format: 'STORY' }, ctx)).toMatchObject({ state: 'PUBLICADO' })
    expect(s.calls.length).toBe(n) // não consulta o que já expirou
  })

  it('Reels: cria o contêiner com o vídeo e devolve "em análise"; a conferência publica quando termina', async () => {
    reels.length = 0
    let status = 'IN_PROGRESS'
    const s = simulated([IG_LIMIT,
      (c) => c.url.includes('/IG/media_publish') ? { status: 200, body: { id: 'RL1' } } : null,
      (c) => c.url.includes('/IG/media') && c.method === 'POST' ? { status: 200, body: { id: 'RC1' } } : null,
      (c) => c.url.includes('/RC1?') ? { status: 200, body: { status_code: status } } : null,
      (c) => c.url.includes('/RL1?') ? { status: 200, body: { id: 'RL1', permalink: 'https://www.instagram.com/reel/r1/' } } : null,
    ])
    const ctx = ctxWith(s.http, 'IG')
    const r = await instagramConnector.publish!(payload({ format: 'REELS', template: 'DESTAQUE' }), ctx)
    expect(r).toMatchObject({ state: 'EM_ANALISE', pendingToken: 'RC1' })
    expect(reels).toEqual(['adrefsocial000001:DESTAQUE'])
    const create = new URLSearchParams(s.calls.find((c) => c.url.includes('/IG/media') && c.method === 'POST')!.body)
    expect(create.get('media_type')).toBe('REELS')
    expect(create.get('video_url')).toBe('https://app.test/reel.mp4')
    expect(create.get('share_to_feed')).toBe('true')
    expect(s.calls.some((c) => c.url.includes('media_publish'))).toBe(false)

    const ref = { vehicleId: 'v1', remoteId: null, externalRef: 'x', pendingToken: 'RC1', format: 'REELS' as const }
    expect(await instagramConnector.get!(ref, ctx)).toMatchObject({ state: 'EM_ANALISE' })
    status = 'FINISHED'
    expect(await instagramConnector.get!(ref, ctx)).toMatchObject({ state: 'PUBLICADO', remoteId: 'RL1', pendingToken: null, remoteUrl: 'https://www.instagram.com/reel/r1/' })
  })

  it('Reels recusado pelo Instagram (ERROR) = rejeitado, sem publicar', async () => {
    const s = simulated([(c) => c.url.includes('/RC9?') ? { status: 200, body: { status_code: 'ERROR', status: 'Error: formato de vídeo' } } : null])
    const r = await instagramConnector.get!({ vehicleId: 'v1', remoteId: null, externalRef: 'x', pendingToken: 'RC9', format: 'REELS' }, ctxWith(s.http, 'IG'))
    expect(r).toMatchObject({ state: 'REJEITADO', pendingToken: null })
  })
})

describe('Estúdio social — Página do Facebook — SIMULAÇÃO', () => {
  it('Post: anexa só a arte ao post da Página', async () => {
    const s = simulated([
      (c) => c.url.includes('/PAGE/photos') ? { status: 200, body: { id: 'PH1' } } : null,
      (c) => c.url.includes('/PAGE/feed') ? { status: 200, body: { id: 'PP1' } } : null,
    ])
    await metaPageConnector.publish!(payload({ format: 'POST', template: 'OFERTA' }), ctxWith(s.http, 'PAGE'))
    const photos = s.calls.filter((c) => c.url.includes('/PAGE/photos')).map((c) => new URLSearchParams(c.body).get('url'))
    expect(photos).toEqual(['https://app.test/art/POST-OFERTA-43000-%2Fapi%2Fsite%2Fassets%2Faaaaaaaaaaaa.jpg'])
  })

  it('Story: foto da arte vertical sem publicar + /photo_stories', async () => {
    const s = simulated([
      (c) => c.url.includes('/PAGE/photos') ? { status: 200, body: { id: 'PH2' } } : null,
      (c) => c.url.includes('/PAGE/photo_stories') ? { status: 200, body: { success: true, post_id: 'STORY1' } } : null,
    ])
    const r = await metaPageConnector.publish!(payload({ format: 'STORY', template: 'CHEGOU' }), ctxWith(s.http, 'PAGE'))
    expect(r).toMatchObject({ state: 'PUBLICADO', remoteId: 'STORY1' })
    const photo = new URLSearchParams(s.calls.find((c) => c.url.includes('/PAGE/photos'))!.body)
    expect(photo.get('published')).toBe('false')
    expect(photo.get('url')).toContain('/art/STORY-CHEGOU')
    expect(new URLSearchParams(s.calls.find((c) => c.url.includes('/photo_stories'))!.body).get('photo_id')).toBe('PH2')
  })

  it('Reels: start → envio por file_url (rupload) → finish PUBLISHED com a legenda; conferência pelo status do vídeo', async () => {
    let vs = 'processing'
    const s = simulated([
      (c) => c.url.includes('/PAGE/video_reels') && c.body.includes('upload_phase=start') ? { status: 200, body: { video_id: 'VID1', upload_url: 'https://rupload.facebook.com/video-upload/v23.0/VID1' } } : null,
      (c) => c.url.startsWith('https://rupload.facebook.com/video-upload/') ? { status: 200, body: { success: true } } : null,
      (c) => c.url.includes('/PAGE/video_reels') && c.body.includes('upload_phase=finish') ? { status: 200, body: { success: true } } : null,
      (c) => c.url.includes('/VID1?') ? { status: 200, body: { id: 'VID1', permalink_url: '/reel/123', status: { video_status: vs } } } : null,
    ])
    const ctx = ctxWith(s.http, 'PAGE')
    const r = await metaPageConnector.publish!(payload({ format: 'REELS', template: 'OFERTA' }), ctx)
    expect(r).toMatchObject({ state: 'EM_ANALISE', remoteId: 'VID1' })
    const up = s.calls.find((c) => c.url.includes('rupload'))!
    expect(up.url).toMatch(/\/video-upload\/v\d+\.\d+\/VID1$/)
    expect(up.headers).toMatchObject({ Authorization: 'OAuth PT', file_url: 'https://app.test/reel.mp4' })
    const finish = new URLSearchParams(s.calls.find((c) => c.body.includes('upload_phase=finish'))!.body)
    expect(finish.get('video_state')).toBe('PUBLISHED')
    expect(finish.get('description')).toContain('Tiguan')
    const ref = { vehicleId: 'v1', remoteId: 'VID1', externalRef: 'x', format: 'REELS' as const }
    expect(await metaPageConnector.get!(ref, ctx)).toMatchObject({ state: 'EM_ANALISE' })
    vs = 'ready'
    expect(await metaPageConnector.get!(ref, ctx)).toMatchObject({ state: 'PUBLICADO', remoteUrl: 'https://www.facebook.com/reel/123' })
  })

  it('Story não é apagado pela API (some sozinho); Reels é excluído', async () => {
    const s = simulated([(c) => c.method === 'DELETE' ? { status: 200, body: { success: true } } : null])
    const ctx = ctxWith(s.http, 'PAGE')
    expect(await metaPageConnector.remove!({ vehicleId: 'v1', remoteId: 'STORY1', externalRef: 'x', format: 'STORY' }, 'VENDIDO', ctx)).toMatchObject({ state: 'REMOVIDO' })
    expect(s.calls).toHaveLength(0)
    await metaPageConnector.remove!({ vehicleId: 'v1', remoteId: 'VID1', externalRef: 'x', format: 'REELS' }, 'VENDIDO', ctx)
    expect(s.calls[0]).toMatchObject({ method: 'DELETE' })
  })

  it('sem formato: continua o post com as fotos (comportamento anterior)', async () => {
    const s = simulated([
      (c) => c.url.includes('/PAGE/photos') ? { status: 200, body: { id: `P${c.body.length}` } } : null,
      (c) => c.url.includes('/PAGE/feed') ? { status: 200, body: { id: 'PP2' } } : null,
    ])
    await metaPageConnector.publish!(payload(null), ctxWith(s.http, 'PAGE'))
    const photos = s.calls.filter((c) => c.url.includes('/PAGE/photos')).map((c) => new URLSearchParams(c.body).get('url')!)
    expect(photos).toHaveLength(3)
    expect(photos.every((u) => u.includes('/m/'))).toBe(true)
  })
})
