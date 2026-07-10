// =============================================================================
// src/lib/crlv/settings.ts
//
// Módulo de leitura e gerenciamento de configurações da leitura documental.
// Lê e valida individualmente as 5 chaves do SystemSetting.
// =============================================================================

import { prisma } from '@/lib/prisma'
import {
  DocumentReaderGeneralSchema,
  DocumentReaderProvidersSchema,
  DocumentReaderFieldRulesSchema,
  DocumentReaderMappingsSchema,
  DocumentReaderTenantAccessSchema,
  type DocumentReaderGeneral,
  type DocumentReaderProviders,
  type DocumentReaderFieldRules,
  type DocumentReaderMappings,
  type DocumentReaderTenantAccess,
} from './schemas'

export const KEYS = {
  GENERAL: 'global:document_reader:general:v1',
  PROVIDERS: 'global:document_reader:providers:v1',
  FIELD_RULES: 'global:document_reader:field_rules:v1',
  MAPPINGS: 'global:document_reader:mappings:v1',
  TENANT_ACCESS: 'global:document_reader:tenant_access:v1',
}

// Defaults seguros caso a configuração ainda não esteja criada no banco
export const DEFAULT_GENERAL: DocumentReaderGeneral = {
  schemaVersion: '1.0',
  revision: 0,
  updatedAt: new Date().toISOString(),
  active: true,
  allowedTenants: ['*'],
  maxSizeMb: 8,
  maxPages: 3,
  maxProcessingTimeSec: 30,
  keepOriginal: true,
  retentionDays: 365,
  autoFill: true,
  requireConfirmation: true,
  minConfidence: 0.8,
}

export const DEFAULT_PROVIDERS: DocumentReaderProviders = {
  schemaVersion: '1.0',
  revision: 0,
  updatedAt: new Date().toISOString(),
  nativePdfText: { active: true, priority: 1 },
  qrReader: { active: true, priority: 2 },
  tesseractOcr: { active: true, priority: 3, languages: ['por'] },
  paddleOcr: { active: false },
  vioDecoder: { active: false, priority: 99 },
  gemini: { active: false, useOnlyOnFailure: true },
  documentAi: { active: false },
  openaiVision: { active: false },
}

export const DEFAULT_FIELD_RULES: DocumentReaderFieldRules = {
  schemaVersion: '1.0',
  revision: 0,
  updatedAt: new Date().toISOString(),
  rules: {
    plate: { sources: ['NATIVE_PDF_TEXT', 'LOCAL_OCR'], minConfidence: 0.9, requireReview: false },
    chassis: { sources: ['NATIVE_PDF_TEXT', 'LOCAL_OCR'], minConfidence: 0.95, requireReview: true },
    renavam: { sources: ['NATIVE_PDF_TEXT', 'LOCAL_OCR'], minConfidence: 0.9, requireReview: false },
    brand: { sources: ['NATIVE_PDF_TEXT', 'LOCAL_OCR', 'CATALOG_DERIVED'], minConfidence: 0.8, requireReview: false },
    model: { sources: ['NATIVE_PDF_TEXT', 'LOCAL_OCR', 'CATALOG_DERIVED'], minConfidence: 0.8, requireReview: false },
    modelYear: { sources: ['NATIVE_PDF_TEXT', 'LOCAL_OCR'], minConfidence: 0.9, requireReview: false },
  },
}

