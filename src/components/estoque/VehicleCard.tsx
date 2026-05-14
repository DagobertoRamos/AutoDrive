'use client'

// =============================================================================
// VehicleCard — Card de veículo para a listagem do estoque
// =============================================================================

import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Gauge, Calendar, AlertTriangle, Tag, Car } from 'lucide-react'
import { VehicleStatusBadge, CautelarBadge, StockTypeBadge, ConditionBadge } from './VehicleStatusBadge'
import { cn } from '@/lib/utils'

interface VehiclePendency {
  id: string
  option: { label: string; category: string | null }
}

interface VehicleCardProps {
  vehicle: {
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
    stockPendencies: VehiclePendency[]
    hasOpenNegotiation: boolean
    openNegotiationId:  string | null
    _count: { photos: number; stockPendencies: number }
  }
  className?: string
}

function formatCurrency(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatKm(km: number | null): string {
  if (km == null) return '—'
  return new Intl.NumberFormat('pt-BR').format(km) + ' km'
}

export function VehicleCard({ vehicle, className }: VehicleCardProps) {
  const yearLabel = vehicle.modelYear
    ? `${vehicle.year ?? '—'}/${vehicle.modelYear}`
    : vehicle.year?.toString() ?? '—'

  const pendencyCount = vehicle._count.stockPendencies

  return (
    <Link
      href={`/estoque/${vehicle.id}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white',
        'shadow-sm transition-all duration-200',
        'hover:border-brand-300 hover:shadow-md',
        className,
      )}
    >
      {/* Foto */}
      <div className="relative h-44 w-full overflow-hidden bg-gray-100">
        {vehicle.mainPhotoUrl ? (
          <Image
            src={vehicle.mainPhotoUrl}
            alt={`${vehicle.brand} ${vehicle.model}`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Car className="h-16 w-16 text-gray-300" />
          </div>
        )}

        {/* Badges sobrepostas */}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <VehicleStatusBadge status={vehicle.stockStatus} />
          {vehicle.stockType && <StockTypeBadge type={vehicle.stockType} />}
        </div>

        {/* Em negociação */}
        {vehicle.hasOpenNegotiation && (
          <div className="absolute inset-0 flex items-end justify-center pb-2">
            <span className="flex items-center gap-1 rounded-full bg-indigo-600/90 px-3 py-1 text-xs font-semibold text-white shadow">
              <AlertTriangle className="h-3 w-3" />
              Em negociação
            </span>
          </div>
        )}

        {/* Contagem de fotos */}
        {vehicle._count.photos > 1 && (
          <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            +{vehicle._count.photos - 1} fotos
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Placa + condição */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold tracking-widest text-gray-800">
            {vehicle.plate ?? 'S/PLACA'}
          </span>
          {vehicle.conditionType && <ConditionBadge condition={vehicle.conditionType} />}
        </div>

        {/* Marca/Modelo/Versão */}
        <div>
          <p className="font-semibold text-gray-900 leading-tight">
            {vehicle.brand} {vehicle.model}
          </p>
          {vehicle.version && (
            <p className="text-xs text-gray-500 truncate">{vehicle.version}</p>
          )}
        </div>

        {/* Detalhes em grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0 text-gray-400" />
            {yearLabel}
          </span>
          <span className="flex items-center gap-1">
            <Gauge className="h-3 w-3 shrink-0 text-gray-400" />
            {formatKm(vehicle.km)}
          </span>
          {vehicle.color && (
            <span className="flex items-center gap-1 col-span-1 truncate">
              <span className="h-2 w-2 rounded-full border border-gray-300 shrink-0" style={{ background: 'currentColor' }} />
              {vehicle.color}
            </span>
          )}
          {vehicle.fuel && (
            <span className="truncate">{vehicle.fuel}</span>
          )}
        </div>

        {/* Unidade */}
        {vehicle.unit && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3 w-3 shrink-0" />
            {vehicle.unit.name}
          </span>
        )}

        {/* Cautelar */}
        <CautelarBadge status={vehicle.cautelarStatus} hideIfNone />

        {/* Pendências */}
        {pendencyCount > 0 && (
          <div className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
            <Tag className="h-3 w-3 shrink-0" />
            {pendencyCount} {pendencyCount === 1 ? 'pendência' : 'pendências'}
          </div>
        )}

        {/* Preço */}
        <div className="mt-auto pt-2 border-t border-gray-100">
          <p className="text-lg font-bold text-brand-700">
            {formatCurrency(vehicle.salePrice)}
          </p>
        </div>
      </div>
    </Link>
  )
}
