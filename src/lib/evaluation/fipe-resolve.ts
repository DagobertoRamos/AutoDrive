// =============================================================================
// Busca a FIPE de uma avaliação pelo que ela já tem (marca, modelo, versão,
// ano modelo, combustível) navegando o catálogo Parallelum:
//   marca → modelo/versão → ano-combustível → preço.
// Quando a versão ou o ano-combustível é ambíguo, devolve as opções para o
// usuário escolher (status 'choose') em vez de chutar.
// =============================================================================

import { getBrands, getModels, getYears, getPrice } from '@/lib/fipe/parallelum'
import {
  normalizeBrandName, normalizeModelName, tokenizeVehicleName, bestFipeMatch, topFipeMatches, pickFipeYear, parseFipePrice,
} from './fipe-match'

export interface FipeOptionChoice {
  tipo:      string
  brandId:   string
  modelId:   string
  yearId:    string
  label:     string   // "TIIDA S 1.8 Flex 16V Aut. · 2013 Flex"
}

export interface FipeFound {
  fipeCode:  string
  fipeValue: number
  month:     string
  label:     string
}

export type FipeResolveResult =
  | { status: 'found'; fipe: FipeFound }
  | { status: 'choose'; options: FipeOptionChoice[] }
  | { status: 'not_found'; reason: string }

export interface FipeResolveInput {
  vehicleType?:     string | null
  brand?:           string | null
  model?:           string | null
  version?:         string | null
  modelYear?:       number | null
  manufactureYear?: number | null
  fuel?:            string | null
}

export function tipoFromVehicleType(vt: string | null | undefined): 'carros' | 'motos' | 'caminhoes' {
  const v = String(vt ?? '').toUpperCase()
  if (v === 'MOTORCYCLE' || v === 'MOTO' || v === 'MOTOS') return 'motos'
  if (v === 'TRUCK' || v === 'CAMINHAO' || v === 'CAMINHOES') return 'caminhoes'
  return 'carros'
}

/** Preço de uma opção escolhida (marca/modelo/ano FIPE). */
export async function fetchFipePrice(o: Omit<FipeOptionChoice, 'label'>): Promise<FipeFound | null> {
  const r = await getPrice(o.tipo, o.brandId, o.modelId, o.yearId)
  if (!r.ok || !r.data) return null
  const value = parseFipePrice(r.data.price)
  if (!value || !r.data.codeFipe) return null
  return {
    fipeCode: r.data.codeFipe,
    fipeValue: value,
    month: (r.data.referenceMonth ?? '').trim(),
    label: `${r.data.model} · ${r.data.modelYear}`,
  }
}

const MAX_MODEL_CANDIDATES = 4
const MAX_BASE_CANDIDATES  = 12
const MAX_OPTIONS          = 12

export async function resolveFipe(input: FipeResolveInput): Promise<FipeResolveResult> {
  const year = input.modelYear ?? input.manufactureYear ?? null
  if (!input.brand || !input.model) return { status: 'not_found', reason: 'Sem marca/modelo.' }
  if (!year) return { status: 'not_found', reason: 'Sem ano modelo.' }
  const tipo = tipoFromVehicleType(input.vehicleType)

  const brands = await getBrands(tipo)
  if (!brands.ok || !brands.data?.length) return { status: 'not_found', reason: 'Catálogo FIPE indisponível.' }
  const target = normalizeBrandName(input.brand)
  const brand =
    brands.data.find((b) => normalizeBrandName(b.name) === target) ??
    brands.data.find((b) => { const c = normalizeBrandName(b.name); return c.startsWith(target) || target.startsWith(c) }) ??
    bestFipeMatch(brands.data, input.brand)
  if (!brand) return { status: 'not_found', reason: `Marca "${input.brand}" não encontrada na FIPE.` }

  const models = await getModels(tipo, brand.code)
  if (!models.ok || !models.data?.length) return { status: 'not_found', reason: 'Modelos FIPE indisponíveis.' }
  // Camadas: nome exato (avaliação criada pelo seletor FIPE) → melhor casamento
  // por modelo+versão → todas as versões do mesmo modelo base ("TIIDA …").
  // Fica na primeira camada que tem preço para o ano — o nome escolhido pode
  // ser de outra geração (ex.: "TIIDA S Aut." só existe em 2008–2009).
  const fullName = [input.model, input.version].filter(Boolean).join(' ')
  const baseToken = tokenizeVehicleName(input.model)[0]
  const tiers = [
    models.data.filter((m) => normalizeModelName(m.name) === normalizeModelName(input.model)),
    topFipeMatches(models.data, fullName, MAX_MODEL_CANDIDATES),
    baseToken ? models.data.filter((m) => tokenizeVehicleName(m.name)[0] === baseToken).slice(0, MAX_BASE_CANDIDATES) : [],
  ]
  if (!tiers.some((t) => t.length)) return { status: 'not_found', reason: `Modelo "${input.model}" não encontrado na FIPE.` }

  const tried = new Set<string>()
  let options: FipeOptionChoice[] = []
  for (const tier of tiers) {
    for (const m of tier) {
      if (tried.has(m.code)) continue
      tried.add(m.code)
      const years = await getYears(tipo, brand.code, m.code)
      if (!years.ok || !years.data?.length) continue
      const { pick, options: yOpts } = pickFipeYear(years.data, year, input.fuel)
      for (const y of (pick ? [pick] : yOpts)) options.push({ tipo, brandId: brand.code, modelId: m.code, yearId: y.code, label: `${m.name} · ${y.name}` })
    }
    if (options.length) break
  }
  options = options.slice(0, MAX_OPTIONS)
  if (!options.length) return { status: 'not_found', reason: `Sem preço FIPE para ${year}.` }
  if (options.length > 1) return { status: 'choose', options }

  const found = await fetchFipePrice(options[0])
  return found ? { status: 'found', fipe: found } : { status: 'not_found', reason: 'Preço FIPE indisponível.' }
}
