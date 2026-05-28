'use client'

import { ClipboardList, Clock, CheckCircle2, XCircle, BarChart3 } from 'lucide-react'

export interface StatsCounts {
  pending:    number
  inProgress: number
  finalized:  number
  canceled:   number
  total:      number
}

interface StatCardProps {
  label:     string
  value:     number
  icon:      React.ReactNode
  accent:    'brand' | 'amber' | 'blue' | 'emerald' | 'red' | 'gray'
  onClick?:  () => void
  active?:   boolean
}

const ACCENT: Record<StatCardProps['accent'], { ring: string; iconBg: string; iconColor: string; value: string }> = {
  brand:    { ring: 'ring-brand-200 hover:border-brand-300',    iconBg: 'bg-brand-50',    iconColor: 'text-brand-600',    value: 'text-brand-700' },
  amber:    { ring: 'ring-amber-200 hover:border-amber-300',    iconBg: 'bg-amber-50',    iconColor: 'text-amber-600',    value: 'text-amber-700' },
  blue:     { ring: 'ring-blue-200 hover:border-blue-300',      iconBg: 'bg-blue-50',     iconColor: 'text-blue-600',     value: 'text-blue-700' },
  emerald:  { ring: 'ring-emerald-200 hover:border-emerald-300',iconBg: 'bg-emerald-50',  iconColor: 'text-emerald-600',  value: 'text-emerald-700' },
  red:      { ring: 'ring-red-200 hover:border-red-300',        iconBg: 'bg-red-50',      iconColor: 'text-red-600',      value: 'text-red-700' },
  gray:     { ring: 'ring-gray-200 hover:border-gray-300',      iconBg: 'bg-gray-100',    iconColor: 'text-gray-600',     value: 'text-gray-700' },
}

function StatCard({ label, value, icon, accent, onClick, active }: StatCardProps) {
  const a = ACCENT[accent]
  const interactive = !!onClick
  const Component: 'button' | 'div' = interactive ? 'button' : 'div'

  return (
    <Component
      onClick={onClick}
      type={interactive ? 'button' : undefined}
      className={[
        'group flex items-center gap-3 rounded-xl border bg-white px-4 py-3.5 text-left shadow-sm transition-all',
        interactive ? `cursor-pointer hover:shadow-md ${a.ring}` : '',
        active ? `ring-2 ${a.ring}` : 'border-gray-200',
      ].join(' ')}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${a.iconBg} ${a.iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className={`text-xl font-bold leading-tight ${a.value}`}>{value}</p>
      </div>
    </Component>
  )
}

interface Props {
  counts:        StatsCounts
  activeStatus?: string
  onSelect?:     (status: string) => void
  loading?:      boolean
}

export function EvaluationStatsCards({ counts, activeStatus, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[68px] animate-pulse rounded-xl border border-gray-200 bg-white shadow-sm" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <StatCard
        label="Pendentes"
        value={counts.pending}
        icon={<Clock size={18} />}
        accent="amber"
        active={activeStatus === 'PENDING_REVIEW' || activeStatus === 'DRAFT'}
        onClick={onSelect ? () => onSelect('PENDING_REVIEW') : undefined}
      />
      <StatCard
        label="Em andamento"
        value={counts.inProgress}
        icon={<ClipboardList size={18} />}
        accent="blue"
        active={activeStatus === 'IN_PROGRESS'}
        onClick={onSelect ? () => onSelect('IN_PROGRESS') : undefined}
      />
      <StatCard
        label="Finalizadas"
        value={counts.finalized}
        icon={<CheckCircle2 size={18} />}
        accent="emerald"
        active={activeStatus === 'FINALIZED' || activeStatus === 'APPROVED'}
        onClick={onSelect ? () => onSelect('FINALIZED') : undefined}
      />
      <StatCard
        label="Canceladas"
        value={counts.canceled}
        icon={<XCircle size={18} />}
        accent="red"
        active={activeStatus === 'CANCELADA' || activeStatus === 'CANCELED' || activeStatus === 'REJECTED'}
        onClick={onSelect ? () => onSelect('CANCELADA') : undefined}
      />
      <StatCard
        label="Total no período"
        value={counts.total}
        icon={<BarChart3 size={18} />}
        accent="brand"
        active={!activeStatus}
        onClick={onSelect ? () => onSelect('') : undefined}
      />
    </div>
  )
}
