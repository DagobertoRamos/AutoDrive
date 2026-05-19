// =============================================================================
// AuthorizedPlateProvider
//
// Provider genérico para qualquer API autorizada de consulta de placa
// (ex.: Cilia, Placafipe, Sinesp B2B, etc.).
//
// Configuração:
//   IntegrationCredential.service = 'PLATE_LOOKUP'
//   IntegrationCredential.apiUrl   = URL base do provider (sem barra final)
//   IntegrationCredential.apiKey   = chave/segredo principal (Bearer/Header)
//   IntegrationCredential.token    = token alternativo (alguns providers exigem)
//   IntegrationCredential.notes    = JSON opcional p/ ajustes (header, path)
//
// Resposta esperada do provedor (normalizada aqui — adapte conforme necessário):
//   { plate, brand, model, version, year, color, fuel, chassi, renavam, fipeCode }
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { PlateLookupProvider, PlateLookupResult } from '../types'

const TIMEOUT_MS = Number(process.env.PLATE_LOOKUP_TIMEOUT_MS ?? 10000)

interface CredCache { url: string; apiKey: string | null; token: string | null; expires: number }
let CRED: CredCache | null = null

async function loadCredential(): Promise<CredCache | null> {
  if (CRED && CRED.expires > Date.now()) return CRED
  try {
    const c = await prisma.integrationCredential.findFirst({
      where:   { service: 'PLATE_LOOKUP', active: true },
      orderBy: { isDefault: 'desc' },
      select:  { apiUrl: true, apiKey: true, token: true },
    })
    if (!c || !c.apiUrl?.trim()) {
      CRED = null
      return null
    }
    CRED = {
      url:     c.apiUrl.replace(/\/+$/, ''),
      apiKey:  c.apiKey ?? null,
      token:   c.token  ?? null,
      expires: Date.now() + 5 * 60 * 1000,
    }
    return CRED
  } catch {
    return null
  }
}

export const AuthorizedPlateProvider: PlateLookupProvider = {
  name: 'authorized',

  async isConfigured() {
    const cred = await loadCredential()
    return !!cred
  },

  async lookupByPlate(plateRaw: string): Promise<PlateLookupResult> {
    const cred = await loadCredential()
    if (!cred) {
      return { ok: false, found: false, source: 'authorized', error: 'Integração de placa não configurada.' }
    }
    const plate = plateRaw.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    if (plate.length < 6) {
      return { ok: false, found: false, source: 'authorized', error: 'Placa inválida.' }
    }

    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      // Convenção: GET {apiUrl}/{plate}
      // Header preferencial: Authorization: Bearer <apiKey>; fallback X-Api-Key.
      const url = `${cred.url}/${plate}`
      const headers: Record<string, string> = {
        Accept:        'application/json',
        'User-Agent':  'AutoDrive/1.0',
      }
      if (cred.apiKey)  headers.Authorization = `Bearer ${cred.apiKey}`
      if (cred.token)   headers['X-Api-Token'] = cred.token

      const res = await fetch(url, { signal: controller.signal, headers, next: { revalidate: 0 } })
      if (res.status === 404) {
        return { ok: true, found: false, source: 'authorized', error: 'Placa não encontrada.' }
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, found: false, source: 'authorized', error: 'Credencial de consulta de placa inválida.' }
      }
      if (!res.ok) {
        return { ok: false, found: false, source: 'authorized', error: `Provedor de placa retornou erro ${res.status}.` }
      }
      const d = await res.json()

      // Normalização tolerante a vários formatos de provedor
      const obj = d?.data ?? d?.vehicle ?? d ?? {}
      return {
        ok:    true,
        found: true,
        source: 'authorized',
        data: {
          plate,
          brand:           pickStr(obj, ['brand', 'marca', 'fabricante']),
          model:           pickStr(obj, ['model', 'modelo']),
          version:         pickStr(obj, ['version', 'versao']),
          manufactureYear: pickNum(obj, ['manufactureYear', 'anoFabricacao', 'ano_fabricacao']),
          modelYear:       pickNum(obj, ['modelYear', 'anoModelo', 'ano_modelo', 'ano']),
          color:           pickStr(obj, ['color', 'cor']),
          fuel:            pickStr(obj, ['fuel', 'combustivel']),
          chassi:          pickStr(obj, ['chassi', 'chassis']),
          renavam:         pickStr(obj, ['renavam']),
          bodyType:        pickStr(obj, ['bodyType', 'carroceria']),
          doors:           pickNum(obj, ['doors', 'portas']),
          fipeCode:        pickStr(obj, ['fipeCode', 'codigoFipe', 'codigo_fipe']),
          fipeValue:       pickNum(obj, ['fipeValue', 'valorFipe', 'valor_fipe']),
          category:        pickStr(obj, ['category', 'categoria']),
          vehicleType:     pickStr(obj, ['vehicleType', 'tipoVeiculo', 'tipo_veiculo']),
          raw:             d,
        },
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return { ok: false, found: false, source: 'authorized', error: 'Tempo limite excedido na consulta de placa.' }
      }
      return { ok: false, found: false, source: 'authorized', error: 'Provedor de placa indisponível neste momento.' }
    } finally {
      clearTimeout(timeout)
    }
  },
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}
function pickNum(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && !isNaN(v)) return v
    if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v, 10)
  }
  return undefined
}

/** Limpa o cache da credencial (útil após alteração no painel MASTER). */
export function clearPlateProviderCache(): void {
  CRED = null
}
