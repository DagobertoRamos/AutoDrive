'use client'

// =============================================================================
// /estoque — Listagem do estoque de veículos
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import {
  LayoutGrid, List, Search, Filter, ChevronLeft, ChevronRight,
  Plus, Car, RotateCcw, X,
} from 'lucide-react'
import Link from 'next/link'
import { VehicleCard } from '@/components/estoque/VehicleCard'
import { VehicleListTable } from '@/components/estoque/VehicleListTable'
import { canAccessModule } from '@/lib/permissions'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Vehicle {
  id: string
  plate:        string | null
  brand:        string
  model:        string
  version:      string | null
  year:         number | null
  modelYear:    number | null
  km:           number | null
  color:        string | null
  fuel:         string | null
  salePrice:    number | null
  mainPhotoUrl: string | null
  stockStatus:  string
  stockType:    string | null
  stockLocation: string | null
  conditionType: string | null
  cautelarStatus: string
  unit:          { id: string; name: string } | null
  stockPendencies: { id: string; option: { label: string; category: string | null } }[]
  hasOpenNegotiation: boolean
  openNegotiationId:  string | null
  _count: { photos: number; stockPendencies: number }
}

interface Pagination {
  page:       number
  limit:      number
  total:      number
  totalPages: number
}

interface Unit { id: string; name: string }

// ── Constantes de filtros ─────────────────────────────────────────────────────

const STOCK_STATUS_OPTIONS = [
  { value: 'DISPONIVEL',            label: 'Disponível' },
  { value: 'EM_PROMOCAO',           label: 'Em Promoção' },
  { value: 'EM_ATACADO',            label: 'Atacado' },
  { value: 'RESERVADO',             label: 'Reservado' },
  { value: 'EM_NEGOCIACAO',         label: 'Em Negociação' },
  { value: 'EM_SERVICO',            label: 'Em Serviço' },
  { value: 'BLOQUEADO',             label: 'Bloqueado' },
  { value: 'PENDENTE_DOCUMENTACAO', label: 'Pend. Documentação' },
  { value: 'PENDENTE_AVALIACAO',    label: 'Pend. Avaliação' },
  { value: 'PENDENTE_PREPARACAO',   label: 'Pend. Preparação' },
  { value: 'VENDIDO',               label: 'Vendido' },
  { value: 'COMPRADO',              label: 'Comprado' },
  { value: 'DEVOLVIDO',             label: 'Devolvido' },
  { value: 'CANCELADO',             label: 'Cancelado' },
]

const STOCK_LOCATION_OPTIONS = [
  { value: 'SHOWROOM',     label: 'Showroom' },
  { value: 'ATACADO',      label: 'Atacado' },
  { value: 'FORA_ESTOQUE', label: 'Fora do Estoque' },
  { value: 'OUTROS',       label: 'Outros' },
]

const VEHICLE_TYPE_OPTIONS = [
  { value: 'CAR',        label: 'Carro' },
  { value: 'MOTORCYCLE', label: 'Moto' },
  { value: 'TRUCK',      label: 'Caminhão' },
]

const STOCK_TYPE_OPTIONS = [
  { value: 'PROPRIO',    label: 'Próprio' },
  { value: 'CONSIGNADO', label: 'Consignado' },
]

const CONDITION_OPTIONS = [
  { value: 'ZERO_KM',  label: '0 km' },
  { value: 'SEMINOVO', label: 'Seminovo' },
  { value: 'USADO',    label: 'Usado' },
]

const CAUTELAR_OPTIONS = [
  { value: 'APROVADA',        label: 'Aprovada' },
  { value: 'REPROVADA',       label: 'Reprovada' },
  { value: 'PENDENTE',        label: 'Pendente' },
  { value: 'COM_APONTAMENTO', label: 'Com Apontamento' },
  { value: 'SEM_CAUTELAR',    label: 'Sem Cautelar' },
]

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm animate-pulse">
      <div className="h-44 bg-gray-200" />
      <div className="flex flex-col gap-3 p-3">
        <div className="flex justify-between">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-4 w-14 rounded bg-gray-200" />
        </div>
        <div className="h-4 w-40 rounded bg-gray-200" />
        <div className="h-3 w-32 rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-3 rounded bg-gray-200" />
          <div className="h-3 rounded bg-gray-200" />
        </div>
        <div className="mt-2 h-5 w-24 rounded bg-gray-200" />
      </div>
    </div>
  )
}

