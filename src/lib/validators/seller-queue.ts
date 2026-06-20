// =============================================================================
// Zod validators — Comercial › Fila de Atendimento (Fase 3) — AutoDrive
// Check-in/out, pausa/retorno (payload de presença).
// =============================================================================

import { z } from 'zod'

const optStr = z.string().trim().max(500).nullish()

// Payload de presença (enviado pelo celular do vendedor).
export const presenceSchema = z.object({
  latitude:  z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  accuracyM: z.number().nonnegative().max(100000).nullish(),
  deviceId:  optStr,
  qrToken:   optStr,
  // Override do gerente/líder com justificativa (exige permissão sellerQueue.override).
  override:       z.boolean().default(false),
  overrideReason: optStr,
})

export const checkInSchema = presenceSchema
export const resumeSchema = presenceSchema
export const checkOutSchema = z.object({ reason: optStr })
export const pauseSchema = z.object({ reason: optStr })
