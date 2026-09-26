// =============================================================================
// Esteira de entrada do veículo — regras PURAS (testadas).
//
//   Portões (todos precisam estar resolvidos para o carro andar):
//     Avaliação · Negociação de entrada · Perícia · Recebimento do veículo
//     (Perícia vale "pendente/aprovada/com apontamento/reprovada" — só não vale
//      "sem perícia".)
//   Portões OK + serviços em aberto → EM_SERVICO  (aparece no site como "Em breve")
//   Portões OK + serviços concluídos → DISPONIVEL
//   Algum portão reaberto → volta para PENDENTE_PREPARACAO
// O status só é movido automaticamente enquanto o carro está na esteira
// (Pend. Preparação / Em serviço / Disponível); vendido, reservado, em
// negociação etc. nunca são tocados.
// =============================================================================

export const GATE_EVALUATION  = 'Avaliação'
export const GATE_NEGOTIATION = 'Negociação de entrada'
export const GATE_INSPECTION  = 'Perícia'
export const GATE_RECEIVE     = 'Recebimento do veículo'
export const STAGE_SERVICES   = 'Serviços da avaliação'
export const INFO_NOTES       = 'Pendências da avaliação'

export const INTAKE_GATES = [GATE_EVALUATION, GATE_NEGOTIATION, GATE_INSPECTION, GATE_RECEIVE] as const

/** Status em que a esteira pode mover o carro sozinha. */
export const INTAKE_AUTO_STATUSES = ['PENDENTE_PREPARACAO', 'EM_SERVICO', 'DISPONIVEL'] as const

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
export const sameLabel = (a: string, b: string) => norm(a) === norm(b)

export function isGate(label: string): boolean {
  return INTAKE_GATES.some((g) => sameLabel(g, label))
}

/** Perícia conta como resolvida com qualquer status, menos "sem perícia". */
export function inspectionOk(cautelarStatus: string | null | undefined): boolean {
  const s = String(cautelarStatus ?? '').toUpperCase()
  return !!s && s !== 'SEM_CAUTELAR'
}

export interface IntakePendency { label: string; resolved: boolean; resolvedAt?: Date | string | null; createdAt?: Date | string | null }

export interface IntakeState {
  /** Carro tem esteira (pelo menos um portão registrado). */
  tracked:      boolean
  gatesTotal:   number
  gatesDone:    number
  missingGates: string[]
  servicesOpen: boolean
  /** Status que a esteira quer para o carro, ou null se não deve mexer. */
  nextStatus:   'PENDENTE_PREPARACAO' | 'EM_SERVICO' | 'DISPONIVEL' | null
}

export function intakeState(pendencies: IntakePendency[], stockStatus: string | null | undefined): IntakeState {
  const gates = INTAKE_GATES.map((g) => pendencies.find((p) => sameLabel(p.label, g))).filter((p): p is IntakePendency => !!p)
  const tracked = gates.length > 0
  const missingGates = gates.filter((g) => !g.resolved).map((g) => g.label)
  const servicesOpen = pendencies.some((p) => sameLabel(p.label, STAGE_SERVICES) && !p.resolved)
  let want: IntakeState['nextStatus'] = null
  if (tracked) want = missingGates.length ? 'PENDENTE_PREPARACAO' : servicesOpen ? 'EM_SERVICO' : 'DISPONIVEL'
  const current = String(stockStatus ?? '').toUpperCase()
  const movable = (INTAKE_AUTO_STATUSES as readonly string[]).includes(current)
  return {
    tracked, gatesTotal: gates.length, gatesDone: gates.length - missingGates.length, missingGates, servicesOpen,
    nextStatus: movable && want && want !== current ? want : null,
  }
}

const DAY = 86_400_000
const toDate = (d: Date | string | null | undefined) => (d ? new Date(d) : null)

/** Dias inteiros entre duas datas (mín. 0). */
export function daysBetween(a: Date | string | null | undefined, b: Date | string | null | undefined = new Date()): number | null {
  const x = toDate(a); const y = toDate(b)
  if (!x || !y || isNaN(x.getTime()) || isNaN(y.getTime())) return null
  return Math.max(0, Math.floor((y.getTime() - x.getTime()) / DAY))
}

export interface TimelineStep { key: string; label: string; done: boolean; at: string | null; days: number | null }

/**
 * Linha do tempo da esteira: entrada → portões → serviços → fotos → disponível.
 * `days` = dias desde a entrada até concluir a etapa (time-to-line por etapa).
 */
export function intakeTimeline(input: {
  entryDate:   Date | string | null
  pendencies:  IntakePendency[]
  photosAt?:   Date | string | null
  availableAt?: Date | string | null
  stockStatus: string | null
}): TimelineStep[] {
  const find = (label: string) => input.pendencies.find((p) => sameLabel(p.label, label))
  const step = (key: string, label: string, done: boolean, at: Date | string | null | undefined): TimelineStep => {
    const d = toDate(at)
    return { key, label, done, at: done && d ? d.toISOString() : null, days: done && d ? daysBetween(input.entryDate, d) : null }
  }
  const gateSteps = INTAKE_GATES.map((g) => {
    const p = find(g)
    return step(norm(g).replace(/\s+/g, '-'), g, !!p?.resolved, p?.resolvedAt)
  })
  const svc = find(STAGE_SERVICES)
  const st = String(input.stockStatus ?? '').toUpperCase()
  return [
    step('entrada', 'Entrada', !!input.entryDate, input.entryDate),
    ...gateSteps,
    step('servicos', 'Serviços', svc ? svc.resolved : gateSteps.every((g) => g.done), svc?.resolvedAt ?? null),
    step('fotos', 'Fotos novas', !!input.photosAt, input.photosAt),
    step('disponivel', 'Disponível', st === 'DISPONIVEL' || st === 'EM_PROMOCAO', input.availableAt ?? null),
  ]
}
