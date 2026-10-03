// =============================================================================
// TESTES DE CONTRATO — SIMULAÇÃO da TikTok Content Posting API (Direct Post),
// conforme a documentação oficial lida em 02/10/2026. Não comprovam integração real.
// =============================================================================
import { describe, expect, it, vi } from 'vitest'
import { buildPayload } from '../content-core'
import { exactMatch } from '../mapping-core'
import { createHttpClient, type FetchLike } from './http'
import type { ConnectorContext, SocialMedia } from './types'
import { chunkPlan, pickPrivacy, tiktokConnector, tiktokResult } from './tiktok'

vi.mock('../platform-apps', () => ({ getPlatformApp: async () => ({ clientId: 'ck', clientSecret: 'cs', source: 'env' }) }))

type Call = { url: string; method: string; body: string; headers: Record<string, string> }
function server(opts: { unaudited?: boolean; status?: unknown } = {}) {
  const calls: Call[] = []
  const f: FetchLike = async (url, init) => {
    const u = new URL(url)
    const method = String(init.method ?? 'GET')
    const body = init.body instanceof URLSearchParams ? init.body.toString() : init.body instanceof Uint8Array ? `<${init.body.length} bytes>` : String(init.body ?? '')
    calls.push({ url, method, body, headers: (init.headers as Record<string, string>) ?? {} })
    const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s })
    const ok = (data: unknown) => j(200, { data, error: { code: 'ok', message: '' } })
    if (u.pathname === '/v2/oauth/token/') return j(200, { access_token: 'NEW', refresh_token: 'R2', expires_in: 86400, refresh_expires_in: 31536000, open_id: 'oid' })
    if (u.pathname === '/v2/post/publish/creator_info/query/') return ok({ creator_username: 'loja', privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], max_video_post_duration_sec: 600 })
    const unaudited = (b: string) => opts.unaudited && !b.includes('SELF_ONLY')
    if (u.pathname === '/v2/post/publish/video/init/') {
      if (unaudited(body)) return j(403, { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'unaudited' } })
      return ok({ publish_id: 'v_pub_1', upload_url: 'https://open-upload.tiktokapis.com/upload/?id=1' })
    }
    if (u.hostname === 'open-upload.tiktokapis.com' && method === 'PUT') return new Response(null, { status: 201 })
    if (u.pathname === '/v2/post/publish/content/init/') {
      if (unaudited(body)) return j(403, { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'unaudited' } })
      return ok({ publish_id: 'p_pub_1' })
    }
    // JSON cru: o id é inteiro de 64 bits (não cabe em number do JS).
    if (u.pathname === '/v2/post/publish/status/fetch/') return opts.status ? ok(opts.status) : new Response('{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7300000000000000001]},"error":{"code":"ok","message":""}}', { status: 200 })
    return j(599, { error: { code: 'nao_simulado' } })
  }
  return { calls, http: createHttpClient(f) }
}

const social: SocialMedia = {
  artUrl: (u, _p, f) => `https://app.test/art/${f}${u}.jpg`,
  video: async () => ({ url: 'https://app.test/v.mp4', bytes: new Uint8Array(1234) }),
  carVideo: async () => new Uint8Array(2048),
}

const saved: Array<{ s: Record<string, string>; exp?: Date | null }> = []
const ctx = (http: ConnectorContext['http'], expired = false): ConnectorContext => ({
  connection: { id: 'c', tenantId: 't', externalAccountId: 'oid', environment: 'PRODUCAO', config: {} },
  secrets: { access_token: 'OLD', refresh_token: 'R1', expires_at: String(Date.parse(expired ? '2026-10-02T11:00:00Z' : '2026-10-03T11:00:00Z')), username: 'loja' },
  http,
  mapping: { async resolve(_k, _s, label, lookup, pick) { const c = await lookup(); return pick ? pick(c) : exactMatch(label, c) } },
  mediaUrl: (u) => `https://app.test/m${u}.jpg`,
  social,
  async saveSecrets(s, exp) { saved.push({ s, exp }) },
  now: () => new Date('2026-10-02T12:00:00Z'),
})

