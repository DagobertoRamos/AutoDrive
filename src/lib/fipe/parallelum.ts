// =============================================================================
// FIPE — Service Central (Provider: Parallelum / Fipe Online)
//
// Documentação: https://fipe.parallelum.com.br
// Base URL:     https://fipe.parallelum.com.br/api/v2
// Header obrigatório: X-Subscription-Token
//
// Resolução do token (em ordem):
//   1) IntegrationCredential ativo com service='FIPE_PROVIDER' e isDefault=true
//   2) process.env.FIPE_SUBSCRIPTION_TOKEN  (dev local)
//   3) process.env.FIPE_API_KEY              (alias alternativo)
//
// Cache: PostgreSQL via model FipeCache (best-effort) + cache em memória
// como fallback caso a migration ainda não tenha rodado.
//
// SEGURANÇA:
// - O token NUNCA é retornado em respostas
// - Logs não incluem o token
// - Frontend NUNCA chama Parallelum direto (só via /api/integrations/fipe/*)
// =============================================================================

import { prisma } from '@/lib/prisma'
import { getActiveIntegrationCredential } from '@/lib/integrations/active'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface FipeResult<T> {
  ok:       boolean
  data?:    T
  error?:   string
  details?: string             // detalhes técnicos (apenas dev)
  source:   'parallelum' | 'cache'
}

export interface FipeReference  { code: string; month: string }
export interface FipeBrand      { code: string; name: string }
export interface FipeModel      { code: string; name: string }
export interface FipeYear       { code: string; name: string }
export interface FipePrice {
  brand:           string
  codeFipe:        string
  fuel:            string
  fuelAcronym:     string
  model:           string
  modelYear:       number
  price:           string
  referenceMonth:  string
  vehicleType:     number
}

export type TipoVeiculoBR = 'carros' | 'motos' | 'caminhoes' | 'caminhões'
export type TipoVeiculoApi = 'cars'   | 'motorcycles' | 'trucks'

// ── Normalização de tipo de veículo ──────────────────────────────────────────

const TIPO_MAP: Record<string, TipoVeiculoApi> = {
  carros:       'cars',
  carro:        'cars',
  cars:         'cars',
  car:          'cars',
  motos:        'motorcycles',
  moto:         'motorcycles',
  motorcycles:  'motorcycles',
  motorcycle:   'motorcycles',
  caminhoes:    'trucks',
  caminhões:    'trucks',
  caminhao:     'trucks',
  caminhão:     'trucks',
  trucks:       'trucks',
  truck:        'trucks',
}
export function normalizeTipoVeiculo(t: string): TipoVeiculoApi | null {
  const k = String(t ?? '').trim().toLowerCase()
  return TIPO_MAP[k] ?? null
}

// ── Configuração (token + base url) ───────────────────────────────────────────

const DEFAULT_BASE = 'https://fipe.parallelum.com.br/api/v2'
const TIMEOUT_MS   = Number(process.env.FIPE_TIMEOUT_MS ?? 12000)

interface ResolvedConfig { baseUrl: string; token: string | null }
let cachedCfg:   ResolvedConfig | null = null
let cachedCfgAt: number                = 0
const CFG_TTL_MS = 5 * 60 * 1000

async function resolveConfig(): Promise<ResolvedConfig> {
  const now = Date.now()
  if (cachedCfg && now - cachedCfgAt < CFG_TTL_MS) return cachedCfg

  // Padrão: env como fallback. Em produção SaaS a credencial vem do DB.
  let baseUrl = process.env.FIPE_BASE_URL || DEFAULT_BASE
  let token   = process.env.FIPE_SUBSCRIPTION_TOKEN
              || process.env.FIPE_API_KEY
              || null

  try {
    // Aceita FIPE_PROVIDER (novo, padrão) ou FIPE (legado).
    const cred = await getActiveIntegrationCredential(['FIPE_PROVIDER', 'FIPE'])
    if (cred) {
      if (cred.apiUrl?.trim()) baseUrl = cred.apiUrl.trim()
      // apiKey guarda o "X-Subscription-Token" no painel. Fallback: token livre.
      if (cred.apiKey?.trim()) token = cred.apiKey.trim()
      else if (cred.token?.trim()) token = cred.token.trim()
    }
  } catch { /* mantém env */ }

  cachedCfg   = { baseUrl: baseUrl.replace(/\/+$/, ''), token }
  cachedCfgAt = now
  return cachedCfg
}

/** Limpa o cache da configuração (após alteração da credencial). */
export function clearFipeConfigCache(): void {
  cachedCfg = null
  cachedCfgAt = 0
}

// ── Cache em memória (fallback se FipeCache table indisponível) ──────────────

