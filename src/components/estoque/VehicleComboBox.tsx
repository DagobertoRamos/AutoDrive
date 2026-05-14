'use client'

// =============================================================================
// VehicleComboBox — Seleção hierárquica Marca → Modelo → Versão com FIPE
//
// Defensivo por design:
//   • Nunca chama .toLowerCase() em valor undefined/null
//   • Aceita options em qualquer formato de API (code/codigo/id, name/nome/label)
//   • Filtra itens inválidos sem quebrar
//   • Toda chamada async tem try/catch/finally
//   • Loading nunca fica infinito
// =============================================================================

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Loader2, Search, AlertCircle } from 'lucide-react'
import type { FipePrice, VehicleCategory } from '@/lib/vehicle-lookup/types'

// ── Tipo flexível que aceita o que vier da API ────────────────────────────────

export type AnyOption = {
  id?:          string | number | null
  code?:        string | number | null
  codigo?:      string | number | null
  value?:       string | number | null
  name?:        string | null
  nome?:        string | null
  label?:       string | null
  text?:        string | null
  description?: string | null
  descricao?:   string | null
  [key: string]: unknown
}

// ── Helpers defensivos ────────────────────────────────────────────────────────

/** Extrai o label de um item de opção em qualquer formato */
function getOptionLabel(option: unknown): string {
  if (option == null || typeof option !== 'object') return ''
  const o = option as AnyOption
  const raw =
    o.name        ??
    o.nome        ??
    o.label       ??
    o.text        ??
    o.description ??
    o.descricao   ??
    o.code        ??
    o.codigo      ??
    o.value       ??
    o.id
  return String(raw ?? '').trim()
}

/** Extrai o value/code de um item de opção em qualquer formato */
function getOptionValue(option: unknown): string {
  if (option == null || typeof option !== 'object') return ''
  const o = option as AnyOption
  const raw =
    o.code   ??
    o.codigo ??
    o.id     ??
    o.value  ??
    o.name   ??
    o.nome   ??
    o.label
  return String(raw ?? '').trim()
}

/** Normaliza qualquer array de opções para { code, name } seguro */
function normalizeOptions(raw: unknown): { code: string; name: string }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(Boolean)                           // remove null/undefined
    .map((item) => ({
      code: getOptionValue(item),
      name: getOptionLabel(item),
    }))
    .filter((o) => o.code !== '' || o.name !== '') // remove itens completamente vazios
}

// ── ComboBox interno genérico e defensivo ─────────────────────────────────────

interface ComboBoxProps {
  label:         string
  value:         string
  onChange:      (code: string, name: string) => void
  options:       { code: string; name: string }[]
  loading?:      boolean
  error?:        string
  disabled?:     boolean
  placeholder?:  string
  emptyMessage?: string
  required?:     boolean
}

