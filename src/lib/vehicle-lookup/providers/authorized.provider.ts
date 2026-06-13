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
      const data = normalizePlacaResponse(plate, raw)
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

}

// =============================================================================
// Normalizador da resposta da API Placas
// =============================================================================
//
// A API Placas retorna campos em formatos diferentes em níveis distintos:
//   - root:  MARCA, MODELO, SUBMODELO, VERSAO, marca, modelo, marcaModelo,
//            ano, anoModelo, chassi, cor, municipio, origem, placa, uf,
//            placa_alternativa, situacao, logo, extra, fipe.dados
//   - extra: ano_fabricacao, ano_modelo, caixa_cambio, cilindradas,
//            combustivel, especie, modelo, municipio, nacionalidade,
//            quantidade_passageiro, segmento, sub_segmento, tipo_veiculo,
//            uf_placa, placa_modelo_novo, placa_modelo_antigo
//   - fipe.dados[]: { codigo_fipe, texto_marca, texto_modelo, texto_valor,
//                     mes_referencia, ano_modelo, combustivel, score,
//                     tipo_modelo }
//
// As regras de fallback e seleção do "melhor FIPE" estão documentadas no
// requisito de produto e seguem a ordem: maior score → mesmo ano_modelo →
// combustível compatível → similaridade textual. Quando o provedor não traz
// um campo, deixamos vazio para preenchimento manual.

const TIPO_MODELO_TO_CATEGORY: Record<string, 'CAR' | 'MOTORCYCLE' | 'TRUCK'> = {
  '1': 'CAR', '2': 'MOTORCYCLE', '3': 'TRUCK',
}

function inferVehicleType(rawTipo: unknown, extraTipo: unknown, fipeTipo: unknown): 'CAR' | 'MOTORCYCLE' | 'TRUCK' | undefined {
  const candidates = [rawTipo, extraTipo, fipeTipo]
    .filter((v) => v != null)
    .map((v) => String(v).toUpperCase().trim())
  for (const v of candidates) {
    if (v === '1' || v === '2' || v === '3') return TIPO_MODELO_TO_CATEGORY[v]
    if (v.includes('MOTO'))     return 'MOTORCYCLE'
    if (v.includes('CAMINHAO') || v.includes('CAMINHÃO') || v.includes('CAMINHONETE TRUCK')) return 'TRUCK'
    if (v.includes('CARRO') || v.includes('AUTOMOVEL') || v.includes('AUTOMÓVEL') ||
        v.includes('CAMIONETA') || v.includes('CAMINHONETE') || v.includes('UTILITARIO') ||
        v.includes('UTILITÁRIO') || v.includes('SUV') || v.includes('PICAPE')) return 'CAR'
  }
  return undefined
}

/** Remove a marca do início do nome do modelo, ex: "VOLKSWAGEN GOL 1.0" → "GOL 1.0" */
function stripBrandFromModel(model: string, brand: string): string {
  if (!model || !brand) return model
  const b = brand.toUpperCase().trim()
  const m = model.toUpperCase().trim()
  if (m.startsWith(b + ' ')) return model.slice(brand.length).trim()
  return model
}

interface FipeDado {
  codigo_fipe?:    string
  texto_marca?:    string
  texto_modelo?:   string
  texto_valor?:    string
  mes_referencia?: string
  ano_modelo?:     string | number
  combustivel?:    string
  score?:          number
  tipo_modelo?:    string | number
}