interface MemEntry<T> { value: T; expires: number }
const MEM = new Map<string, MemEntry<unknown>>()
function memGet<T>(key: string): T | null {
  const h = MEM.get(key) as MemEntry<T> | undefined
  if (!h) return null
  if (h.expires <= Date.now()) { MEM.delete(key); return null }
  return h.value
}
function memSet<T>(key: string, value: T, ttlMs: number): void {
  MEM.set(key, { value, expires: Date.now() + ttlMs })
}

// ── Cache no PostgreSQL via model FipeCache (best-effort) ────────────────────

interface CacheLookup { endpoint: string; cacheKey: string; ttlMs: number }
interface CacheMeta {
  vehicleType?: string | null
  brandId?:     string | null
  modelId?:     string | null
  yearId?:      string | null
  codeFipe?:    string | null
  reference?:   string | null
}

async function dbGet<T>(key: string): Promise<T | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).fipeCache.findUnique({
      where:  { cacheKey: key },
      select: { data: true, expiresAt: true },
    })
    if (!row) return null
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) return null
    return row.data as T
  } catch { return null }
}

async function dbSet<T>(opts: CacheLookup & CacheMeta, data: T): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).fipeCache.upsert({
      where:  { cacheKey: opts.cacheKey },
      update: {
        provider:   'parallelum',
        endpoint:   opts.endpoint,
        vehicleType: opts.vehicleType ?? null,
        brandId:    opts.brandId    ?? null,
        modelId:    opts.modelId    ?? null,
        yearId:     opts.yearId     ?? null,
        codeFipe:   opts.codeFipe   ?? null,
        reference:  opts.reference  ?? null,
        data:       data as object,
        expiresAt:  new Date(Date.now() + opts.ttlMs),
      },
      create: {
        provider:   'parallelum',
        endpoint:   opts.endpoint,
        cacheKey:   opts.cacheKey,
        vehicleType: opts.vehicleType ?? null,
        brandId:    opts.brandId    ?? null,
        modelId:    opts.modelId    ?? null,
        yearId:     opts.yearId     ?? null,
        codeFipe:   opts.codeFipe   ?? null,
        reference:  opts.reference  ?? null,
        data:       data as object,
        expiresAt:  new Date(Date.now() + opts.ttlMs),
      },
    })
  } catch { /* tabela ainda não existe — silent */ }
}

async function withCache<T>(
  opts: CacheLookup & CacheMeta & { refresh?: boolean },
  fetcher: () => Promise<FipeResult<T>>,
): Promise<FipeResult<T>> {
  if (!opts.refresh) {
    const mem = memGet<T>(opts.cacheKey)
    if (mem) return { ok: true, data: mem, source: 'cache' }
    const db = await dbGet<T>(opts.cacheKey)
    if (db)  { memSet(opts.cacheKey, db, opts.ttlMs); return { ok: true, data: db, source: 'cache' } }
  }
  const result = await fetcher()
  if (result.ok && result.data) {
    memSet(opts.cacheKey, result.data, opts.ttlMs)
    void dbSet(opts, result.data)
  }
  return result
}

/** Limpa todo o cache em memória do FIPE. DB precisa ser limpo via SQL. */
export function clearFipeMemoryCache(): void {
  MEM.clear()
}

// ── HTTP helper (token NUNCA aparece em logs ou retorno) ─────────────────────

