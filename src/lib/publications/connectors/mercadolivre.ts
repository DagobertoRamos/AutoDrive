// =============================================================================
// Conector: Mercado Livre — classificados de VEÍCULOS no Brasil (MLB1744).
// Fonte: developers.mercadolivre.com.br › Publicação de automóveis e
// Sincronização de publicações (veículos), atualizadas em 28/08/2026.
//   publicar:  POST /items (buying_mode classified, channels [marketplace],
//              listing_type_id do PACOTE da loja) + POST /items/{id}/description
//   atualizar: PUT /items/{id} (título, preço, fotos, seller_contact, atributos)
//   pausar/reativar: PUT status paused|active · retirar: closed + deleted:true
//   conferir:  GET /items/{id}
// Desde 01/10/2026 seller_contact.country_code2/phone2 (WhatsApp) são
// obrigatórios para concessionária. Nunca compramos pacote/destaque.
// =============================================================================

import { channelSpec } from '../channels'
import { ConnectorError } from '../errors'
import { channelText, fuelLabel, gearLabel, splitBrPhone, type ListingPayload } from '../content-core'
import { normalizePlate } from '../validate-core'
import { normalizeLabel } from '../mapping-core'
import { throwForStatus, type HttpResponse } from './http'
import { getPlatformApp } from '../platform-apps'
import type { Connector, ConnectorContext, RemoteRef, RemoteResult } from './types'

const spec = channelSpec('MERCADO_LIVRE')!
const API = 'https://api.mercadolibre.com'
const REFRESH_BEFORE_MS = 5 * 60_000

export function mlState(status: string | undefined, subStatus: string[] = []): RemoteResult['state'] {
  switch (status) {
    case 'active': return 'PUBLICADO'
    case 'paused': return 'PAUSADO'
    case 'closed': return 'REMOVIDO'
    case 'under_review': case 'not_yet_active': case 'payment_required': case 'inactive': return subStatus.includes('deleted') ? 'REMOVIDO' : 'EM_ANALISE'
    default: return 'EM_ANALISE'
  }
}

/** Erro do ML (JSON com message/cause) → erro tipado. */
export function mlError(res: HttpResponse, what: string): ConnectorError | null {
  if (res.status >= 200 && res.status < 300) return null
  const j = res.json<{ message?: string; error?: string; cause?: Array<{ code?: string | number; message?: string }> }>() ?? {}
  const causes = (j.cause ?? []).map((c) => `${c.code ?? ''} ${c.message ?? ''}`.trim()).filter(Boolean)
  const text = [j.message, ...causes].filter(Boolean).join(' · ').slice(0, 500)
  if (res.status === 401 || /invalid[_ ]token|expired/i.test(text)) return new ConnectorError('AUTH', `${what}: token do Mercado Livre inválido ou expirado.`, undefined, { code: String(res.status) })
  if (res.status === 403) return new ConnectorError('AUTH', `${what}: sem permissão (${text || 403}).`, 'Reconecte a conta do Mercado Livre com o usuário titular.', { code: '403' })
  if (res.status === 429) return new ConnectorError('RATE_LIMIT', `${what}: limite de requisições do Mercado Livre.`, undefined, { code: '429', retryAfterMs: 60_000 })
  if (res.status >= 500) return new ConnectorError('UNAVAILABLE', `${what}: Mercado Livre indisponível (${res.status}).`, undefined, { code: String(res.status) })
  if (res.status === 409) return new ConnectorError('UNAVAILABLE', `${what}: conflito temporário (409); tentando de novo.`, undefined, { code: '409', retryAfterMs: 5_000 })
  return new ConnectorError('VALIDATION', `${what}: ${text || `recusado (${res.status})`}`, undefined, { code: String(res.status), details: j })
}

async function ensureToken(ctx: ConnectorContext, force = false): Promise<string> {
  const exp = Number(ctx.secrets.expires_at ?? 0)
  if (!force && ctx.secrets.access_token && exp - ctx.now().getTime() > REFRESH_BEFORE_MS) return ctx.secrets.access_token
  const app = await getPlatformApp('MERCADO_LIVRE')
  if (!app) throw new ConnectorError('CONFIG', 'App do Mercado Livre não configurado na plataforma.', 'O MASTER cadastra o app em Master › Integrações (Publicações — Mercado Livre).')
  const { clientId, clientSecret } = app
  if (!ctx.secrets.refresh_token) throw new ConnectorError('AUTH', 'Autorização do Mercado Livre ausente.', 'Conecte a conta em Canais conectados.')
  const res = await ctx.http.request({
    method: 'POST', url: `${API}/oauth/token`, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: ctx.secrets.refresh_token }),
  })
  if (res.status === 400 || res.status === 401) throw new ConnectorError('AUTH', 'A autorização do Mercado Livre foi revogada ou expirou.', 'Reconecte a conta em Canais conectados.', { code: 'invalid_grant' })
  throwForStatus(res, 'Mercado Livre (token)')
  const j = res.json<{ access_token: string; refresh_token?: string; expires_in?: number; user_id?: number }>()
  if (!j?.access_token) throw new ConnectorError('UNAVAILABLE', 'Mercado Livre não devolveu token.')
  const expiresAt = new Date(ctx.now().getTime() + (j.expires_in ?? 21_600) * 1000)
  const next = { ...ctx.secrets, access_token: j.access_token, refresh_token: j.refresh_token ?? ctx.secrets.refresh_token, expires_at: String(expiresAt.getTime()) }
  Object.assign(ctx.secrets, next)
  await ctx.saveSecrets(next, expiresAt)
  return j.access_token
}

