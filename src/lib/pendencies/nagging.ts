// =============================================================================
// Nagging da Crítica (Fase 4) — decisões PURAS (sem I/O, testáveis)
//
// "Crítica" = severity 'CRITICAL' (não é enum de prioridade). Uma pendência vira
// crítica quando: (a) o prazo comprometido estoura N vezes, ou (b) é Urgente e
// fica sem resposta por X horas — ou manualmente pelo gestor. Uma vez crítica,
// o nagging escala em NÍVEIS conforme o tempo em Crítica:
//   Nível 1 (0–L2h):  banner fixo no topo enquanto logado.
//   Nível 2 (L2–L3h): modal bloqueante + push periódico.
//   Nível 3 (L3h+):   escala p/ gestão + libera penalidade (Fase 5).
// =============================================================================

import { PENDENCY_EVENT } from './events'
import type { PendencySlaEngineSettings } from './settings'

const STOPPED = new Set(['FINALIZADA', 'CANCELADA', 'AGUARDANDO_RESPOSTA'])

export interface NaggingEventLite {
  type:        string
  newDueDate?: Date | string | null
  createdAt:   Date | string
}

const ms = (v: Date | string) => new Date(v).getTime()

/** Momento em que a pendência virou Crítica (1º evento CRITICAL_RAISED) ou null. */
export function criticalSince(events: NaggingEventLite[]): Date | null {
  const raised = events
    .filter((e) => e.type === PENDENCY_EVENT.CRITICAL_RAISED)
    .sort((a, b) => ms(a.createdAt) - ms(b.createdAt))
  return raised[0] ? new Date(raised[0].createdAt) : null
}

/** Nível de nagging (0 = não crítica/ainda sem marco). */
export function criticalLevel(since: Date | null, now: Date, cfg: PendencySlaEngineSettings): 0 | 1 | 2 | 3 {
  if (!since) return 0
  const hours = (now.getTime() - since.getTime()) / 3600_000
  if (hours >= cfg.naggingL3Hours) return 3
  if (hours >= cfg.naggingL2Hours) return 2
  return 1
}

export interface ShouldBecomeCriticalInput {
  priority: string
  severity: string | null
  status:   string
  events:   NaggingEventLite[]
  now:      Date
  cfg:      PendencySlaEngineSettings
}

/** Deve ser elevada a Crítica agora? (auto-gatilhos). */
export function shouldBecomeCritical(input: ShouldBecomeCriticalInput): { critical: boolean; reason: string } {
  const { priority, severity, status, events, now, cfg } = input
  if (severity === 'CRITICAL') return { critical: false, reason: 'já crítica' }
  if (STOPPED.has(status)) return { critical: false, reason: 'encerrada' }

  // (a) prazos comprometidos estourados N vezes.
  const overdueStrikes = events.filter(
    (e) => e.type === PENDENCY_EVENT.COMMITMENT && e.newDueDate && ms(e.newDueDate) < now.getTime(),
  ).length
  if (overdueStrikes >= cfg.overdueStrikesForCritical) {
    return { critical: true, reason: `prazo comprometido estourado ${overdueStrikes}x` }
  }

  // (b) Urgente sem RESPOSTA há mais de criticalStaleHours (desde a criação ou
  // última resposta/compromisso).
  if (priority === 'URGENTE') {
    const activity = events
      .filter((e) => [PENDENCY_EVENT.RESPONSE, PENDENCY_EVENT.COMMITMENT, PENDENCY_EVENT.CREATED].includes(e.type as never))
      .map((e) => ms(e.createdAt))
    const lastActivity = activity.length ? Math.max(...activity) : null
    if (lastActivity !== null && (now.getTime() - lastActivity) >= cfg.criticalStaleHours * 3600_000) {
      return { critical: true, reason: `Urgente sem resposta há ${cfg.criticalStaleHours}h` }
    }
  }

  return { critical: false, reason: '' }
}