/** Parser tolerante de "R$ 91.320,00" / "91.320,00" / "91320" / number → number em reais */
function parseFipeValue(s: unknown): number | null {
  if (s == null || s === '') return null
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const str = String(s).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (!str) return null
  // Se tem vírgula, ela é decimal e pontos são milhar. Senão, pontos são milhar.
  const normalized = str.includes(',')
    ? str.replace(/\./g, '').replace(',', '.')
    : str.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Seleciona o melhor item FIPE entre as opções disponíveis. */
export function pickBestFipe(
  dados: FipeDado[] | undefined,
  ctx: { brand?: string; model?: string; version?: string; anoModelo?: number | null; combustivel?: string | null },
): FipeDado | null {
  if (!Array.isArray(dados) || dados.length === 0) return null
  const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const targetTxt = norm([ctx.brand, ctx.model, ctx.version].filter(Boolean).join(' '))

  const scored = dados.map((d) => {
    const baseScore = Number(d.score ?? 0)
    let bonus = 0
    if (ctx.anoModelo && d.ano_modelo && Number(d.ano_modelo) === ctx.anoModelo) bonus += 100
    if (ctx.combustivel && d.combustivel && norm(d.combustivel).startsWith(norm(ctx.combustivel)[0] ?? '')) bonus += 25
    if (targetTxt && d.texto_modelo) {
      const dm = norm(d.texto_modelo)
      // similaridade simples: palavras em comum
      const targetWords = new Set(targetTxt.split(/\s+/).filter(Boolean))
      const overlap = dm.split(/\s+/).filter((w) => targetWords.has(w)).length
      bonus += overlap * 10
    }
    return { d, total: baseScore + bonus }
  })
  scored.sort((a, b) => b.total - a.total)
  return scored[0]?.d ?? null
}

export function normalizePlacaResponse(plate: string, raw: Record<string, unknown>): VehicleLookupData {
  const r = raw as {
    MARCA?: string; MODELO?: string; SUBMODELO?: string; VERSAO?: string
    marca?: string; modelo?: string; marcaModelo?: string
    ano?: string | number; anoModelo?: string | number
    chassi?: string; cor?: string; municipio?: string; origem?: string
    placa?: string; uf?: string; tipo_veiculo?: string; vehicleType?: string
    extra?: Record<string, unknown>
    fipe?: { dados?: FipeDado[] }
  }
  const extra = (r.extra ?? {}) as Record<string, unknown>

  // ── Marca ─────────────────────────────────────────────────────────────────
  const brand = (
    (typeof r.marca === 'string' && r.marca) ||
    (typeof r.MARCA === 'string' && r.MARCA) ||
    (typeof r.marcaModelo === 'string' && r.marcaModelo.split('/')[0]) ||
    ''
  ).trim() || undefined

  // ── Modelo ───────────────────────────────────────────────────────────────
  const modelFromMarcaModelo = typeof r.marcaModelo === 'string' && r.marcaModelo.includes('/')
    ? r.marcaModelo.split('/').slice(1).join('/').trim()
    : ''
  const extraModelRaw = typeof extra.modelo === 'string' ? extra.modelo : ''
  const extraModelClean = brand && extraModelRaw ? stripBrandFromModel(extraModelRaw, brand) : extraModelRaw
  const model = (
    (typeof r.modelo === 'string' && r.modelo) ||
    (typeof r.MODELO === 'string' && r.MODELO) ||
    (typeof r.SUBMODELO === 'string' && r.SUBMODELO) ||
    extraModelClean ||
    modelFromMarcaModelo ||
    ''
  ).trim() || undefined

  // ── Versão ───────────────────────────────────────────────────────────────
  // Não preencher "T" sozinho se a API trouxe texto completo via FIPE/SUBMODELO.
  let version = (
    (typeof r.VERSAO === 'string' && r.VERSAO.trim().length > 1 && r.VERSAO) ||
    (typeof r.SUBMODELO === 'string' && r.SUBMODELO) ||
    ''
  ).trim() || undefined

  // ── Anos ─────────────────────────────────────────────────────────────────
  const anoFabricacao = toIntOrUndefined(extra.ano_fabricacao) ?? toIntOrUndefined(r.ano)
  const anoModelo     = toIntOrUndefined(extra.ano_modelo)     ?? toIntOrUndefined(r.anoModelo)

  // ── Combustível ──────────────────────────────────────────────────────────
  const combustivel = (typeof extra.combustivel === 'string' && extra.combustivel.trim()) || undefined

  // ── Tipo de veículo ──────────────────────────────────────────────────────
  const fipeDados = r.fipe?.dados
  const fipeTipoModelo = fipeDados?.[0]?.tipo_modelo
  const vehicleType = inferVehicleType(r.tipo_veiculo ?? r.vehicleType, extra.tipo_veiculo ?? extra.segmento, fipeTipoModelo)

  // ── FIPE: escolhe a melhor entrada do array ─────────────────────────────
  const best = pickBestFipe(fipeDados, { brand, model, version, anoModelo: anoModelo ?? null, combustivel: combustivel ?? null })
  const fipeValue = best ? (parseFipeValue(best.texto_valor) ?? undefined) : undefined
  const fipeCode = best?.codigo_fipe || undefined
  const fipeReferenceMonth = best?.mes_referencia?.trim() || undefined

  // Fallback de versão a partir do FIPE quando ainda não temos texto significativo
  if ((!version || version.length <= 1) && best?.texto_modelo) {
    const txt = best.texto_modelo.trim()
    // Remove prefixo de modelo ("GOL 1.0 FLEX" → "1.0 FLEX") se possível
    if (model) {
      const m = txt.toUpperCase().indexOf(model.toUpperCase())
      version = (m >= 0 ? txt.slice(m + model.length).trim() : txt) || version
    } else {
      version = txt
    }
  }

  // Fallback de combustível a partir do FIPE
  const fuelFinal = combustivel ?? (best?.combustivel ? best.combustivel : undefined)

  const data: VehicleLookupData = {
    plate: (typeof r.placa === 'string' && r.placa) ||
           (typeof extra.placa_modelo_novo === 'string' ? extra.placa_modelo_novo : plate),
    vehicleType,
    brand,
    model,
    version,
    fullModel: [brand, model, version].filter(Boolean).join(' ') || undefined,
    manufactureYear: anoFabricacao,
    modelYear: anoModelo,
    fuel: fuelFinal,
    color: typeof r.cor === 'string' ? r.cor : undefined,
    chassi: typeof r.chassi === 'string' ? r.chassi : undefined,
    renavam: undefined, // API Placas não retorna renavam — preenchimento manual
    engine: undefined,  // motor textual não retornado — preenchimento manual
    displacement: typeof extra.cilindradas === 'string' ? extra.cilindradas : undefined,
    power: undefined,
    transmission: typeof extra.caixa_cambio === 'string' && (extra.caixa_cambio as string).trim()
      ? (extra.caixa_cambio as string)
      : undefined,
    doors: undefined, // não vem na API Placas — preenchimento manual
    bodyType: undefined,
    fipeCode,
    fipeValue,
    fipeReferenceMonth,
    restrictions: [],
    raw,
  }
  return data
}

function toIntOrUndefined(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\D/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}
