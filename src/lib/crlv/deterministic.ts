// =============================================================================
// src/lib/crlv/deterministic.ts
//
// Módulo de processamento determinístico para classificação de dados de veículos.
// Implementa validações de tipo de veículo, motorização sugerida e transmissão.
// =============================================================================

import { VehicleCategory } from './types'

/**
 * Remove acentos e converte para maiúsculas para normalizar strings de comparação.
 */
export function normalizeText(text: string | undefined | null): string {
  if (!text) return ''
  return text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

/**
 * Classifica a categoria interna do veículo (CAR, MOTORCYCLE, TRUCK, OTHER, UNKNOWN)
 * com base nos campos de espécie/tipo oficial, carroceria e dicionário de mapeamentos.
 */
export function classifyVehicleCategory(
  speciesRaw: string | undefined | null,
  bodyRaw: string | undefined | null,
  mappings?: Record<string, string>
): VehicleCategory {
  const normalizedSpecies = normalizeText(speciesRaw)
  const normalizedBody = normalizeText(bodyRaw)

  // 1. Tenta correspondência exata via dicionário de mapeamentos
  if (mappings) {
    if (mappings[normalizedSpecies]) return mappings[normalizedSpecies] as VehicleCategory
    if (mappings[normalizedBody]) return mappings[normalizedBody] as VehicleCategory
  }

  // 2. Fallbacks de termos para Carros
  const carRegex = /\b(AUTOMOVEL|CAMIONETA|UTILITARIO|BUGGY|HATCH|SEDAN|SUV|CONVERSIVEL|COUPE|MINIVAN|WAGON|PERUA|CROSSOVER|PICKUP|PICAPE)\b/
  if (carRegex.test(normalizedSpecies) || carRegex.test(normalizedBody)) {
    return 'CAR'
  }

  // 3. Fallbacks de termos para Motos
  const motoRegex = /\b(MOTOCICLETA|MOTONETA|CICLOMOTOR|TRICICLO|QUADRICICLO)\b/
  if (motoRegex.test(normalizedSpecies) || motoRegex.test(normalizedBody)) {
    return 'MOTORCYCLE'
  }

  // 4. Fallbacks de termos para Caminhões/Pesados
  const truckRegex = /\b(CAMINHAO|TRATOR|REBOQUE|SEMI[\s\-]?REBOQUE)\b/
  if (truckRegex.test(normalizedSpecies) || truckRegex.test(normalizedBody)) {
    return 'TRUCK'
  }

  // 5. Outros tipos oficiais não mapeados para forçar (ex: ônibus)
  const otherRegex = /\b(ONIBUS|MICRO[\s\-]?ONIBUS|MOTOR[\s\-]?CASA|CHASSI|REBOQUE)\b/
  if (otherRegex.test(normalizedSpecies) || otherRegex.test(normalizedBody)) {
    return 'OTHER'
  }

  return 'UNKNOWN'
}

/**
 * Mapeamento estático padrão para cilindradas frequentes caso o mapeamento dinâmico
 * do Master não esteja carregado ou não cubra o valor.
 */
const DEFAULT_DISPLACEMENT_MAP: Record<number, string> = {
  999: '1.0',
  1197: '1.2',
  1332: '1.3',
  1498: '1.5',
  1598: '1.6',
  1798: '1.8',
  1998: '2.0',
}

/**
 * Converte a cilindrada (cm³) em uma sugestão de motorização comercial (ex: 999 -> 1.0).
 * Sempre retorna requiresReview = true e source = CATALOG_DERIVED.
 */
export function getEngineCommercialLabel(
  cc: number | undefined | null,
  mappings?: Record<string, string>
): { label: string | null; requiresReview: boolean } {
  if (!cc || cc <= 0) return { label: null, requiresReview: false }

  // 1. Tenta correspondência no mapeamento customizado
  if (mappings && mappings[String(cc)]) {
    return { label: mappings[String(cc)], requiresReview: true }
  }

  // 2. Tenta no dicionário estático
  if (DEFAULT_DISPLACEMENT_MAP[cc]) {
    return { label: DEFAULT_DISPLACEMENT_MAP[cc], requiresReview: true }
  }

  // 3. Fallbacks determinísticos por faixas comuns para motores brasileiros/importados
  if (cc >= 900 && cc <= 1050) return { label: '1.0', requiresReview: true }
  if (cc >= 1150 && cc <= 1250) return { label: '1.2', requiresReview: true }
  if (cc >= 1290 && cc <= 1350) return { label: '1.3', requiresReview: true }
  if (cc >= 1390 && cc <= 1450) return { label: '1.4', requiresReview: true }
  if (cc >= 1490 && cc <= 1550) return { label: '1.5', requiresReview: true }
  if (cc >= 1580 && cc <= 1650) return { label: '1.6', requiresReview: true }
  if (cc >= 1780 && cc <= 1855) return { label: '1.8', requiresReview: true }
  if (cc >= 1950 && cc <= 2050) return { label: '2.0', requiresReview: true }

  return { label: null, requiresReview: true }
}

/**
 * Dicionário estático padrão de correspondência de transmissão com base
 * em siglas comuns encontradas no final de nomes de versão de veículos.
 */
const DEFAULT_TRANSMISSION_KEYWORDS: Record<string, string> = {
  ' MEC ': 'MANUAL',
  ' MEC': 'MANUAL',
  ' MT ': 'MANUAL',
  ' MT': 'MANUAL',
  ' AT ': 'AUTOMATIC',
  ' AT': 'AUTOMATIC',
  ' AUT ': 'AUTOMATIC',
  ' AUT': 'AUTOMATIC',
  ' AD ': 'AUTOMATIC',
  ' AD': 'AUTOMATIC',
  ' AUTOMATICO ': 'AUTOMATIC',
  ' AUTOMATICO': 'AUTOMATIC',
  ' AUTOMATICA ': 'AUTOMATIC',
  ' AUTOMATICA': 'AUTOMATIC',
  ' CVT ': 'CVT',
  ' CVT': 'CVT',
  ' DSG ': 'DUAL_CLUTCH',
  ' DSG': 'DUAL_CLUTCH',
  ' DCT ': 'DUAL_CLUTCH',
  ' DCT': 'DUAL_CLUTCH',
  ' PDK ': 'DUAL_CLUTCH',
  ' PDK': 'DUAL_CLUTCH',
  ' ASG ': 'AUTOMATED',
  ' I-MOTION ': 'AUTOMATED',
  ' IMOTION ': 'AUTOMATED',
  ' DUALOGIC ': 'AUTOMATED',
}

/**
 * Tenta sugerir o tipo de transmissão (MANUAL, AUTOMATIC, CVT, etc.)
 * a partir do texto da versão ou modelo.
 */
export function resolveTransmissionType(
  versionRaw: string | undefined | null,
  mappings?: Record<string, string>
): { type: string | null; requiresReview: boolean } {
  if (!versionRaw) return { type: 'UNKNOWN', requiresReview: true }

  const textToSearch = ` ${normalizeText(versionRaw)} `

  // 1. Tenta correspondência nos mapeamentos customizados do Master
  if (mappings) {
    for (const [kw, transType] of Object.entries(mappings)) {
      const normalizedKw = ` ${normalizeText(kw)} `
      if (textToSearch.includes(normalizedKw)) {
        return { type: transType, requiresReview: true }
      }
    }
  }

  // 2. Tenta correspondência nas keywords padrão
  for (const [kw, transType] of Object.entries(DEFAULT_TRANSMISSION_KEYWORDS)) {
    if (textToSearch.includes(kw)) {
      return { type: transType, requiresReview: true }
    }
  }

  return { type: 'UNKNOWN', requiresReview: true }
}
