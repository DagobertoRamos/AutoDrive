// =============================================================================
// TESTES DE CONTRATO — SIMULAÇÃO da Mobiauto Open API 1.0 (Swagger público).
// Não comprovam integração real.
// =============================================================================
import { describe, expect, it, vi } from 'vitest'
import { buildPayload } from '../content-core'
import { exactMatch } from '../mapping-core'
import { createHttpClient, type FetchLike } from './http'
import type { ConnectorContext } from './types'
import { mobiautoConnector, mobiDeal } from './mobiauto'

vi.mock('../platform-apps', () => ({ getPlatformApp: async () => ({ clientId: 'app', clientSecret: 'sec', source: 'env' }) }))

type Call = { url: string; method: string; body: string; auth?: string }
function server(opts: { plans?: unknown } = {}) {
  const calls: Call[] = []
  const deals = new Map<number, { published: boolean }>()
  const f: FetchLike = async (url, init) => {
    const u = new URL(url)
    const method = String(init.method ?? 'GET')
    const body = init.body instanceof URLSearchParams ? init.body.toString() : String(init.body ?? '')
    calls.push({ url, method, body, auth: (init.headers as Record<string, string>)?.Authorization })
    const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s })
    const p = u.pathname
    if (p.endsWith('/openid-connect/token')) return j(200, { access_token: 'NEW', refresh_token: 'R2', expires_in: 300 })
    if (p === '/api/vehicle/v1.0/makes/CAR') return j(200, [{ id: 10, name: 'FIAT' }])
    if (p === '/api/vehicle/v1.0/models/CAR/10') return j(200, [{ id: 20, name: 'ARGO' }])
    if (p === '/api/vehicle/v1.0/trims/CAR/20') return j(200, [{ id: 30, name: 'DRIVE 1.0' }, { id: 31, name: 'TREKKING 1.3' }])
    if (p === '/api/vehicle/v1.0/colors') return j(200, [{ id: 1, name: 'Prata' }])
    if (p === '/api/vehicle/v1.0/fuels') return j(200, [{ id: 2, name: 'FLEX' }])
    if (p === '/api/vehicle/v1.0/transmissions') return j(200, [{ id: 3, name: 'MANUAL' }])
    if (p === '/api/dealer/77/plans') return j(200, opts.plans ?? [{ dealPlanId: 'P1', planUsed: true, quantityAvailable: 5, vehicleType: 'CAR' }])
    if (p === '/api/dealer/77/inventory/v1.0' && method === 'POST') { deals.set(555, { published: false }); return j(200, { id: 555 }) }
    const m = /\/api\/dealer\/77\/inventory\/v1.0\/(\d+)(\/image)?$/.exec(p)
    if (m && !m[2] && method === 'GET') return deals.has(Number(m[1])) ? j(200, { id: Number(m[1]) }) : j(404, {})
    if (m && !m[2] && method === 'DELETE') { deals.delete(Number(m[1])); return new Response(null, { status: 204 }) }
    if (m && m[2] && method === 'POST') return j(200, {})
    const pub = /\/api\/publish\/v1.0\/dealer\/77\/deal\/(\d+)(\/(publish|unpublish))?$/.exec(p)
    if (pub && pub[3] === 'publish') { const d = deals.get(Number(pub[1])); if (d) d.published = true; return j(200, {}) }
    if (pub && pub[3] === 'unpublish') { const d = deals.get(Number(pub[1])); if (d) d.published = false; return j(200, {}) }
    if (pub) return deals.get(Number(pub[1]))?.published ? j(200, { status: 'PUBLISHED' }) : j(404, {})
    return j(599, { message: 'rota não simulada' })
  }
  return { calls, http: createHttpClient(f) }
}

