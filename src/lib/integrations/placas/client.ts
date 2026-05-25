// =============================================================================
// API Placas (wdapi2.com.br) — Cliente backend
//
// Endpoints suportados:
//   GET  https://wdapi2.com.br/consulta/{plate}/{token}  → dados do veículo + FIPE
//   GET  https://wdapi2.com.br/saldo/{token}             → saldo da conta
//
// Tokens carregados de IntegrationCredential (service=PLATE_LOOKUP) — sem expor
// nunca ao frontend. Resposta normalizada para PlateResult com fipeOptions e
// bestFipe (selecionado por score + tiebreakers).
//
// HTTP status conforme spec API Placas:
//   200 OK, 400 placa inválida, 401 token inválido, 402 sem saldo,
//   406 placa não encontrada, 429 rate limit
// =============================================================================

import { prisma } from '@/lib/prisma'

const DEFAULT_BASE_URL = 'https://wdapi2.com.br'
const TIMEOUT_MS       = Number(process.env.PLATE_LOOKUP_TIMEOUT_MS ?? 12000)

export interface FipeOption {
  codigoFipe:     string
  textoMarca:     string
  textoModelo:    string
  textoValor:     string
  valor:          number
  anoModelo:      number
  combustivel:    string
  mesReferencia:  string
  referenciaFipe: string
  score:          number
}

export interface PlateResult {
  success:       boolean
  httpStatus:    number
  errorMessage?: string
  plate?:        string
  brand?:        string
  model?:        string
  version?:      string
  manufactureYear?: number
  modelYear?:    number
  color?:        string
  fuel?:         string
  chassi?:       string
  city?:         string
  state?:        string
  origin?:       string
  situation?:    string
  logoUrl?:      string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?:        Record<string, any>
  fipeOptions?:  FipeOption[]
  bestFipe?:     FipeOption
}

interface CredCache {
  baseUrl: string
  token:   string | null
  expires: number
}
let CRED: CredCache | null = null

