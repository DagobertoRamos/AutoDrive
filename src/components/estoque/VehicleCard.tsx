'use client'

// =============================================================================
// VehicleCard — Card de veículo para a listagem do estoque
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Gauge, Calendar, AlertTriangle, Tag, Car, ChevronLeft, ChevronRight } from 'lucide-react'
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
    hasOpenNegotiation:    boolean
    openNegotiationId:     string | null
    openNegotiationNumber?: string | null
    openNegotiationStatus?: string | null
    openNegotiationSeller?: string | null
    openNegotiationUnit?:   string | null
    /** URLs ordenadas: marketing primeiro, fallback fotos da avaliação. */
    displayPhotos?:        string[]
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
      {/* Foto / carrossel */}
      <div className="relative h-44 w-full overflow-hidden bg-gray-100">
        <VehicleCardCarousel
          photos={vehicle.displayPhotos ?? (vehicle.mainPhotoUrl ? [vehicle.mainPhotoUrl] : [])}
          alt={`${vehicle.brand} ${vehicle.model}`}
        />

        {/* Badges sobrepostas */}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <VehicleStatusBadge status={vehicle.stockStatus} />
          {vehicle.stockType && <StockTypeBadge type={vehicle.stockType} />}
        </div>

        {/* Em negociação — chip pequeno sobre a foto (detalhe vai no card abaixo) */}
        {vehicle.hasOpenNegotiation && (
          <div className="absolute right-2 top-2">
            <span className="flex items-center gap-1 rounded-full bg-amber-500/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow">
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
        {/* ── Aviso de negociação em aberto ─────────────────────────────── */}
        {vehicle.hasOpenNegotiation && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-900">Veículo em negociação</p>
                {vehicle.openNegotiationSeller && (
                  <p className="mt-0.5 text-amber-800 truncate">
                    Vendedor: <span className="font-medium">{vehicle.openNegotiationSeller}</span>
                  </p>
                )}
                {vehicle.openNegotiationNumber && (
                  <p className="text-amber-800">
                    Negociação: <span className="font-mono font-medium">{vehicle.openNegotiationNumber}</span>
                  </p>
                )}
                {vehicle.openNegotiationStatus && (
                  <p className="text-amber-700/90 text-[10px] uppercase tracking-wide">
                    {vehicle.openNegotiationStatus.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

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

// ── Carrossel das fotos do card (auto-rotate + setas no hover) ──────────────
function VehicleCardCarousel({ photos, alt }: { photos: string[]; alt: string }) {
  const [idx, setIdx] = useState(0)
  const [hovering, setHovering] = useState(false)
  const total = photos.length
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-rotate quando não está hover (4s)
  useEffect(() => {
    if (total <= 1) return
    if (hovering) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      return
    }
    intervalRef.current = setInterval(() => setIdx((i) => (i + 1) % total), 4000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [total, hovering])

  // Reset índice se a lista muda
  useEffect(() => { setIdx((i) => (i >= total ? 0 : i)) }, [total])

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Car className="h-16 w-16 text-gray-300" />
      </div>
    )
  }

  return (
    <div
      className="relative h-full w-full"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Image
        key={photos[idx]}
        src={photos[idx]}
        alt={alt}
        fill
        className="object-cover transition-opacity duration-300"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        unoptimized
      />

      {total > 1 && (
        <>
          {/* Setas (visíveis no hover) */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx((i) => (i - 1 + total) % total) }}
            className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover:opacity-100"
            aria-label="Foto anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx((i) => (i + 1) % total) }}
            className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover:opacity-100"
            aria-label="Próxima foto"
          >
            <ChevronRight size={14} />
          </button>

          {/* Dots indicators */}
          <div className="absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx(i) }}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50',
                )}
                aria-label={`Foto ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
