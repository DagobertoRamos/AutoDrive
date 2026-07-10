// =============================================================================
// src/lib/crlv/schemas.ts
//
// Schemas de validação Zod para as configurações divididas da leitura documental.
// Cada schema garante tipagem estrita de schemaVersion, revision e metadados.
// =============================================================================

import { z } from 'zod'

// ── Metadados Base para Configurações ─────────────────────────────────────────
export const BaseConfigSchema = z.object({
  schemaVersion: z.string(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
  updatedByUserId: z.string().nullable().optional(),
})

// ── 1. Geral (general) ────────────────────────────────────────────────────────
export const DocumentReaderGeneralSchema = BaseConfigSchema.extend({
  active: z.boolean(),
  allowedTenants: z.array(z.string()), // ["*"] para todos
  maxSizeMb: z.number().positive().default(8),
  maxPages: z.number().int().positive().default(3),
  maxProcessingTimeSec: z.number().int().positive().default(30),
  keepOriginal: z.boolean().default(true),
  retentionDays: z.number().int().positive().default(365),
  autoFill: z.boolean().default(true),
  requireConfirmation: z.boolean().default(true),
  minConfidence: z.number().min(0).max(1).default(0.8),
})

export type DocumentReaderGeneral = z.infer<typeof DocumentReaderGeneralSchema>

// ── 2. Provedores (providers) ──────────────────────────────────────────────────
export const DocumentReaderProvidersSchema = BaseConfigSchema.extend({
  nativePdfText: z.object({
    active: z.boolean(),
    priority: z.number().int(),
  }),
  qrReader: z.object({
    active: z.boolean(),
    priority: z.number().int(),
  }),
  tesseractOcr: z.object({
    active: z.boolean(),
    priority: z.number().int(),
    languages: z.array(z.string()).default(['por']),
  }),
  paddleOcr: z.object({
    active: z.boolean(),
    url: z.string().optional().nullable(),
  }),
  vioDecoder: z.object({
    active: z.boolean().refine(val => val === false, { message: 'VIO Decoder deve permanecer inativo na Fase 1' }),
    priority: z.number().int().default(99),
  }),
  gemini: z.object({
    active: z.boolean(),
    useOnlyOnFailure: z.boolean().default(true),
  }),
  documentAi: z.object({
    active: z.boolean().default(false),
  }),
  openaiVision: z.object({
    active: z.boolean().default(false),
  }),
})

export type DocumentReaderProviders = z.infer<typeof DocumentReaderProvidersSchema>

// ── 3. Regras por Campo (field_rules) ─────────────────────────────────────────
export const FieldRuleSchema = z.object({
  sources: z.array(z.string()), // ex: ["NATIVE_PDF_TEXT", "LOCAL_OCR"]
  minConfidence: z.number().min(0).max(1),
  requireReview: z.boolean(),
})

export const DocumentReaderFieldRulesSchema = BaseConfigSchema.extend({
  rules: z.record(z.string(), FieldRuleSchema),
})

export type DocumentReaderFieldRules = z.infer<typeof DocumentReaderFieldRulesSchema>

// ── 4. Mapeamentos (mappings) ────────────────────────────────────────────────
export const DocumentReaderMappingsSchema = BaseConfigSchema.extend({
  brands: z.record(z.string(), z.string()), // "VW" -> "Volkswagen"
  speciesTypes: z.record(z.string(), z.enum(['CAR', 'MOTORCYCLE', 'TRUCK', 'OTHER', 'UNKNOWN'])), // "AUTOMOVEL" -> "CAR"
  fuels: z.record(z.string(), z.string()), // "GASOLINA" -> "GASOLINE"
  displacements: z.record(z.string(), z.string()), // "999" -> "1.0"
  transmissions: z.record(z.string(), z.string()), // "AT" -> "AUTOMATIC"
})

export type DocumentReaderMappings = z.infer<typeof DocumentReaderMappingsSchema>

// ── 5. Acesso por Tenant (tenant_access) ─────────────────────────────────────
export const DocumentReaderTenantAccessSchema = BaseConfigSchema.extend({
  tenantAccess: z.record(z.string(), z.boolean()), // tenantId -> true/false
})

export type DocumentReaderTenantAccess = z.infer<typeof DocumentReaderTenantAccessSchema>
