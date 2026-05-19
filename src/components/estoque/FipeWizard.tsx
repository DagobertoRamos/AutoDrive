'use client'

// =============================================================================
// FipeWizard — Stepper Tipo → Marca → Modelo → Ano/Variante → Preço
//
// Consome as rotas internas que proxiam o provider FIPE (Parallelum):
//   GET /api/integrations/fipe/brands  ?tipoVeiculo=
//   GET /api/integrations/fipe/models  ?tipoVeiculo=&brandId=
//   GET /api/integrations/fipe/years   ?tipoVeiculo=&brandId=&modelId=
//   GET /api/integrations/fipe/price   ?tipoVeiculo=&brandId=&modelId=&yearId=
//
// Ao concluir, dispara onComplete com os campos prontos para salvar em
// VehicleEvaluation/Deal:
//   { codigoFipe, valor, valorNumber, mesReferencia, marca, modelo,
//     anoModelo, combustivel, tipoVeiculo, dataConsulta }
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Car, Bike, Truck, ChevronRight, Loader2, Search, AlertTriangle,
  CheckCircle2, RefreshCcw, X,
} from 'lucide-react'

export interface FipeResult {
  codigoFipe:    string
  valor:         string        // "R$ 95.000,00"
  valorNumber:   number        // 95000
  mesReferencia: string        // "maio/2026 "
  marca:         string
  modelo:        string
  anoModelo:     number | null
  combustivel:   string
  tipoVeiculo:   'carros' | 'motos' | 'caminhoes'
  dataConsulta:  string        // ISO
}

// Provider Parallelum: { code, name }
interface Brand   { code: string; name: string }
interface Model   { code: string; name: string }
interface Year    { code: string; name: string }
interface PriceData {
  brand:           string
  codeFipe:        string
  fuel:            string
  fuelAcronym:     string
  model:           string
  modelYear:       number
  price:           string         // "R$ 95.000,00"
  referenceMonth:  string         // "abril de 2024"
  vehicleType:     number
}

type Tipo = 'carros' | 'motos' | 'caminhoes'

const TIPOS: Array<{ value: Tipo; label: string; Icon: typeof Car }> = [
  { value: 'carros',     label: 'Carro',    Icon: Car },
  { value: 'motos',      label: 'Moto',     Icon: Bike },
  { value: 'caminhoes',  label: 'Caminhão', Icon: Truck },
]

