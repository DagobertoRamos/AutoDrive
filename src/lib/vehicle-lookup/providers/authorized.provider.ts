// =============================================================================
// Provedor de consulta veicular autorizado/contratado
// =============================================================================
//
// Este adapter é o ponto de integração com provedores externos AUTORIZADOS,
// como SERPRO, APIs estaduais conveniadas, ou provedores privados contratados.
//
// IMPORTANTE — Requisitos legais e de segurança:
//   • Use SOMENTE bases, APIs e provedores com autorização expressa.
//   • Não utilize scraping, CAPTCHA bypass ou acesso não autorizado.
//   • Dados como chassi completo, RENAVAM e restrições só estarão disponíveis
//     se o provedor contratado e a legislação vigente permitirem.
//   • Dados pessoais do proprietário (nome, CPF) não devem ser retornados sem
//     base legal adequada e finalidade justificada (LGPD, art. 7°).
//   • API keys e tokens NUNCA devem chegar ao frontend.
//   • Configure via variáveis de ambiente no servidor.
//
// Variáveis de ambiente necessárias:
//   VEHICLE_LOOKUP_API_URL    — URL base da API contratada
//   VEHICLE_LOOKUP_API_KEY    — Chave/token de autenticação
//   VEHICLE_LOOKUP_TIMEOUT_MS — Timeout em ms (padrão: 8000)
//
// Para habilitar, configure as variáveis acima. Se não configuradas,
// este provedor retorna found: false graciosamente e o sistema continua
// com fallback manual.
// =============================================================================

import type { VehicleLookupProvider, VehicleLookupResult, VehicleLookupData } from '../types'
import { getActiveIntegrationCredential } from '@/lib/integrations/active'

const ENV_API_URL = process.env.VEHICLE_LOOKUP_API_URL
const ENV_API_KEY = process.env.VEHICLE_LOOKUP_API_KEY
const TIMEOUT_MS  = Number(process.env.VEHICLE_LOOKUP_TIMEOUT_MS ?? 8_000)

interface ResolvedPlateConfig {
  url:   string
  key:   string
  source: 'integration' | 'env'
}

/**
 * Resolve a configuração ativa: primeiro tenta IntegrationCredential
 * (service=PLATE_LOOKUP, configurada via /master/integrations), depois
 * cai no fallback de variáveis de ambiente (dev local).
 */
async function resolvePlateConfig(): Promise<ResolvedPlateConfig | null> {
  try {
    const cred = await getActiveIntegrationCredential('PLATE_LOOKUP')
    if (cred?.apiUrl && cred?.apiKey) {
      return { url: cred.apiUrl.replace(/\/+$/, ''), key: cred.apiKey, source: 'integration' }
    }
  } catch { /* DB indisponível — segue para env */ }

  if (ENV_API_URL && ENV_API_KEY) {
    return { url: ENV_API_URL.replace(/\/+$/, ''), key: ENV_API_KEY, source: 'env' }
  }
  return null
}

/** Verifica se o provedor está configurado (DB ou env). */
export async function isAuthorizedProviderConfigured(): Promise<boolean> {
  const cfg = await resolvePlateConfig()
  return !!cfg
}

export class AuthorizedProvider implements VehicleLookupProvider {
  readonly name = 'authorized_provider'

  async lookupByPlate(plate: string): Promise<VehicleLookupResult> {
    const cfg = await resolvePlateConfig()
    if (!cfg) {
      return {
        success: true,
        found:   false,
        message: 'API de placa não configurada. Configure uma credencial PLATE_LOOKUP em /master/integrations ou preencha os dados manualmente.',
      }
    }
    const API_URL = cfg.url
    const API_KEY = cfg.key

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(`${API_URL}/consulta/placa/${plate}`, {
        method:  'GET',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!response.ok) {
        if (response.status === 404) {
          return { success: true, found: false, source: this.name }
        }
        console.warn(`[AuthorizedProvider] HTTP ${response.status} para placa ${plate}`)
        return {
          success: false,
          found:   false,
          error:   'Provedor retornou erro. Tente novamente ou preencha manualmente.',
        }
      }

      const raw = await response.json()

      // ── Normalizador ──────────────────────────────────────────────────────
      // Adapte este bloco ao schema de resposta do seu provedor contratado.
      // Os campos abaixo são genéricos — renomeie conforme a documentação.
      const data: VehicleLookupData = {
        plate,
        vehicleType:     this.mapVehicleType(raw.tipo_veiculo ?? raw.vehicleType),
        brand:           raw.marca        ?? raw.brand,
        model:           raw.modelo       ?? raw.model,
        version:         raw.versao       ?? raw.version,
        fullModel:       raw.modelo_completo ?? raw.fullModel,
        manufactureYear: raw.ano_fabricacao  ?? raw.manufactureYear,
        modelYear:       raw.ano_modelo      ?? raw.modelYear,
        fuel:            raw.combustivel     ?? raw.fuel,
        color:           raw.cor             ?? raw.color,
        chassi:          raw.chassi          ?? raw.chassis,      // se autorizado
        renavam:         raw.renavam,                             // se autorizado
        engine:          raw.motor           ?? raw.engine,
        displacement:    raw.cilindradas     ?? raw.displacement,
        power:           raw.potencia        ?? raw.power,
        transmission:    raw.cambio          ?? raw.transmission,
        doors:           raw.portas          ?? raw.doors,
        bodyType:        raw.carroceria      ?? raw.bodyType,
        restrictions:    Array.isArray(raw.restricoes) ? raw.restricoes : [],
        raw,                                                       // payload bruto (não expor ao client)
      }

      return { success: true, found: true, source: this.name, data }
    } catch (err: unknown) {
      clearTimeout(timer)
      const isAbort = err instanceof Error && err.name === 'AbortError'
      console.warn(`[AuthorizedProvider] ${isAbort ? 'Timeout' : 'Erro'} ao consultar placa ${plate}:`, err)
      return {
        success: false,
        found:   false,
        error:   isAbort
          ? 'Tempo limite da consulta excedido. Tente novamente ou preencha manualmente.'
          : 'Falha ao conectar com o provedor. Preencha manualmente.',
      }
    }
  }

  private mapVehicleType(raw: string | undefined): 'CAR' | 'MOTORCYCLE' | 'TRUCK' | undefined {
    if (!raw) return undefined
    const v = raw.toUpperCase()
    if (v.includes('MOTO'))     return 'MOTORCYCLE'
    if (v.includes('CAMINHAO') || v.includes('CAMINHÃO')) return 'TRUCK'
    if (v.includes('CAR') || v.includes('AUTOMOVEL') || v.includes('AUTOMÓVEL')) return 'CAR'
    return undefined
  }
}
