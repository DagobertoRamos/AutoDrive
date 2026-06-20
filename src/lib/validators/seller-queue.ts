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

// ── Cliente na loja (Fase 4) ────────────────────────────────────────────────
export const createArrivalSchema = z.object({
  customerName:      z.string().trim().max(200).nullish(),
  customerPhone:     z.string().trim().max(40).nullish(),
  requestedSellerId: optStr, // cliente pediu por um vendedor (exige regra/aprovação)
  notes:             optStr,
}).refine((d) => Boolean(d.customerName || d.customerPhone), { message: 'Informe ao menos o nome ou o telefone do cliente.' })

// call-next: líder/gerente pode forçar um vendedor (com justificativa).
export const callNextSchema = z.object({
  sellerId: optStr,
  reason:   optStr,
})

// ── Atendimento: aceite / recusa / timeout / finalizar (Fase 5) ─────────────
export const attendanceTypes = ['SALE', 'EXCHANGE', 'PURCHASE', 'CONSIGNMENT', 'FINANCING', 'AFTER_SALES', 'OTHER'] as const
export const attendanceResults = ['CONVERTED_TO_NEGOTIATION', 'SCHEDULED_RETURN', 'NO_INTEREST', 'LOST', 'DUPLICATED', 'FORWARDED_TO_RESPONSIBLE', 'INVALID_ATTENDANCE'] as const

export const acceptSchema = presenceSchema // aceitar revalida presença
export const rejectSchema = z.object({ reason: z.string().trim().min(2, 'Motivo da recusa é obrigatório.') })
export const timeoutSchema = z.object({ reason: optStr })
export const finishSchema = z.object({
  type:   z.enum(attendanceTypes),
  result: z.enum(attendanceResults),
  dealId: optStr,
  leadId: optStr,
  notes:  optStr,
})
