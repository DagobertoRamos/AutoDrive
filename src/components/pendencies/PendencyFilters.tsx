'use client'

// =============================================================================
// PendencyFilters — Componente de filtros reutilizável — AutoDrive
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Search, X, ChevronDown, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PendencyFilters, PendencyPriority, PendencyStatus } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SellerOption {
  id: string
  name: string
}

export interface UnitOption {
  id: string
  name: string
}

export interface PendencyFiltersProps {
  filters: PendencyFilters
  onChange: (filters: PendencyFilters) => void
  sellers?: SellerOption[]
  units?: UnitOption[]
  showSellerFilter?: boolean
  showUnitFilter?: boolean
  showDateFilter?: boolean
  showTypeFilter?: boolean
  className?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: PendencyStatus; label: string }[] = [
  { value: 'ABERTA',              label: 'Aberta' },
  { value: 'EM_ANDAMENTO',        label: 'Em Andamento' },
  { value: 'AGUARDANDO_RESPOSTA', label: 'Aguardando Resposta' },
  { value: 'PAUSADA',             label: 'Pausada' },
  { value: 'FINALIZADA',          label: 'Finalizada' },
  { value: 'REATIVADA',           label: 'Reativada' },
  { value: 'CANCELADA',           label: 'Cancelada' },
  { value: 'VENCIDA',             label: 'Vencida' },
]

const PRIORITY_OPTIONS: { value: PendencyPriority; label: string; color: string }[] = [
  { value: 'URGENTE', label: 'Urgente', color: 'text-red-600' },
  { value: 'ALTA',    label: 'Alta',    color: 'text-orange-600' },
  { value: 'MEDIA',   label: 'Média',   color: 'text-amber-600' },
  { value: 'BAIXA',   label: 'Baixa',   color: 'text-green-600' },
]

// ---------------------------------------------------------------------------
// MultiSelect helper
// ---------------------------------------------------------------------------

interface MultiSelectProps<T extends string> {
  label: string
  options: { value: T; label: string; color?: string }[]
  selected: T[]
  onChange: (values: T[]) => void
}

function MultiSelect<T extends string>({
  label,
  options,
  selected,
  onChange,
}: MultiSelectProps<T>) {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(
    (value: T) => {
      onChange(
        selected.includes(value)
          ? selected.filter((v) => v !== value)
          : [...selected, value],
      )
    },
    [selected, onChange],
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <span className="truncate text-gray-700">
          {selected.length === 0
            ? label
            : selected.length === 1
            ? options.find((o) => o.value === selected[0])?.label
            : `${label} (${selected.length})`}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-gray-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className={cn('text-gray-700', opt.color)}>{opt.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PendencyFilters({
  filters,
  onChange,
  sellers = [],
  units = [],
  showSellerFilter = false,
  showUnitFilter = false,
  showDateFilter = false,
  showTypeFilter = false,
  className,
}: PendencyFiltersProps) {
  const [search, setSearch] = useState(filters.search ?? '')

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== filters.search) {
        onChange({ ...filters, search: search || undefined, page: 1 })
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedStatuses = Array.isArray(filters.status)
    ? filters.status
    : filters.status
    ? [filters.status]
    : []

  const selectedPriorities = Array.isArray(filters.priority)
    ? filters.priority
    : filters.priority
    ? [filters.priority]
    : []

  const hasActiveFilters =
    !!filters.search ||
    selectedStatuses.length > 0 ||
    selectedPriorities.length > 0 ||
    !!filters.sellerId ||
    !!filters.unitId ||
    !!filters.dueDateFrom ||
    !!filters.dueDateTo

  function clearFilters() {
    setSearch('')
    onChange({})
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Row 1: Search + active filter count */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, placa, negociação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-md border border-gray-200 bg-white pl-9 pr-8 text-sm shadow-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm hover:bg-gray-50"
          >
            <Filter className="h-4 w-4" />
            Limpar
          </button>
        )}
      </div>

      {/* Row 2: Filter selects */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status multi-select */}
        <div className="w-44">
          <MultiSelect
            label="Status"
            options={STATUS_OPTIONS}
            selected={selectedStatuses}
            onChange={(values) =>
              onChange({ ...filters, status: values.length ? values : undefined, page: 1 })
            }
          />
        </div>

        {/* Priority multi-select */}
        <div className="w-40">
          <MultiSelect
            label="Prioridade"
            options={PRIORITY_OPTIONS}
            selected={selectedPriorities}
            onChange={(values) =>
              onChange({ ...filters, priority: values.length ? values : undefined, page: 1 })
            }
          />
        </div>

        {/* Seller select */}
        {showSellerFilter && sellers.length > 0 && (
          <div className="w-48">
            <select
              value={filters.sellerId ?? ''}
              onChange={(e) =>
                onChange({
                  ...filters,
                  sellerId: e.target.value || undefined,
                  page: 1,
                })
              }
              className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Todos os vendedores</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Unit select */}
        {showUnitFilter && units.length > 0 && (
          <div className="w-44">
            <select
              value={
                Array.isArray(filters.unitId)
                  ? filters.unitId[0] ?? ''
                  : filters.unitId ?? ''
              }
              onChange={(e) =>
                onChange({
                  ...filters,
                  unitId: e.target.value || undefined,
                  page: 1,
                })
              }
              className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Todas as lojas</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date range */}
        {showDateFilter && (
          <>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500 whitespace-nowrap">De:</label>
              <input
                type="date"
                value={filters.dueDateFrom ?? ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    dueDateFrom: e.target.value || undefined,
                    page: 1,
                  })
                }
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500 whitespace-nowrap">Até:</label>
              <input
                type="date"
                value={filters.dueDateTo ?? ''}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    dueDateTo: e.target.value || undefined,
                    page: 1,
                  })
                }
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </>
        )}
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedStatuses.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200"
            >
              {STATUS_OPTIONS.find((o) => o.value === s)?.label}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    status: selectedStatuses.filter((v) => v !== s),
                    page: 1,
                  })
                }
                className="text-blue-500 hover:text-blue-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {selectedPriorities.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 border border-orange-200"
            >
              {PRIORITY_OPTIONS.find((o) => o.value === p)?.label}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    priority: selectedPriorities.filter((v) => v !== p),
                    page: 1,
                  })
                }
                className="text-orange-500 hover:text-orange-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
