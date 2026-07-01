// =============================================================================
// PendencyStatusBadge — Badge reutilizável de status e prioridade — AutoDrive
// =============================================================================

import { cn } from '@/lib/utils'
import type { PendencyPriority, PendencyStatus } from '@/types'

// ── Prioridade ──────────────────────────────────────────────────────────────

export const PRIORITY_CONFIG: Record<
  PendencyPriority,
  { label: string; bgClass: string; textClass: string; borderClass: string; dotClass: string }
> = {
  URGENTE: {
    label:       'Urgente',
    bgClass:     'bg-red-600',
    textClass:   'text-white',
    borderClass: 'border-red-700',
    dotClass:    'bg-red-300',
  },
  ALTA: {
    label:       'Alta',
    bgClass:     'bg-orange-500',
    textClass:   'text-white',
    borderClass: 'border-orange-600',
    dotClass:    'bg-orange-300',
  },
  MEDIA: {
    label:       'Média',
    bgClass:     'bg-amber-500',
    textClass:   'text-white',
    borderClass: 'border-amber-600',
    dotClass:    'bg-amber-300',
  },
  BAIXA: {
    label:       'Baixa',
    bgClass:     'bg-green-600',
    textClass:   'text-white',
    borderClass: 'border-green-700',
    dotClass:    'bg-green-300',
  },
}

// ── Status ──────────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  PendencyStatus,
  { label: string; bgClass: string; textClass: string; borderClass: string }
> = {
  ABERTA: {
    label:       'Aberta',
    bgClass:     'bg-amber-100',
    textClass:   'text-amber-800',
    borderClass: 'border-amber-200',
  },
  EM_ANDAMENTO: {
    label:       'Em Andamento',
    bgClass:     'bg-blue-100',
    textClass:   'text-blue-800',
    borderClass: 'border-blue-200',
  },
  AGUARDANDO_RESPOSTA: {
    label:       'Aguardando',
    bgClass:     'bg-sky-100',
    textClass:   'text-sky-800',
    borderClass: 'border-sky-200',
  },
  PAUSADA: {
    label:       'Pausada',
    bgClass:     'bg-gray-100',
    textClass:   'text-gray-700',
    borderClass: 'border-gray-200',
  },
  FINALIZADA: {
    label:       'Finalizada',
    bgClass:     'bg-green-100',
    textClass:   'text-green-800',
    borderClass: 'border-green-200',
  },
  REATIVADA: {
    label:       'Reativada',
    bgClass:     'bg-violet-100',
    textClass:   'text-violet-800',
    borderClass: 'border-violet-200',
  },
  CANCELADA: {
    label:       'Arquivada',
    bgClass:     'bg-gray-200',
    textClass:   'text-gray-700',
    borderClass: 'border-gray-300',
  },
  VENCIDA: {
    label:       'Vencida',
    bgClass:     'bg-red-100',
    textClass:   'text-red-800',
    borderClass: 'border-red-200',
  },
}

// ── Priority border helpers ──────────────────────────────────────────────────

export const PRIORITY_BORDER_COLOR: Record<PendencyPriority, string> = {
  URGENTE: 'hover:border-red-600',
  ALTA:    'hover:border-orange-500',
  MEDIA:   'hover:border-amber-500',
  BAIXA:   'hover:border-green-600',
}

// ── PriorityBadge ────────────────────────────────────────────────────────────

interface PriorityBadgeProps {
  priority:  PendencyPriority
  size?:     'sm' | 'md' | 'lg'
  showDot?:  boolean
  className?: string
}

export function PriorityBadge({ priority, size = 'md', showDot = false, className }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG['MEDIA']

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-2xs font-semibold',
    md: 'px-2 py-0.5 text-xs font-semibold',
    lg: 'px-3 py-1 text-sm font-semibold',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border',
        config.bgClass,
        config.textClass,
        config.borderClass,
        sizeClasses[size],
        className,
      )}
    >
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />}
      {config.label}
    </span>
  )
}

// ── StatusBadge ──────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status:    PendencyStatus
  size?:     'sm' | 'md' | 'lg'
  className?: string
}

export function StatusBadge({ status, size = 'md', className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, bgClass: 'bg-gray-100', textClass: 'text-gray-700', borderClass: 'border-gray-200' }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-2xs font-medium',
    md: 'px-2 py-0.5 text-xs font-medium',
    lg: 'px-3 py-1 text-sm font-medium',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border',
        config.bgClass,
        config.textClass,
        config.borderClass,
        sizeClasses[size],
        className,
      )}
    >
      {config.label}
    </span>
  )
}
