'use client'

// =============================================================================
// Badges de status/tipo do veículo
// =============================================================================

import { cn } from '@/lib/utils'

// ── StockStatus ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DISPONIVEL:               { label: 'Disponível',           className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  VENDIDO:                  { label: 'Vendido',              className: 'bg-gray-100 text-gray-600 border-gray-200' },
  COMPRADO:                 { label: 'Comprado',             className: 'bg-blue-100 text-blue-800 border-blue-200' },
  CANCELADO:                { label: 'Cancelado',            className: 'bg-red-100 text-red-700 border-red-200' },
  DEVOLVIDO:                { label: 'Devolvido',            className: 'bg-orange-100 text-orange-700 border-orange-200' },
  BLOQUEADO:                { label: 'Bloqueado',            className: 'bg-red-200 text-red-800 border-red-300' },
  EM_PROMOCAO:              { label: 'Em Promoção',          className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  EM_ATACADO:               { label: 'Atacado',              className: 'bg-purple-100 text-purple-800 border-purple-200' },
  EM_NEGOCIACAO:            { label: 'Em Negociação',        className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  EM_SERVICO:               { label: 'Em Serviço',           className: 'bg-amber-100 text-amber-800 border-amber-200' },
  RESERVADO:                { label: 'Reservado',            className: 'bg-teal-100 text-teal-800 border-teal-200' },
  PENDENTE_DOCUMENTACAO:    { label: 'Pend. Documentação',   className: 'bg-rose-100 text-rose-700 border-rose-200' },
  PENDENTE_AVALIACAO:       { label: 'Pend. Avaliação',      className: 'bg-amber-100 text-amber-700 border-amber-200' },
  PENDENTE_PREPARACAO:      { label: 'Pend. Preparação',     className: 'bg-sky-100 text-sky-700 border-sky-200' },
  EM_PRECIFICACAO:          { label: 'Aguardando precificação', className: 'bg-amber-100 text-amber-800 border-amber-300' },
}

interface VehicleStatusBadgeProps {
  status: string
  className?: string
  size?: 'sm' | 'md'
}

export function VehicleStatusBadge({ status, className, size = 'sm' }: VehicleStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-600 border-gray-200' }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  )
}

// ── CautelarBadge ─────────────────────────────────────────────────────────────

const CAUTELAR_CONFIG: Record<string, { label: string; className: string }> = {
  APROVADA:        { label: 'Cautelar OK',       className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  REPROVADA:       { label: 'Cautelar Reprovada', className: 'bg-red-100 text-red-700 border-red-200' },
  PENDENTE:        { label: 'Cautelar Pendente',  className: 'bg-amber-100 text-amber-700 border-amber-200' },
  COM_APONTAMENTO: { label: 'Com Apontamento',    className: 'bg-orange-100 text-orange-700 border-orange-200' },
  SEM_CAUTELAR:    { label: 'Sem Cautelar',       className: 'bg-gray-100 text-gray-500 border-gray-200' },
}

interface CautelarBadgeProps {
  status: string
  className?: string
  hideIfNone?: boolean
}

export function CautelarBadge({ status, className, hideIfNone = false }: CautelarBadgeProps) {
  if (hideIfNone && status === 'SEM_CAUTELAR') return null
  const config = CAUTELAR_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-500 border-gray-200' }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  )
}

// ── StockTypeBadge ────────────────────────────────────────────────────────────

const STOCK_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  PROPRIO:      { label: 'Próprio',     className: 'bg-brand-100 text-brand-800 border-brand-200' },
  CONSIGNADO:   { label: 'Consignado',  className: 'bg-purple-100 text-purple-700 border-purple-200' },
}

interface StockTypeBadgeProps {
  type: string
  className?: string
}

export function StockTypeBadge({ type, className }: StockTypeBadgeProps) {
  const config = STOCK_TYPE_CONFIG[type] ?? { label: type, className: 'bg-gray-100 text-gray-600 border-gray-200' }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  )
}

// ── ConditionBadge ────────────────────────────────────────────────────────────

const CONDITION_CONFIG: Record<string, { label: string; className: string }> = {
  ZERO_KM:  { label: '0 km',     className: 'bg-blue-100 text-blue-800 border-blue-200' },
  SEMINOVO: { label: 'Seminovo', className: 'bg-teal-100 text-teal-700 border-teal-200' },
  USADO:    { label: 'Usado',    className: 'bg-gray-100 text-gray-600 border-gray-200' },
}

interface ConditionBadgeProps {
  condition: string
  className?: string
}

export function ConditionBadge({ condition, className }: ConditionBadgeProps) {
  const config = CONDITION_CONFIG[condition] ?? { label: condition, className: 'bg-gray-100 text-gray-600 border-gray-200' }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  )
}
