// =============================================================================
// Provedor FIPE — Tabela FIPE pública (veiculos.fipe.org.br / mirror legal)
// =============================================================================
//
// A Tabela FIPE é publicada mensalmente pela Fundação Instituto de Pesquisas
// Econômicas e seus dados são de domínio público.
//
// Este módulo usa a API comunitária em https://parallelum.com.br/fipe/api/v2/
// (espelho público amplamente utilizado) OU o endpoint configurado via env.
//
// Para produção recomenda-se:
//   1. Contrato com provedor certificado de dados FIPE; ou
//   2. Consumo direto da API oficial FIPE (quando disponível); ou
//   3. Importação periódica da tabela para base interna.
//
// Variável opcional:
//   FIPE_API_BASE_URL — padrão: "https://parallelum.com.br/fipe/api/v2"
// =============================================================================

import type { FipeBrand, FipeModel, FipeVersion, FipePrice, VehicleCategory } from '../types'

const BASE_URL = process.env.FIPE_API_BASE_URL ?? 'https://parallelum.com.br/fipe/api/v2'
const TIMEOUT_MS = 10_000

// Mapeia VehicleCategory → segmento da URL
const SEGMENT: Record<VehicleCategory, string> = {
  CAR:        'cars',
  MOTORCYCLE: 'motorcycles',
  TRUCK:      'trucks',
}

async function fetchFipe<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Accept': 'application/json' },
      signal:  controller.signal,
      next:    { revalidate: 86400 }, // cache Next.js por 24h (ISR)
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<T>
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

// ── Brands ───────────────────────────────────────────────────────────────────

interface RawFipeBrand { codigo: string; nome: string }

export async function getFipeBrands(type: VehicleCategory): Promise<FipeBrand[]> {
  const raw = await fetchFipe<RawFipeBrand[]>(`/${SEGMENT[type]}/brands`)
  return raw.map((b) => ({ code: b.codigo, name: b.nome, type }))
}

export async function getAllFipeBrands(): Promise<FipeBrand[]> {
  const [cars, motos, trucks] = await Promise.allSettled([
    getFipeBrands('CAR'),
    getFipeBrands('MOTORCYCLE'),
    getFipeBrands('TRUCK'),
  ])
  return [
    ...(cars.status   === 'fulfilled' ? cars.value   : []),
    ...(motos.status  === 'fulfilled' ? motos.value  : []),
    ...(trucks.status === 'fulfilled' ? trucks.value : []),
  ]
}

// ── Models ────────────────────────────────────────────────────────────────────

interface RawFipeModels { modelos: { codigo: number; nome: string }[] }

export async function getFipeModels(type: VehicleCategory, brandCode: string): Promise<FipeModel[]> {
  const raw = await fetchFipe<RawFipeModels>(`/${SEGMENT[type]}/brands/${brandCode}/models`)
  return (raw.modelos ?? []).map((m) => ({
    code:      String(m.codigo),
    name:      m.nome,
    brandCode,
    type,
  }))
}

// ── Years / Versions ──────────────────────────────────────────────────────────

interface RawFipeYear { codigo: string; nome: string }

export async function getFipeVersions(
  type:       VehicleCategory,
  brandCode:  string,
  modelCode:  string,
): Promise<FipeVersion[]> {
  const raw = await fetchFipe<RawFipeYear[]>(
    `/${SEGMENT[type]}/brands/${brandCode}/models/${modelCode}/years`,
  )

  return raw.map((y) => {
    const [yearStr, fuelCode] = y.codigo.split('-')
    const fuelLabel = fuelCode === '1' ? 'Gasolina' : fuelCode === '2' ? 'Álcool' : fuelCode === '3' ? 'Diesel' : 'Flex'
    return {
      code:      y.codigo,
      yearLabel: y.nome,
      modelYear: Number(yearStr),
      fuelCode:  fuelCode ?? '1',
      fuelLabel,
    }
  })
}

// ── Price ─────────────────────────────────────────────────────────────────────

interface RawFipePrice {
  CodigoFipe:   string
  Marca:        string
  Modelo:       string
  AnoModelo:    number
  Combustivel:  string
  Valor:        string  // "R$ 35.000,00"
  MesReferencia: string
}

export async function getFipePrice(
  type:        VehicleCategory,
  brandCode:   string,
  modelCode:   string,
  yearCode:    string, // ex: "2022-1"
): Promise<FipePrice> {
  const raw = await fetchFipe<RawFipePrice>(
    `/${SEGMENT[type]}/brands/${brandCode}/models/${modelCode}/years/${yearCode}`,
  )

  const valueStr = raw.Valor?.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()
  const value = parseFloat(valueStr)

  return {
    fipeCode:       raw.CodigoFipe,
    brand:          raw.Marca,
    model:          raw.Modelo,
    modelYear:      raw.AnoModelo,
    fuel:           raw.Combustivel,
    value:          isNaN(value) ? 0 : value,
    referenceMonth: raw.MesReferencia,
  }
}
