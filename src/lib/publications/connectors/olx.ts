// =============================================================================
// Conector: OLX — API de anúncios, categoria AUTOS (2020 Carros, vans e utilitários).
// Fonte: https://developers.olx.com.br/anuncio/api/ (import, publishing_status,
// autos/sub_auto, autos/car_models) — lidos em 25/09/2026. NÃO usa a
// documentação XML de Imóveis.
//   enviar:  PUT https://apps.olx.com.br/autoupload/import  (operation insert = inserir OU editar pelo id)
//   retirar: mesmo endpoint, operation delete
//   status:  POST https://apps.olx.com.br/autoupload/import/{token}
// Como "insert" com o mesmo id edita, reenviar após timeout não duplica.
// =============================================================================

import { channelSpec } from '../channels'
import { ConnectorError } from '../errors'
import { channelText, splitBrPhone } from '../content-core'
import type { ListingPayload } from '../content-core'
import { normalizePlate } from '../validate-core'
import { sourceKey, type Candidate } from '../mapping-core'
import { throwForStatus } from './http'
import type { Connector, ConnectorContext, RemoteRef, RemoteResult } from './types'

const spec = channelSpec('OLX')!
const BASE = 'https://apps.olx.com.br/autoupload'

const GEARBOX: Record<string, string> = { MANUAL: '1', AUTOMATICO: '2', CVT: '2', SEMI_AUTOMATICO: '3', AUTOMATIZADO: '4' }
const FUEL: Record<string, string> = { GASOLINA: '1', ETANOL: '2', FLEX: '3', GNV: '4', DIESEL: '5', HIBRIDO: '6', ELETRICO: '7' }
const DOORS: Record<number, string> = { 2: '1', 4: '2', 3: '3' }
const COLOR: Record<string, string> = { PRETO: '1', BRANCO: '2', PRATA: '3', VERMELHO: '4', CINZA: '5', AZUL: '6', AMARELO: '7', VERDE: '8', LARANJA: '9' }

/** Ano no formato da OLX (anteriores a 1980 vão por faixa). */
export function olxRegdate(year: number): string {
  if (year >= 1980) return String(year)
  for (const b of [1975, 1970, 1965, 1960, 1955]) if (year >= b) return String(b)
  return '1950'
}

const norm = (s?: string | null) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

/** Resultado síncrono do import (statusCode) → erro tipado. */
export function olxImportError(body: { statusCode?: number; statusMessage?: string; errors?: unknown }): ConnectorError | null {
  const c = Number(body.statusCode)
  if (c === 0) return null
  const msg = `OLX: ${body.statusMessage ?? 'erro'} (${c})`
  const details = body.errors
  if (c === -2) return new ConnectorError('RATE_LIMIT', msg, undefined, { code: String(c), retryAfterMs: 5 * 60_000 })
  if (c === -7 || c === -8) return new ConnectorError('QUOTA', msg, undefined, { code: String(c), details })
  if (c === -6) return new ConnectorError('CONFIG', msg, 'A conta OLX precisa de plano profissional para EMPRESA (Essencial/Plus/Premium Empresa) habilitado para integração.', { code: String(c) })
  if (c === -5 || c === -1) return new ConnectorError('UNAVAILABLE', msg, undefined, { code: String(c) })
  return new ConnectorError('VALIDATION', msg, 'Veja os erros de validação no diagnóstico e corrija o anúncio.', { code: String(c), details })
}

type AdStatus = { status?: string; operation?: string; list_id?: string; url?: string; message?: Array<{ error?: string }> | unknown; image_errors?: unknown }