async function loadCredential(): Promise<CredCache | null> {
  if (CRED && CRED.expires > Date.now()) return CRED
  try {
    const c = await prisma.integrationCredential.findFirst({
      where: {
        service: 'PLATE_LOOKUP',
        active:  true,
        OR: [
          { apiUrl: { contains: 'wdapi' } },
          { apiUrl: { contains: 'apiplacas' } },
          { apiUrl: { equals: null } },        // fallback: token apenas
        ],
      },
      orderBy: { isDefault: 'desc' },
      select:  { apiUrl: true, apiKey: true, token: true },
    })
    if (!c) { CRED = null; return null }
    // Para wdapi2 o token é o segredo principal — aceita em token ou apiKey
    const token = (c.token ?? c.apiKey ?? '').trim() || null
    if (!token) { CRED = null; return null }
    CRED = {
      baseUrl: (c.apiUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
      token,
      expires: Date.now() + 5 * 60 * 1000,
    }
    return CRED
  } catch {
    return null
  }
}

export function clearPlacasCredentialCache(): void {
  CRED = null
}

export async function isPlacasConfigured(): Promise<boolean> {
  const c = await loadCredential()
  return !!c
}

// ── Score helpers ────────────────────────────────────────────────────────────

function parseFipeMoney(s: string): number {
  if (!s) return 0
  // "R$ 78.345,00" → 78345.00
  const cleaned = String(s).replace(/[^\d,]/g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function similarity(a: string, b: string): number {
  const A = (a ?? '').toLowerCase()
  const B = (b ?? '').toLowerCase()
  if (!A || !B) return 0
  const wordsA = A.split(/\s+/)
  let hits = 0
  for (const w of wordsA) if (w && B.includes(w)) hits++
  return hits
}

function pickBestFipe(
  options: FipeOption[],
  ctx: { brand?: string; model?: string; modelYear?: number; fuel?: string },
): FipeOption | undefined {
  if (!options.length) return undefined
  const fuelKey = (ctx.fuel ?? '').toLowerCase()
  const target  = `${ctx.brand ?? ''} ${ctx.model ?? ''}`.trim()
  const sorted = [...options].sort((a, b) => {
    // 1) Score desc
    if (b.score !== a.score) return b.score - a.score
    // 2) Ano modelo bate
    const ay = (ctx.modelYear && a.anoModelo === ctx.modelYear) ? 1 : 0
    const by = (ctx.modelYear && b.anoModelo === ctx.modelYear) ? 1 : 0
    if (ay !== by) return by - ay
    // 3) Combustível bate
    const af = (fuelKey && (a.combustivel ?? '').toLowerCase().includes(fuelKey)) ? 1 : 0
    const bf = (fuelKey && (b.combustivel ?? '').toLowerCase().includes(fuelKey)) ? 1 : 0
    if (af !== bf) return bf - af
    // 4) Similaridade textual com brand+model
    const as = similarity(target, `${a.textoMarca} ${a.textoModelo}`)
    const bs = similarity(target, `${b.textoMarca} ${b.textoModelo}`)
    return bs - as
  })
  return sorted[0]
}

// ── Consulta principal ──────────────────────────────────────────────────────

export async function consultPlate(plateRaw: string): Promise<PlateResult> {
  const cred = await loadCredential()
  if (!cred) {
    return {
      success: false,
      httpStatus: 503,
      errorMessage: 'Integração API Placas não configurada. Configure em /master/integrations.',
    }
  }
  const plate = String(plateRaw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (plate.length < 6) {
    return { success: false, httpStatus: 400, errorMessage: 'Placa inválida.' }
  }

  const url = `${cred.baseUrl}/consulta/${plate}/${cred.token}`
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'AutoDrive/1.0' },
      next:    { revalidate: 0 },
    })

    if (res.status === 401) return { success: false, httpStatus: 401, errorMessage: 'Token API Placas inválido.' }
    if (res.status === 402) return { success: false, httpStatus: 402, errorMessage: 'Sem saldo na API Placas.' }
    if (res.status === 406) return { success: false, httpStatus: 406, errorMessage: 'Placa não encontrada.' }
    if (res.status === 429) return { success: false, httpStatus: 429, errorMessage: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }
    if (res.status === 400) return { success: false, httpStatus: 400, errorMessage: 'Placa inválida ou requisição malformada.' }

    if (!res.ok) {
      return { success: false, httpStatus: res.status, errorMessage: `API Placas retornou HTTP ${res.status}.` }
    }

    const d = (await res.json()) as Record<string, unknown>

    // ── Normalização de campos do veículo ──────────────────────────────────
    const brand = pickStr(d, ['MARCA', 'marca', 'brand'])
    const model = pickStr(d, ['MODELO', 'modelo', 'model'])
    const version = pickStr(d, ['SUBMODELO', 'submodelo', 'version'])

    // ── Normalização de FIPE options ───────────────────────────────────────
    const rawFipe = ((d as { fipe?: { dados?: unknown[] } }).fipe?.dados ?? []) as unknown[]
    const fipeOptions: FipeOption[] = rawFipe.map((row) => {
      const r = row as Record<string, unknown>
      const textoValor = String(r.texto_valor ?? r.textoValor ?? '')
      return {
        codigoFipe:     String(r.codigo_fipe     ?? r.codigoFipe     ?? ''),
        textoMarca:     String(r.texto_marca     ?? r.textoMarca     ?? ''),
        textoModelo:    String(r.texto_modelo    ?? r.textoModelo    ?? ''),
        textoValor,
        valor:          parseFipeMoney(textoValor),
        anoModelo:      Number(r.ano_modelo      ?? r.anoModelo      ?? 0) || 0,
        combustivel:    String(r.combustivel     ?? ''),
        mesReferencia:  String(r.mes_referencia  ?? r.mesReferencia  ?? ''),
        referenciaFipe: String(r.referencia_fipe ?? r.referenciaFipe ?? ''),
        score:          Number(r.score ?? 0) || 0,
      }
    }).filter((f) => f.codigoFipe)

    const modelYear = pickNum(d, ['ano', 'anoModelo', 'ano_modelo'])
    const manufactureYear = pickNum(d, ['anoModelo', 'ano']) ?? modelYear
    const fuel = pickStr(d, ['combustivel', 'fuel'])

    const bestFipe = pickBestFipe(fipeOptions, { brand, model, modelYear, fuel })

    return {
      success: true,
      httpStatus: 200,
      plate,
      brand,
      model,
      version,
      manufactureYear,
      modelYear,
      color:       pickStr(d, ['cor', 'color']),
      fuel,
      chassi:      pickStr(d, ['chassi', 'chassis']),
      city:        pickStr(d, ['municipio', 'cidade']),
      state:       pickStr(d, ['uf', 'estado']),
      origin:      pickStr(d, ['origem']),
      situation:   pickStr(d, ['situacao']),
      logoUrl:     pickStr(d, ['logo']),
      extra:       d as Record<string, unknown>,
      fipeOptions,
      bestFipe,
    }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { success: false, httpStatus: 408, errorMessage: 'Tempo limite excedido na consulta de placa.' }
    }
    return { success: false, httpStatus: 502, errorMessage: 'API Placas indisponível.' }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Saldo ────────────────────────────────────────────────────────────────────

export interface BalanceResult {
  success:       boolean
  httpStatus:    number
  errorMessage?: string
  balance?:      number
  raw?:          unknown
}

export async function getBalance(): Promise<BalanceResult> {
  const cred = await loadCredential()
  if (!cred) {
    return { success: false, httpStatus: 503, errorMessage: 'Integração API Placas não configurada.' }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${cred.baseUrl}/saldo/${cred.token}`, {
      signal:  controller.signal,
      headers: { Accept: 'application/json' },
      next:    { revalidate: 0 },
    })
    if (res.status === 401) return { success: false, httpStatus: 401, errorMessage: 'Token API Placas inválido.' }
    if (!res.ok) return { success: false, httpStatus: res.status, errorMessage: `HTTP ${res.status}` }
    const d = await res.json()
    const balance = Number((d as { saldo?: unknown }).saldo ?? (d as { balance?: unknown }).balance ?? 0)
    return { success: true, httpStatus: 200, balance: Number.isFinite(balance) ? balance : 0, raw: d }
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { success: false, httpStatus: 408, errorMessage: 'Timeout no saldo.' }
    }
    return { success: false, httpStatus: 502, errorMessage: 'API Placas indisponível.' }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Helpers internos ────────────────────────────────────────────────────────

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v, 10)
  }
  return undefined
}
