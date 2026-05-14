'use client'

// =============================================================================
// PendencyCard — Card de pendência com cores por prioridade
// =============================================================================

import { useState } from 'react'
import { Calendar, Clock, User, Car, FileText, ChevronRight } from 'lucide-react'
import { PriorityBadge, StatusBadge, PRIORITY_BORDER_COLOR } from './PendencyStatusBadge'
import { PendencyModal } from './PendencyModal'
import { cn, formatDate } from '@/lib/utils'
import type { PendencyWithRelations } from '@/types'

interface PendencyCardProps {
  pendency: PendencyWithRelations
  onRefresh: () => void
}

const PRIORITY_LEFT_BORDER: Record<string, string> = {
  URGENTE: 'border-l-red-600',
  ALTA:    'border-l-orange-500',
  MEDIA:   'border-l-amber-500',
  BAIXA:   'border-l-green-600',
}

export function PendencyCard({ pendency, onRefresh }: PendencyCardProps) {
  const [modalOpen, setModalOpen] = useState(false)

  const isOverdue = pendency.dueDate && new Date(pendency.dueDate) < new Date()
  const leftBorder = PRIORITY_LEFT_BORDER[pendency.priority] ?? 'border-l-gray-300'
  const hoverBorder = PRIORITY_BORDER_COLOR[pendency.priority] ?? ''

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className={cn(
          'group relative cursor-pointer rounded-lg border border-l-4 bg-white p-4 shadow-sm transition-all duration-200',
          'hover:shadow-md hover:-translate-y-0.5',
          leftBorder,
          hoverBorder
        )}
      >
        {/* Header: prioridade + status */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <PriorityBadge priority={pendency.priority} showDot />
          <StatusBadge status={pendency.status} />
        </div>

        {/* Cliente */}
        <div className="mb-2">
          <p className="text-sm font-semibold text-gray-800 truncate">{pendency.customerName}</p>
          <p className="text-xs text-gray-500 truncate">{pendency.type}</p>
        </div>

        {/* Placa + Veículo */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <Car size={12} className="text-gray-400 shrink-0" />
            <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold text-gray-700">
              {pendency.plate || '—'}
            </span>
          </div>
          {pendency.vehicle && (
            <span className="text-xs text-gray-500 truncate">{pendency.vehicle}</span>
          )}
        </div>

        {/* Negociação */}
        {pendency.negotiation && (
          <div className="flex items-center gap-1 mb-2">
            <FileText size={11} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-500 truncate">{pendency.negotiation}</span>
          </div>
        )}

        {/* Footer: datas e responsável */}
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
          <div className="flex flex-col gap-0.5">
            {pendency.dueDate && (
              <div className="flex items-center gap-1">
                <Calendar size={11} className={isOverdue ? 'text-red-500' : 'text-gray-400'} />
                <span className={cn('text-[11px]', isOverdue ? 'font-semibold text-red-600' : 'text-gray-500')}>
                  Vence: {formatDate(new Date(pendency.dueDate))}
                </span>
              </div>
            )}
            {pendency.lastSentAt && (
              <div className="flex items-center gap-1">
                <Clock size={11} className="text-gray-400" />
                <span className="text-[11px] text-gray-400">
                  Enviado: {formatDate(new Date(pendency.lastSentAt))}
                </span>
              </div>
            )}
          </div>
          {pendency.responsible && (
            <div className="flex items-center gap-1">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <User size={12} />
              </div>
              <span className="text-[11px] text-gray-500 truncate max-w-[80px]">
                {pendency.responsible.shortName ?? pendency.responsible.fullName}
              </span>
            </div>
          )}
        </div>

        <ChevronRight
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      {modalOpen && (
        <PendencyModal
          pendency={pendency}
          onClose={() => setModalOpen(false)}
          onRefresh={() => { setModalOpen(false); onRefresh() }}
        />
      )}
    </>
  )
}