// ── Filtro Select ─────────────────────────────────────────────────────────────

interface FilterSelectProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}

function FilterSelect({ value, onChange, placeholder, options }: FilterSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function EstoquePage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''

  const canManage  = canAccessModule(role, 'stock.manage')
  const canEvaluate = canAccessModule(role, 'stock.evaluate')

  // ── Estado ──────────────────────────────────────────────────────────────────
  const [vehicles, setVehicles]       = useState<Vehicle[]>([])
  const [pagination, setPagination]   = useState<Pagination | null>(null)
  const [units, setUnits]             = useState<Unit[]>([])
  const [loading, setLoading]         = useState(true)
  const [viewMode, setViewMode]       = useState<'cards' | 'list'>('cards')
  const [showFilters, setShowFilters] = useState(false)

  // Filtros
  const [search,          setSearch]          = useState('')
  const [page,            setPage]            = useState(1)
  const [unitId,          setUnitId]          = useState('')
  const [stockStatus,     setStockStatus]     = useState('')
  const [stockLocation,   setStockLocation]   = useState('')
  const [vehicleType,     setVehicleType]     = useState('')
  const [stockType,       setStockType]       = useState('')
  const [conditionType,   setConditionType]   = useState('')
  const [cautelarStatus,  setCautelarStatus]  = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce da busca
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  // Carrega unidades
  useEffect(() => {
    fetch('/api/units?limit=200', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setUnits(d.data ?? []) })
      .catch(() => {})
  }, [])

  // Carrega veículos
  const fetchVehicles = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '24')
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (unitId)          params.set('unitId', unitId)
      if (stockStatus)     params.set('stockStatus', stockStatus)
      if (stockLocation)   params.set('stockLocation', stockLocation)
      if (vehicleType)     params.set('vehicleType', vehicleType)
      if (stockType)       params.set('stockType', stockType)
      if (conditionType)   params.set('conditionType', conditionType)
      if (cautelarStatus)  params.set('cautelarStatus', cautelarStatus)
      if (includeInactive) params.set('includeInactive', 'true')

      const res  = await fetch(`/api/vehicles?${params}`, { cache: 'no-store' })
      const data = await res.json()
      if (data.success) {
        setVehicles(data.data ?? [])
        setPagination(data.pagination ?? null)
      }
    } catch (_) {
      //
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, unitId, stockStatus, stockLocation, vehicleType, stockType, conditionType, cautelarStatus, includeInactive])

  useEffect(() => { fetchVehicles() }, [fetchVehicles])

  // Resetar página ao mudar filtros (exceto page)
  const resetPage = () => setPage(1)

  const hasActiveFilters = !!(unitId || stockStatus || stockLocation || vehicleType || stockType || conditionType || cautelarStatus || includeInactive || debouncedSearch)

  function clearFilters() {
    setSearch('')
    setUnitId('')
    setStockStatus('')
    setStockLocation('')
    setVehicleType('')
    setStockType('')
    setConditionType('')
    setCautelarStatus('')
    setIncludeInactive(false)
    setPage(1)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
          {pagination && (
            <p className="text-sm text-gray-500 mt-0.5">
              {pagination.total} {pagination.total === 1 ? 'veículo encontrado' : 'veículos encontrados'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEvaluate && (
            <Link
              href="/estoque/avaliacao"
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              Fazer Avaliação
            </Link>
          )}
          {canManage && (
            <Link
              href="/estoque/novo"
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Adicionar Veículo
            </Link>
          )}
        </div>
      </div>

      {/* Barra de busca + controles */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por placa, marca, modelo, chassi..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Botão filtros */}
        <button
          onClick={() => setShowFilters((p) => !p)}
          className={[
            'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition-colors',
            showFilters
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
          ].join(' ')}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {hasActiveFilters && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
              •
            </span>
          )}
        </button>

        {/* Toggle visualização */}
        <div className="flex rounded-lg border border-gray-300 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setViewMode('cards')}
            className={[
              'p-2 transition-colors',
              viewMode === 'cards' ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50',
            ].join(' ')}
            title="Visualização em cards"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={[
              'p-2 border-l border-gray-300 transition-colors',
              viewMode === 'list' ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50',
            ].join(' ')}
            title="Visualização em lista"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Atualizar */}
        <button
          onClick={fetchVehicles}
          className="rounded-lg border border-gray-300 bg-white p-2 text-gray-500 shadow-sm hover:bg-gray-50 transition-colors"
          title="Atualizar"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* Painel de filtros */}
      {showFilters && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {/* Unidade */}
            <select
              value={unitId}
              onChange={(e) => { setUnitId(e.target.value); resetPage() }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todas as unidades</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>

            <FilterSelect
              value={stockStatus}
              onChange={(v) => { setStockStatus(v); resetPage() }}
              placeholder="Todos os status"
              options={STOCK_STATUS_OPTIONS}
            />

            <FilterSelect
              value={stockLocation}
              onChange={(v) => { setStockLocation(v); resetPage() }}
              placeholder="Localização"
              options={STOCK_LOCATION_OPTIONS}
            />

            <FilterSelect
              value={vehicleType}
              onChange={(v) => { setVehicleType(v); resetPage() }}
              placeholder="Tipo de veículo"
              options={VEHICLE_TYPE_OPTIONS}
            />

            <FilterSelect
              value={stockType}
              onChange={(v) => { setStockType(v); resetPage() }}
              placeholder="Tipo de estoque"
              options={STOCK_TYPE_OPTIONS}
            />

            <FilterSelect
              value={conditionType}
              onChange={(v) => { setConditionType(v); resetPage() }}
              placeholder="Condição"
              options={CONDITION_OPTIONS}
            />

            <FilterSelect
              value={cautelarStatus}
              onChange={(v) => { setCautelarStatus(v); resetPage() }}
              placeholder="Cautelar"
              options={CAUTELAR_OPTIONS}
            />

            {/* Incluir inativos — apenas managers */}
            {canManage && (
              <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 cursor-pointer shadow-sm">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => { setIncludeInactive(e.target.checked); resetPage() }}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Incluir inativos
              </label>
            )}

            {/* Limpar filtros */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        viewMode === 'cards' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm animate-pulse">
            <div className="h-12 bg-gray-100 border-b border-gray-200" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-100">
                <div className="h-4 w-20 rounded bg-gray-200" />
                <div className="h-4 w-40 rounded bg-gray-200" />
                <div className="h-4 w-12 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        )
      ) : vehicles.length === 0 ? (
        /* Estado vazio */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-20 text-center">
          <Car className="h-14 w-14 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-600">
            {hasActiveFilters ? 'Nenhum veículo encontrado' : 'Estoque vazio'}
          </h3>
          <p className="mt-1 text-sm text-gray-400 max-w-sm">
            {hasActiveFilters
              ? 'Tente ajustar os filtros ou limpe a busca para ver mais resultados.'
              : 'Ainda não há veículos cadastrados no estoque.'}
          </p>
          {hasActiveFilters ? (
            <button
              onClick={clearFilters}
              className="mt-4 flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <X className="h-4 w-4" />
              Limpar filtros
            </button>
          ) : canManage ? (
            <Link
              href="/estoque/novo"
              className="mt-4 flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Adicionar primeiro veículo
            </Link>
          ) : null}
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
        </div>
      ) : (
        <VehicleListTable vehicles={vehicles} />
      )}

      {/* Paginação */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-gray-600">
            Página {pagination.page} de {pagination.totalPages} —{' '}
            {pagination.total} veículo{pagination.total !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>

            {/* Páginas numeradas */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(
                  pagination.totalPages - 4,
                  pagination.page - 2,
                )) + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={[
                      'h-8 w-8 rounded-lg text-sm font-medium transition-colors',
                      p === pagination.page
                        ? 'bg-brand-600 text-white'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {p}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