const ctx = (http: ConnectorContext['http']): ConnectorContext => ({
  connection: { id: 'c', tenantId: 't', externalAccountId: '77', environment: 'PRODUCAO', config: {} },
  secrets: { access_token: 'OLD', refresh_token: 'R1', expires_at: String(Date.parse('2026-09-26T11:00:00Z')) },
  http,
  mapping: { async resolve(_k, _s, label, lookup, pick) { const c = await lookup(); return pick ? pick(c) : exactMatch(label, c) } },
  mediaUrl: (u) => `https://app.test/m${u}.jpg`,
  async saveSecrets() {},
  now: () => new Date('2026-09-26T12:00:00Z'),
})

const payload = (version = 'Drive 1.0') => buildPayload({
  reference: 'adref', storeName: 'Loja', gallery: ['/a1', '/a2'], contacts: {}, location: {},
  vehicle: { id: 'v', brand: 'Fiat', model: 'Argo', version, year: 2021, modelYear: 2022, km: 35000, color: 'Prata', fuel: 'FLEX', transmission: 'MANUAL', doors: 4, plate: 'ABC1D23', salePrice: 72900, isPromo: false },
})
const ref = { vehicleId: 'v', remoteId: '555', externalRef: 'x' }

describe('Mobiauto — SIMULAÇÃO', () => {
  it('renova o token, cadastra com códigos oficiais, envia fotos com posição e publica no plano com cota', async () => {
    const s = server()
    const c = ctx(s.http)
    const r = await mobiautoConnector.publish!(payload(), c)
    expect(r.remoteId).toBe('555')
    expect(s.calls[0].body).toContain('grant_type=refresh_token')
    const post = s.calls.find((x) => x.method === 'POST' && x.url.endsWith('/inventory/v1.0'))!
    expect(post.auth).toBe('Bearer NEW')
    expect(JSON.parse(post.body)).toMatchObject({ vehicleType: 'CAR', stockKind: 'USED', trimId: 30, colorId: 1, fuelId: 2, transmissionId: 3, km: 35000, plate: 'ABC1D23', price: 72900 })
    expect(JSON.parse(s.calls.find((x) => x.url.endsWith('/555/image'))!.body)).toEqual([{ url: 'https://app.test/m/a1.jpg', position: 1 }, { url: 'https://app.test/m/a2.jpg', position: 2 }])
    expect(s.calls.some((x) => x.url.endsWith('/555/publish?planId=P1'))).toBe(true)
    expect((await mobiautoConnector.get!(ref, c)).state).toBe('PUBLICADO')
  })
  it('plano sem anúncios disponíveis = cota esgotada (não compra plano)', async () => {
    const s = server({ plans: [{ dealPlanId: 'P1', planUsed: true, quantityAvailable: 0, vehicleType: 'CAR' }] })
    await expect(mobiautoConnector.publish!(payload(), ctx(s.http))).rejects.toMatchObject({ kind: 'QUOTA' })
  })
  it('pausar = unpublish (fica cadastrado, fora do ar); reativar; retirar = DELETE', async () => {
    const s = server()
    const c = ctx(s.http)
    await mobiautoConnector.publish!(payload(), c)
    expect((await mobiautoConnector.pause!(ref, c)).state).toBe('PAUSADO')
    expect((await mobiautoConnector.resume!(ref, payload(), c)).state).toBe('PUBLICADO')
    expect((await mobiautoConnector.remove!(ref, 'VENDIDO', c)).state).toBe('NAO_ENCONTRADO')
  })
  it('versão sem correspondência não publica (vai para revisão)', async () => {
    const s = server()
    await expect(mobiautoConnector.publish!(payload('Precision 1.8'), ctx(s.http))).rejects.toMatchObject({ code: 'MAPPING' })
  })
  it('0 km vira stockKind NEW', () => {
    const p = buildPayload({ reference: 'r', storeName: '', gallery: ['/a'], contacts: {}, location: {}, vehicle: { id: 'v', km: 0, salePrice: 1 } })
    const one = { id: '1', label: '' }
    expect(mobiDeal(p, { trim: one, color: one, fuel: one, gear: one })).toMatchObject({ stockKind: 'NEW', deal0km: true })
  })
})
