// =============================================================================
// Conector: Mobiauto — Mobiauto Open API 1.0 (Swagger público:
// https://open-api.mobiauto.com.br/swagger-ui.html, lido em 26/09/2026).
//   auth:     OAuth2 (Keycloak) authorization code — app da plataforma
//             (client_id/segredo pedidos a openapi@mobiauto.com.br); a loja
//             autoriza e escolhe a revenda (GET /api/dealer/v1.0/dealers)
//   publicar: POST /api/dealer/{dealerId}/inventory/v1.0 (ShortDealDto)
//             + POST .../{dealId}/image (url, position)
//             + PUT /api/publish/v1.0/dealer/{dealerId}/deal/{dealId}/publish?planId=
//   alterar:  PUT .../inventory/v1.0/{dealId} + fotos (troca e reordena)
//   pausar/reativar: PUT .../unpublish | .../publish
//   retirar:  DELETE .../inventory/v1.0/{dealId}
//   conferir: GET /api/publish/v1.0/dealer/{dealerId}/deal/{dealId} + GET do anúncio
//   plano:    GET /api/dealer/{dealerId}/plans (quantityAvailable)
// =============================================================================

import { channelSpec } from '../channels'
import { ConnectorError } from '../errors'
import { channelText, type ListingPayload } from '../content-core'
import { normalizePlate } from '../validate-core'
import { sourceKey, type Candidate } from '../mapping-core'
import { getPlatformApp } from '../platform-apps'
import { throwForStatus, type HttpResponse } from './http'
import type { Connector, ConnectorContext, RemoteRef, RemoteResult } from './types'

const spec = channelSpec('MOBIAUTO')!
export const MOBIAUTO_API = 'https://open-api.mobiauto.com.br'
export const MOBIAUTO_AUTH = 'https://auth.mobiauto.com.br/auth/realms/mobiauto/protocol/openid-connect'
const REFRESH_BEFORE_MS = 2 * 60_000

async function ensureToken(ctx: ConnectorContext, force = false): Promise<string> {
  const exp = Number(ctx.secrets.expires_at ?? 0)
  if (!force && ctx.secrets.access_token && exp - ctx.now().getTime() > REFRESH_BEFORE_MS) return ctx.secrets.access_token
  if (!ctx.secrets.refresh_token) throw new ConnectorError('AUTH', 'Autorização da Mobiauto ausente.', 'Conecte a conta em Canais conectados.')
  const app = await getPlatformApp('MOBIAUTO')
  if (!app) throw new ConnectorError('CONFIG', 'App da Mobiauto não cadastrado na plataforma.', 'O MASTER cadastra em Master › Integrações (Publicações — Mobiauto).')
  const res = await ctx.http.request({
    method: 'POST', url: `${MOBIAUTO_AUTH}/token`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: app.clientId, client_secret: app.clientSecret, refresh_token: ctx.secrets.refresh_token }),
  })
  if (res.status === 400 || res.status === 401) throw new ConnectorError('AUTH', 'A autorização da Mobiauto expirou ou foi revogada.', 'Reconecte a conta em Canais conectados.')
  throwForStatus(res, 'Mobiauto (token)')
  const j = res.json<{ access_token: string; refresh_token?: string; expires_in?: number }>()
  if (!j?.access_token) throw new ConnectorError('UNAVAILABLE', 'Mobiauto não devolveu token.')
  const expiresAt = new Date(ctx.now().getTime() + (j.expires_in ?? 300) * 1000)
  const next = { ...ctx.secrets, access_token: j.access_token, refresh_token: j.refresh_token ?? ctx.secrets.refresh_token, expires_at: String(expiresAt.getTime()) }
  Object.assign(ctx.secrets, next)
  await ctx.saveSecrets(next, expiresAt)
  return j.access_token
}