/** Status do anúncio num import → estado remoto. */
export function olxAdState(ad: AdStatus | undefined): RemoteResult {
  if (!ad) return { state: 'EM_ANALISE', message: 'OLX ainda processando.' }
  const st = String(ad.status ?? '').toLowerCase()
  const errs = Array.isArray(ad.message) ? (ad.message as Array<{ error?: string }>).map((m) => m?.error).filter(Boolean).join(', ') : ''
  const del = String(ad.operation ?? '') === 'delete'
  if (st === 'accepted' || st === 'accept') {
    return del
      ? { state: 'REMOVIDO', remoteStatus: 'accepted/delete' }
      : { state: 'PUBLICADO', remoteId: ad.list_id ?? null, remoteUrl: ad.url ?? null, remoteStatus: 'accepted', data: ad.image_errors ? { image_errors: ad.image_errors } : undefined, message: ad.image_errors ? 'Publicado, mas algumas fotos falharam (veja o diagnóstico).' : null }
  }
  if (st === 'refused' || st === 'error') return { state: 'REJEITADO', remoteStatus: st, message: errs ? `OLX recusou: ${errs}` : 'OLX recusou o anúncio.' }
  return { state: del ? 'EM_ANALISE' : 'EM_ANALISE', remoteId: ad.list_id ?? null, remoteStatus: st || 'pending', message: 'Na fila de moderação da OLX.' }
}

function token(ctx: ConnectorContext): string {
  const t = ctx.secrets.access_token
  if (!t) throw new ConnectorError('AUTH', 'Conta OLX sem autorização.', 'Conecte a conta OLX em Canais conectados.')
  return t
}

async function post<T>(ctx: ConnectorContext, url: string, body: unknown, opts: { method?: 'POST' | 'PUT'; creates?: boolean } = {}): Promise<T> {
  const res = await ctx.http.request({ method: opts.method ?? 'POST', url, creates: opts.creates, headers: { 'Content-Type': 'application/json', 'User-Agent': 'AutoDrive/1.0' }, body: JSON.stringify(body) })
  throwForStatus(res, 'OLX')
  const j = res.json<T>()
  if (!j) throw new ConnectorError('UNAVAILABLE', 'OLX respondeu em formato inesperado.')
  return j
}

async function carInfo(ctx: ConnectorContext, path: string): Promise<Candidate[]> {
  const j = await post<{ status?: string; data?: Record<string, number | string> }>(ctx, `${BASE}/car_info${path}`, { access_token: token(ctx) })
  return Object.entries(j.data ?? {}).map(([label, id]) => ({ id: String(id), label }))
}

async function resolveCar(p: ListingPayload, ctx: ConnectorContext) {
  const v = p.vehicle
  const need = (x: Candidate | null, what: string, val: unknown) => {
    if (!x) throw new ConnectorError('VALIDATION', `${what} "${val}" sem correspondência segura na OLX.`, 'Revise o de-para em Publicações › Pendências de mapeamento.', { code: 'MAPPING' })
    return x
  }
  const brand = need(await ctx.mapping.resolve('BRAND', sourceKey(v.brand), String(v.brand), () => carInfo(ctx, '')), 'Marca', v.brand)
  const model = need(await ctx.mapping.resolve('MODEL', sourceKey(v.brand, v.model), String(v.model), () => carInfo(ctx, `/${brand.id}`)), 'Modelo', v.model)
  const version = need(await ctx.mapping.resolve('VERSION', sourceKey(v.brand, v.model, v.version), String(v.version), () => carInfo(ctx, `/${brand.id}/${model.id}`)), 'Versão', v.version)
  return { brand, model, version }
}

