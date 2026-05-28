'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  Car, User, Phone, MapPin, Calendar, ChevronRight, Eye, ClipboardCheck, RefreshCw, Loader2,
} from 'lucide-react'
import { getStatusDef } from './status'

export interface EvaluationListItem {
  id:                 string
  status?:            string | null
  plate?:             string | null
  brand?:             string | null
  model?:             string | null
  version?:           string | null
  modelYear?:         number | null
  manufactureYear?:   number | null
  color?:             string | null
  km?:                number | null
  fipeValue?:         number | string | null
  evaluatedValue?:    number | string | null
  ownerName?:         string | null
  ownerPhone?:        string | null
  unitId?:            string | null
  unitName?:          string | null
  evaluatedById?:     string | null
  evaluatorName?:     string | null
  createdAt:          string
}

interface Props {
  item:          EvaluationListItem
  detailsHref?:  string
  evaluateHref?: string
  /** Chamado após reabertura bem-sucedida pra recarregar a listagem */
  onReopened?:   () => void
}

const MANAGER_PLUS = new Set(['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'])
const CANCELED_STATUSES = new Set(['CANCELADA', 'CANCELED', 'REJECTED'])

const fmtBRL = (v: unknown): string | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (isNaN(n) || n === 0) return null
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const fmtRelative = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins   < 1)  return 'agora mesmo'
  if (mins   < 60) return `há ${mins} min`
  if (hours  < 24) return `há ${hours} h`
  if (days   === 1) return 'ontem'
  if (days   < 7)  return `há ${days} dias`
  return d.toLocaleDateString('pt-BR')
}

const fmtDateTime = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function EvaluationCard({ item, detailsHref, evaluateHref, onReopened }: Props) {
  const router  = useRouter()
  const { data: session } = useSession()
  const status  = getStatusDef(item.status)
  const fipeStr = fmtBRL(item.fipeValue)
  const evalStr = fmtBRL(item.evaluatedValue)
  const [reopening, setReopening] = useState(false)

  const vehicleLine = [item.brand, item.model, item.version].filter(Boolean).join(' ')
  const yearLine    = [item.manufactureYear, item.modelYear].filter(Boolean).join('/')

  const evalUrl = evaluateHref ?? `/estoque/avaliacao?id=${item.id}`
  const viewUrl = detailsHref  ?? `/estoque/avaliacao/${item.id}/inspecao`

  // Quando cancelada, mostramos "Reabrir" (gerente+) em vez de "Avaliar"
  const isCanceled  = CANCELED_STATUSES.has((item.status ?? '').toUpperCase())
  const canReopen   = isCanceled && MANAGER_PLUS.has(session?.user?.role ?? '')

  async function handleReopen(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const reason = window.prompt('Motivo da reabertura (opcional, máx 200 chars):', 'Cliente retornou para fechar negócio')
    if (reason === null) return  // usuário clicou Cancel
    setReopening(true)
    try {
      const r = await fetch(`/api/evaluations/${item.id}/reopen`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason: reason.slice(0, 200) || null }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        alert(d?.error ?? 'Falha ao reabrir avaliação.')
        return
      }
      onReopened?.()
      router.push(`/estoque/avaliacao/${item.id}/inspecao`)
    } catch {
      alert('Erro de conexão ao reabrir.')
    } finally {
      setReopening(false)
    }
  }

  // Card inteiro clicável → leva pra inspeção; botões internos têm stopPropagation
  return (
    <div
      onClick={() => router.push(viewUrl)}
      className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md cursor-pointer"
    >
      {/* Barra lateral colorida por status */}
      <div className={`absolute left-0 top-0 h-full w-1 ${status.dot}`} aria-hidden />

      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5 sm:pl-6">
        {/* Bloco principal: placa + veículo */}
        <div className="flex flex-1 items-start gap-4 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Car size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-gray-900 px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-white">
                {item.plate ?? '—'}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
            <p className="mt-1 truncate text-base font-semibold text-gray-900">
              {vehicleLine || 'Veículo não identificado'}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
              {item.color && <span>{item.color}</span>}
              {yearLine   && <span>{yearLine}</span>}
              {item.km != null && <span>{Number(item.km).toLocaleString('pt-BR')} km</span>}
            </div>
          </div>
        </div>

        {/* Cliente + Unidade */}
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 sm:flex-1 sm:max-w-[420px]">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Cliente</p>
            <p className="flex items-center gap-1.5 truncate font-medium text-gray-800">
              <User size={12} className="shrink-0 text-gray-400" />
              {item.ownerName ?? '—'}
            </p>
            {item.ownerPhone && (
              <p className="flex items-center gap-1.5 text-xs text-gray-500">
                <Phone size={11} className="shrink-0" />
                {item.ownerPhone}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Unidade</p>
            <p className="flex items-center gap-1.5 truncate font-medium text-gray-800">
              <MapPin size={12} className="shrink-0 text-gray-400" />
              {item.unitName ?? '—'}
            </p>
            {item.evaluatorName && (
              <p className="truncate text-xs text-gray-500">por {item.evaluatorName}</p>
            )}
          </div>
        </div>

        {/* Valores (opcional) */}
        {(fipeStr || evalStr) && (
          <div className="hidden text-right md:block">
            {fipeStr && (
              <>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">FIPE</p>
                <p className="text-sm font-semibold text-gray-700">{fipeStr}</p>
              </>
            )}
            {evalStr && (
              <p className="mt-0.5 text-xs font-medium text-emerald-700">Avaliado {evalStr}</p>
            )}
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5">
          {canReopen ? (
            <button
              type="button"
              onClick={handleReopen}
              disabled={reopening}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-60"
            >
              {reopening ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {reopening ? 'Reabrindo...' : 'Reabrir'}
            </button>
          ) : isCanceled ? (
            <span
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-medium text-gray-500"
              title="Apenas gerente ou superior pode reabrir avaliações canceladas"
            >
              Cancelada
            </span>
          ) : (
            <Link
              href={evalUrl}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              <ClipboardCheck size={13} />
              Avaliar
            </Link>
          )}
          <Link
            href={viewUrl}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-brand-700"
          >
            <Eye size={11} />
            Ver detalhes
            <ChevronRight size={11} />
          </Link>
        </div>
      </div>

      {/* Rodapé: criação */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-gray-50/60 px-5 py-2 text-[11px] text-gray-500">
        <Calendar size={11} />
        <span title={fmtDateTime(item.createdAt)}>
          Criada {fmtRelative(item.createdAt)}
          <span className="ml-1 text-gray-400">• {fmtDateTime(item.createdAt)}</span>
        </span>
      </div>
    </div>
  )
}

export function EvaluationCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex animate-pulse items-center gap-6 p-5">
        <div className="h-12 w-12 rounded-xl bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-gray-100" />
          <div className="h-3 w-48 rounded bg-gray-100" />
        </div>
        <div className="h-9 w-24 rounded-lg bg-gray-100" />
      </div>
      <div className="h-7 bg-gray-50" />
    </div>
  )
}
