// =============================================================================
// Zod validators — Telefonia (Fase 3B) — AutoDrive
// Conexões (BYOC, credenciais cifradas), números/ramais.
// =============================================================================

import { z } from 'zod'

const optStr = z.string().trim().max(2000).nullish()
const reqStr = (label: string, min = 1) => z.string().trim().min(min, `${label} é obrigatório.`)

export const telephonyEnvironments = ['HOMOLOGACAO', 'PRODUCAO'] as const
export const telephonyProviderKinds = ['ASTERISK', 'THREE_CX', 'TWILIO', 'GENERIC_WEBHOOK', 'MANUAL'] as const

// ── Provedores (MASTER, global) ─────────────────────────────────────────────
export const createProviderSchema = z.object({
  name:              reqStr('Nome', 2),
  kind:              z.enum(telephonyProviderKinds),
  active:            z.boolean().default(true),
  supportsInbound:   z.boolean().default(false),
  supportsOutbound:  z.boolean().default(false),
  supportsRecording: z.boolean().default(false),
  supportsWebhook:   z.boolean().default(false),
  baseUrl:           optStr,
  apiVersion:        optStr,
  notes:             optStr,
  fieldMappings:     z.record(z.unknown()).nullish(),
})
export const updateProviderSchema = z.object({
  name:              z.string().trim().min(2).optional(),
  kind:              z.enum(telephonyProviderKinds).optional(),
  active:            z.boolean().optional(),
  supportsInbound:   z.boolean().optional(),
  supportsOutbound:  z.boolean().optional(),
  supportsRecording: z.boolean().optional(),
  supportsWebhook:   z.boolean().optional(),
  baseUrl:           optStr,
  apiVersion:        optStr,
  notes:             optStr,
  fieldMappings:     z.record(z.unknown()).nullish(),
})

// Segredos da conexão (livres por provedor: sipUser, sipPassword, apiKey, token,
// accountSid, authToken, etc.). Validados como mapa string→string não vazio.
const secretsRecord = z.record(z.string().trim().min(1)).nullish()

// ── Conexões ────────────────────────────────────────────────────────────────
export const createConnectionSchema = z.object({
  providerId:    reqStr('Provedor'),
  environment:   z.enum(telephonyEnvironments).default('PRODUCAO'),
  label:         optStr,
  webhookActive: z.boolean().default(false),
  secrets:       secretsRecord, // cifrados no backend; nunca retornados em claro
})

export const updateConnectionSchema = z.object({
  environment:   z.enum(telephonyEnvironments).optional(),
  label:         optStr,
  active:        z.boolean().optional(),
  webhookActive: z.boolean().optional(),
  secrets:       secretsRecord, // se enviado, ROTACIONA as credenciais
})

// ── Números / ramais ──────────────────────────────────────────────────────────
export const createNumberSchema = z.object({
  number:       reqStr('Número', 3),
  connectionId: optStr,
  label:        optStr,
  extension:    optStr,
  unitId:       optStr,
  source:       optStr,
  inbound:      z.boolean().default(true),
  outbound:     z.boolean().default(true),
  active:       z.boolean().default(true),
})

export const updateNumberSchema = z.object({
  number:       z.string().trim().min(3).optional(),
  connectionId: optStr,
  label:        optStr,
  extension:    optStr,
  unitId:       optStr,
  source:       optStr,
  inbound:      z.boolean().optional(),
  outbound:     z.boolean().optional(),
  active:       z.boolean().optional(),
})