async function api(ctx: ConnectorContext, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, opts: { creates?: boolean; what?: string } = {}): Promise<HttpResponse> {
  const doCall = async (tok: string) => ctx.http.request({
    method, url: `${API}${path}`, creates: opts.creates,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let res = await doCall(await ensureToken(ctx))
  if (res.status === 401) res = await doCall(await ensureToken(ctx, true))
  const err = mlError(res, opts.what ?? 'Mercado Livre')
  if (err) throw err
  return res
}

function attributes(p: ListingPayload) {
  const v = p.vehicle
  const a: Array<{ id: string; value_name: string }> = []
  const push = (id: string, val: unknown) => { if (val !== undefined && val !== null && String(val).trim()) a.push({ id, value_name: String(val) }) }
  push('BRAND', v.brand); push('MODEL', v.model); push('TRIM', v.version)
  push('VEHICLE_YEAR', v.modelYear ?? v.year)
  push('KILOMETERS', v.km != null ? `${Math.round(v.km)} km` : null)
  push('FUEL_TYPE', fuelLabel(v.fuel)); push('TRANSMISSION', gearLabel(v.transmission)?.replace(/ CVT$/, ''))
  push('DOORS', v.doors); push('COLOR', v.color)
  push('LICENSE_PLATE', normalizePlate(v.plate) || null)
  if (v.chassi && v.chassi.length >= 6) push('VIN_LAST_DIGITS', v.chassi.slice(-6).toUpperCase())
  push('ITEM_CONDITION', p.isNew ? 'Novo' : 'Usado')
  return a
}

function sellerContact(p: ListingPayload) {
  const w = splitBrPhone(p.contacts.whatsapp)
  const ph = splitBrPhone(p.contacts.phone) ?? w
  return {
    contact: p.contacts.contactName ?? p.storeName ?? '', other_info: '',
    country_code: ph ? '55' : '', area_code: ph?.area ?? '', phone: ph?.number ?? '',
    country_code2: w ? '55' : '', area_code2: '', phone2: w?.full ?? '', // WhatsApp: país em country_code2, restante concatenado em phone2
    email: p.contacts.email ?? '', webpage: p.contacts.site ?? '',
  }
}

export function mlItemBody(p: ListingPayload, ctx: { listingTypeId: string; cityId: string; addressLine?: string | null; mediaUrl: (u: string) => string }) {
  const t = channelText(p, spec)
  return {
    title: t.title, category_id: 'MLB1744', price: Math.round(p.price ?? 0), currency_id: 'BRL', available_quantity: 1,
    buying_mode: 'classified', listing_type_id: ctx.listingTypeId, condition: p.isNew ? 'new' : 'used', channels: ['marketplace'],
    pictures: p.photos.slice(0, spec.media.max).map((u) => ({ source: ctx.mediaUrl(u) })),
    seller_contact: sellerContact(p),
    location: { ...(ctx.addressLine ? { address_line: ctx.addressLine } : {}), zip_code: String(p.location.zip ?? '').replace(/\D/g, ''), city: { id: ctx.cityId } },
    attributes: attributes(p),
    seller_custom_field: p.reference,
  }
}

function cfg(ctx: ConnectorContext) {
  const listingTypeId = String(ctx.connection.config.listingTypeId ?? '')
  const cityId = String(ctx.connection.config.cityId ?? '')
  if (!listingTypeId) throw new ConnectorError('CONFIG', 'Tipo de anúncio (pacote) do Mercado Livre não escolhido.', 'Escolha o tipo de anúncio do pacote contratado em Canais conectados › Mercado Livre.')
  if (!cityId) throw new ConnectorError('CONFIG', 'Cidade do Mercado Livre não configurada.', 'Informe a cidade da loja (id de localização do Mercado Livre) em Canais conectados › Mercado Livre.')
  return { listingTypeId, cityId, addressLine: (ctx.connection.config.addressLine as string | undefined) ?? null }
}

type MlItem = { id: string; status?: string; sub_status?: string[]; permalink?: string; seller_custom_field?: string; attributes?: Array<{ id: string; value_name?: string }> }

/** Marca/modelo/versão que o ML associou são os nossos? Divergência = revisar (não aceita calado). */
export function mlMismatch(p: ListingPayload, item: MlItem): string[] {
  const got = new Map((item.attributes ?? []).map((a) => [a.id, normalizeLabel(a.value_name)]))
  const out: string[] = []
  const cmp = (id: string, ours: unknown, label: string) => {
    const theirs = got.get(id); const mine = normalizeLabel(String(ours ?? ''))
    if (theirs && mine && theirs !== mine) out.push(`${label}: enviado "${ours}", Mercado Livre associou "${(item.attributes ?? []).find((a) => a.id === id)?.value_name}"`)
  }
  cmp('BRAND', p.vehicle.brand, 'Marca'); cmp('MODEL', p.vehicle.model, 'Modelo'); cmp('TRIM', p.vehicle.version, 'Versão')
  return out
}

function toResult(item: MlItem, p?: ListingPayload | null): RemoteResult {
  const warnings = p ? mlMismatch(p, item) : []
  return {
    state: mlState(item.status, item.sub_status), remoteId: item.id, remoteUrl: item.permalink ?? null, remoteStatus: [item.status, ...(item.sub_status ?? [])].filter(Boolean).join('/'),
    message: warnings.length ? `Confira o mapeamento — ${warnings.join('; ')}` : null,
    data: warnings.length ? { mapeamento: warnings } : undefined,
  }
}

export const mercadoLivreConnector: Connector = {
  spec,
  async testConnection(ctx) {
    const res = await api(ctx, 'GET', '/users/me', undefined, { what: 'Conta' })
    const me = res.json<{ id: number; nickname?: string }>()
    return { ok: true, message: 'Conta do Mercado Livre autorizada.', account: me?.nickname ?? String(me?.id ?? '') }
  },
  async publish(p, ctx) {
    const c = cfg(ctx)
    const res = await api(ctx, 'POST', '/items', mlItemBody(p, { ...c, mediaUrl: ctx.mediaUrl }), { creates: true, what: 'Publicar' })
    const item = res.json<MlItem>()
    if (!item?.id) throw new ConnectorError('UNAVAILABLE', 'Mercado Livre não devolveu o id do anúncio.')
    await api(ctx, 'POST', `/items/${item.id}/description`, { plain_text: channelText(p, spec).description }, { what: 'Descrição' })
    return toResult(item, p)
  },
  async get(ref, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    try {
      const res = await api(ctx, 'GET', `/items/${encodeURIComponent(ref.remoteId)}`, undefined, { what: 'Consultar' })
      return toResult(res.json<MlItem>()!)
    } catch (e) {
      if (e instanceof ConnectorError && e.code === '404') return { state: 'NAO_ENCONTRADO', remoteId: ref.remoteId }
      throw e
    }
  },
  async findByReference(ref: RemoteRef, p, ctx) {
    const me = (await api(ctx, 'GET', '/users/me', undefined, { what: 'Conta' })).json<{ id: number }>()
    const search = (await api(ctx, 'GET', `/users/${me?.id}/items/search?limit=20&sort=start_time_desc`, undefined, { what: 'Buscar' })).json<{ results?: string[] }>()
    const ids = (search?.results ?? []).slice(0, 20)
    if (!ids.length) return null
    const multi = (await api(ctx, 'GET', `/items?ids=${ids.join(',')}&attributes=id,status,sub_status,permalink,seller_custom_field`, undefined, { what: 'Buscar' })).json<Array<{ code: number; body: MlItem }>>() ?? []
    const hit = multi.map((m) => m.body).find((b) => b?.seller_custom_field === ref.externalRef)
    return hit ? toResult(hit, p) : null
  },
  async update(ref, p, ctx) {
    const c = cfg(ctx)
    const body = mlItemBody(p, { ...c, mediaUrl: ctx.mediaUrl })
    const res = await api(ctx, 'PUT', `/items/${ref.remoteId}`, { title: body.title, price: body.price, pictures: body.pictures, seller_contact: body.seller_contact, attributes: body.attributes }, { what: 'Atualizar' })
    await api(ctx, 'PUT', `/items/${ref.remoteId}/description`, { plain_text: channelText(p, spec).description }, { what: 'Descrição' })
    return toResult(res.json<MlItem>()!, p)
  },
  async pause(ref, ctx) {
    const res = await api(ctx, 'PUT', `/items/${ref.remoteId}`, { status: 'paused' }, { what: 'Pausar' })
    return toResult(res.json<MlItem>()!)
  },
  async resume(ref, _p, ctx) {
    const res = await api(ctx, 'PUT', `/items/${ref.remoteId}`, { status: 'active' }, { what: 'Reativar' })
    return toResult(res.json<MlItem>()!)
  },
  async remove(ref, _reason, ctx) {
    if (!ref.remoteId) return { state: 'NAO_ENCONTRADO' }
    await api(ctx, 'PUT', `/items/${ref.remoteId}`, { status: 'closed' }, { what: 'Encerrar' })
    // O 2º passo pode dar 409 (optimistic locking) por alguns segundos: tenta de novo.
    for (let i = 0; i < 3; i++) {
      try { await api(ctx, 'PUT', `/items/${ref.remoteId}`, { deleted: 'true' }, { what: 'Excluir' }); break } catch (e) {
        if (!(e instanceof ConnectorError && e.code === '409') || i === 2) throw e
        await new Promise((r) => setTimeout(r, 3_000))
      }
    }
    return { state: 'REMOVIDO', remoteId: ref.remoteId, message: 'Anúncio encerrado e excluído.' }
  },
}
