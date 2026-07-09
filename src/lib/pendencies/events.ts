// =============================================================================
// Pendências — timeline unificada (Fase 2)
//
// `logPendencyEvent` grava um evento na tabela pendency_events (fonte de verdade
// da timeline e da auditoria de cobranças/penalidades). É TOLERANTE a migration
// pendente: se a tabela ainda não existir, apenas ignora (não quebra a mutação).
//
// `buildTimeline` e `eventLabel` são PUROS (sem I/O) para ficarem cobertos por
// teste — mesclam pendency_events + status_history + comments + notification_logs
// numa única lista cronológica.
// =============================================================================

import { prisma } from '@/lib/prisma'

export const PENDENCY_EVENT = {
  CREATED:          'CREATED',
  STATUS_CHANGED:   'STATUS_CHANGED',
  RESPONSE:         'RESPONSE',
  PRIORITY_CHANGED: 'PRIORITY_CHANGED',
  DUE_CHANGED:      'DUE_CHANGED',
  COMMITMENT:       'COMMITMENT',
  POPUP_SHOWN:      'POPUP_SHOWN',
  POPUP_DISMISSED:  'POPUP_DISMISSED',
  ESCALATED:        'ESCALATED',
  PENALTY_APPLIED:  'PENALTY_APPLIED',
  PENALTY_REMOVED:  'PENALTY_REMOVED',
  REMINDER_SENT:    'REMINDER_SENT',
  ASSIGNED:         'ASSIGNED',
} as const

export type PendencyEventType = (typeof PENDENCY_EVENT)[keyof typeof PENDENCY_EVENT]

export interface LogPendencyEventInput {
  tenantId?:     string | null
  pendencyId:    string
  type:          PendencyEventType
  authorId?:     string | null
  authorName?:   string | null
  content?:      string | null
  prevStatus?:   string | null
  newStatus?:    string | null
  prevPriority?: string | null
  newPriority?:  string | null
  prevDueDate?:  Date | null
  newDueDate?:   Date | null
}

/** Grava um evento na timeline. Nunca lança (migration pendente = no-op). */
export async function logPendencyEvent(input: LogPendencyEventInput): Promise<void> {
  try {
    await prisma.pendencyEvent.create({
      data: {
        tenantId:     input.tenantId ?? null,
        pendencyId:   input.pendencyId,
        type:         input.type,
        authorId:     input.authorId ?? null,
        authorName:   input.authorName ?? null,
        content:      input.content ?? null,
        prevStatus:   input.prevStatus ?? null,
        newStatus:    input.newStatus ?? null,
        prevPriority: input.prevPriority ?? null,
        newPriority:  input.newPriority ?? null,
        prevDueDate:  input.prevDueDate ?? null,
        newDueDate:   input.newDueDate ?? null,
      },
    })
  } catch {
    // Tabela ainda não migrada ou erro transitório: não bloqueia a operação.
  }
}

// ---------------------------------------------------------------------------
// Timeline pura (mescla + rótulos)
// ---------------------------------------------------------------------------

const STATUS_PT: Record<string, string> = {
  ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_RESPOSTA: 'Aguardando resposta',
  PAUSADA: 'Pausada', FINALIZADA: 'Finalizada', REATIVADA: 'Reativada', CANCELADA: 'Arquivada',
  VENCIDA: 'Vencida',
}
const PRIORITY_PT: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente', CRITICA: 'Crítica',
}
const stPt = (s?: string | null) => (s ? STATUS_PT[s] ?? s : '—')
const prPt = (p?: string | null) => (p ? PRIORITY_PT[p] ?? p : '—')

export interface TimelineEntry {
  id:     string
  kind:   string            // grupo visual: status | comment | event | send
  type:   string            // tipo específico do evento
  at:     string            // ISO
  by:     string | null
  title:  string
  detail?: string | null
}

