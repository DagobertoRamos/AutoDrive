// =============================================================================
// Conector: Chaves na Mão — API REST de veículos (manual oficial v1.0,
// cdn.chavesnamao.com.br/documents/manual_integracao_API_REST_veiculos_2022_chaves_na_mao.pdf).
//   auth:     GET /clients/jwt (header token) → JWT válido por 1 dia
//   publicar: POST /vehicles (publica sozinho se houver espaço no plano)
//   alterar:  PUT /vehicles/{reference}
//   pausar:   DELETE /publications/{reference} · reativar: POST /publications/{reference}
//   retirar:  DELETE /vehicles/{reference}
//   conferir: GET /vehicles/{reference} (publication null = fora do ar)
//   plano:    GET /clients/plan
// Limite: requisições por janela de 10 s (429 + retry-after).
// =============================================================================

import { channelSpec } from '../channels'
import { ConnectorError } from '../errors'
import { channelText, type ListingPayload } from '../content-core'
import { normalizePlate } from '../validate-core'
import { mapBySynonyms, sourceKey, type Candidate } from '../mapping-core'
import { throwForStatus, type HttpResponse } from './http'
import type { Connector, ConnectorContext, RemoteRef, RemoteResult } from './types'

const spec = channelSpec('CHAVES_NA_MAO')!
const BASES = {
  PRODUCAO: 'https://api.chavesnamao.com.br/integration/v1',
  HOMOLOGACAO: 'https://homologacao.chavesnamao.com.br/vehicle-integration',
}
const JWT_MS = 20 * 3_600_000 // renova antes de 1 dia

/** Cores aceitas (enum do manual) e nomes usuais no estoque. "Branco" é ambíguo (metálico × pérola) → revisão. */
export const CNM_COLORS: Record<string, string[]> = {
  BLACK: ['preto', 'preta'], RED: ['vermelho', 'vermelha'], SILVER: ['prata'], GREEN: ['verde'], YELLOW: ['amarelo', 'amarela'],
  BLUE: ['azul'], METALLIC_WHITE: ['branco metalico'], PEARL_WHITE: ['branco perola', 'branco perolizado'], GREY: ['cinza'],
  LEAD: ['chumbo', 'grafite'], BEIGE: ['bege'], ORANGE: ['laranja'], BURGUNDY: ['bordo', 'bordô'], BROWN: ['marrom'], GOLDEN: ['dourado', 'dourada'],
  PURPLE: ['roxo', 'roxa'], PINK: ['rosa'], MULTICOLORED: ['varias cores'], WINE: ['vinho'], CHAMPAGNE: ['champagne', 'champanhe'], BRONZE: ['bronze'], OTHER: ['outra', 'outra cor'],
}
const COLOR_CANDIDATES: Candidate[] = Object.keys(CNM_COLORS).map((id) => ({ id, label: id }))
const FUEL: Record<string, string> = { FLEX: 'FLEX', GASOLINA: 'GASOLINE', ETANOL: 'ETHANOL', DIESEL: 'DIESEL', HIBRIDO: 'HYBRID', ELETRICO: 'ELETRIC', GNV: 'GNV' }

