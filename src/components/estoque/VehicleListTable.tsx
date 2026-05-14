'use client'

// =============================================================================
// VehicleListTable — Listagem em tabela compacta do estoque
// =============================================================================

import Link from 'next/link'
import { AlertTriangle, Tag } from 'lucide-react'
import { VehicleStatusBadge, CautelarBadge, ConditionBadge } from './VehicleStatusBadge'

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
  salePrice:    number | null
  mainPhotoUrl: string | null
  stockStatus:  string
  stockType:    string | null
  conditionType: string | null
  cautelarStatus: string
  unit:          { id: string; name: string } | null
  hasOpenNegotiation: boolean
  openNegotiationId:  string | null
  _count: { photos: number; stockPendencies: number }
}

interface VehicleListTableProps {
  vehicles: Vehicle[]
}

function formatCurrency(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatKm(km: number | null): string {
  if (km == null) return '—'
  return new Intl.NumberFormat('pt-BR').format(km) + ' km'
}

export function VehicleListTable({ vehicles }: VehicleListTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left">
            <th className="px-4 py-3 font-medium text-gray-600">Placa</th>
            <th className="px-4 py-3 font-medium text-gray-600">Veículo</th>
            <th className="px-4 py-3 font-medium text-gray-600">Ano</th>
            <th className="px-4 py-3 font-medium text-gray-600">KM</th>
            <th className="px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="px-4 py-3 font-medium text-gray-600">Cautelar</th>
            <th className="px-4 py-3 font-medium text-gray-600">Unidade</th>
            <th className="px-4 py-3 font-medium text-gray-600 text-right">Preço</th>
            <th className="px-4 py-3 font-medium text-gray-600"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {vehicles.map((v) => {
            const yearLabel = v.modelYear
              ? `${v.year ?? '—'}/${v.modelYear}`
              : v.year?.toString() ?? '—'

            return (
              <tr
                key={v.id}
                className="group hover:bg-gray-50 transition-colors"
              >
                {/* Placa */}
                <td className="px-4 py-3">
                  <span className="font-mono font-bold tracking-wider text-gray-900">
                    {v.plate ?? 'S/PLACA'}
                  </span>
                </td>

                {/* Veículo */}
                <td className="px-4 py-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {v.brand} {v.model}
                    </p>
                    <p className="text-xs text-gray-500 truncate max-w-[180px]">
                      {v.version ?? v.color ?? ''}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {v.conditionType && <ConditionBadge condition={v.conditionType} />}
                    {v.hasOpenNegotiation && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Negociação
                      </span>
                    )}
                    {v._count.stockPendencies > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Tag className="h-2.5 w-2.5" />
                        {v._count.stockPendencies}
                      </span>
                    )}
                  </div>
                </td>

                {/* Ano */}
                <td className="px-4 py-3 text-gray-700">{yearLabel}</td>

                {/* KM */}
                <td className="px-4 py-3 text-gray-700">{formatKm(v.km)}</td>

                {/* Status */}
                <td className="px-4 py-3">
                  <VehicleStatusBadge status={v.stockStatus} />
                </td>

                {/* Cautelar */}
                <td className="px-4 py-3">
                  <CautelarBadge status={v.cautelarStatus} hideIfNone />
                </td>

                {/* Unidade */}
                <td className="px-4 py-3 text-gray-600">
                  {v.unit?.name ?? '—'}
                </td>

                {/* Preço */}
                <td className="px-4 py-3 text-right font-semibold text-brand-700">
                  {formatCurrency(v.salePrice)}
                </td>

                {/* Ação */}
                <td className="px-4 py-3">
                  <Link
                    href={`/estoque/${v.id}`}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
