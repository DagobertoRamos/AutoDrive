'use client'

// =============================================================================
// /estoque/avaliacao — Avaliação de veículo obrigatória antes do cadastro
// 6 etapas: Placa → Veículo → FIPE/Preços → Cautelar → Cliente → Resultado
// =============================================================================

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Car, CheckCircle,
  ClipboardCheck, DollarSign, ShieldCheck, User,
  FileCheck, AlertTriangle, Info,
} from 'lucide-react'
import { canAccessModule } from '@/lib/permissions'
import { PlateInput } from '@/components/estoque/PlateInput'
import { VehicleComboBox, type VehicleComboSelection } from '@/components/estoque/VehicleComboBox'
import type { VehicleLookupData, VehicleCategory } from '@/lib/vehicle-lookup/types'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Unit { id: string; name: string }

type Step = 1 | 2 | 3 | 4 | 5 | 6

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'
const selectCls = inputCls

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function Grid({ cols = 3, children }: { cols?: 2 | 3 | 4; children: React.ReactNode }) {
  const colMap = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }
  return <div className={`grid grid-cols-1 gap-4 ${colMap[cols]}`}>{children}</div>
}

function Section({ title, icon, children }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-brand-600">{icon}</span>}
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'Placa',        icon: <Car className="h-4 w-4" /> },
  { num: 2, label: 'Veículo',      icon: <ClipboardCheck className="h-4 w-4" /> },
  { num: 3, label: 'FIPE / Preços', icon: <DollarSign className="h-4 w-4" /> },
  { num: 4, label: 'Cautelar',     icon: <ShieldCheck className="h-4 w-4" /> },
  { num: 5, label: 'Cliente',      icon: <User className="h-4 w-4" /> },
  { num: 6, label: 'Resultado',    icon: <FileCheck className="h-4 w-4" /> },
]

