// =============================================================================
// BrasilAPI — Service Central
//
// Funções:
//   - getCep(cep)
//   - getCnpj(cnpj)
//   - getBanks()
//   - getBankByCode(code)
//   - getFipeTables()
//   - getFipeBrands(tipoVeiculo, tabelaReferencia?)
//   - getFipeVehicles(tipoVeiculo, codigoMarca, tabelaReferencia?)
//   - getFipePrice(codigoFipe, tabelaReferencia?)
//
// A URL base é lida de:
//   1. IntegrationCredential ativo com service=BRASILAPI (preferência)
//   2. process.env.BRASILAPI_URL
//   3. Default público https://brasilapi.com.br/api
//
// Cache em memória:
//   - bancos: 24h
//   - tabelas FIPE: 24h
//   - marcas FIPE: 24h por tipo+tabela
//   - veículos FIPE: 6h por tipo+marca+tabela
//   - preço FIPE: 1h por código+tabela
//   - CEP: 30 min por código
//   - CNPJ: 1h por documento
//
// Todas as funções nunca lançam exceção — sempre retornam um objeto
// `{ ok: boolean; data?: T; error?: string; source: 'brasilapi' | 'cache' }`.
// =============================================================================

import { prisma } from '@/lib/prisma'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface BrasilApiResult<T> {
  ok:     boolean
  data?:  T
  error?: string
  source: 'brasilapi' | 'cache' | 'fallback'
}

export interface CepData {
  cep:         string
  state:       string
  city:        string
  neighborhood:string
  street:      string
  complement?: string
  coordinates?: { latitude: string; longitude: string }
}

export interface CnpjData {
  cnpj:                          string
  razao_social:                  string
  nome_fantasia?:                string
  email?:                        string
  ddd_telefone_1?:               string
  ddd_telefone_2?:               string
  cep?:                          string
  logradouro?:                   string
  numero?:                       string
  complemento?:                  string
  bairro?:                       string
  municipio?:                    string
  uf?:                           string
  descricao_situacao_cadastral?: string
  cnae_fiscal_descricao?:        string
  natureza_juridica?:            string
  qsa?:                          Array<{
    nome_socio?:                       string
    cnpj_cpf_do_socio?:                string
    qualificacao_socio?:               string
    data_entrada_sociedade?:           string
  }>
  data_inicio_atividade?:        string
}

export interface BankData {
  ispb:     string
  name:     string
  code:     number | null
  fullName: string
}

export interface FipeTableData {
  codigo: number
  mes:    string
}

export interface FipeBrandData {
  nome:  string
  valor: string
}

export interface FipeVehicleData {
  modelo:    string
  valor:     string
  // Em alguns retornos vem com codigo, anoModelo etc
  [k: string]: unknown
}

export interface FipePriceData {
  valor:           string
  marca:           string
  modelo:          string
  anoModelo:       number
  combustivel:     string
  codigoFipe:      string
  mesReferencia:   string
  tipoVeiculo:     number
  siglaCombustivel:string
  dataConsulta:    string
}

export type TipoVeiculoFipe = 'carros' | 'motos' | 'caminhoes'

// ── Configuração ──────────────────────────────────────────────────────────────

const DEFAULT_BASE = 'https://brasilapi.com.br/api'
const TIMEOUT_MS   = Number(process.env.BRASILAPI_TIMEOUT_MS ?? 8000)

// Resolve a URL base. Prioriza IntegrationCredential ativo, depois env, depois default.
let cachedBaseUrl:    string | null = null
let cachedBaseUrlAt:  number        = 0
const BASE_URL_TTL_MS = 5 * 60 * 1000 // 5 min

/**
 * Normaliza a URL para sempre terminar em "/api" (sem barra final).
 * Aceita tanto "https://brasilapi.com.br" quanto "https://brasilapi.com.br/api"
 * vindos do painel ou de env. Rejeita URLs que claramente não são da BrasilAPI
 * (proteção extra além do validador do catálogo).
 */
