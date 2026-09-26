'use client'

// =============================================================================
// EvaluationGridCard — modo "Cards" da lista de avaliações, no mesmo formato
// do card do estoque (foto em cima com carrossel, dados embaixo, valor no pé).
// =============================================================================

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Calendar, ClipboardCheck, Gauge, Loader2, MapPin, RefreshCw, User, Warehouse } from 'lucide-react'
import { VehicleCardCarousel } from '../VehicleCard'
import { getStatusDef } from './status'
import { useReopenEvaluation, type EvaluationListItem } from './EvaluationCard'

const MANAGER_PLUS = new Set(['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'])
const CANCELED_STATUSES = new Set(['CANCELADA', 'CANCELED', 'REJECTED'])

const DECISION_CHIP: Record<string, { label: string; cls: string }> = {
  ACEITA:     { label: 'Cliente aceitou',   cls: 'bg-emerald-600/95' },
  RECUSADA:   { label: 'Cliente recusou',   cls: 'bg-red-600/95' },
  ANALISANDO: { label: 'Cliente analisando', cls: 'bg-blue-600/95' },
}

function fmtBRL(v: unknown): string | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (isNaN(n) || n === 0) return null
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function EvaluationGridCard({ item, onReopened }: { item: EvaluationListItem; onReopened?: () => void }) {
  const router = useRouter()
  const { data: session } = useSession()
  const { reopening, handleReopen } = useReopenEvaluation(item.id, onReopened)

  const status   = getStatusDef(item.status)
  const decision = DECISION_CHIP[(item.customerDecision ?? '').toUpperCase()]
  const photos   = (item.photos ?? []).map((p) => p.url).filter((u): u is string => !!u)
  const cover    = item.coverPhotoUrl
  const urls     = photos.length ? photos.slice(0, 6) : cover ? [cover] : []
  const photoCnt = item.photoCount ?? photos.length
  const yearLine = [item.manufactureYear, item.modelYear].filter(Boolean).join('/') || '—'
  const evalStr  = fmtBRL(item.evaluatedValue)
  const fipeStr  = fmtBRL(item.fipeValue)

  const viewUrl    = `/estoque/avaliacao/${item.id}/inspecao`
  const isCanceled = CANCELED_STATUSES.has((item.status ?? '').toUpperCase())
  const canReopen  = isCanceled && MANAGER_PLUS.has(session?.user?.role ?? '')

  return (
    <div
      onClick={() => router.push(viewUrl)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:border-brand-300 hover:shadow-md"
    >
      {/* Foto / carrossel */}
      <div className="relative h-44 w-full overflow-hidden bg-gray-100">
        <VehicleCardCarousel photos={urls} alt={[item.brand, item.model].filter(Boolean).join(' ') || 'Veículo'} />

        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm ${status.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>

        {decision && (
          <div className="absolute right-2 top-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow ${decision.cls}`}>
              {decision.label}
            </span>
          </div>
        )}

        {photoCnt > 1 && (
          <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            +{photoCnt - 1} fotos
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold tracking-widest text-gray-800">{item.plate ?? 'S/PLACA'}</span>
          <span className="text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleDateString('pt-BR')}</span>
        </div>

        <div>
          <p className="font-semibold leading-tight text-gray-900">
            {[item.brand, item.model].filter(Boolean).join(' ') || 'Veículo não identificado'}
          </p>
          {item.version && <p className="truncate text-xs text-gray-500">{item.version}</p>}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
          <span className="flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0 text-gray-400" />{yearLine}</span>
          <span className="flex items-center gap-1"><Gauge className="h-3 w-3 shrink-0 text-gray-400" />{item.km != null ? `${Number(item.km).toLocaleString('pt-BR')} km` : '—'}</span>
          {item.color && <span className="truncate">{item.color}</span>}
        </div>

        <span className="flex items-center gap-1 truncate text-xs text-gray-600">
          <User className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="truncate">{item.ownerName ?? '—'}</span>
        </span>
        {item.unitName && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.unitName}</span>
          </span>
        )}

        {/* Valor + ação */}
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-gray-100 pt-2">
          <div className="min-w-0">
            {evalStr ? (
              <p className="text-lg font-bold text-brand-700">{evalStr}</p>
            ) : (
              <p className="text-sm font-medium text-gray-400">Sem valor avaliado</p>
            )}
            {fipeStr && <p className="text-[10px] text-gray-500">FIPE {fipeStr}</p>}
          </div>

          {item.vehicleId ? (
            <Link href={`/estoque/${item.vehicleId}`} onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
              <Warehouse size={12} /> Estoque
            </Link>
          ) : canReopen ? (
            <button type="button" onClick={handleReopen} disabled={reopening}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
              {reopening ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reabrir
            </button>
          ) : !isCanceled && (
            <Link href={`/estoque/avaliacao?id=${item.id}`} onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
              <ClipboardCheck size={12} /> Avaliar
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
