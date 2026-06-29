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
  customerEmail:     z.string().trim().email('E-mail inválido').max(200).nullish(),
  customerIsWhatsapp: z.boolean().optional(),
  requestedSellerId: optStr, // cliente pediu por um vendedor (exige regra/aprovação)
  notes:             optStr,
  // Modo de atendimento ao registrar a chegada.
  mode:              z.enum(['NORMAL', 'SPECIFIC', 'POS_VENDAS', 'AGENDAMENTO']).optional(),
  targetSellerId:    optStr, // colaborador escolhido (SPECIFIC / POS_VENDAS)
}).refine((d) => Boolean(d.customerName || d.customerPhone || d.targetSellerId), { message: 'Informe o cliente (nome/telefone) ou escolha o colaborador.' })

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
  // Cliente registrado pelo vendedor que atendeu (gera o lead de atendimento).
  customerName:  z.string().trim().max(200).nullish(),
  customerPhone: z.string().trim().max(40).nullish(),
  customerEmail: z.string().trim().email('E-mail inválido').max(200).nullish(),
})

// ── Ações do gerente: bloquear/liberar + reordenar (Fase 8) ─────────────────
export const blockSchema = z.object({
  blocked: z.boolean(),
  reason:  z.string().trim().min(2, 'Justificativa obrigatória.'),
})
export const reorderSchema = z.object({
  entryId:   z.string().trim().min(1),
  direction: z.enum(['up', 'down']),
  reason:    z.string().trim().min(2, 'Justificativa obrigatória.'),
})

// ── Configuração da unidade (Fase 8) ────────────────────────────────────────
export const presenceMethodValues = ['GPS', 'QR_CODE', 'DEVICE_CHECK'] as const
export const configSchema = z.object({
  active:                        z.boolean().optional(),
  presenceMethods:               z.array(z.enum(presenceMethodValues)).optional(),
  geofenceLat:                   z.number().min(-90).max(90).nullish(),
  geofenceLng:                   z.number().min(-180).max(180).nullish(),
  geofenceRadiusM:               z.number().int().min(10).max(5000).optional(),
  qrSecret:                      optStr,
  acceptTimeoutSeconds:          z.number().int().min(10).max(600).optional(),
  requireRevalidationOnAccept:   z.boolean().optional(),
  openTime:                      optStr,
  closeTime:                     optStr,
  allowedDays:                   z.array(z.string().trim().max(8)).optional(),
  recurringCustomerRule:         z.enum(['RESPONSIBLE', 'QUEUE']).optional(),
  requestByNameRequiresApproval: z.boolean().optional(),
  // Avisos/alertas
  alertSound:                    z.boolean().optional(),
  alertSoundType:                z.enum(['siren', 'beep', 'chime', 'alarm', 'bell', 'soft']).optional(),
  alertBrowserPush:              z.boolean().optional(),
  alertWhatsapp:                 z.boolean().optional(),
  alertWhatsappManagers:         z.boolean().optional(),
  alertRepeatSeconds:            z.number().int().min(5).max(120).optional(),
  allowChooseSeller:             z.boolean().optional(),
  // Quem pode finalizar o atendimento: se false, só a gestão (líder/gerente).
  allowSellerFinish: z.boolean().optional(),
  // Motivos cadastrados pela gestão (encerrar lead/atendimento e negociação).
  leadCloseReasons:   z.array(z.string().trim().min(1).max(80)).max(60).optional(),
  negotiationReasons: z.array(z.string().trim().min(1).max(80)).max(60).optional(),
  // Auto-saída por pausa/ausência prolongada (minutos). 0/ausente = desligado.
  maxPauseMinutes:    z.number().int().min(0).max(480).optional(),
  // Liga/desliga a fila automaticamente pelo horário (openTime/closeTime/allowedDays).
  autoSchedule:       z.boolean().optional(),
  // Estratégia anti-abuso (bloqueio por reincidência de timeouts no dia).
  autoBlock: z.object({
    enabled:              z.boolean(),
    strikesForCooldown:   z.number().int().min(1).max(20),
    cooldownHours:        z.number().int().min(1).max(24),
    strikesForDailyBlock: z.number().int().min(2).max(40),
  }).refine((a) => a.strikesForDailyBlock > a.strikesForCooldown, {
    message: 'O bloqueio diário deve exigir mais perdas que o bloqueio temporário.',
    path: ['strikesForDailyBlock'],
  }).optional(),
})