function StepBar({ current, onNavigate }: { current: Step; onNavigate: (s: Step) => void }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const done    = s.num < current
        const active  = s.num === current
        const enabled = s.num <= current || done
        return (
          <div key={s.num} className="flex items-center">
            <button
              type="button"
              disabled={!enabled}
              onClick={() => enabled && onNavigate(s.num as Step)}
              className={[
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors whitespace-nowrap',
                active  ? 'bg-brand-600 text-white shadow-sm'       : '',
                done    ? 'text-brand-700 hover:bg-brand-50'         : '',
                !enabled && !active && !done ? 'text-gray-300 cursor-not-allowed' : '',
                !active && enabled ? 'cursor-pointer' : '',
              ].join(' ')}
            >
              <span className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold',
                active  ? 'bg-white text-brand-600'              : '',
                done    ? 'bg-brand-100 text-brand-600'          : '',
                !enabled && !active && !done ? 'bg-gray-100 text-gray-300' : '',
              ].join(' ')}>
                {done ? <CheckCircle className="h-4 w-4" /> : s.num}
              </span>
              <span className="text-xs font-medium">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 shrink-0 ${s.num < current ? 'bg-brand-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Formulário principal ──────────────────────────────────────────────────────

function AvaliacaoForm() {
  const { data: session } = useSession()
  const router            = useRouter()
  const searchParams      = useSearchParams()
  const role = (session?.user as { role?: string })?.role ?? ''

  const canAccess  = canAccessModule(role, 'stock.evaluate')
  const canApprove = canAccessModule(role, 'stock.manage')

  const [step,       setStep]       = useState<Step>(1)
  const [units,      setUnits]      = useState<Unit[]>([])
  const [lookupData, setLookupData] = useState<VehicleLookupData | null>(null)
  const [dataSource, setDataSource] = useState<string>('')
  const [saving,     setSaving]     = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [savedId,    setSavedId]    = useState('')
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState<'saved' | 'approved' | null>(null)

  // ── Etapa 1 — Placa ─────────────────────────────────────────────────────────
  const [plate,        setPlate]        = useState('')
  const [plateDisplay, setPlateDisplay] = useState('')

  // ── Etapa 2 — Veículo ────────────────────────────────────────────────────────
  const [combo, setCombo] = useState<VehicleComboSelection>({
    vehicleType: '', brandCode: '', brandName: '', modelCode: '', modelName: '',
    versionCode: '', versionLabel: '', modelYear: null,
    fipeCode: '', fipeValue: null, fipeMonth: '', fuel: '',
  })
  // Fallback manual de marca/modelo quando VehicleComboBox não tem seleção
  const [manualBrand, setManualBrand] = useState('')
  const [manualModel, setManualModel] = useState('')

  const [version,      setVersion]      = useState('')
  const [year,         setYear]         = useState('')
  const [km,           setKm]           = useState('')
  const [color,        setColor]        = useState('')
  const [fuel,         setFuel]         = useState('')
  const [transmission, setTransmission] = useState('')
  const [doors,        setDoors]        = useState('')
  const [engine,       setEngine]       = useState('')
  const [displacement, setDisplacement] = useState('')
  const [power,        setPower]        = useState('')
  const [bodyType,     setBodyType]     = useState('')
  const [chassi,       setChassi]       = useState('')
  const [renavam,      setRenavam]      = useState('')
  const [conditionType, setConditionType] = useState('')
  const [unitId,        setUnitId]       = useState('')

  // ── Etapa 3 — FIPE / Preços ──────────────────────────────────────────────────
  const [fipeCode,       setFipeCode]       = useState('')
  const [fipeValue,      setFipeValue]      = useState('')
  const [fipeMonth,      setFipeMonth]      = useState('')
  const [evaluatedValue, setEvaluatedValue] = useState('')
  const [desiredValue,   setDesiredValue]   = useState('')
  const [minimumValue,   setMinimumValue]   = useState('')
  const [suggestedSale,  setSuggestedSale]  = useState('')

  // ── Etapa 4 — Cautelar ───────────────────────────────────────────────────────
  const [cautelarStatus, setCautelarStatus] = useState('SEM_CAUTELAR')
  const [cautelarNumber, setCautelarNumber] = useState('')
  const [cautelarNotes,  setCautelarNotes]  = useState('')

  // ── Etapa 5 — Cliente ────────────────────────────────────────────────────────
  const [ownerName,  setOwnerName]  = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerCpf,   setOwnerCpf]   = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')

  // ── Etapa 6 — Resultado ──────────────────────────────────────────────────────
  const [intention,       setIntention]       = useState('APENAS_AVALIACAO')
  const [result,          setResult]          = useState('PENDENTE')
  const [evaluationNotes, setEvaluationNotes] = useState('')
  const [stockType,       setStockType]       = useState('PROPRIO')

  // ── Carga inicial ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/units?limit=200', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setUnits(d.data ?? []) })
      .catch(() => {})

    // Pré-carrega vehicleId se vier pela URL (vindo de /estoque/[id])
    const vehicleIdParam = searchParams.get('vehicleId')
    if (vehicleIdParam) {
      fetch(`/api/vehicles/${vehicleIdParam}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data) {
            const v = d.data
            setPlate(v.plate ?? '')
            setPlateDisplay(v.plate ?? '')
            setVersion(v.version ?? '')
            setYear(v.year?.toString() ?? '')
            setKm(v.km?.toString() ?? '')
            setColor(v.color ?? '')
            setFuel(v.fuel ?? '')
            setTransmission(v.transmission ?? '')
            setDoors(v.doors?.toString() ?? '')
            setChassi(v.chassi ?? '')
            setRenavam(v.renavam ?? '')
            setConditionType(v.conditionType ?? '')
            if (v.unitId) setUnitId(v.unitId)
            setCombo((prev) => ({
              ...prev,
              vehicleType: v.vehicleType ?? '',
            }))
          }
        })
        .catch(() => {})
    }
  }, [searchParams])

  // ── Auto-preencher a partir do resultado da consulta por placa ───────────────
  const handleLookupResult = useCallback((data: VehicleLookupData | null, status: string) => {
    setLookupData(data)
    if (!data || status !== 'found') { setDataSource(''); return }
    setDataSource('auto')
    // Marca/Modelo — pré-preenche fallback manual (substituído se combo for usado)
    if (data.brand) setManualBrand(data.brand)
    if (data.model) setManualModel(data.model)
    // Veículo
    if (data.version)         setVersion(data.version)
    if (data.manufactureYear) setYear(String(data.manufactureYear))
    if (data.fuel)            setFuel(data.fuel)
    if (data.color)           setColor(data.color)
    if (data.transmission)    setTransmission(data.transmission)
    if (data.doors)           setDoors(String(data.doors))
    if (data.engine)          setEngine(data.engine)
    if (data.displacement)    setDisplacement(data.displacement)
    if (data.power)           setPower(data.power)
    if (data.bodyType)        setBodyType(data.bodyType)
    if (data.chassi)          setChassi(data.chassi)
    if (data.renavam)         setRenavam(data.renavam)
    // FIPE
    if (data.fipeCode)           setFipeCode(data.fipeCode)
    if (data.fipeValue != null)  setFipeValue(String(data.fipeValue))
    if (data.fipeReferenceMonth) setFipeMonth(data.fipeReferenceMonth)
    // ComboBox — pré-seleciona tipo se disponível
    const vtype = data.vehicleType
    if (vtype) {
      setCombo((prev) => ({ ...prev, vehicleType: vtype as VehicleCategory }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync FIPE quando ComboBox seleciona versão ────────────────────────────────
  useEffect(() => {
    if (combo.fipeValue != null) setFipeValue(combo.fipeValue.toString())
    if (combo.fipeCode)          setFipeCode(combo.fipeCode)
    if (combo.fipeMonth)         setFipeMonth(combo.fipeMonth)
    if (combo.fuel)              setFuel(combo.fuel)
    if (combo.modelYear)         setYear(combo.modelYear.toString())
    if (combo.brandName && combo.modelName) {
      // não sobrescrever se já foi preenchido por lookup
    }
  }, [combo.fipeValue, combo.fipeCode, combo.fipeMonth, combo.fuel, combo.modelYear, combo.brandName, combo.modelName])

  // ── Parsers ──────────────────────────────────────────────────────────────────
  function parseMoney(v: string): number | null {
    if (!v.trim()) return null
    const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
    return isNaN(n) ? null : n
  }

  // ── Salvar avaliação ──────────────────────────────────────────────────────────
  async function handleSave() {
    // Prioridade: seleção do combo → entrada manual → dado do lookup
    const brand = combo.brandName  || manualBrand  || lookupData?.brand  || ''
    const model = combo.modelName  || manualModel  || lookupData?.model  || ''

    if (!plate) { setError('Placa é obrigatória.'); return }
    if (!brand || !model) { setError('Marca e modelo são obrigatórios. Preencha na etapa Veículo (combo ou campos manuais).'); return }

    setSaving(true)
    setError('')
    try {
      const body = {
        vehicleId:    searchParams.get('vehicleId') || null,
        unitId:       unitId || null,
        plate:        plate  || null,
        chassi:       chassi || null,
        renavam:      renavam || null,
        brand,
        model,
        version:      version || combo.versionLabel || lookupData?.version || null,
        year:         year ? Number(year) : null,
        modelYear:    combo.modelYear ?? null,
        km:           km ? Number(km) : null,
        color:        color || null,
        fuel:         fuel || null,
        transmission: transmission || null,
        doors:        doors ? Number(doors) : null,
        vehicleType:  combo.vehicleType || lookupData?.vehicleType || null,
        conditionType: conditionType || null,
        engine:       engine || null,
        displacement: displacement || null,
        power:        power || null,
        bodyType:     bodyType || null,
        fipeCode:     fipeCode || combo.fipeCode || null,
        fipeReferenceMonth: fipeMonth || combo.fipeMonth || null,
        fipeValue:       parseMoney(fipeValue),
        evaluatedValue:  parseMoney(evaluatedValue),
        desiredValue:    parseMoney(desiredValue),
        minimumValue:    parseMoney(minimumValue),
        suggestedSalePrice: parseMoney(suggestedSale),
        stockType:       stockType || 'PROPRIO',
        cautelarStatus:  cautelarStatus || 'SEM_CAUTELAR',
        cautelarNumber:  cautelarNumber || null,
        cautelarNotes:   cautelarNotes  || null,
        ownerName:       ownerName  || null,
        ownerPhone:      ownerPhone || null,
        ownerCpf:        ownerCpf   || null,
        ownerEmail:      ownerEmail || null,
        result:          result   || 'PENDENTE',
        intention:       intention || 'APENAS_AVALIACAO',
        notes:           evaluationNotes || null,
        lookupSource:    dataSource || 'manual',
      }

      const res  = await fetch('/api/vehicles/evaluations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()

      if (data.success) {
        setSavedId(data.data.id)
        if (result === 'APROVADO' && canApprove) {
          await handleApprove(data.data.id)
        } else {
          setSuccess('saved')
          setTimeout(() => router.push('/estoque'), 2500)
        }
      } else {
        setError(data.error ?? 'Erro ao salvar avaliação.')
      }
    } catch (_) {
      setError('Erro de conexão.')
    } finally {
      setSaving(false)
    }
  }

  // ── Aprovar avaliação e criar veículo ────────────────────────────────────────
  async function handleApprove(evaluationId?: string) {
    const id = evaluationId ?? savedId
    if (!id) { setError('Salve a avaliação antes de aprovar.'); return }
    setApproving(true)
    setError('')
    try {
      const res  = await fetch(`/api/vehicles/evaluations/${id}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stockType, stockStatus: 'COMPRADO' }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('approved')
        setTimeout(() => router.push(`/estoque/${data.data.vehicleId}`), 2000)
      } else {
        setError(data.error ?? 'Erro ao aprovar avaliação.')
      }
    } catch (_) {
      setError('Erro de conexão ao aprovar.')
    } finally {
      setApproving(false)
    }
  }

  // ── Guards ────────────────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ClipboardCheck className="h-14 w-14 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">Sem permissão</h2>
        <p className="text-sm text-gray-400">Você não tem acesso ao módulo de avaliações.</p>
      </div>
    )
  }

  if (success === 'approved') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <CheckCircle className="h-16 w-16 text-emerald-500" />
        <h2 className="text-xl font-bold text-emerald-700">Avaliação aprovada!</h2>
        <p className="text-sm text-gray-500">Veículo cadastrado no estoque com sucesso. Redirecionando...</p>
      </div>
    )
  }

  if (success === 'saved') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <CheckCircle className="h-16 w-16 text-brand-500" />
        <h2 className="text-xl font-bold text-brand-700">Avaliação salva!</h2>
        <p className="text-sm text-gray-500">Redirecionando para o estoque...</p>
        {savedId && canApprove && (
          <button
            onClick={() => handleApprove()}
            disabled={approving}
            className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <FileCheck className="h-4 w-4" />
            {approving ? 'Cadastrando...' : 'Aprovar e cadastrar no estoque agora'}
          </button>
        )}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-20">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/estoque" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Estoque
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Fazer Avaliação</h1>
        </div>
      </div>

      {/* Aviso de fluxo obrigatório */}
      <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
        <Info className="h-5 w-5 shrink-0 text-brand-600 mt-0.5" />
        <p className="text-sm text-brand-700">
          <strong>Avaliação obrigatória.</strong> Todo veículo deve ser avaliado antes de entrar no estoque.
          Após salvar, você poderá aprovar e cadastrar automaticamente.
        </p>
      </div>

      {/* Step Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm overflow-x-auto">
        <StepBar current={step} onNavigate={setStep} />
      </div>

      {/* Erro global */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Etapa 1 — Placa ── */}
      {step === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <Section title="Identificação por Placa" icon={<Car className="h-5 w-5" />}>
            <div className="max-w-md">
              <Field label="Placa do Veículo" required hint="Digite a placa e aguarde — os dados serão carregados automaticamente quando possível.">
                <PlateInput
                  value={plate}
                  onChange={(normal, display) => { setPlate(normal); setPlateDisplay(display) }}
                  onLookupResult={handleLookupResult}
                />
              </Field>
            </div>

            {/* Preview de dados encontrados */}
            {lookupData && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  Dados encontrados automaticamente
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  {lookupData.brand        && <div><span className="text-xs text-emerald-500">Marca</span><p className="font-medium text-emerald-900">{lookupData.brand}</p></div>}
                  {lookupData.model        && <div><span className="text-xs text-emerald-500">Modelo</span><p className="font-medium text-emerald-900">{lookupData.model}</p></div>}
                  {lookupData.version      && <div><span className="text-xs text-emerald-500">Versão</span><p className="font-medium text-emerald-900 truncate">{lookupData.version}</p></div>}
                  {lookupData.manufactureYear && <div><span className="text-xs text-emerald-500">Ano Fab.</span><p className="font-medium text-emerald-900">{lookupData.manufactureYear}</p></div>}
                  {lookupData.modelYear    && <div><span className="text-xs text-emerald-500">Ano Mod.</span><p className="font-medium text-emerald-900">{lookupData.modelYear}</p></div>}
                  {lookupData.color        && <div><span className="text-xs text-emerald-500">Cor</span><p className="font-medium text-emerald-900">{lookupData.color}</p></div>}
                  {lookupData.fuel         && <div><span className="text-xs text-emerald-500">Combustível</span><p className="font-medium text-emerald-900">{lookupData.fuel}</p></div>}
                  {lookupData.fipeValue    && <div><span className="text-xs text-emerald-500">FIPE</span><p className="font-medium text-emerald-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lookupData.fipeValue)}</p></div>}
                </div>
                <p className="mt-2 text-xs text-emerald-500">
                  Você poderá revisar e corrigir todos os campos nas próximas etapas.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!plate}
                onClick={() => setStep(2)}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                Próxima etapa
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </Section>
        </div>
      )}

      {/* ── Etapa 2 — Veículo ── */}
      {step === 2 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Marca / Modelo / Versão" icon={<Car className="h-5 w-5" />}>
            {dataSource === 'auto' && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Dados preenchidos automaticamente. Revise e corrija se necessário.
              </div>
            )}
            <VehicleComboBox
              value={combo}
              onChange={setCombo}
              initialType={lookupData?.vehicleType as VehicleCategory | undefined}
            />

            {/* ── Fallback manual — aparece quando combo não tem marca ou modelo ── */}
            {(!combo.brandCode || !combo.modelCode) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {combo.brandCode
                    ? 'Modelo não selecionado na lista — preencha manualmente se necessário.'
                    : 'Marca não selecionada na lista — preencha manualmente se necessário.'}
                </p>
                <Grid cols={2}>
                  {!combo.brandCode && (
                    <Field label="Marca" required hint="Ex: Volkswagen, Fiat, Toyota, Honda">
                      <input
                        value={manualBrand}
                        onChange={(e) => setManualBrand(e.target.value)}
                        className={inputCls}
                        placeholder="Nome da marca"
                      />
                    </Field>
                  )}
                  {!combo.modelCode && (
                    <Field label="Modelo" required hint="Ex: Gol, Palio, Corolla, HB20">
                      <input
                        value={manualModel}
                        onChange={(e) => setManualModel(e.target.value)}
                        className={inputCls}
                        placeholder="Nome do modelo"
                      />
                    </Field>
                  )}
                </Grid>
              </div>
            )}

            {/* Versão manual (complemento ao combo) */}
            <Field label="Versão / Trim (manual se necessário)">
              <input value={version} onChange={(e) => setVersion(e.target.value)} className={inputCls} placeholder="Ex: TSI 1.0 Flex 4p Aut." />
            </Field>
          </Section>

          <div className="border-t border-gray-100 pt-4">
            <Section title="Dados do Veículo">
              <Grid>
                <Field label="Ano Fabricação">
                  <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} placeholder="2022" min={1900} max={2100} />
                </Field>
                <Field label="Quilometragem (KM)" required>
                  <input type="number" value={km} onChange={(e) => setKm(e.target.value)} className={inputCls} placeholder="45000" min={0} />
                </Field>
                <Field label="Cor">
                  <input value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} placeholder="Prata" />
                </Field>
                <Field label="Combustível">
                  <select value={fuel} onChange={(e) => setFuel(e.target.value)} className={selectCls}>
                    <option value="">Selecione</option>
                    <option>Flex</option><option>Gasolina</option><option>Etanol</option>
                    <option>Diesel</option><option>Elétrico</option><option>Híbrido</option><option>GNV</option>
                  </select>
                </Field>
                <Field label="Câmbio">
                  <select value={transmission} onChange={(e) => setTransmission(e.target.value)} className={selectCls}>
                    <option value="">Selecione</option>
                    <option>Manual</option><option>Automático</option><option>Automatizado</option>
                    <option>CVT</option><option>Semi-automático</option>
                  </select>
                </Field>
                <Field label="Portas">
                  <select value={doors} onChange={(e) => setDoors(e.target.value)} className={selectCls}>
                    <option value="">Selecione</option>
                    <option value="2">2 portas</option><option value="4">4 portas</option>
                  </select>
                </Field>
                <Field label="Motorização" hint="Ex: 1.0 Turbo Flex">
                  <input value={engine} onChange={(e) => setEngine(e.target.value)} className={inputCls} placeholder="1.0 Turbo Flex" />
                </Field>
                <Field label="Cilindradas">
                  <input value={displacement} onChange={(e) => setDisplacement(e.target.value)} className={inputCls} placeholder="999 cc" />
                </Field>
                <Field label="Potência">
                  <input value={power} onChange={(e) => setPower(e.target.value)} className={inputCls} placeholder="116 cv" />
                </Field>
                <Field label="Carroceria">
                  <input value={bodyType} onChange={(e) => setBodyType(e.target.value)} className={inputCls} placeholder="Sedan, SUV, Hatch..." />
                </Field>
                <Field label="Condição">
                  <select value={conditionType} onChange={(e) => setConditionType(e.target.value)} className={selectCls}>
                    <option value="">Selecione</option>
                    <option value="ZERO_KM">0 km</option>
                    <option value="SEMINOVO">Seminovo</option>
                    <option value="USADO">Usado</option>
                  </select>
                </Field>
                <Field label="Unidade">
                  <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={selectCls}>
                    <option value="">Sem unidade específica</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </Field>
              </Grid>

              {/* Identificação */}
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Identificação</p>
                <Grid cols={2}>
                  <Field label="Placa" hint="Preenchida automaticamente da etapa 1">
                    <input value={plateDisplay || plate} disabled className={inputCls + ' font-mono uppercase bg-gray-50'} />
                  </Field>
                  <Field label="Chassi" hint={lookupData?.chassi ? 'Via consulta autorizada' : ''}>
                    <input value={chassi} onChange={(e) => setChassi(e.target.value.toUpperCase())} className={inputCls + ' font-mono'} placeholder="17 caracteres" maxLength={17} />
                  </Field>
                  <Field label="Renavam" hint={lookupData?.renavam ? 'Via consulta autorizada' : ''}>
                    <input value={renavam} onChange={(e) => setRenavam(e.target.value)} className={inputCls} placeholder="11 dígitos" />
                  </Field>
                </Grid>
              </div>
            </Section>
          </div>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(1)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Etapa 3 — FIPE / Preços ── */}
      {step === 3 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Tabela FIPE" icon={<DollarSign className="h-5 w-5" />}>
            <Grid>
              <Field label="Código FIPE">
                <input value={fipeCode} onChange={(e) => setFipeCode(e.target.value)} className={inputCls + ' font-mono'} placeholder="005415-6" />
              </Field>
              <Field label="Valor FIPE (R$)" hint="Preenchido automaticamente pelo sistema FIPE">
                <input value={fipeValue} onChange={(e) => setFipeValue(e.target.value)} className={inputCls} placeholder="0,00" />
              </Field>
              <Field label="Mês de Referência">
                <input value={fipeMonth} onChange={(e) => setFipeMonth(e.target.value)} className={inputCls} placeholder="maio/2026" />
              </Field>
            </Grid>
          </Section>

          <div className="border-t border-gray-100 pt-4">
            <Section title="Precificação da Avaliação">
              <Grid>
                <Field label="Valor Avaliado (R$)" hint="Quanto o veículo vale segundo o avaliador">
                  <input value={evaluatedValue} onChange={(e) => setEvaluatedValue(e.target.value)} className={inputCls} placeholder="0,00" />
                </Field>
                <Field label="Valor Desejado pelo Cliente (R$)">
                  <input value={desiredValue} onChange={(e) => setDesiredValue(e.target.value)} className={inputCls} placeholder="0,00" />
                </Field>
                <Field label="Valor Mínimo de Compra (R$)">
                  <input value={minimumValue} onChange={(e) => setMinimumValue(e.target.value)} className={inputCls} placeholder="0,00" />
                </Field>
                <Field label="Preço de Venda Sugerido (R$)">
                  <input value={suggestedSale} onChange={(e) => setSuggestedSale(e.target.value)} className={inputCls} placeholder="0,00" />
                </Field>
              </Grid>

              {/* Margem estimada */}
              {evaluatedValue && suggestedSale && (
                <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-700">Margem estimada</span>
                  <span className="text-base font-bold text-emerald-800">
                    {(() => {
                      const ev = parseMoney(evaluatedValue)
                      const sv = parseMoney(suggestedSale)
                      if (!ev || !sv) return '—'
                      const margin = sv - ev
                      const pct = ev > 0 ? ((margin / ev) * 100).toFixed(1) : '—'
                      return `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(margin)} (${pct}%)`
                    })()}
                  </span>
                </div>
              )}
            </Section>
          </div>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(2)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
            <button type="button" onClick={() => setStep(4)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Etapa 4 — Cautelar ── */}
      {step === 4 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Cautelar / Perícia" icon={<ShieldCheck className="h-5 w-5" />}>
            <Field label="Status da Cautelar" required>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: 'SEM_CAUTELAR',    l: 'Sem Cautelar',      cls: 'border-gray-300 text-gray-600' },
                  { v: 'PENDENTE',        l: 'Pendente',           cls: 'border-amber-400 text-amber-700' },
                  { v: 'APROVADA',        l: 'Aprovada',           cls: 'border-emerald-400 text-emerald-700' },
                  { v: 'REPROVADA',       l: 'Reprovada',          cls: 'border-red-400 text-red-700' },
                  { v: 'COM_APONTAMENTO', l: 'Com Apontamento',    cls: 'border-orange-400 text-orange-700' },
                ].map(({ v, l, cls }) => (
                  <button
                    key={v} type="button"
                    onClick={() => setCautelarStatus(v)}
                    className={[
                      'rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors',
                      cautelarStatus === v ? `${cls} bg-opacity-10 bg-current` : 'border-gray-200 text-gray-500 hover:border-gray-300',
                      cautelarStatus === v ? 'ring-2 ring-offset-1 ring-current' : '',
                    ].join(' ')}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            <Grid cols={2}>
              <Field label="Número do Laudo / Cautelar">
                <input value={cautelarNumber} onChange={(e) => setCautelarNumber(e.target.value)} className={inputCls} placeholder="Número do documento" />
              </Field>
            </Grid>
            <Field label="Apontamentos / Observações">
              <textarea value={cautelarNotes} onChange={(e) => setCautelarNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'} placeholder="Descreva os apontamentos encontrados na cautelar..." />
            </Field>
          </Section>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(3)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
            <button type="button" onClick={() => setStep(5)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Etapa 5 — Cliente ── */}
      {step === 5 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Dados do Proprietário / Cliente" icon={<User className="h-5 w-5" />}>
            <Grid>
              <Field label="Nome completo">
                <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} placeholder="Nome do proprietário" />
              </Field>
              <Field label="WhatsApp / Telefone">
                <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} className={inputCls} placeholder="(00) 00000-0000" />
              </Field>
              <Field label="CPF / CNPJ" hint="Armazenado com finalidade legítima (LGPD)">
                <input value={ownerCpf} onChange={(e) => setOwnerCpf(e.target.value)} className={inputCls} placeholder="000.000.000-00" maxLength={18} />
              </Field>
              <Field label="E-mail">
                <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className={inputCls} placeholder="email@exemplo.com" />
              </Field>
            </Grid>
          </Section>

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(4)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
            <button type="button" onClick={() => setStep(6)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
              Próxima <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Etapa 6 — Resultado ── */}
      {step === 6 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Resultado da Avaliação" icon={<FileCheck className="h-5 w-5" />}>
            <Grid cols={2}>
              <Field label="Intenção" required>
                <select value={intention} onChange={(e) => setIntention(e.target.value)} className={selectCls}>
                  <option value="APENAS_AVALIACAO">Apenas Avaliação</option>
                  <option value="COMPRA">Compra</option>
                  <option value="TROCA">Troca</option>
                  <option value="CONSIGNACAO">Consignação</option>
                </select>
              </Field>
              <Field label="Tipo de Estoque (pós-aprovação)">
                <select value={stockType} onChange={(e) => setStockType(e.target.value)} className={selectCls}>
                  <option value="PROPRIO">Próprio</option>
                  <option value="CONSIGNADO">Consignado</option>
                </select>
              </Field>
            </Grid>

            <Field label="Resultado" required>
              <div className="flex gap-3">
                {[
                  { v: 'PENDENTE',  l: 'Pendente',  cls: 'border-amber-400 bg-amber-50 text-amber-800' },
                  { v: 'APROVADO',  l: 'Aprovado',  cls: 'border-emerald-400 bg-emerald-50 text-emerald-800' },
                  { v: 'RECUSADO',  l: 'Recusado',  cls: 'border-red-400 bg-red-50 text-red-800' },
                ].map(({ v, l, cls }) => (
                  <button
                    key={v} type="button"
                    onClick={() => setResult(v)}
                    className={[
                      'flex-1 rounded-xl border-2 py-3 text-sm font-bold transition-all',
                      result === v ? cls + ' scale-105 shadow-sm' : 'border-gray-200 text-gray-500 hover:border-gray-300',
                    ].join(' ')}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Observações finais">
              <textarea
                value={evaluationNotes}
                onChange={(e) => setEvaluationNotes(e.target.value)}
                rows={4}
                className={inputCls + ' resize-none'}
                placeholder="Registre aqui os detalhes, pendências, condições da avaliação..."
              />
            </Field>

            {/* Resumo antes de salvar */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Resumo da avaliação</p>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div><span className="text-xs text-gray-400">Placa</span><p className="font-mono font-bold">{plateDisplay || plate || '—'}</p></div>
                <div><span className="text-xs text-gray-400">Marca/Modelo</span><p className="font-medium">{(combo.brandName || manualBrand || lookupData?.brand || '—')} {(combo.modelName || manualModel || lookupData?.model || '')}</p></div>
                <div><span className="text-xs text-gray-400">Ano</span><p className="font-medium">{year || '—'}</p></div>
                <div><span className="text-xs text-gray-400">KM</span><p className="font-medium">{km ? Number(km).toLocaleString('pt-BR') + ' km' : '—'}</p></div>
                <div><span className="text-xs text-gray-400">FIPE</span><p className="font-medium">{fipeValue ? `R$ ${Number(fipeValue).toLocaleString('pt-BR')}` : '—'}</p></div>
                <div><span className="text-xs text-gray-400">Avaliado</span><p className="font-medium">{evaluatedValue ? `R$ ${Number(evaluatedValue).toLocaleString('pt-BR')}` : '—'}</p></div>
              </div>
            </div>
          </Section>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button type="button" onClick={() => setStep(5)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>

            <div className="flex gap-3">
              {/* Salvar apenas */}
              <button
                type="button"
                disabled={saving || approving}
                onClick={handleSave}
                className="flex items-center gap-2 rounded-lg border border-brand-500 bg-white px-5 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-60 transition-colors"
              >
                <ClipboardCheck className="h-4 w-4" />
                {saving ? 'Salvando...' : 'Salvar avaliação'}
              </button>

              {/* Salvar e aprovar (apenas se canApprove e resultado = APROVADO) */}
              {canApprove && result === 'APROVADO' && (
                <button
                  type="button"
                  disabled={saving || approving}
                  onClick={async () => { await handleSave() }}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  <FileCheck className="h-4 w-4" />
                  {saving || approving ? 'Processando...' : 'Aprovar e cadastrar no estoque'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Export com Suspense (useSearchParams requer boundary) ──────────────────────

export default function AvaliacaoPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-96 rounded-xl bg-gray-100" />}>
      <AvaliacaoForm />
    </Suspense>
  )
}
