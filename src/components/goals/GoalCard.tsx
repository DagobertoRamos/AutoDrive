// =============================================================================
// GoalCard — Card visual de uma meta com barra de progresso e nível
// Apresentacional puro: recebe a meta e o progresso já calculados pelo backend.
// =============================================================================

import {
  Handshake,
  ShoppingCart,
  ArrowLeftRight,
  FileText,
  ShieldCheck,
  Wrench,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Tipos espelham o retorno de /api/goals/me (sem acoplar ao Prisma no client).
export interface GoalCardData {
  goal: {
    id:          string
    type:        string
    scope:       string
    period:      string
    title:       string | null
    measureUnit: string
    progressive: boolean
    targetValue: number | string
  }
  progress: {
    target:       number
    achievedValue:number
    percent:      number
    currentLevel: number
    nextTarget:   number | null
    reached:      boolean
    note?:        string
  }
}

const TYPE_META: Record<string, { label: string; icon: LucideIcon }> = {
  SALES_EXCHANGE:    { label: 'Vendas e Trocas',   icon: Handshake },
  PURCHASE:          { label: 'Compras',            icon: ShoppingCart },
  RETURN:            { label: 'Retornos',           icon: ArrowLeftRight },
  DOCUMENTATION:     { label: 'Documentação',       icon: FileText },
  EXTENDED_WARRANTY: { label: 'Garantia Estendida', icon: ShieldCheck },
  SERVICE:           { label: 'Serviços',           icon: Wrench },
}

const SCOPE_LABEL: Record<string, string> = {
  USER:   'Minha meta',
  UNIT:   'Meta da unidade',
  TENANT: 'Meta da loja',
  GLOBAL: 'Meta global',
}

function formatValue(value: number, unit: string): string {
  if (unit === 'BRL') {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  if (unit === 'PERCENT') return `${Math.round(value)}%`
  return Math.round(value).toLocaleString('pt-BR')
}

/** Cor da barra/percentual conforme o quanto da meta foi atingido. */
function tone(percent: number): { bar: string; text: string; chip: string } {
  if (percent >= 100) return { bar: 'bg-brand-600', text: 'text-brand-700', chip: 'bg-brand-50 text-brand-700' }
  if (percent >= 66)  return { bar: 'bg-blue-500',  text: 'text-blue-700',  chip: 'bg-blue-50 text-blue-700' }
  if (percent >= 33)  return { bar: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 text-amber-700' }
  return { bar: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-50 text-red-700' }
}

export function GoalCard({ data }: { data: GoalCardData }) {
  const { goal, progress } = data
  const meta = TYPE_META[goal.type] ?? { label: goal.type, icon: Target }
  const Icon = meta.icon
  const t = tone(progress.percent)
  const pctClamped = Math.min(progress.percent, 100)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', t.chip)}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{goal.title || meta.label}</p>
          <p className="text-xs text-gray-400">{SCOPE_LABEL[goal.scope] ?? goal.scope}</p>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', t.chip)}>
          {Math.round(progress.percent)}%
        </span>
      </div>

      {/* Barra de progresso */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn('h-full rounded-full transition-all duration-500', t.bar)}
          style={{ width: `${pctClamped}%` }}
        />
      </div>

      <div className="flex items-end justify-between">
        <p className="text-sm text-gray-600">
          <span className={cn('text-lg font-bold tabular-nums', t.text)}>
            {formatValue(progress.achievedValue, goal.measureUnit)}
          </span>
          <span className="text-gray-400"> / {formatValue(progress.target, goal.measureUnit)}</span>
        </p>
        {goal.progressive && (
          <span className="rounded-md bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
            Nível {progress.currentLevel}
            {progress.nextTarget != null && (
              <span className="text-gray-400"> · próx. {formatValue(progress.nextTarget, goal.measureUnit)}</span>
            )}
          </span>
        )}
      </div>

      {progress.reached && (
        <p className="text-xs font-semibold text-brand-700">🎯 Meta atingida!</p>
      )}
    </div>
  )
}
