// =============================================================================
// Quality System — Tipos, categorias e constantes.
// Pontos NEGATIVOS = penalidade. Pontos POSITIVOS = estorno/correção.
// =============================================================================

export type QualityCategory = 'PENDENCY' | 'LEAD' | 'ATTENDANCE' | 'ADMIN' | 'QUEUE' | 'MANUAL'

export const QUALITY_CATEGORIES: Record<QualityCategory, string> = {
  PENDENCY:   'Pendências',
  LEAD:       'Gestão de leads',
  ATTENDANCE: 'Qualidade do atendimento',
  ADMIN:      'Procedimentos administrativos',
  QUEUE:      'Fila de atendimento',
  MANUAL:     'Aplicação manual',
}

// ── Tipos de eventos por categoria ──────────────────────────────────────────

export const QUALITY_EVENT_TYPES = {
  // PENDENCY
  PENDENCY_SLA_BREACH:        'PENDENCY_SLA_BREACH',        // pendência venceu SLA sem resolução
  PENDENCY_OVERDUE_DAILY:     'PENDENCY_OVERDUE_DAILY',     // +1 dia em atraso (recorrente)
  PENDENCY_NOT_ACKNOWLEDGED:  'PENDENCY_NOT_ACKNOWLEDGED',  // não marcou ciente em X horas
  // LEAD
  LEAD_NO_RESPONSE_24H:       'LEAD_NO_RESPONSE_24H',       // lead sem contato há 24h
  LEAD_NO_RESPONSE_48H:       'LEAD_NO_RESPONSE_48H',       // lead sem contato há 48h
  LEAD_NO_SUMMARY_48H:        'LEAD_NO_SUMMARY_48H',        // lead sem resumo há 48h
  LEAD_NOT_FED_SYSTEM:        'LEAD_NOT_FED_SYSTEM',        // não alimentou o sistema (resultado)
  LEAD_CLIENT_WAITING:        'LEAD_CLIENT_WAITING',        // cliente de lead aguardando retorno
  // ATTENDANCE
  ATTENDANCE_NOT_FINALIZED:   'ATTENDANCE_NOT_FINALIZED',   // atendimento presencial não finalizado
  ATTENDANCE_NO_REGISTRATION: 'ATTENDANCE_NO_REGISTRATION', // não cadastrou o cliente no atendimento
  // ADMIN
  ADMIN_PROCEDURE_MISSED:     'ADMIN_PROCEDURE_MISSED',     // deixou de seguir procedimento
  ADMIN_DEADLINE_MISSED:      'ADMIN_DEADLINE_MISSED',      // prazo administrativo perdido
  // QUEUE
  QUEUE_TIMEOUT:              'QUEUE_TIMEOUT',              // perdeu a vez na fila (timeout)
  QUEUE_FRAUD_CONFIRMED:      'QUEUE_FRAUD_CONFIRMED',      // ocorrência de fraude confirmada
  // MANUAL
  MANUAL_WARNING:             'MANUAL_WARNING',             // aviso formal do gestor
  MANUAL_PENALTY:             'MANUAL_PENALTY',             // penalidade manual por situação específica
  MANUAL_REVERSAL:            'MANUAL_REVERSAL',            // estorno manual
} as const

export type QualityEventType = typeof QUALITY_EVENT_TYPES[keyof typeof QUALITY_EVENT_TYPES]

export const QUALITY_EVENT_TYPE_LABELS: Record<QualityEventType, string> = {
  PENDENCY_SLA_BREACH:        'Pendência com SLA vencido',
  PENDENCY_OVERDUE_DAILY:     'Pendência em atraso (+1 dia)',
  PENDENCY_NOT_ACKNOWLEDGED:  'Pendência sem ciência',
  LEAD_NO_RESPONSE_24H:       'Lead sem resposta (24h)',
  LEAD_NO_RESPONSE_48H:       'Lead sem resposta (48h)',
  LEAD_NO_SUMMARY_48H:        'Lead sem resumo (48h)',
  LEAD_NOT_FED_SYSTEM:        'Sistema não alimentado',
  LEAD_CLIENT_WAITING:        'Cliente de lead aguardando',
  ATTENDANCE_NOT_FINALIZED:   'Atendimento não finalizado',
  ATTENDANCE_NO_REGISTRATION: 'Cliente não cadastrado',
  ADMIN_PROCEDURE_MISSED:     'Procedimento não seguido',
  ADMIN_DEADLINE_MISSED:      'Prazo administrativo perdido',
  QUEUE_TIMEOUT:              'Timeout na fila',
  QUEUE_FRAUD_CONFIRMED:      'Ocorrência de conformidade',
  MANUAL_WARNING:             'Aviso formal',
  MANUAL_PENALTY:             'Penalidade manual',
  MANUAL_REVERSAL:            'Estorno / correção',
}

