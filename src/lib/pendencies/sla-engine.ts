// =============================================================================
// Motor de SLA / pop-ups (Fase 3) — decisão PURA (sem I/O, 100% testável)
//
// A partir da prioridade + status + eventos da pendência (pendency_events) +
// config, decide QUAL pop-up bloqueante o responsável deve ver ao entrar:
//   - 'commit'  → Alta/Urgente SEM prazo comprometido: "Em quanto tempo resolve?"
//   - 'charge'  → Urgente com prazo comprometido ESTOURADO e sem cobrança recente:
//                 "Você disse que resolveria até X. O que aconteceu?"
//   - 'none'    → nada a cobrar agora.
//
// Todo o estado (prazo comprometido, adiamentos, última cobrança) é DERIVADO dos
// eventos — sem colunas novas na Pendency.
// =============================================================================

import { PENDENCY_EVENT } from './events'
import type { PendencySlaEngineSettings } from './settings'

export type PopupKind = 'none' | 'commit' | 'charge'

// Status em que o ciclo PARA (resolvida / em validação / arquivada).
const STOPPED_STATUS = new Set(['FINALIZADA', 'CANCELADA', 'AGUARDANDO_RESPOSTA'])

export interface SlaEventLite {
  type:        string
  content?:    string | null
  newDueDate?: Date | string | null
  createdAt:   Date | string
}

export interface SlaDecisionInput {
  priority: string
  status:   string
  events:   SlaEventLite[]
  now:      Date
  config:   PendencySlaEngineSettings
}

export interface SlaDecision {
  kind:             PopupKind
  blocking:         boolean
  committedDueDate: string | null   // ISO do prazo comprometido, se houver
  deferCount:       number
  canDefer:         boolean         // ainda pode adiar (< maxDefer)
  overdue:          boolean
}

const ms = (v: Date | string) => new Date(v).getTime()

/** Decide o pop-up a exibir para o responsável (ou 'none'). */
export function decidePendencyPopup(input: SlaDecisionInput): SlaDecision {
  const none: SlaDecision = { kind: 'none', blocking: false, committedDueDate: null, deferCount: 0, canDefer: false, overdue: false }
  const { priority, status, events, now, config } = input

  if (!config.enabled) return none
  if (STOPPED_STATUS.has(status)) return none
  if (!config.requireCommitFor.includes(priority as never)) return none

  // Derivações dos eventos.
  const commitments = events
    .filter((e) => e.type === PENDENCY_EVENT.COMMITMENT && e.newDueDate)
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
  const committed = commitments[0]?.newDueDate ? new Date(commitments[0].newDueDate) : null
  const deferCount = events.filter((e) => e.type === PENDENCY_EVENT.POPUP_DISMISSED).length
  const canDefer = deferCount < config.maxDefer

  // 1) Sem prazo comprometido → pop-up de compromisso (Alta e Urgente).
  if (!committed) {
    return { kind: 'commit', blocking: true, committedDueDate: null, deferCount, canDefer, overdue: false }
  }

  // 2) Com prazo comprometido: só Urgente cobra automaticamente ao estourar.
  const overdue = ms(committed) < now.getTime()
  if (priority === 'URGENTE' && overdue) {
    // Throttle: não recobrar dentro de chargeIntervalHours desde a última cobrança.
    const lastCharge = events
      .filter((e) => e.type === PENDENCY_EVENT.POPUP_SHOWN && e.content === 'charge')
      .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))[0]
    const withinThrottle = lastCharge
      ? (now.getTime() - ms(lastCharge.createdAt)) < config.chargeIntervalHours * 3600_000
      : false
    if (!withinThrottle) {
      return { kind: 'charge', blocking: true, committedDueDate: committed.toISOString(), deferCount, canDefer, overdue: true }
    }
  }

  return { ...none, committedDueDate: committed.toISOString(), deferCount, overdue }
}