/** Rótulo humano (PT) de um evento da tabela pendency_events. */
export function eventLabel(e: {
  type: string; prevStatus?: string | null; newStatus?: string | null
  prevPriority?: string | null; newPriority?: string | null
  prevDueDate?: Date | string | null; newDueDate?: Date | string | null
}): string {
  const d = (v?: Date | string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')
  switch (e.type) {
    case PENDENCY_EVENT.CREATED:          return 'Pendência criada'
    case PENDENCY_EVENT.STATUS_CHANGED:   return `Status: ${stPt(e.prevStatus)} → ${stPt(e.newStatus)}`
    case PENDENCY_EVENT.RESPONSE:         return 'Resposta do responsável'
    case PENDENCY_EVENT.PRIORITY_CHANGED: return `Prioridade: ${prPt(e.prevPriority)} → ${prPt(e.newPriority)}`
    case PENDENCY_EVENT.DUE_CHANGED:      return `Prazo: ${d(e.prevDueDate)} → ${d(e.newDueDate)}`
    case PENDENCY_EVENT.COMMITMENT:       return `Prazo comprometido: ${d(e.newDueDate)}`
    case PENDENCY_EVENT.POPUP_SHOWN:      return 'Pop-up de cobrança exibido'
    case PENDENCY_EVENT.POPUP_DISMISSED:  return 'Pop-up adiado/ignorado'
    case PENDENCY_EVENT.ESCALATED:        return 'Escalonada para gestão'
    case PENDENCY_EVENT.PENALTY_APPLIED:  return 'Penalidade aplicada'
    case PENDENCY_EVENT.PENALTY_REMOVED:  return 'Penalidade removida'
    case PENDENCY_EVENT.REMINDER_SENT:    return 'Lembrete enviado'
    case PENDENCY_EVENT.ASSIGNED:         return 'Responsável designado'
    default:                              return e.type
  }
}

export interface TimelineSources {
  events?: Array<{ id: string; type: string; authorName?: string | null; content?: string | null; prevStatus?: string | null; newStatus?: string | null; prevPriority?: string | null; newPriority?: string | null; prevDueDate?: Date | string | null; newDueDate?: Date | string | null; createdAt: Date | string }>
  statusHistory?: Array<{ id: string; previousStatus?: string | null; newStatus: string; reason?: string | null; createdAt: Date | string; changedByUser?: { name?: string | null } | null }>
  comments?: Array<{ id: string; content: string; createdAt: Date | string; user?: { name?: string | null } | null }>
  notificationLogs?: Array<{ id: string; channel: string; status: string; sentCount?: number; detail?: string | null; createdAt: Date | string }>
}

/** Mescla todas as fontes numa timeline única, do mais recente ao mais antigo. */
export function buildTimeline(src: TimelineSources): TimelineEntry[] {
  const iso = (v: Date | string) => new Date(v).toISOString()
  const out: TimelineEntry[] = []

  for (const e of src.events ?? []) {
    out.push({ id: `ev_${e.id}`, kind: 'event', type: e.type, at: iso(e.createdAt), by: e.authorName ?? null, title: eventLabel(e), detail: e.content ?? null })
  }
  for (const h of src.statusHistory ?? []) {
    out.push({ id: `st_${h.id}`, kind: 'status', type: PENDENCY_EVENT.STATUS_CHANGED, at: iso(h.createdAt), by: h.changedByUser?.name ?? null, title: `Status: ${stPt(h.previousStatus)} → ${stPt(h.newStatus)}`, detail: h.reason ?? null })
  }
  for (const c of src.comments ?? []) {
    out.push({ id: `cm_${c.id}`, kind: 'comment', type: PENDENCY_EVENT.RESPONSE, at: iso(c.createdAt), by: c.user?.name ?? null, title: 'Comentário', detail: c.content })
  }
  for (const l of src.notificationLogs ?? []) {
    const label = l.channel === 'ESCALATION' ? 'Escalonamento notificado' : l.status === 'SENT' ? `Lembrete enviado (${l.sentCount ?? 0})` : 'Lembrete sem aparelho'
    out.push({ id: `nl_${l.id}`, kind: 'send', type: PENDENCY_EVENT.REMINDER_SENT, at: iso(l.createdAt), by: null, title: label, detail: l.detail ?? null })
  }

  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}