async function api(ctx: ConnectorContext, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, creates = false): Promise<HttpResponse> {
  const call = async (t: string) => ctx.http.request({ method, url: `${MOBIAUTO_API}${path}`, creates, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  let res = await call(await ensureToken(ctx))
  if (res.status === 401) res = await call(await ensureToken(ctx, true))
  return res
}

function mobiError(res: HttpResponse, what: string): ConnectorError | null {
  if (res.status >= 200 && res.status < 300) return null
  const j = res.json<{ message?: string; error?: string; errors?: unknown }>()
  const msg = `${what}: ${j?.message ?? j?.error ?? `HTTP ${res.status}`}`.slice(0, 400)
  if (res.status === 403) return new ConnectorError('AUTH', msg, 'O usuário conectado não tem acesso a esta revenda na Mobiauto.', { code: '403' })
  if (res.status === 404) return new ConnectorError('NOT_FOUND', msg, undefined, { code: '404' })
  if (/plano|plan|quota|limite|dispon[ií]vel/i.test(msg) && res.status < 500) return new ConnectorError('QUOTA', msg, undefined, { code: String(res.status), details: j })
  try { throwForStatus(res, what) } catch (e) { return e as ConnectorError }
  return null
}

const dealer = (ctx: ConnectorContext) => ctx.connection.externalAccountId

/** Listas de referência (formato genérico id + nome/descrição). */
function candidatesOf(j: unknown): Candidate[] {
  const arr = Array.isArray(j) ? j : Array.isArray((j as { content?: unknown })?.content) ? (j as { content: unknown[] }).content : []
  return (arr as Array<Record<string, unknown>>).map((x) => {
    const id = x.id ?? x.makeId ?? x.modelId ?? x.trimId ?? x.colorId ?? x.fuelId ?? x.transmissionId
    const label = x.name ?? x.description ?? x.label ?? x.makeName ?? x.modelName ?? x.trimName
    return { id: id == null ? '' : String(id), label: label == null ? '' : String(label) }
  }).filter((c) => c.id && c.label)
}

async function lookup(ctx: ConnectorContext, path: string): Promise<Candidate[]> {
  const res = await api(ctx, 'GET', path)
  const err = mobiError(res, 'Mobiauto (tabela)'); if (err) throw err
  return candidatesOf(res.json())
}

async function resolveCodes(p: ListingPayload, ctx: ConnectorContext) {
  const v = p.vehicle
  const need = (x: Candidate | null, what: string, val: unknown) => {
    if (!x) throw new ConnectorError('VALIDATION', `${what} "${val}" sem correspondência segura na Mobiauto.`, 'Revise o de-para em Publicações › Pendências de mapeamento.', { code: 'MAPPING' })
    return x
  }
  const make = need(await ctx.mapping.resolve('BRAND', sourceKey(v.brand), String(v.brand), () => lookup(ctx, '/api/vehicle/v1.0/makes/CAR')), 'Marca', v.brand)
  const model = need(await ctx.mapping.resolve('MODEL', sourceKey(v.brand, v.model), String(v.model), () => lookup(ctx, `/api/vehicle/v1.0/models/CAR/${make.id}`)), 'Modelo', v.model)
  const trim = need(await ctx.mapping.resolve('VERSION', sourceKey(v.brand, v.model, v.version), String(v.version), () => lookup(ctx, `/api/vehicle/v1.0/trims/CAR/${model.id}`)), 'Versão', v.version)
  const color = need(await ctx.mapping.resolve('COLOR', sourceKey(v.color), String(v.color), () => lookup(ctx, '/api/vehicle/v1.0/colors')), 'Cor', v.color)
  const fuel = need(await ctx.mapping.resolve('FUEL', sourceKey(v.fuel), String(v.fuel), () => lookup(ctx, '/api/vehicle/v1.0/fuels')), 'Combustível', v.fuel)
  const gear = need(await ctx.mapping.resolve('TRANSMISSION', sourceKey(v.transmission), String(v.transmission), () => lookup(ctx, '/api/vehicle/v1.0/transmissions')), 'Câmbio', v.transmission)
  return { trim, color, fuel, gear }
}

/** ShortDealDto (Swagger). Só campos que existem no estoque — nada inventado. */
export function mobiDeal(p: ListingPayload, codes: { trim: Candidate; color: Candidate; fuel: Candidate; gear: Candidate }) {
  const v = p.vehicle
  const t = channelText(p, spec)
  return {
    vehicleType: 'CAR', stockKind: p.isNew ? 'NEW' : 'USED', deal0km: p.isNew,
    trimId: Number(codes.trim.id), colorId: Number(codes.color.id), fuelId: Number(codes.fuel.id), transmissionId: Number(codes.gear.id),
    km: Math.max(0, Math.round(v.km ?? 0)), modelYear: v.modelYear ?? v.year, productionYear: v.year ?? v.modelYear,
    plate: normalizePlate(v.plate) || undefined, vin: v.chassi || undefined, doors: v.doors ?? undefined,
    price: Math.round(p.price ?? 0), description: t.description.slice(0, 4000),
  }
}

async function planId(ctx: ConnectorContext): Promise<string | undefined> {
  const fixed = ctx.connection.config.planId
  if (fixed) return String(fixed)
  const res = await api(ctx, 'GET', `/api/dealer/${dealer(ctx)}/plans`)
  const err = mobiError(res, 'Planos'); if (err) throw err
  const plans = (res.json<Array<{ dealPlanId: string; planUsed?: boolean; quantityAvailable?: number; vehicleType?: string }>>() ?? []).filter((x) => x.vehicleType === 'CAR' || !x.vehicleType)
  const ok = plans.find((x) => x.planUsed !== false && (x.quantityAvailable ?? 0) > 0)
  if (!ok) throw new ConnectorError('QUOTA', 'Plano da Mobiauto sem anúncios disponíveis.', 'Libere um anúncio ou amplie o plano na Mobiauto (o AutoDrive não compra planos).')
  return ok.dealPlanId
}

async function sendImages(ctx: ConnectorContext, dealId: string, photos: string[]) {
  const imgs = photos.slice(0, spec.media.max).map((u, i) => ({ url: ctx.mediaUrl(u), position: i + 1 }))
  const res = await api(ctx, 'POST', `/api/dealer/${dealer(ctx)}/inventory/v1.0/${dealId}/image`, imgs)
  const err = mobiError(res, 'Fotos'); if (err) throw err
}

async function state(ctx: ConnectorContext, dealId: string): Promise<RemoteResult> {
  const deal = await api(ctx, 'GET', `/api/dealer/${dealer(ctx)}/inventory/v1.0/${dealId}`)
  if (deal.status === 404) return { state: 'NAO_ENCONTRADO', remoteId: dealId }
  const e1 = mobiError(deal, 'Consultar'); if (e1) throw e1
  const pub = await api(ctx, 'GET', `/api/publish/v1.0/dealer/${dealer(ctx)}/deal/${dealId}`)
  if (pub.status === 404) return { state: 'PAUSADO', remoteId: dealId, remoteStatus: 'não publicado' }
  const e2 = mobiError(pub, 'Consultar publicação'); if (e2) throw e2
  const d = deal.json<{ blocked?: boolean; blockedReason?: string; externalUrl?: string }>() ?? {}
  if (d.blocked) return { state: 'REJEITADO', remoteId: dealId, remoteStatus: 'bloqueado', message: d.blockedReason ?? 'Anúncio bloqueado pela Mobiauto.' }
  return { state: 'PUBLICADO', remoteId: dealId, remoteStatus: 'publicado', data: { publicacao: pub.json() } }
}

async function publishDeal(ctx: ConnectorContext, dealId: string) {
  const plan = await planId(ctx)
  const res = await api(ctx, 'PUT', `/api/publish/v1.0/dealer/${dealer(ctx)}/deal/${dealId}/publish${plan ? `?planId=${encodeURIComponent(plan)}` : ''}`)
  const err = mobiError(res, 'Publicar'); if (err) throw err
}

export const mobiautoConnector: Connector = {
  spec,
  async testConnection(ctx) {
    const res = await api(ctx, 'GET', `/api/dealer/v1.0/dealers?dealerId=${dealer(ctx)}`)
    const err = mobiError(res, 'Revenda'); if (err) throw err
    const d = (res.json<Array<{ name?: string }>>() ?? [])[0]
    return { ok: true, message: 'Revenda Mobiauto autorizada.', account: d?.name, quota: await this.limits!(ctx).catch(() => ({})) }
  },
  async limits(ctx) {
    const res = await api(ctx, 'GET', `/api/dealer/${dealer(ctx)}/plans`)
    const err = mobiError(res, 'Planos'); if (err) throw err
    return { planos: res.json() }
  },
  async publish(p, ctx) {
    const codes = await resolveCodes(p, ctx)
    const res = await api(ctx, 'POST', `/api/dealer/${dealer(ctx)}/inventory/v1.0`, mobiDeal(p, codes), true)
    const err = mobiError(res, 'Cadastrar anúncio'); if (err) throw err
    const id = res.json<{ id?: number }>()?.id
    if (!id) throw new ConnectorError('UNAVAILABLE', 'Mobiauto não devolveu o id do anúncio.')
    await sendImages(ctx, String(id), p.photos)
    await publishDeal(ctx, String(id))
    return { state: 'EM_ANALISE', remoteId: String(id), message: 'Enviado; conferindo publicação.' }
  },
  get(ref: RemoteRef, ctx) { return ref.remoteId ? state(ctx, ref.remoteId) : Promise.resolve({ state: 'NAO_ENCONTRADO' }) },
  async findByReference(_ref, p, ctx) {
    const plate = normalizePlate(p?.vehicle.plate)
    if (!plate) return null
    const res = await api(ctx, 'GET', `/api/dealer/${dealer(ctx)}/inventory/v1.0?size=200`)
    const err = mobiError(res, 'Buscar'); if (err) throw err
    const hit = (res.json<Array<{ id: number; plate?: string }>>() ?? []).find((d) => normalizePlate(d.plate) === plate)
    return hit ? state(ctx, String(hit.id)) : null
  },
  async update(ref, p, ctx) {
    const codes = await resolveCodes(p, ctx)
    const id = String(ref.remoteId)
    const res = await api(ctx, 'PUT', `/api/dealer/${dealer(ctx)}/inventory/v1.0/${id}`, { ...mobiDeal(p, codes), id: Number(id) })
    const err = mobiError(res, 'Atualizar'); if (err) throw err
    // Fotos: remove as atuais e envia na ordem aprovada (capa = posição 1).
    const cur = await api(ctx, 'GET', `/api/dealer/${dealer(ctx)}/inventory/v1.0/${id}/image`)
    for (const img of (cur.json<Array<{ id?: number; imageId?: number }>>() ?? [])) {
      const imgId = img.id ?? img.imageId
      if (imgId != null) { const d = await api(ctx, 'DELETE', `/api/dealer/${dealer(ctx)}/inventory/v1.0/${id}/image/${imgId}`); const e = mobiError(d, 'Excluir foto'); if (e && e.kind !== 'NOT_FOUND') throw e }
    }
    await sendImages(ctx, id, p.photos)
    return state(ctx, id)
  },
  async pause(ref, ctx) {
    const res = await api(ctx, 'PUT', `/api/publish/v1.0/dealer/${dealer(ctx)}/deal/${ref.remoteId}/unpublish`)
    const err = mobiError(res, 'Pausar'); if (err && err.kind !== 'NOT_FOUND') throw err
    return state(ctx, String(ref.remoteId))
  },
  async resume(ref, _p, ctx) {
    await publishDeal(ctx, String(ref.remoteId))
    return state(ctx, String(ref.remoteId))
  },
  async remove(ref, _reason, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    const res = await api(ctx, 'DELETE', `/api/dealer/${dealer(ctx)}/inventory/v1.0/${ref.remoteId}`)
    const err = mobiError(res, 'Retirar'); if (err && err.kind !== 'NOT_FOUND') throw err
    return state(ctx, String(ref.remoteId))
  },
}