/** Anúncio no formato do import (categoria 2020). */
export function olxAd(p: ListingPayload, ref: string, codes: { brand: Candidate; model: Candidate; version: Candidate }, mediaUrl: (u: string) => string): Record<string, unknown> {
  const v = p.vehicle
  const phone = splitBrPhone(p.contacts.whatsapp ?? p.contacts.phone)
  const t = channelText(p, spec)
  const params: Record<string, unknown> = {
    vehicle_brand: codes.brand.id, vehicle_model: codes.model.id, vehicle_version: codes.version.id,
    regdate: olxRegdate(v.year ?? v.modelYear ?? 0), mileage: Math.max(0, Math.round(v.km ?? 0)),
  }
  const gb = GEARBOX[norm(v.transmission)]; if (gb) params.gearbox = gb
  const fu = FUEL[norm(v.fuel)]; if (fu) params.fuel = fu
  const dr = v.doors ? DOORS[v.doors] : undefined; if (dr) params.doors = dr
  const plate = normalizePlate(v.plate); if (plate) params.vehicle_tag = plate
  const col = COLOR[norm(v.color)]; if (v.color) params.carcolor = col ?? '10' // 10 = Outra
  if (p.isNew) params.zero_km = '1'
  return {
    id: ref, operation: 'insert', category: 2020,
    subject: t.title.slice(0, 90), // em Carros a OLX preenche o assunto sozinha
    body: t.description.slice(0, 6000),
    phone: phone ? Number(phone.full) : undefined,
    type: 's', price: Math.round(p.price ?? 0), zipcode: String(p.location.zip ?? '').replace(/\D/g, ''),
    params,
    images: p.photos.slice(0, spec.media.max).map(mediaUrl),
  }
}

async function importAds(ctx: ConnectorContext, adList: unknown[], creates: boolean): Promise<string> {
  const j = await post<{ token?: string; statusCode?: number; statusMessage?: string; errors?: unknown }>(ctx, `${BASE}/import`, { access_token: token(ctx), ad_list: adList }, { method: 'PUT', creates })
  const err = olxImportError(j)
  if (err) throw err
  if (!j.token) throw new ConnectorError('UNAVAILABLE', 'OLX não devolveu o token da importação.')
  return j.token
}

export const olxConnector: Connector = {
  spec,
  async testConnection(ctx) {
    const res = await ctx.http.request({ method: 'POST', url: 'https://apps.olx.com.br/oauth_api/basic_user_info', headers: { 'Content-Type': 'application/json', 'User-Agent': 'AutoDrive/1.0' }, body: JSON.stringify({ access_token: token(ctx) }) })
    throwForStatus(res, 'OLX')
    const j = res.json<{ user_name?: string; user_email?: string }>() ?? {}
    return { ok: true, message: 'Conta OLX autorizada.', account: j.user_name ?? j.user_email ?? undefined }
  },
  async publish(p, ctx) {
    const codes = await resolveCar(p, ctx)
    const pendingToken = await importAds(ctx, [olxAd(p, ctxRef(p), codes, ctx.mediaUrl)], true)
    return { state: 'EM_ANALISE', pendingToken, message: 'Aceito para processamento pela OLX (ainda não é publicação).' }
  },
  async update(_ref, p, ctx) {
    const codes = await resolveCar(p, ctx)
    const pendingToken = await importAds(ctx, [olxAd(p, ctxRef(p), codes, ctx.mediaUrl)], false)
    return { state: 'EM_ANALISE', pendingToken, message: 'Edição enviada; aguardando processamento.' }
  },
  async get(ref: RemoteRef, ctx) {
    if (!ref.pendingToken) return ref.remoteId ? { state: 'PUBLICADO', remoteId: ref.remoteId, remoteUrl: ref.remoteUrl } : { state: 'NAO_ENCONTRADO' }
    const j = await post<{ autoupload_status?: string; ads?: Record<string, AdStatus> }>(ctx, `${BASE}/import/${encodeURIComponent(ref.pendingToken)}`, { access_token: token(ctx) })
    const r = olxAdState(j.ads?.[ref.externalRef])
    return { ...r, remoteId: r.remoteId ?? ref.remoteId, remoteUrl: r.remoteUrl ?? ref.remoteUrl, pendingToken: r.state === 'EM_ANALISE' ? ref.pendingToken : null }
  },
  async remove(ref, _reason, ctx) {
    const pendingToken = await importAds(ctx, [{ id: ref.externalRef, operation: 'delete' }], false)
    return { state: 'EM_ANALISE', pendingToken, remoteId: ref.remoteId, message: 'Retirada enviada à OLX; conferindo.' }
  },
}

/** A referência vai no payload (reference = externalRef da publicação). */
function ctxRef(p: ListingPayload): string { return p.reference }
