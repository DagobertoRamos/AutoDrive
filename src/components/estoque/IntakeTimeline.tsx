'use client'

// =============================================================================
// Esteira de entrada — linha do tempo na ficha do veículo (entrada → portões →
// serviços → fotos → disponível) com os dias de cada etapa desde a entrada.
// Regras em src/lib/stock/intake-core.ts.
// =============================================================================

import { Check, Clock } from 'lucide-react'
import { daysBetween, intakeState, intakeTimeline, type IntakePendency } from '@/lib/stock/intake-core'
import { HelpHint, WithHint } from '@/components/ui/help-hint'
import { opsHint, opsText } from '@/lib/glossary-ops'

export function IntakeTimeline({ entryDate, pendencies, photosAt, stockStatus, onGoToPendencies }: {
  entryDate:   string | null
  pendencies:  IntakePendency[]
  photosAt:    string | null
  stockStatus: string
  onGoToPendencies?: () => void
}) {
  const state = intakeState(pendencies, stockStatus)
  if (!state.tracked) return null
  const steps = intakeTimeline({ entryDate, pendencies, photosAt, stockStatus })
  const inStock = daysBetween(entryDate)
  const current = steps.findIndex((s) => !s.done)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">Esteira de entrada <HelpHint {...opsHint('ESTEIRA')} /></p>
          <p className="text-xs text-gray-500">
            {state.missingGates.length
              ? <WithHint text={opsText('PORTAO')}>{`Falta: ${state.missingGates.join(', ')}.`}</WithHint>
              : state.servicesOpen
                ? 'Em serviço (site: “Em breve”).'
                : 'Entrada concluída.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inStock != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
              <Clock size={12} /> {inStock} dia(s) desde a entrada <HelpHint {...opsHint('DIAS_PARADO')} size={12} />
            </span>
          )}
          {onGoToPendencies && state.missingGates.length > 0 && (
            <button type="button" onClick={onGoToPendencies} className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">Resolver pendências</button>
          )}
        </div>
      </div>
      <ol className="flex gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <li key={s.key} className="min-w-[92px] flex-1">
            <div className={`h-1.5 rounded-full ${s.done ? 'bg-emerald-500' : i === current ? 'bg-amber-400' : 'bg-gray-200'}`} />
            <div className="mt-1.5 flex items-center gap-1">
              {s.done
                ? <Check size={12} className="shrink-0 text-emerald-600" />
                : <span className={`h-2 w-2 shrink-0 rounded-full ${i === current ? 'bg-amber-400' : 'bg-gray-300'}`} />}
              <span className={`truncate text-[11px] font-medium ${s.done ? 'text-gray-800' : i === current ? 'text-amber-800' : 'text-gray-400'}`}>{s.label}</span>
            </div>
            <p className="pl-4 text-[10px] text-gray-400">
              {s.done && s.at ? `${new Date(s.at).toLocaleDateString('pt-BR')}${s.days != null && s.key !== 'entrada' ? ` · ${s.days}d` : ''}` : i === current ? 'agora' : ''}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}