function parseValor(v: string): number {
  const n = parseFloat(v.replace(/[R$\s.]/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

const baseInput =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

// ── Componente ────────────────────────────────────────────────────────────────

export function FipeWizard({
  initialTipo = 'carros',
  onComplete,
  onCancel,
}: {
  initialTipo?: Tipo
  onComplete: (r: FipeResult) => void
  onCancel?:  () => void
}) {
  const [tipo,       setTipo]       = useState<Tipo>(initialTipo)
  const [brands,     setBrands]     = useState<Brand[]>([])
  const [brandQuery, setBrandQuery] = useState('')
  const [brandSel,   setBrandSel]   = useState<Brand | null>(null)
  const [models,     setModels]     = useState<Model[]>([])
  const [modelQuery, setModelQuery] = useState('')
  const [modelSel,   setModelSel]   = useState<Model | null>(null)
  const [years,      setYears]      = useState<Year[]>([])
  const [yearSel,    setYearSel]    = useState<Year | null>(null)
  const [price,      setPrice]      = useState<PriceData | null>(null)

  const [loading, setLoading] = useState<null | 'brands' | 'models' | 'years' | 'price'>(null)
  const [error,   setError]   = useState<string>('')

  // ── Carrega marcas quando muda o tipo ──────────────────────────────────────
  const loadBrands = useCallback(async (t: Tipo) => {
    setLoading('brands')
    setError('')
    setBrands([])
    setBrandSel(null)
    setModels([]); setModelSel(null)
    setYears([]);  setYearSel(null)
    setPrice(null)
    try {
      const res  = await fetch(`/api/integrations/fipe/brands?tipoVeiculo=${t}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Falha ao carregar marcas FIPE.')
      setBrands(Array.isArray(json.data) ? json.data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar marcas FIPE.')
    } finally {
      setLoading(null)
    }
  }, [])

  useEffect(() => { loadBrands(tipo) }, [tipo, loadBrands])

  // ── Carrega modelos ao selecionar marca ────────────────────────────────────
  const loadModels = useCallback(async (b: Brand) => {
    setLoading('models')
    setError('')
    setModels([]); setModelSel(null)
    setYears([]);  setYearSel(null)
    setPrice(null)
    try {
      const res  = await fetch(`/api/integrations/fipe/models?tipoVeiculo=${tipo}&brandId=${encodeURIComponent(b.code)}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Falha ao carregar modelos FIPE.')
      setModels(Array.isArray(json.data) ? json.data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar modelos FIPE.')
    } finally {
      setLoading(null)
    }
  }, [tipo])

  // ── Carrega anos/combustível ao selecionar modelo ──────────────────────────
  const loadYears = useCallback(async (m: Model) => {
    if (!brandSel) return
    setLoading('years')
    setError('')
    setYears([]); setYearSel(null); setPrice(null)
    try {
      const res  = await fetch(
        `/api/integrations/fipe/years?tipoVeiculo=${tipo}&brandId=${encodeURIComponent(brandSel.code)}&modelId=${encodeURIComponent(m.code)}`,
      )
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Falha ao carregar anos FIPE.')
      setYears(Array.isArray(json.data) ? json.data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar anos FIPE.')
    } finally {
      setLoading(null)
    }
  }, [tipo, brandSel])

  // ── Consulta preço ao selecionar ano ───────────────────────────────────────
  const loadPrice = useCallback(async (y: Year) => {
    if (!brandSel || !modelSel) return
    setLoading('price')
    setError('')
    setPrice(null)
    try {
      const res  = await fetch(
        `/api/integrations/fipe/price?tipoVeiculo=${tipo}&brandId=${encodeURIComponent(brandSel.code)}&modelId=${encodeURIComponent(modelSel.code)}&yearId=${encodeURIComponent(y.code)}`,
      )
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Falha ao consultar preço FIPE.')
      setPrice(json.data as PriceData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao consultar preço FIPE.')
    } finally {
      setLoading(null)
    }
  }, [tipo, brandSel, modelSel])

  const filteredBrands = useMemo(() => {
    const q = brandQuery.trim().toLowerCase()
    if (!q) return brands.slice(0, 60)
    return brands.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 60)
  }, [brands, brandQuery])

  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase()
    if (!q) return models.slice(0, 60)
    return models.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 60)
  }, [models, modelQuery])

  // ── Confirmar (chamado pelo botão depois do preço carregado) ───────────────
  const handleConfirm = () => {
    if (!price || !yearSel) return
    onComplete({
      codigoFipe:    price.codeFipe,
      valor:         price.price,
      valorNumber:   parseValor(price.price),
      mesReferencia: price.referenceMonth,
      marca:         price.brand,
      modelo:        price.model,
      anoModelo:     typeof price.modelYear === 'number' ? price.modelYear : null,
      combustivel:   price.fuel,
      tipoVeiculo:   tipo,
      dataConsulta:  new Date().toISOString(),
    })
  }

  // ── UI ──────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Crumbs */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className="font-semibold">FIPE:</span>
        <Crumb active={!brandSel} done={!!brandSel}>{TIPOS.find((t) => t.value === tipo)?.label}</Crumb>
        <ChevronRight size={12} className="text-gray-300" />
        <Crumb active={!!brandSel && !modelSel} done={!!modelSel}>{brandSel?.name ?? 'Marca'}</Crumb>
        <ChevronRight size={12} className="text-gray-300" />
        <Crumb active={!!modelSel && !yearSel} done={!!yearSel}>{modelSel?.name ?? 'Modelo'}</Crumb>
        <ChevronRight size={12} className="text-gray-300" />
        <Crumb active={!!yearSel && !price} done={!!price}>{yearSel?.name ?? 'Ano'}</Crumb>
        <ChevronRight size={12} className="text-gray-300" />
        <Crumb active={!!price}>Preço</Crumb>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
          >
            <X size={11} /> Cancelar
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => loadBrands(tipo)}
            className="ml-auto flex items-center gap-1 text-amber-900 hover:underline"
          >
            <RefreshCcw size={11} /> Recarregar
          </button>
        </div>
      )}

      {/* Tipo */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tipo de veículo</p>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTipo(value)}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                tipo === value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Marca */}
      <Panel title="Marca" loading={loading === 'brands'}>
        <SearchInput value={brandQuery} onChange={setBrandQuery} placeholder="Buscar marca..." />
        <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-gray-100">
          {filteredBrands.length === 0 && loading !== 'brands' && (
            <p className="px-3 py-3 text-xs text-gray-400">Nenhuma marca encontrada.</p>
          )}
          <ul className="divide-y divide-gray-50">
            {filteredBrands.map((b) => (
              <li key={b.code}>
                <button
                  type="button"
                  onClick={() => { setBrandSel(b); loadModels(b) }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50 ${
                    brandSel?.code === b.code ? 'bg-brand-50/70 font-semibold text-brand-800' : 'text-gray-700'
                  }`}
                >
                  <span>{b.name}</span>
                  {brandSel?.code === b.code && <CheckCircle2 size={13} className="text-brand-600" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {/* Modelo */}
      {brandSel && (
        <Panel title="Modelo" loading={loading === 'models'}>
          <SearchInput value={modelQuery} onChange={setModelQuery} placeholder="Buscar modelo..." />
          <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-gray-100">
            {filteredModels.length === 0 && loading !== 'models' && (
              <p className="px-3 py-3 text-xs text-gray-400">Nenhum modelo disponível.</p>
            )}
            <ul className="divide-y divide-gray-50">
              {filteredModels.map((m) => (
                <li key={m.code}>
                  <button
                    type="button"
                    onClick={() => { setModelSel(m); loadYears(m) }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50 ${
                      modelSel?.code === m.code ? 'bg-brand-50/70 font-semibold text-brand-800' : 'text-gray-700'
                    }`}
                  >
                    <span className="truncate pr-2">{m.name}</span>
                    <span className="font-mono text-[10px] text-gray-400">{m.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      {/* Ano / combustível */}
      {modelSel && (
        <Panel title="Ano / Combustível" loading={loading === 'years'}>
          {years.length === 0 && loading !== 'years' && !error && (
            <p className="px-3 py-3 text-xs text-gray-400">Aguardando anos…</p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {years.map((y) => (
              <button
                key={y.code}
                type="button"
                onClick={() => { setYearSel(y); loadPrice(y) }}
                className={`rounded-lg border-2 px-3 py-2 text-left text-sm transition-all ${
                  yearSel?.code === y.code
                    ? 'border-brand-500 bg-brand-50 text-brand-800'
                    : 'border-gray-200 bg-white hover:border-brand-300'
                }`}
              >
                <span className="block font-semibold">{y.name}</span>
                <span className="block font-mono text-[10px] text-gray-400">{y.code}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* Preço final */}
      {yearSel && (
        <Panel title="Preço FIPE" loading={loading === 'price'}>
          {!price && loading !== 'price' && !error && (
            <p className="px-3 py-3 text-xs text-gray-400">Aguardando preço…</p>
          )}
          {price && (
            <div className="flex flex-col gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{price.model}</p>
                  <p className="text-[11px] text-gray-500">
                    {price.brand} · {price.modelYear} · {price.fuel}
                    <span className="ml-2 font-mono text-gray-400">FIPE {price.codeFipe}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold text-emerald-700">{price.price}</p>
                  <p className="text-[10px] text-gray-400">{price.referenceMonth}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                <CheckCircle2 size={14} />
                Usar esta consulta FIPE
              </button>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function Crumb({ children, active, done }: { children: React.ReactNode; active?: boolean; done?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
      done   ? 'bg-emerald-50 text-emerald-700'
      : active ? 'bg-brand-100 text-brand-800'
      : 'bg-gray-100 text-gray-500'
    }`}>
      {children}
    </span>
  )
}

function Panel({ title, loading, children }: { title: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        {loading && <Loader2 size={12} className="animate-spin text-gray-400" />}
      </div>
      {children}
    </div>
  )
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        className={`${baseInput} pl-7`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