export const DEFAULT_MAPPINGS: DocumentReaderMappings = {
  schemaVersion: '1.0',
  revision: 0,
  updatedAt: new Date().toISOString(),
  brands: {
    VW: 'Volkswagen',
    VOLKS: 'Volkswagen',
    CHEV: 'Chevrolet',
    GM: 'Chevrolet',
    FIAT: 'Fiat',
    FORD: 'Ford',
    RENAULT: 'Renault',
    HYUND: 'Hyundai',
    HYUNDAI: 'Hyundai',
    TOYOTA: 'Toyota',
    HONDA: 'Honda',
  },
  speciesTypes: {
    AUTOMOVEL: 'CAR',
    CAMIONETA: 'CAR',
    UTILITARIO: 'CAR',
    MOTOCICLETA: 'MOTORCYCLE',
    MOTONETA: 'MOTORCYCLE',
    CICLOMOTOR: 'MOTORCYCLE',
    CAMINHAO: 'TRUCK',
  },
  fuels: {
    GASOLINA: 'GASOLINE',
    ALCOOL: 'ETHANOL',
    ETANOL: 'ETHANOL',
    FLEX: 'FLEX',
    DIESEL: 'DIESEL',
    ELETRICO: 'ELECTRIC',
    HIBRIDO: 'HYBRID',
  },
  displacements: {
    '999': '1.0',
    '1598': '1.6',
    '1998': '2.0',
  },
  transmissions: {
    MEC: 'MANUAL',
    MT: 'MANUAL',
    AUT: 'AUTOMATIC',
    AT: 'AUTOMATIC',
    CVT: 'CVT',
    DSG: 'DUAL_CLUTCH',
  },
}

export const DEFAULT_TENANT_ACCESS: DocumentReaderTenantAccess = {
  schemaVersion: '1.0',
  revision: 0,
  updatedAt: new Date().toISOString(),
  tenantAccess: {},
}

export interface ConsolidatedDocumentReaderSettings {
  general: DocumentReaderGeneral
  providers: DocumentReaderProviders
  fieldRules: DocumentReaderFieldRules
  mappings: DocumentReaderMappings
  tenantAccess: DocumentReaderTenantAccess
}

/**
 * Lê e consolida todas as 5 configurações sob chaves separadas.
 * Faz fallback para os objetos padrão seguros caso não existam no banco.
 */
export async function getConsolidatedSettings(): Promise<ConsolidatedDocumentReaderSettings> {
  const [generalRes, providersRes, fieldRulesRes, mappingsRes, tenantAccessRes] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: KEYS.GENERAL } }),
    prisma.systemSetting.findUnique({ where: { key: KEYS.PROVIDERS } }),
    prisma.systemSetting.findUnique({ where: { key: KEYS.FIELD_RULES } }),
    prisma.systemSetting.findUnique({ where: { key: KEYS.MAPPINGS } }),
    prisma.systemSetting.findUnique({ where: { key: KEYS.TENANT_ACCESS } }),
  ])

  let general = DEFAULT_GENERAL
  if (generalRes?.value) {
    try {
      general = DocumentReaderGeneralSchema.parse(JSON.parse(generalRes.value))
    } catch (e) {
      console.error('[DocumentReaderSettings] Falha ao validar general:', e)
    }
  }

  let providers = DEFAULT_PROVIDERS
  if (providersRes?.value) {
    try {
      providers = DocumentReaderProvidersSchema.parse(JSON.parse(providersRes.value))
    } catch (e) {
      console.error('[DocumentReaderSettings] Falha ao validar providers:', e)
    }
  }

  let fieldRules = DEFAULT_FIELD_RULES
  if (fieldRulesRes?.value) {
    try {
      fieldRules = DocumentReaderFieldRulesSchema.parse(JSON.parse(fieldRulesRes.value))
    } catch (e) {
      console.error('[DocumentReaderSettings] Falha ao validar fieldRules:', e)
    }
  }

  let mappings = DEFAULT_MAPPINGS
  if (mappingsRes?.value) {
    try {
      mappings = DocumentReaderMappingsSchema.parse(JSON.parse(mappingsRes.value))
    } catch (e) {
      console.error('[DocumentReaderSettings] Falha ao validar mappings:', e)
    }
  }

  let tenantAccess = DEFAULT_TENANT_ACCESS
  if (tenantAccessRes?.value) {
    try {
      tenantAccess = DocumentReaderTenantAccessSchema.parse(JSON.parse(tenantAccessRes.value))
    } catch (e) {
      console.error('[DocumentReaderSettings] Falha ao validar tenantAccess:', e)
    }
  }

  return { general, providers, fieldRules, mappings, tenantAccess }
}