async function http<T>(path: string): Promise<FipeResult<T>> {
  const { baseUrl, token } = await resolveConfig()
  if (!token) {
    return {
      ok: false, source: 'parallelum',
      error: 'Integração FIPE/Parallelum não configurada. Cadastre o token em /master/integrations.',
    }
  }
  const url = `${baseUrl}${path}`
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: {
        Accept:                 'application/json',
        'X-Subscription-Token': token,
        'User-Agent':           'AutoDrive/1.0',
      },
      next: { revalidate: 0 },
    })
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false, source: 'parallelum',
        error: 'Token FIPE/Parallelum inválido ou sem permissão. Verifique a credencial.',
      }
    }
    if (res.status === 404) {
      return { ok: false, source: 'parallelum', error: 'Recurso FIPE não encontrado.' }
    }
    if (res.status === 429) {
      return { ok: false, source: 'parallelum', error: 'Limite de consultas FIPE atingido. Tente novamente em breve.' }
    }
    if (!res.ok) {
      return { ok: false, source: 'parallelum', error: `FIPE/Parallelum retornou erro ${res.status}.` }
    }
    const data = (await res.json()) as T
    return { ok: true, source: 'parallelum', data }
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name
    if (name === 'AbortError') {
      return { ok: false, source: 'parallelum', error: 'Tempo limite de consulta FIPE excedido.' }
    }
    const msg = err instanceof Error ? err.message : 'erro desconhecido'
    return {
      ok: false, source: 'parallelum',
      error: 'FIPE/Parallelum indisponível neste momento.',
      details: process.env.NODE_ENV !== 'production' ? msg : undefined,
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ── TTLs por endpoint ────────────────────────────────────────────────────────

const TTL = {
  references: 24 * 60 * 60 * 1000, // 24h
  brands:     24 * 60 * 60 * 1000,
  models:     24 * 60 * 60 * 1000,
  years:      24 * 60 * 60 * 1000,
  price:      12 * 60 * 60 * 1000, // 12h
  code:       12 * 60 * 60 * 1000,
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export async function getReferences(refresh = false): Promise<FipeResult<FipeReference[]>> {
  return withCache(
    { endpoint: 'references', cacheKey: 'fipe:refs', ttlMs: TTL.references, refresh },
    () => http<FipeReference[]>('/references'),
  )
}

export async function getBrands(
  tipoBr: TipoVeiculoBR | string,
  refresh = false,
): Promise<FipeResult<FipeBrand[]>> {
  const tipo = normalizeTipoVeiculo(tipoBr)
  if (!tipo) return { ok: false, source: 'parallelum', error: 'Tipo de veículo inválido.' }
  return withCache(
    {
      endpoint:    'brands',
      cacheKey:    `fipe:brands:${tipo}`,
      vehicleType: tipo,
      ttlMs:       TTL.brands,
      refresh,
    },
    () => http<FipeBrand[]>(`/${tipo}/brands`),
  )
}

export async function getModels(
  tipoBr: TipoVeiculoBR | string,
  brandId: string,
  refresh = false,
): Promise<FipeResult<FipeModel[]>> {
  const tipo = normalizeTipoVeiculo(tipoBr)
  if (!tipo)    return { ok: false, source: 'parallelum', error: 'Tipo de veículo inválido.' }
  if (!brandId) return { ok: false, source: 'parallelum', error: 'brandId é obrigatório.' }
  return withCache(
    {
      endpoint:    'models',
      cacheKey:    `fipe:models:${tipo}:${brandId}`,
      vehicleType: tipo, brandId,
      ttlMs:       TTL.models, refresh,
    },
    () => http<FipeModel[]>(`/${tipo}/brands/${encodeURIComponent(brandId)}/models`),
  )
}

export async function getYears(
  tipoBr: TipoVeiculoBR | string,
  brandId: string,
  modelId: string,
  refresh = false,
): Promise<FipeResult<FipeYear[]>> {
  const tipo = normalizeTipoVeiculo(tipoBr)
  if (!tipo)    return { ok: false, source: 'parallelum', error: 'Tipo de veículo inválido.' }
  if (!brandId || !modelId)
    return { ok: false, source: 'parallelum', error: 'brandId e modelId são obrigatórios.' }
  return withCache(
    {
      endpoint:    'years',
      cacheKey:    `fipe:years:${tipo}:${brandId}:${modelId}`,
      vehicleType: tipo, brandId, modelId,
      ttlMs:       TTL.years, refresh,
    },
    () => http<FipeYear[]>(`/${tipo}/brands/${brandId}/models/${modelId}/years`),
  )
}

export async function getPrice(
  tipoBr: TipoVeiculoBR | string,
  brandId: string,
  modelId: string,
  yearId:  string,
  refresh = false,
): Promise<FipeResult<FipePrice>> {
  const tipo = normalizeTipoVeiculo(tipoBr)
  if (!tipo)    return { ok: false, source: 'parallelum', error: 'Tipo de veículo inválido.' }
  if (!brandId || !modelId || !yearId)
    return { ok: false, source: 'parallelum', error: 'brandId, modelId e yearId são obrigatórios.' }
  return withCache(
    {
      endpoint:    'price',
      cacheKey:    `fipe:price:${tipo}:${brandId}:${modelId}:${yearId}`,
      vehicleType: tipo, brandId, modelId, yearId,
      ttlMs:       TTL.price, refresh,
    },
    () => http<FipePrice>(`/${tipo}/brands/${brandId}/models/${modelId}/years/${encodeURIComponent(yearId)}`),
  )
}

/** Busca preço por código FIPE diretamente (sem navegar marcas/modelos). */
export async function getPriceByCode(
  codeFipe: string,
  refresh = false,
): Promise<FipeResult<FipePrice[]>> {
  const code = String(codeFipe ?? '').trim()
  if (!code) return { ok: false, source: 'parallelum', error: 'codeFipe é obrigatório.' }
  return withCache(
    {
      endpoint: 'priceByCode',
      cacheKey: `fipe:priceByCode:${code}`,
      codeFipe: code,
      ttlMs:    TTL.code, refresh,
    },
    () => http<FipePrice[]>(`/cars/${encodeURIComponent(code)}/years`),
  )
}