function base(ctx: ConnectorContext): string {
  const custom = ctx.connection.config.baseUrl
  if (typeof custom === 'string' && /^https:\/\/[\w.-]+\.chavesnamao\.com\.br\//.test(custom)) return custom.replace(/\/+$/, '')
  return BASES[ctx.connection.environment] ?? BASES.PRODUCAO
}

async function jwt(ctx: ConnectorContext, force = false): Promise<string> {
  if (!force && ctx.secrets.jwt && ctx.now().getTime() - Number(ctx.secrets.jwtAt ?? 0) < JWT_MS) return ctx.secrets.jwt
  if (!ctx.secrets.token) throw new ConnectorError('CONFIG', 'Token de integração do Chaves na Mão ausente.', 'Copie o token em Meus dados › Token de integração e cole em Canais conectados.')
  const res = await ctx.http.request({ method: 'GET', url: `${base(ctx)}/clients/jwt`, headers: { token: ctx.secrets.token } })
  if (res.status === 401 || res.status === 403) throw new ConnectorError('AUTH', 'Token de integração do Chaves na Mão recusado.', 'Confira/renove o token em Meus dados › Token de integração.')
  throwForStatus(res, 'Chaves na Mão (JWT)')
  const t = res.json<{ token?: string }>()?.token
  if (!t) throw new ConnectorError('UNAVAILABLE', 'Chaves na Mão não devolveu o JWT.')
  const next = { ...ctx.secrets, jwt: t, jwtAt: String(ctx.now().getTime()) }
  Object.assign(ctx.secrets, next)
  await ctx.saveSecrets(next, null)
  return t
}

async function api(ctx: ConnectorContext, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, creates = false): Promise<HttpResponse> {
  const doCall = async (t: string) => ctx.http.request({ method, url: `${base(ctx)}${path}`, creates, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  let res = await doCall(await jwt(ctx))
  if (res.status === 401) res = await doCall(await jwt(ctx, true))
  return res
}

function cnmError(res: HttpResponse, what: string): ConnectorError | null {
  if (res.status >= 200 && res.status < 300) return null
  const j = res.json<{ message?: string | string[] }>()
  const msg = Array.isArray(j?.message) ? j!.message.join('; ') : j?.message ?? ''
  if (res.status === 400) return new ConnectorError('VALIDATION', `${what}: ${msg || 'dados recusados'}`, undefined, { code: '400', details: j })
  if (res.status === 422) {
    if (/n[aã]o existe/i.test(msg)) return new ConnectorError('NOT_FOUND', `${what}: ${msg}`, undefined, { code: '422' })
    if (/plano|espa[cç]o|limite/i.test(msg)) return new ConnectorError('QUOTA', `${what}: ${msg}`, undefined, { code: '422' })
    return new ConnectorError('VALIDATION', `${what}: ${msg || 'erro lógico'}`, undefined, { code: '422', details: j })
  }
  try { throwForStatus(res, what) } catch (e) { return e as ConnectorError }
  return null
}

const list = (j: unknown): Array<{ id: number | string; name: string }> => (Array.isArray(j) ? j : Array.isArray((j as { data?: unknown })?.data) ? (j as { data: unknown[] }).data : []) as Array<{ id: number | string; name: string }>

async function lookup(ctx: ConnectorContext, path: string): Promise<Candidate[]> {
  const res = await api(ctx, 'GET', path)
  const err = cnmError(res, 'Chaves na Mão (tabela)'); if (err) throw err
  return list(res.json()).map((x) => ({ id: String(x.id), label: String(x.name) }))
}

async function resolveTrim(p: ListingPayload, ctx: ConnectorContext) {
  const v = p.vehicle
  const need = (x: Candidate | null, what: string, val: unknown) => {
    if (!x) throw new ConnectorError('VALIDATION', `${what} "${val}" sem correspondência segura no Chaves na Mão.`, 'Revise o de-para em Publicações › Pendências de mapeamento.', { code: 'MAPPING' })
    return x
  }
  const brand = need(await ctx.mapping.resolve('BRAND', sourceKey(v.brand), String(v.brand), () => lookup(ctx, '/vehicles/brands')), 'Marca', v.brand)
  const model = need(await ctx.mapping.resolve('MODEL', sourceKey(v.brand, v.model), String(v.model), () => lookup(ctx, `/vehicles/brands/${brand.id}/models`)), 'Modelo', v.model)
  const trim = need(await ctx.mapping.resolve('VERSION', sourceKey(v.brand, v.model, v.version), String(v.version), () => lookup(ctx, `/vehicles/models/${model.id}/trims`)), 'Versão', v.version)
  const color = need(await ctx.mapping.resolve('COLOR', sourceKey(v.color), String(v.color), async () => COLOR_CANDIDATES, (c) => mapBySynonyms(v.color, CNM_COLORS, c)), 'Cor', v.color)
  return { trimId: Number(trim.id), color: color.id }
}

export function cnmBody(p: ListingPayload, codes: { trimId: number; color: string }, mediaUrl: (u: string) => string) {
  const v = p.vehicle
  const t = channelText(p, spec)
  const fuel = FUEL[String(v.fuel ?? '').toUpperCase()]
  if (!fuel) throw new ConnectorError('VALIDATION', `Combustível "${v.fuel}" sem equivalente no Chaves na Mão.`, 'Ajuste o combustível na ficha do veículo.')
  return {
    reference: p.reference, type: 'C',
    value: Math.round(p.price ?? 0),
    deposit: 0, amountPerInstallment: 0, amountOfInstallments: 0, // 0 = sem entrada/parcelamento anunciado (não inventamos condições)
    color: codes.color, gearbox: String(v.transmission ?? '').toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC', fuel,
    mileage: Math.max(0, Math.round(v.km ?? 0)), doors: v.doors ?? undefined,
    manufacturedYear: v.year ?? v.modelYear, modelYear: v.modelYear ?? v.year,
    licensePlate: normalizePlate(v.plate) || undefined, trimId: codes.trimId,
    pictures: p.photos.slice(0, spec.media.max).map((u) => ({ source: mediaUrl(u) })),
    description: t.description.slice(0, 4000), title: t.title.slice(0, 100),
  }
}

type CnmVehicle = { reference: string; active?: boolean; publication?: { highlighted?: boolean } | null; updatedAt?: string }

function toResult(v: CnmVehicle): RemoteResult {
  if (v.publication) return { state: 'PUBLICADO', remoteId: v.reference, remoteStatus: v.publication.highlighted ? 'publicado/destaque' : 'publicado' }
  return { state: 'PAUSADO', remoteId: v.reference, remoteStatus: 'sem publicação', message: 'Cadastrado, mas fora do ar (plano sem espaço ou despublicado).' }
}

async function getVehicle(ref: string, ctx: ConnectorContext): Promise<RemoteResult> {
  const res = await api(ctx, 'GET', `/vehicles/${encodeURIComponent(ref)}`)
  const err = cnmError(res, 'Consultar')
  if (err?.kind === 'NOT_FOUND' || res.status === 404) return { state: 'NAO_ENCONTRADO', remoteId: ref }
  if (err) throw err
  return toResult(res.json<CnmVehicle>()!)
}

export const chavesNaMaoConnector: Connector = {
  spec,
  async testConnection(ctx) {
    const plan = await this.limits!(ctx)
    return { ok: true, message: 'Token aceito pelo Chaves na Mão.', quota: plan }
  },
  async limits(ctx) {
    const res = await api(ctx, 'GET', '/clients/plan')
    const err = cnmError(res, 'Plano'); if (err) throw err
    return res.json<Record<string, unknown>>() ?? {}
  },
  async publish(p, ctx) {
    const codes = await resolveTrim(p, ctx)
    const res = await api(ctx, 'POST', '/vehicles', cnmBody(p, codes, ctx.mediaUrl), true)
    const err = cnmError(res, 'Publicar'); if (err) throw err
    const r = await getVehicle(p.reference, ctx)
    if (r.state === 'PAUSADO') {
      // Entrou desativado: tenta publicar; sem espaço no plano vira cota esgotada.
      const pub = await api(ctx, 'POST', `/publications/${encodeURIComponent(p.reference)}`, { highlighted: false })
      const e2 = cnmError(pub, 'Publicar')
      if (e2) throw e2.kind === 'VALIDATION' ? new ConnectorError('QUOTA', e2.message, undefined, { code: e2.code }) : e2
      return getVehicle(p.reference, ctx)
    }
    return r
  },
  get(ref: RemoteRef, ctx) { return getVehicle(ref.externalRef, ctx) },
  async findByReference(ref, _p, ctx) {
    const r = await getVehicle(ref.externalRef, ctx)
    return r.state === 'NAO_ENCONTRADO' ? null : r
  },
  async update(ref, p, ctx) {
    const codes = await resolveTrim(p, ctx)
    const res = await api(ctx, 'PUT', `/vehicles/${encodeURIComponent(ref.externalRef)}`, cnmBody(p, codes, ctx.mediaUrl))
    const err = cnmError(res, 'Atualizar'); if (err) throw err
    return getVehicle(ref.externalRef, ctx)
  },
  async pause(ref, ctx) {
    const res = await api(ctx, 'DELETE', `/publications/${encodeURIComponent(ref.externalRef)}`)
    const err = cnmError(res, 'Pausar'); if (err && err.kind !== 'NOT_FOUND') throw err
    return getVehicle(ref.externalRef, ctx)
  },
  async resume(ref, _p, ctx) {
    const res = await api(ctx, 'POST', `/publications/${encodeURIComponent(ref.externalRef)}`, { highlighted: false })
    const err = cnmError(res, 'Reativar'); if (err) throw err.kind === 'VALIDATION' ? new ConnectorError('QUOTA', err.message) : err
    return getVehicle(ref.externalRef, ctx)
  },
  async remove(ref, _reason, ctx) {
    const res = await api(ctx, 'DELETE', `/vehicles/${encodeURIComponent(ref.externalRef)}`)
    const err = cnmError(res, 'Retirar'); if (err && err.kind !== 'NOT_FOUND') throw err
    return getVehicle(ref.externalRef, ctx)
  },
}
