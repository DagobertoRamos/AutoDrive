'use client'

import { useState } from 'react'
import { Search, SlidersHorizontal, X, Calendar } from 'lucide-react'
import { EVALUATION_STATUS } from './status'

export interface EvaluationFiltersState {
  search:   string
  status:   string
  unitId:   string
  periodFrom: string
  periodTo:   string
}

export const EMPTY_FILTERS: EvaluationFiltersState = {
  search:     '',
  status:     '',
  unitId:     '',
  periodFrom: '',
  periodTo:   '',
}

interface UnitOption { id: string; name: string }

interface Props {
  value:    EvaluationFiltersState
  onChange: (next: EvaluationFiltersState) => void
  units?:   UnitOption[]
}

export function EvaluationFilters({ value, onChange, units = [] }: Props) {
  const [open, setOpen] = useState(false)

  const set = <K extends keyof EvaluationFiltersState>(k: K, v: EvaluationFiltersState[K]) =>
    onChange({ ...value, [k]: v })

  const hasFilters =
    value.status ||
    value.unitId ||
    value.periodFrom ||
    value.periodTo

  const clear = () => onChange(EMPTY_FILTERS)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      {/* Linha principal: busca + toggle de filtros avançados */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={value.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Buscar por placa, cliente, marca ou modelo..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {value.search && (
            <button
              type="button"
              onClick={() => set('search', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Limpar busca"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <select
          value={value.status}
          onChange={(e) => set('status', e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">Todos os status</option>
          {/*
            Dedup por label — existem dois valores canônicos do mesmo status
            (ex.: PENDING_REVIEW + AGUARDANDO_APROVACAO ambos = "Aguardando
            aprovação"; CANCELED + CANCELADA = "Cancelada"). Mostramos cada
            label uma única vez, usando o valor "novo" (pt-BR) como canônico.
          */}
          {(() => {
            const seen = new Set<string>()
            return EVALUATION_STATUS.filter((s) => {
              if (seen.has(s.label)) return false
              seen.add(s.label)
              return true
            }).map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))
          })()}
        </select>

        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            open || hasFilters
              ? 'border-brand-300 bg-brand-50 text-brand-700'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal size={13} />
          <span className="hidden sm:inline">Filtros</span>
          {hasFilters && (
            <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              ●
            </span>
          )}
        </button>

        {hasFilters && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            <X size={13} />
            <span className="hidden sm:inline">Limpar</span>
          </button>
        )}
      </div>

      {/* Filtros avançados — accordion */}
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Unidade</label>
            <select
              value={value.unitId}
              onChange={(e) => set('unitId', e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todas as unidades</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Período — de</label>
            <div className="relative">
              <Calendar size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={value.periodFrom}
                onChange={(e) => set('periodFrom', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Período — até</label>
            <div className="relative">
              <Calendar size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={value.periodTo}
                onChange={(e) => set('periodTo', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