export const QUALITY_EVENT_CATEGORIES: Record<QualityEventType, QualityCategory> = {
  PENDENCY_SLA_BREACH:        'PENDENCY',
  PENDENCY_OVERDUE_DAILY:     'PENDENCY',
  PENDENCY_NOT_ACKNOWLEDGED:  'PENDENCY',
  LEAD_NO_RESPONSE_24H:       'LEAD',
  LEAD_NO_RESPONSE_48H:       'LEAD',
  LEAD_NO_SUMMARY_48H:        'LEAD',
  LEAD_NOT_FED_SYSTEM:        'LEAD',
  LEAD_CLIENT_WAITING:        'LEAD',
  ATTENDANCE_NOT_FINALIZED:   'ATTENDANCE',
  ATTENDANCE_NO_REGISTRATION: 'ATTENDANCE',
  ADMIN_PROCEDURE_MISSED:     'ADMIN',
  ADMIN_DEADLINE_MISSED:      'ADMIN',
  QUEUE_TIMEOUT:              'QUEUE',
  QUEUE_FRAUD_CONFIRMED:      'QUEUE',
  MANUAL_WARNING:             'MANUAL',
  MANUAL_PENALTY:             'MANUAL',
  MANUAL_REVERSAL:            'MANUAL',
}

// Custo padrão de pontos por tipo (NEGATIVO = penalidade).
export const DEFAULT_POINT_COSTS: Record<QualityEventType, number> = {
  PENDENCY_SLA_BREACH:        -5,
  PENDENCY_OVERDUE_DAILY:     -2,
  PENDENCY_NOT_ACKNOWLEDGED:  -1,
  LEAD_NO_RESPONSE_24H:       -3,
  LEAD_NO_RESPONSE_48H:       -5,
  LEAD_NO_SUMMARY_48H:        -2,
  LEAD_NOT_FED_SYSTEM:        -4,
  LEAD_CLIENT_WAITING:        -3,
  ATTENDANCE_NOT_FINALIZED:   -5,
  ATTENDANCE_NO_REGISTRATION: -4,
  ADMIN_PROCEDURE_MISSED:     -6,
  ADMIN_DEADLINE_MISSED:      -4,
  QUEUE_TIMEOUT:              -2,
  QUEUE_FRAUD_CONFIRMED:      -8,
  MANUAL_WARNING:             -3,
  MANUAL_PENALTY:             -10,
  MANUAL_REVERSAL:            10, // positivo por padrão (sobrescrito na aplicação)
}

// Tipos que o sistema aplica automaticamente (sweep).
export const AUTO_APPLY_TYPES = new Set<QualityEventType>([
  'PENDENCY_SLA_BREACH',
  'PENDENCY_OVERDUE_DAILY',
  'LEAD_NO_RESPONSE_24H',
  'LEAD_NO_RESPONSE_48H',
  'LEAD_NO_SUMMARY_48H',
])

// Tipos que o gestor pode aplicar manualmente.
export const MANUAL_APPLY_TYPES = new Set<QualityEventType>([
  'ATTENDANCE_NOT_FINALIZED',
  'ATTENDANCE_NO_REGISTRATION',
  'ADMIN_PROCEDURE_MISSED',
  'ADMIN_DEADLINE_MISSED',
  'LEAD_NOT_FED_SYSTEM',
  'LEAD_CLIENT_WAITING',
  'MANUAL_WARNING',
  'MANUAL_PENALTY',
  'MANUAL_REVERSAL',
])