const payload = (format?: 'POST' | 'CARROSSEL' | 'REELS' | 'VIDEO' | 'STORY') => ({
  ...buildPayload({
    reference: 'adref', storeName: 'Loja', gallery: ['/a1', '/a2', '/a3'], contacts: {}, location: {},
    vehicle: { id: 'v', brand: 'Fiat', model: 'Argo', version: 'Drive', year: 2021, modelYear: 2022, km: 35000, color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', doors: 4, plate: 'ABC1D23', salePrice: 72900, isPromo: false },
  }),
  social: format ? { format, template: 'OFERTA' as const } : null,
})

describe('TikTok — regras puras', () => {
  it('pedaços do envio seguem o guia de transferência', () => {
    expect(chunkPlan(3 * 1024 * 1024)).toMatchObject({ count: 1, chunkSize: 3 * 1024 * 1024 })
    expect(chunkPlan(40 * 1024 * 1024).count).toBe(1)
    const big = chunkPlan(95 * 1024 * 1024)
    expect(big.count).toBe(9) // floor(95/10)
    expect(big.ranges.at(-1)![1]).toBe(95 * 1024 * 1024 - 1) // último pedaço leva o resto
  })
  it('privacidade: pública quando aceita; senão a primeira opção', () => {
    expect(pickPrivacy(['SELF_ONLY', 'PUBLIC_TO_EVERYONE'])).toBe('PUBLIC_TO_EVERYONE')
    expect(pickPrivacy(['FOLLOWER_OF_CREATOR', 'SELF_ONLY'])).toBe('FOLLOWER_OF_CREATOR')
    expect(pickPrivacy(['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], 'SELF_ONLY')).toBe('SELF_ONLY')
  })
  it('status: concluído vira link do vídeo; falha vira recusado', () => {
    expect(tiktokResult({ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['99'] }, 'x', 'loja', false, false)).toMatchObject({ state: 'PUBLICADO', remoteId: '99', remoteUrl: 'https://www.tiktok.com/@loja/video/99' })
    expect(tiktokResult({ status: 'FAILED', fail_reason: 'file_format_check_failed' }, 'x', 'loja', false, false)).toMatchObject({ state: 'REJEITADO' })
    expect(tiktokResult({ status: 'PROCESSING_UPLOAD' }, 'x', 'loja', false, false)).toMatchObject({ state: 'EM_ANALISE', pendingToken: 'x' })
  })
})

describe('TikTok — contrato (simulação)', () => {
  it('Reels: envia o ARQUIVO (FILE_UPLOAD + PUT com Content-Range) e confere pelo status', async () => {
    const s = server()
    const c = ctx(s.http)
    const r = await tiktokConnector.publish!(payload('REELS'), c)
    expect(r.state).toBe('EM_ANALISE')
    const init = s.calls.find((x) => x.url.endsWith('/video/init/'))!
    expect(JSON.parse(init.body)).toMatchObject({ post_info: { privacy_level: 'PUBLIC_TO_EVERYONE' }, source_info: { source: 'FILE_UPLOAD', video_size: 1234, chunk_size: 1234, total_chunk_count: 1 } })
    const put = s.calls.find((x) => x.method === 'PUT')!
    expect(put.headers['Content-Range']).toBe('bytes 0-1233/1234')
    const g = await tiktokConnector.get!({ vehicleId: 'v', remoteId: null, externalRef: 'adref', pendingToken: r.pendingToken }, c)
    expect(g).toMatchObject({ state: 'PUBLICADO', remoteId: '7300000000000000001', remoteUrl: 'https://www.tiktok.com/@loja/video/7300000000000000001' })
  })

  it('Carrossel: modo foto com a arte na capa + fotos por link', async () => {
    const s = server()
    const r = await tiktokConnector.publish!(payload('CARROSSEL'), ctx(s.http))
    const init = JSON.parse(s.calls.find((x) => x.url.endsWith('/content/init/'))!.body)
    expect(init).toMatchObject({ media_type: 'PHOTO', post_mode: 'DIRECT_POST', source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0 } })
    expect(init.source_info.photo_images[0]).toContain('/art/CARROSSEL')
    expect(init.source_info.photo_images).toHaveLength(3)
    expect(r.pendingToken).toMatch(/^p_pub_1\|f\|/)
  })

  it('app não auditado: repete como PRIVADO e avisa', async () => {
    const s = server({ unaudited: true })
    const c = ctx(s.http)
    const r = await tiktokConnector.publish!(payload('VIDEO'), c)
    const inits = s.calls.filter((x) => x.url.endsWith('/video/init/'))
    expect(inits).toHaveLength(2)
    expect(JSON.parse(inits[1].body).post_info.privacy_level).toBe('SELF_ONLY')
    expect(r.message).toMatch(/PRIVADO/)
    const g = await tiktokConnector.get!({ vehicleId: 'v', remoteId: null, externalRef: 'adref', pendingToken: r.pendingToken }, c)
    expect(g.remoteStatus).toMatch(/PRIVADO/)
  })

  it('token vencido: renova pelo refresh_token e grava o vencimento da RENOVAÇÃO (365 dias)', async () => {
    saved.length = 0
    const s = server()
    await tiktokConnector.testConnection!(ctx(s.http, true))
    const tok = s.calls.find((x) => x.url.endsWith('/v2/oauth/token/'))!
    expect(tok.body).toContain('grant_type=refresh_token')
    expect(saved[0].s.access_token).toBe('NEW')
    expect(saved[0].exp!.getTime()).toBe(Date.parse('2026-10-02T12:00:00Z') + 31_536_000_000)
  })

  it('Story não existe no TikTok pela API', async () => {
    const s = server()
    await expect(tiktokConnector.publish!(payload('STORY'), ctx(s.http))).rejects.toThrow(/Story/)
    expect(await tiktokConnector.validate!(payload('STORY'), ctx(s.http))).toHaveLength(1)
  })
})