function normalizeBrasilApiUrl(rawUrl: string): string {
  let url = rawUrl.trim().replace(/\/+$/, '')
  // Validação defensiva: se vier URL não-brasilapi (PlacaFipe, etc), ignora.
  if (!/brasilapi\.com\.br/i.test(url)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[brasilapi] URL configurada "${url}" não é da BrasilAPI. Caindo no default.`)
    }
    url = DEFAULT_BASE.replace(/\/+$/, '')
  }
  // Garante o sufixo /api
  if (!/\/api$/.test(url)) url += '/api'
  return url
}

async function getBaseUrl(): Promise<string> {
  const now = Date.now()
  if (cachedBaseUrl && now - cachedBaseUrlAt < BASE_URL_TTL_MS) {
    return cachedBaseUrl
  }
  let raw = ''
  try {
    const cred = await prisma.integrationCredential.findFirst({
      where:  { service: 'BRASILAPI', active: true },
      orderBy: { isDefault: 'desc' },
      select: { apiUrl: true },
    })
    raw = cred?.apiUrl?.trim() || process.env.BRASILAPI_URL || DEFAULT_BASE
  } catch {
    raw = process.env.BRASILAPI_URL || DEFAULT_BASE
  }
  cachedBaseUrl   = normalizeBrasilApiUrl(raw)
  cachedBaseUrlAt = now
  return cachedBaseUrl
}

// ── Cache em memória genérico ────────────────────────────────────────────────

interface CacheEntry<T> { value: T; expires: number }
const CACHE = new Map<string, CacheEntry<unknown>>()

function getCache<T>(key: string): T | null {
  const hit = CACHE.get(key) as CacheEntry<T> | undefined
  if (!hit) return null
  if (hit.expires <= Date.now()) {
    CACHE.delete(key)
    return null
  }
  return hit.value
}
function setCache<T>(key: string, value: T, ttlMs: number): void {
  CACHE.set(key, { value, expires: Date.now() + ttlMs })
}

/** Limpa todo o cache do serviço. Útil para botão "Atualizar bancos" do MASTER. */
export function clearBrasilApiCache(): void {
  CACHE.clear()
  cachedBaseUrl   = null
  cachedBaseUrlAt = 0
}

// ── HTTP helper com timeout e erros normalizados ─────────────────────────────

async function http<T>(path: string): Promise<BrasilApiResult<T>> {
  const base = await getBaseUrl()
  const url  = `${base}${path}`
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'AutoDrive/1.0' },
      next:    { revalidate: 0 },
    })
    if (res.status === 404) {
      return { ok: false, source: 'brasilapi', error: 'Recurso não encontrado.' }
    }
    if (res.status === 429) {
      return { ok: false, source: 'brasilapi', error: 'Limite de consultas atingido. Tente novamente em alguns segundos.' }
    }
    if (!res.ok) {
      return { ok: false, source: 'brasilapi', error: `BrasilAPI retornou erro ${res.status}.` }
    }
    const data = (await res.json()) as T
    return { ok: true, source: 'brasilapi', data }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { ok: false, source: 'brasilapi', error: 'Tempo limite de consulta excedido.' }
    }
    return { ok: false, source: 'brasilapi', error: 'BrasilAPI indisponível neste momento.' }
  } finally {
    clearTimeout(timeout)
  }
}

// ── CEP ───────────────────────────────────────────────────────────────────────

export async function getCep(cepRaw: string): Promise<BrasilApiResult<CepData>> {
  const cep = String(cepRaw).replace(/\D/g, '')
  if (cep.length !== 8) {
    return { ok: false, source: 'brasilapi', error: 'CEP inválido.' }
  }
  const key = `cep:${cep}`
  const hit = getCache<CepData>(key)
  if (hit) return { ok: true, source: 'cache', data: hit }

  // v2 retorna coordenadas, fallback v1
  let res = await http<CepData>(`/cep/v2/${cep}`)
  if (!res.ok) res = await http<CepData>(`/cep/v1/${cep}`)
  if (res.ok && res.data) setCache(key, res.data, 30 * 60 * 1000)
  return res
}

// ── CNPJ ──────────────────────────────────────────────────────────────────────

export async function getCnpj(cnpjRaw: string): Promise<BrasilApiResult<CnpjData>> {
  const cnpj = String(cnpjRaw).replace(/\D/g, '')
  if (cnpj.length !== 14) {
    return { ok: false, source: 'brasilapi', error: 'CNPJ inválido.' }
  }
  const key = `cnpj:${cnpj}`
  const hit = getCache<CnpjData>(key)
  if (hit) return { ok: true, source: 'cache', data: hit }

  const res = await http<CnpjData>(`/cnpj/v1/${cnpj}`)
  if (res.ok && res.data) setCache(key, res.data, 60 * 60 * 1000)
  return res
}

// ── Bancos ────────────────────────────────────────────────────────────────────

/**
 * Lista todos os bancos. Estratégia:
 *   1) Cache em memória (24h).
 *   2) Tabela Bank persistente (sobrevive a restart). Se vazia ou indisponível,
 *      consulta a BrasilAPI e faz write-through.
 *
 * A tabela Bank é opcional — se a migration ainda não foi aplicada, o caminho
 * via DB falha silenciosamente e mantemos o comportamento original (memória +
 * BrasilAPI direto).
 */
export async function getBanks(): Promise<BrasilApiResult<BankData[]>> {
  const key = 'banks:all'
  const hit = getCache<BankData[]>(key)
  if (hit) return { ok: true, source: 'cache', data: hit }

  // 1) Tenta ler da tabela persistente (best-effort)
  const fromDb = await readBanksFromDb()
  if (fromDb && fromDb.length > 0) {
    setCache(key, fromDb, 24 * 60 * 60 * 1000)
    return { ok: true, source: 'cache', data: fromDb }
  }

  // 2) Consulta a BrasilAPI
  const res = await http<BankData[]>(`/banks/v1`)
  if (res.ok && res.data) {
    const cleaned = res.data
      .filter((b) => b && (b.code != null || b.ispb))
      .sort((a, b) => (a.code ?? 9999) - (b.code ?? 9999))
    setCache(key, cleaned, 24 * 60 * 60 * 1000)
    // Write-through best-effort — não bloqueia se a tabela ainda não existe
    void writeBanksToDb(cleaned)
    return { ok: true, source: 'brasilapi', data: cleaned }
  }
  return res
}

// ── Persistência best-effort em tabela Bank ──────────────────────────────────
// Usa cast `as any` porque o cliente Prisma pode estar desatualizado se a
// migration `add_bank_catalog` ainda não tiver sido executada.

async function readBanksFromDb(): Promise<BankData[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: Array<{ ispb: string; name: string; code: number | null; fullName: string | null }> =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).bank.findMany({
        where:   { active: true },
        orderBy: [{ code: 'asc' }],
        select:  { ispb: true, name: true, code: true, fullName: true },
      })
    if (!Array.isArray(rows) || rows.length === 0) return null
    return rows.map((r) => ({
      ispb:     r.ispb,
      name:     r.name,
      code:     r.code,
      fullName: r.fullName ?? r.name,
    }))
  } catch {
    return null
  }
}

async function writeBanksToDb(list: BankData[]): Promise<void> {
  try {
    // upsert em paralelo limitado para evitar rajada de conexões
    const chunkSize = 25
    for (let i = 0; i < list.length; i += chunkSize) {
      const chunk = list.slice(i, i + chunkSize)
      await Promise.all(chunk.map((b) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).bank.upsert({
          where:  { ispb: b.ispb },
          update: { code: b.code ?? null, name: b.name, fullName: b.fullName ?? b.name, active: true, fetchedAt: new Date() },
          create: { ispb: b.ispb, code: b.code ?? null, name: b.name, fullName: b.fullName ?? b.name, active: true },
        }).catch(() => { /* tolera duplicatas */ }),
      ))
    }
  } catch {
    /* silently ignore — fallback é cache em memória */
  }
}

export async function getBankByCode(code: string | number): Promise<BrasilApiResult<BankData>> {
  const c = String(code).trim()
  if (!c) return { ok: false, source: 'brasilapi', error: 'Código do banco é obrigatório.' }
  const key = `bank:${c}`
  const hit = getCache<BankData>(key)
  if (hit) return { ok: true, source: 'cache', data: hit }

  const res = await http<BankData>(`/banks/v1/${c}`)
  if (res.ok && res.data) setCache(key, res.data, 24 * 60 * 60 * 1000)
  return res
}

// ── FIPE ──────────────────────────────────────────────────────────────────────

export async function getFipeTables(): Promise<BrasilApiResult<FipeTableData[]>> {
  const key = 'fipe:tables'
  const hit = getCache<FipeTableData[]>(key)
  if (hit) return { ok: true, source: 'cache', data: hit }
  const res = await http<FipeTableData[]>(`/fipe/tabelas/v1`)
  if (res.ok && res.data) setCache(key, res.data, 24 * 60 * 60 * 1000)
  return res
}

export async function getFipeBrands(
  tipoVeiculo: TipoVeiculoFipe,
  tabelaReferencia?: number | string,
): Promise<BrasilApiResult<FipeBrandData[]>> {
  if (!['carros', 'motos', 'caminhoes'].includes(tipoVeiculo)) {
    return { ok: false, source: 'brasilapi', error: 'Tipo de veículo inválido.' }
  }
  const tabQs = tabelaReferencia ? `?tabela_referencia=${tabelaReferencia}` : ''
  const key   = `fipe:brands:${tipoVeiculo}:${tabelaReferencia ?? 'latest'}`
  const hit   = getCache<FipeBrandData[]>(key)
  if (hit) return { ok: true, source: 'cache', data: hit }

  const res = await http<FipeBrandData[]>(`/fipe/marcas/v1/${tipoVeiculo}${tabQs}`)
  if (res.ok && res.data) setCache(key, res.data, 24 * 60 * 60 * 1000)
  return res
}

export async function getFipeVehicles(
  tipoVeiculo: TipoVeiculoFipe,
  codigoMarca: string | number,
  tabelaReferencia?: number | string,
): Promise<BrasilApiResult<FipeVehicleData[]>> {
  if (!['carros', 'motos', 'caminhoes'].includes(tipoVeiculo)) {
    return { ok: false, source: 'brasilapi', error: 'Tipo de veículo inválido.' }
  }
  if (!codigoMarca) {
    return { ok: false, source: 'brasilapi', error: 'Código da marca é obrigatório.' }
  }
  const tabQs = tabelaReferencia ? `?tabela_referencia=${tabelaReferencia}` : ''
  const key   = `fipe:vehicles:${tipoVeiculo}:${codigoMarca}:${tabelaReferencia ?? 'latest'}`
  const hit   = getCache<FipeVehicleData[]>(key)
  if (hit) return { ok: true, source: 'cache', data: hit }

  const res = await http<FipeVehicleData[]>(`/fipe/veiculos/v1/${tipoVeiculo}/${codigoMarca}${tabQs}`)
  if (res.ok && res.data) setCache(key, res.data, 6 * 60 * 60 * 1000)
  return res
}

export async function getFipePrice(
  codigoFipe: string,
  tabelaReferencia?: number | string,
): Promise<BrasilApiResult<FipePriceData[]>> {
  if (!codigoFipe) {
    return { ok: false, source: 'brasilapi', error: 'Código FIPE é obrigatório.' }
  }
  const tabQs = tabelaReferencia ? `?tabela_referencia=${tabelaReferencia}` : ''
  const key   = `fipe:price:${codigoFipe}:${tabelaReferencia ?? 'latest'}`
  const hit   = getCache<FipePriceData[]>(key)
  if (hit) return { ok: true, source: 'cache', data: hit }

  const res = await http<FipePriceData[]>(`/fipe/preco/v1/${codigoFipe}${tabQs}`)
  if (res.ok && res.data) setCache(key, res.data, 60 * 60 * 1000)
  return res
}
