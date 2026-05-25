// =============================================================================
// Status de Avaliação — labels, cores e ordenação corporativa AutoDrive.
// Reutilizado por badge, filtros e cards de stats.
// =============================================================================

export type EvaluationStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'PENDING_REVIEW'
  | 'FINALIZED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REOPENED'
  | 'CANCELED'

export interface StatusDef {
  value:   EvaluationStatus
  label:   string
  /** Classes Tailwind para badge (fundo + texto + borda). */
  badge:   string
  /** Cor compacta para ícones e barras laterais. */
  dot:     string
  /** Mostrado na lista padrão (sem filtro) — apenas estes status aparecem. */
  isOpen:  boolean
}

export const EVALUATION_STATUS: StatusDef[] = [
  { value: 'DRAFT',          label: 'Rascunho',             badge: 'bg-gray-100 text-gray-700 border-gray-200',   dot: 'bg-gray-400',   isOpen: true },
  { value: 'IN_PROGRESS',    label: 'Em andamento',         badge: 'bg-blue-50 text-blue-700 border-blue-200',    dot: 'bg-blue-500',   isOpen: true },
  { value: 'PENDING_REVIEW', label: 'Aguardando aprovação', badge: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500',  isOpen: true },
  { value: 'REOPENED',       label: 'Reaberta',             badge: 'bg-orange-50 text-orange-800 border-orange-200', dot: 'bg-orange-500', isOpen: true },
  { value: 'APPROVED',       label: 'Aprovada',             badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', isOpen: false },
  { value: 'FINALIZED',      label: 'Finalizada',           badge: 'bg-teal-50 text-teal-700 border-teal-200',    dot: 'bg-teal-500',   isOpen: false },
  { value: 'REJECTED',       label: 'Rejeitada',            badge: 'bg-red-50 text-red-700 border-red-200',       dot: 'bg-red-500',    isOpen: false },
  { value: 'CANCELED',       label: 'Cancelada',            badge: 'bg-gray-100 text-gray-500 border-gray-200',   dot: 'bg-gray-400',   isOpen: false },
]

export const STATUS_BY_VALUE: Record<string, StatusDef> = Object.fromEntries(
  EVALUATION_STATUS.map((s) => [s.value, s]),
)

export function getStatusDef(value: string | null | undefined): StatusDef {
  return STATUS_BY_VALUE[value ?? ''] ?? EVALUATION_STATUS[0]
}

/** Status "abertos" — que precisam de atenção operacional. */
export const OPEN_STATUSES: EvaluationStatus[] =
  EVALUATION_STATUS.filter((s) => s.isOpen).map((s) => s.value)