function ComboBox({
  label, value, onChange, options, loading, error,
  disabled, placeholder, emptyMessage, required,
}: ComboBoxProps) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Garantia: options sempre é array de objetos com code/name string
  const safeOptions = Array.isArray(options)
    ? options.filter((o) => o != null && typeof o === 'object')
    : []

  // Filtragem 100% segura — sem risco de TypeError
  const safeQuery  = String(query ?? '').trim().toLowerCase()
  const filtered   = safeQuery
    ? safeOptions.filter((o) => String(o.name ?? '').toLowerCase().includes(safeQuery))
    : safeOptions

  const selected   = safeOptions.find((o) => String(o.code ?? '') === String(value ?? ''))
  const displayLabel = selected ? String(selected.name ?? '') : ''

  // Fechar ao clicar fora
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // Fechar com Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>

      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => !disabled && !loading && setOpen((p) => !p)}
          className={[
            'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors',
            'focus:outline-none focus:ring-1 focus:ring-brand-500',
            disabled || loading
              ? 'cursor-not-allowed opacity-50 bg-gray-50 border-gray-200'
              : 'bg-white hover:border-brand-400 cursor-pointer',
            error
              ? 'border-red-300'
              : displayLabel
                ? 'border-gray-300 text-gray-900'
                : 'border-gray-300 text-gray-400',
          ].join(' ')}
        >
          <span className="truncate min-w-0">
            {displayLabel || placeholder || 'Selecione...'}
          </span>
          {loading
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
            : <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          }
        </button>

        {open && !loading && (
          <div className="absolute left-0 top-full z-[60] mt-1 w-full min-w-[200px] rounded-xl border border-gray-200 bg-white shadow-xl">
            {/* Campo de busca */}
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value ?? '')}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded-md border border-gray-200 py-1.5 pl-7 pr-2 text-sm focus:border-brand-400 focus:outline-none"
                  placeholder="Pesquisar..."
                />
              </div>
            </div>

            {/* Lista */}
            <ul
              className="max-h-60 overflow-y-auto py-1"
              role="listbox"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-sm text-gray-400 text-center">
                  {emptyMessage || 'Nenhum resultado'}
                </li>
              ) : (
                filtered.map((o, i) => {
                  const code  = String(o.code ?? i)
                  const name  = String(o.name ?? '')
                  const isSelected = code === String(value ?? '')
                  return (
                    <li key={`${code}-${i}`} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        onClick={() => { onChange(code, name); setOpen(false); setQuery('') }}
                        className={[
                          'w-full px-3 py-2 text-left text-sm transition-colors',
                          isSelected
                            ? 'bg-brand-50 font-medium text-brand-700'
                            : 'text-gray-700 hover:bg-gray-50',
                        ].join(' ')}
                      >
                        {name || code || '—'}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

// ── VehicleComboBox (cascata Marca → Modelo → Versão) ─────────────────────────

export interface VehicleComboSelection {
  vehicleType:  VehicleCategory | ''
  brandCode:    string
  brandName:    string
  modelCode:    string
  modelName:    string
  versionCode:  string
  versionLabel: string
  modelYear:    number | null
  fipeCode:     string
  fipeValue:    number | null
  fipeMonth:    string
  fuel:         string
}

export const EMPTY_COMBO_SELECTION: VehicleComboSelection = {
  vehicleType: '', brandCode: '', brandName: '', modelCode: '', modelName: '',
  versionCode: '', versionLabel: '', modelYear: null,
  fipeCode: '', fipeValue: null, fipeMonth: '', fuel: '',
}

interface VehicleComboBoxProps {
  value:        VehicleComboSelection
  onChange:     (sel: VehicleComboSelection) => void
  initialType?: VehicleCategory
  disabled?:    boolean
}

const VEHICLE_TYPES = [
  { code: 'CAR',        label: 'Carro' },
  { code: 'MOTORCYCLE', label: 'Moto' },
  { code: 'TRUCK',      label: 'Caminhão' },
]

function safeFmt(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function VehicleComboBox({ value, onChange, initialType, disabled }: VehicleComboBoxProps) {
  const [brands,   setBrands]   = useState<{ code: string; name: string }[]>([])
  const [models,   setModels]   = useState<{ code: string; name: string }[]>([])
  const [versions, setVersions] = useState<{ code: string; name: string }[]>([])

  const [loadingBrands,   setLoadingBrands]   = useState(false)
  const [loadingModels,   setLoadingModels]   = useState(false)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [loadingFipe,     setLoadingFipe]     = useState(false)

  const [brandError,   setBrandError]   = useState('')
  const [modelError,   setModelError]   = useState('')
  const [versionError, setVersionError] = useState('')
  const [fipeError,    setFipeError]    = useState('')

  // Determina o tipo efetivo (prop ou initialType)
  const effectiveType = value.vehicleType || initialType || ''

  // ── Carrega marcas quando tipo muda ─────────────────────────────────────────
  useEffect(() => {
    if (!effectiveType) return

    setLoadingBrands(true)
    setBrandError('')
    setBrands([])
    setModels([])
    setVersions([])

    const controller = new AbortController()
    fetch(`/api/vehicles/brands?type=${effectiveType}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && Array.isArray(d.data)) {
          setBrands(normalizeOptions(d.data))
        } else {
          setBrandError('Não foi possível carregar as marcas.')
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          setBrandError('Erro ao carregar marcas. Tente novamente.')
        }
      })
      .finally(() => setLoadingBrands(false))

    return () => controller.abort()
  }, [effectiveType])

  // ── Carrega modelos quando marca muda ────────────────────────────────────────
  useEffect(() => {
    if (!value.brandCode || !effectiveType) return

    setLoadingModels(true)
    setModelError('')
    setModels([])
    setVersions([])

    const controller = new AbortController()
    fetch(`/api/vehicles/models?brandCode=${value.brandCode}&type=${effectiveType}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && Array.isArray(d.data)) {
          setModels(normalizeOptions(d.data))
        } else {
          setModelError('Não foi possível carregar os modelos.')
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          setModelError('Erro ao carregar modelos. Tente novamente.')
        }
      })
      .finally(() => setLoadingModels(false))

    return () => controller.abort()
  }, [value.brandCode, effectiveType])

  // ── Carrega versões quando modelo muda ───────────────────────────────────────
  useEffect(() => {
    if (!value.modelCode || !value.brandCode || !effectiveType) return

    setLoadingVersions(true)
    setVersionError('')
    setVersions([])

    const controller = new AbortController()
    fetch(
      `/api/vehicles/versions?brandCode=${value.brandCode}&modelCode=${value.modelCode}&type=${effectiveType}`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && Array.isArray(d.data)) {
          // Versões vêm como FipeVersion — normalizar para { code, name }
          const normalized = (d.data as unknown[])
            .filter(Boolean)
            .map((item) => {
              const i = item as { code?: string; yearLabel?: string; modelYear?: number; fuelLabel?: string; name?: string; nome?: string }
              const code = String(i?.code ?? '')
              const name = i?.yearLabel
                ?? (i?.modelYear ? `${i.modelYear} — ${i.fuelLabel ?? ''}` : '')
                ?? String(i?.name ?? i?.nome ?? code)
              return { code, name: name.trim() }
            })
            .filter((o) => o.code)
          setVersions(normalized)
        } else {
          setVersionError('Não foi possível carregar as versões.')
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          setVersionError('Erro ao carregar versões. Tente novamente.')
        }
      })
      .finally(() => setLoadingVersions(false))

    return () => controller.abort()
  }, [value.modelCode, value.brandCode, effectiveType])

  // ── Busca FIPE quando versão é selecionada ───────────────────────────────────
  async function fetchFipe(versionCode: string, versionLabel: string) {
    if (!value.brandCode || !value.modelCode || !effectiveType) return

    // Extrai modelYear do código "2022-1" → 2022, ou do label
    const yearMatch = versionCode.match(/^(\d{4})/)
    const modelYear = yearMatch ? Number(yearMatch[1]) : null

    setLoadingFipe(true)
    setFipeError('')

    try {
      const url = `/api/vehicles/fipe?brandCode=${value.brandCode}&modelCode=${value.modelCode}&yearCode=${encodeURIComponent(versionCode)}&type=${effectiveType}`
      const res  = await fetch(url)
      const data: { success?: boolean; data?: FipePrice; error?: string } = await res.json().catch(() => ({}))

      if (data?.success && data.data) {
        onChange({
          ...value,
          versionCode,
          versionLabel,
          modelYear,
          fipeCode:  data.data.fipeCode  ?? '',
          fipeValue: data.data.value     ?? null,
          fipeMonth: data.data.referenceMonth ?? '',
          fuel:      data.data.fuel      ?? '',
        })
      } else {
        setFipeError(data?.error ?? 'Não foi possível consultar a Tabela FIPE. Preencha manualmente.')
        onChange({ ...value, versionCode, versionLabel, modelYear })
      }
    } catch (_) {
      setFipeError('Erro ao consultar a Tabela FIPE. Preencha manualmente.')
      onChange({ ...value, versionCode, versionLabel, modelYear })
    } finally {
      setLoadingFipe(false)
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleType(code: string) {
    onChange({
      ...EMPTY_COMBO_SELECTION,
      vehicleType: code as VehicleCategory,
    })
  }

  function handleBrand(code: string, name: string) {
    onChange({
      ...value,
      brandCode: code, brandName: name,
      modelCode: '', modelName: '',
      versionCode: '', versionLabel: '', modelYear: null,
      fipeCode: '', fipeValue: null, fipeMonth: '', fuel: '',
    })
  }

  function handleModel(code: string, name: string) {
    onChange({
      ...value,
      modelCode: code, modelName: name,
      versionCode: '', versionLabel: '', modelYear: null,
      fipeCode: '', fipeValue: null, fipeMonth: '', fuel: '',
    })
  }

  function handleVersion(code: string) {
    const ver = versions.find((v) => v.code === code)
    const label = ver?.name ?? code
    fetchFipe(code, label)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* Tipo de Veículo */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Tipo de Veículo</label>
        <div className="flex gap-2">
          {VEHICLE_TYPES.map((t) => (
            <button
              key={t.code}
              type="button"
              disabled={disabled}
              onClick={() => handleType(t.code)}
              className={[
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                value.vehicleType === t.code
                  ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                  : 'border-gray-300 text-gray-600 hover:border-brand-300 hover:bg-gray-50',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cascata Marca → Modelo → Versão */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ComboBox
          label="Marca"
          required
          value={value.brandCode}
          onChange={handleBrand}
          options={brands}
          loading={loadingBrands}
          error={brandError}
          disabled={disabled || !effectiveType}
          placeholder={effectiveType ? 'Selecione a marca' : 'Selecione o tipo primeiro'}
          emptyMessage="Nenhuma marca encontrada"
        />

        <ComboBox
          label="Modelo"
          required
          value={value.modelCode}
          onChange={handleModel}
          options={models}
          loading={loadingModels}
          error={modelError}
          disabled={disabled || !value.brandCode}
          placeholder={value.brandCode ? 'Selecione o modelo' : 'Selecione a marca primeiro'}
          emptyMessage="Nenhum modelo encontrado"
        />

        <ComboBox
          label="Versão / Ano"
          value={value.versionCode}
          onChange={handleVersion}
          options={versions}
          loading={loadingVersions || loadingFipe}
          error={versionError || fipeError}
          disabled={disabled || !value.modelCode}
          placeholder={value.modelCode ? 'Selecione a versão' : 'Selecione o modelo primeiro'}
          emptyMessage="Nenhuma versão encontrada"
        />
      </div>

      {/* Resultado FIPE */}
      {loadingFipe && (
        <div className="flex items-center gap-2 text-sm text-brand-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Consultando Tabela FIPE...
        </div>
      )}

      {value.fipeValue != null && !loadingFipe && (
        <div className="flex flex-wrap items-stretch gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-xs text-brand-500">Tabela FIPE</span>
            <p className="text-lg font-bold text-brand-800">{safeFmt(value.fipeValue)}</p>
          </div>
          {value.fipeCode && (
            <div className="flex flex-col border-l border-brand-200 pl-3">
              <span className="text-xs text-brand-500">Código</span>
              <p className="font-mono font-medium text-brand-700">{value.fipeCode}</p>
            </div>
          )}
          {value.fipeMonth && (
            <div className="flex flex-col border-l border-brand-200 pl-3">
              <span className="text-xs text-brand-500">Referência</span>
              <p className="font-medium text-brand-700">{value.fipeMonth}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
