// =============================================================================
// Zod validators — Comercial › Fila de Atendimento (Fase 3) — AutoDrive
// Check-in/out, pausa/retorno (payload de presença).
// =============================================================================

import { z } from 'zod'
import { QUEUE_CONFIG_LIMITS } from '@/lib/seller-queue/config-limits'

const optStr = z.string().trim().max(500).nullish()
const limits = QUEUE_CONFIG_LIMITS
const soundTypes = ['siren', 'beep', 'chime', 'alarm', 'bell', 'soft', 'double_beep', 'buzzer', 'strobe', 'sonar', 'space', 'elevator', 'ringtone', 'laser', 'melody', 'panic'] as const

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
  customerId:        optStr, // cliente existente selecionado na busca (anti-duplicação)
  leadId:            optStr, // lead existente selecionado na busca (anti-duplicação)
  notes:             optStr,
  // Modo de atendimento ao registrar a chegada.
  mode:              z.enum(['NORMAL', 'SPECIFIC', 'POS_VENDAS', 'AGENDAMENTO']).optional(),
  targetSellerId:    optStr, // colaborador escolhido (SPECIFIC / POS_VENDAS)
  // Força ir p/ a FILA INDIVIDUAL do colaborador (não chama agora), mesmo livre.
  toPersonalQueue:   z.boolean().optional(),
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
  customerId: optStr, // cliente já existente selecionado na busca (anti-duplicação)
  notes:  optStr,
  // Cliente registrado pelo vendedor que atendeu (gera o lead de atendimento).
  customerName:  z.string().trim().max(200).nullish(),
  customerPhone: z.string().trim().max(40).nullish(),
  customerEmail: z.string().trim().email('E-mail inválido').max(200).or(z.literal('')).nullish(),
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
  alertSoundType:                z.enum(soundTypes).optional(),
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
  maxPauseMinutes:    z.number().int('O tempo de pausa/ausência deve ser um número inteiro.').min(limits.maxPauseMinutes.min, 'O tempo de pausa/ausência não pode ser negativo.').max(limits.maxPauseMinutes.max, 'O tempo de pausa/ausência deve ser no máximo 1440 minutos.').optional(),
  // Liga/desliga a fila automaticamente pelo horário (openTime/closeTime/allowedDays).
  autoSchedule:       z.boolean().optional(),
  // Lembretes de atendimento aberto + política de push da fila (campo JSON).
  attendanceReminder: z.object({
    enabled:               z.boolean(),
    firstAfterMinutes:     z.number().int('O primeiro lembrete deve ser um número inteiro.').min(limits.attendanceFirstAfterMinutes.min, 'O primeiro lembrete deve ser de no mínimo 1 minuto.').max(limits.attendanceFirstAfterMinutes.max, 'O primeiro lembrete deve ser de no máximo 1440 minutos.'),
    repeatIntervalSeconds: z.number().int('O intervalo de repetição dos lembretes deve ser um número inteiro.').min(limits.attendanceRepeatIntervalSeconds.min, 'O intervalo de repetição dos lembretes deve ser de no mínimo 30 segundos.').max(limits.attendanceRepeatIntervalSeconds.max, 'O intervalo de repetição dos lembretes deve ser de no máximo 86400 segundos.'),
    maxReminders:          z.number().int('A quantidade máxima de lembretes deve ser um número inteiro.').min(limits.attendanceMaxReminders.min, 'A quantidade máxima de lembretes deve ser no mínimo 1.').max(limits.attendanceMaxReminders.max, 'A quantidade máxima de lembretes deve ser no máximo 50.'),
    escalateAfter:         z.number().int('A quantidade de lembretes para escalar deve ser um número inteiro.').min(limits.attendanceEscalateAfter.min, 'A quantidade de lembretes para escalar deve ser no mínimo 1.').max(limits.attendanceEscalateAfter.max, 'A quantidade de lembretes para escalar deve ser no máximo 50.'),
    autoEscalate:          z.boolean(),
    requireFinishOnNo:     z.boolean(),
    allowSnooze:           z.boolean(),
    logEveryReminder:      z.boolean(),
  }).optional(),
  queuePush: z.object({
    enabled:                   z.boolean(),
    intervalSeconds:           z.number().int('O intervalo mínimo de push deve ser um número inteiro.').min(limits.queuePushIntervalSeconds.min, 'O intervalo mínimo de push deve ser de no mínimo 30 segundos.').max(limits.queuePushIntervalSeconds.max, 'O intervalo mínimo de push deve ser de no máximo 86400 segundos.'),
    targetScope:               z.enum(['CURRENT_SELLER', 'CALLED_SELLER', 'ALL_ACTIVE_PARTICIPANTS', 'MANAGERS', 'MANAGERS_AND_CURRENT', 'ALL_QUEUE']),
    maxRetries:                z.number().int('A quantidade máxima de tentativas deve ser um número inteiro.').min(limits.queuePushMaxRetries.min, 'A quantidade máxima de tentativas deve ser no mínimo 1.').max(limits.queuePushMaxRetries.max, 'A quantidade máxima de tentativas deve ser no máximo 50.'),
    resendUntil:               z.enum(['ACKNOWLEDGED', 'FINISHED', 'MAX_RETRIES']),
    antiSpamUserLimit:         z.number().int('O limite por vendedor deve ser um número inteiro.').min(limits.queuePushAntiSpamUserLimit.min, 'O limite por vendedor deve ser no mínimo 1.').max(limits.queuePushAntiSpamUserLimit.max, 'O limite por vendedor deve ser no máximo 100.'),
    antiSpamAttendanceLimit:   z.number().int('O limite por atendimento deve ser um número inteiro.').min(limits.queuePushAntiSpamAttendanceLimit.min, 'O limite por atendimento deve ser no mínimo 1.').max(limits.queuePushAntiSpamAttendanceLimit.max, 'O limite por atendimento deve ser no máximo 100.'),
    antiSpamQueueLimit:        z.number().int('O limite por fila deve ser um número inteiro.').min(limits.queuePushAntiSpamQueueLimit.min, 'O limite por fila deve ser no mínimo 1.').max(limits.queuePushAntiSpamQueueLimit.max, 'O limite por fila deve ser no máximo 500.'),
    antiSpamWindowMinutes:     z.number().int('A janela anti-spam deve ser um número inteiro.').min(limits.queuePushAntiSpamWindowMinutes.min, 'A janela anti-spam deve ser de no mínimo 1 minuto.').max(limits.queuePushAntiSpamWindowMinutes.max, 'A janela anti-spam deve ser de no máximo 1440 minutos.'),
    allowedStartTime:          optStr,
    allowedEndTime:            optStr,
    allowOutsideHoursForAdmins: z.boolean(),
    urgency:                   z.enum(['NORMAL', 'HIGH']),
    sound:                     z.boolean(),
  }).optional(),
  panelSound: z.object({
    enabled: z.boolean(),
    repeatUntilAccepted: z.boolean(),
    repeatSeconds: z.number().int('O intervalo do toque do painel deve ser um número inteiro.').min(1, 'O intervalo do toque do painel deve ser de no mínimo 1 segundo.').max(30, 'O intervalo do toque do painel deve ser de no máximo 30 segundos.'),
    refreshSeconds: z.number().int('O intervalo de atualização do painel deve ser um número inteiro.').min(3, 'O intervalo de atualização do painel deve ser de no mínimo 3 segundos.').max(60, 'O intervalo de atualização do painel deve ser de no máximo 60 segundos.'),
    volume: z.number().int('O volume do painel deve ser um número inteiro.').min(0, 'O volume do painel deve ser no mínimo 0.').max(100, 'O volume do painel deve ser no máximo 100.'),
    soundType: z.enum(soundTypes),
    playOnDashboard: z.boolean(),
    onlyStorePanel: z.boolean(),
    muteOutsideHours: z.boolean(),
    requireManualActivation: z.boolean(),
    wakeLock: z.boolean(),
    showHiddenWarning: z.boolean(),
  }).optional(),
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
  // Novas configurações para a Fila Automática / Modo Anti-Briga
  infoRapidaConsumesTurn:      z.enum(['NO', 'YES', 'TIME_LIMIT']).optional(),
  infoRapidaTimeLimitMinutes:  z.number().int().min(1).max(120).optional(),
  allowWaitWithOpenAttendance: z.enum(['NO', 'YES', 'QUICK_ONLY']).optional(),
  responsibleUserIds:          z.array(z.string()).optional(),
})
