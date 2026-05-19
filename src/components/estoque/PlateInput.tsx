'use client'

// =============================================================================
// PlateInput — Campo de placa com máscara dinâmica e busca automática
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { maskPlateInput, isValidPlate, normalizePlate } from '@/lib/vehicles/plate'
import type { VehicleLookupData } from '@/lib/vehicle-lookup/types'

type LookupStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

interface PlateInputProps {
  value:    string
  onChange: (normalized: string, display: string) => void
  onLookupResult?: (data: VehicleLookupData | null, status: LookupStatus) => void
  disabled?: boolean
}

const STATUS_CONFIG: Record<LookupStatus, { icon: React.ReactNode; text: string; className: string } | null> = {
  idle:      null,
  loading: {
    icon:      <Loader2 className="h-4 w-4 animate-spin" />,
    text:      'Consultando dados do veículo...',
    className: 'text-brand-600',
  },
  found: {
    icon:      <CheckCircle2 className="h-4 w-4" />,
    text:      'Dados carregados automaticamente.',
    className: 'text-emerald-600',
  },
  not_found: {
    icon:      <AlertCircle className="h-4 w-4" />,
    text:      'Não encontramos os dados automaticamente. Preencha manualmente.',
    className: 'text-amber-600',
  },
  error: {
    icon:      <XCircle className="h-4 w-4" />,
    text:      'Não foi possível consultar a placa agora. Preencha manualmente ou tente novamente.',
    className: 'text-red-600',
  },
}

/** Delay em ms antes de disparar a consulta após a última tecla */
const DEBOUNCE_MS = 600

export function PlateInput({ value, onChange, onLookupResult, disabled }: PlateInputProps) {
  const [display,    setDisplay]    = useState('')
  const [status,     setStatus]     = useState<LookupStatus>('idle')
  const [lastLooked, setLastLooked] = useState('')
  const [overrideMsg, setOverrideMsg] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincroniza display quando value chega como prop normalizado
  useEffect(() => {
    if (!display && value) setDisplay(value)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const doLookup = useCallback(async (plate: string, force = false) => {
    if (!force && plate === lastLooked) return
    setStatus('loading')
    setOverrideMsg(null)
    setLastLooked(plate)

    try {
      const url = `/api/vehicles/lookup-by-plate?plate=${encodeURIComponent(plate)}${force ? '&refresh=true' : ''}`
      const res  = await fetch(url)
      const data = await res.json()

      if (!res.ok || !data.success) {
        setStatus('error')
        if (data?.error) setOverrideMsg(String(data.error))
        onLookupResult?.(null, 'error')
        return
      }

      if (data.found && data.data) {
        setStatus('found')
        onLookupResult?.(data.data, 'found')
      } else {
        setStatus('not_found')
        // O backend agora envia mensagem específica quando API de placa
        // não está configurada (PLATE_LOOKUP). Usamos ela quando vier.
        if (data?.message) setOverrideMsg(String(data.message))
        onLookupResult?.(null, 'not_found')
      }
    } catch (_) {
      setStatus('error')
      onLookupResult?.(null, 'error')
    }
  }, [lastLooked, onLookupResult])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw     = e.target.value
    const masked  = maskPlateInput(raw)
    const normal  = normalizePlate(masked)
    setDisplay(masked)
    onChange(normal, masked)

    // Reset status ao digitar
    if (status !== 'idle') setStatus('idle')
    onLookupResult?.(null, 'idle')

    // Cancela debounce anterior
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Dispara consulta quando placa ficar válida
    if (isValidPlate(normal)) {
      debounceRef.current = setTimeout(() => doLookup(normal), DEBOUNCE_MS)
    }
  }

  const statusConfig = STATUS_CONFIG[status]
  const isPlateValid = isValidPlate(normalizePlate(display))

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={display}
          onChange={handleChange}
          disabled={disabled}
          placeholder="ABC-1234 ou ABC1D23"
          maxLength={8}
          className={[
            'w-full rounded-xl border py-3 pl-10 pr-12 font-mono text-lg font-bold uppercase tracking-widest shadow-sm',
            'focus:outline-none focus:ring-2 focus:ring-brand-500',
            status === 'found'
              ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
              : status === 'error'
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300 bg-white text-gray-900',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
          autoComplete="off"
          spellCheck={false}
        />
        {/* Status indicator inline */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {status === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-brand-500" />}
          {status === 'found'   && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          {status === 'error'   && <XCircle className="h-5 w-5 text-red-500" />}
          {status === 'not_found' && <AlertCircle className="h-5 w-5 text-amber-500" />}
        </div>
      </div>

      {/* Mensagem de status — usa override do servidor quando disponível */}
      {statusConfig && (
        <div className={`flex items-center gap-2 text-sm font-medium ${statusConfig.className}`}>
          {statusConfig.icon}
          <span>{overrideMsg ?? statusConfig.text}</span>
        </div>
      )}

      {/* Botão consultar novamente */}
      {(status === 'found' || status === 'not_found' || status === 'error') && isPlateValid && (
        <button
          type="button"
          onClick={() => doLookup(normalizePlate(display), true)}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Consultar novamente
        </button>
      )}
    </div>
  )
}
