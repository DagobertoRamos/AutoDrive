'use client'

// =============================================================================
// /estoque/[id] — Detalhes do veículo em estoque
// =============================================================================

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft, Car, Pencil, Trash2, Handshake, AlertTriangle,
  MapPin, Calendar, Gauge, Fuel, Cog, DoorOpen, Palette,
  FileText, Camera, ClipboardCheck, ShieldCheck, Tag,
  DollarSign, History, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import { canAccessModule } from '@/lib/permissions'
import {
  VehicleStatusBadge,
  CautelarBadge,
  StockTypeBadge,
  ConditionBadge,
} from '@/components/estoque/VehicleStatusBadge'
import { VehicleSalePricingPanel } from '@/components/estoque/VehicleSalePricingPanel'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface VehicleDetail {
  id: string
  plate:         string | null
  chassi:        string | null
  renavam:       string | null
  brand:         string
  model:         string
  version:       string | null
  year:          number | null
  modelYear:     number | null
  km:            number | null
  color:         string | null
  fuel:          string | null
  transmission:  string | null
  doors:         number | null
  vehicleType:   string | null
  conditionType: string | null
  stockType:     string | null
  stockLocation: string | null
  stockStatus:   string
  salePrice:     number | null
  purchasePrice: number | null
  fipeValue:     number | null
  cautelarStatus: string
  cautelarNumber: string | null
  cautelarNotes:  string | null
  mainPhotoUrl:   string | null
  notes:          string | null
  active:         boolean
  entryDate:      string | null
  exitDate:       string | null
  createdAt:      string
  updatedAt:      string
  unit:     { id: string; name: string; city: string | null; state: string | null } | null
  customer: { id: string; name: string; phone: string | null; email: string | null; cpf: string | null } | null
  photos: { id: string; url: string; caption: string | null; isMain: boolean; order: number }[]
  stockPendencies: {
    id: string
    notes: string | null
    resolved: boolean
    resolvedAt: string | null
    option: { id: string; label: string; category: string | null }
    resolvedBy: { id: string; name: string } | null
  }[]
  evaluations: {
    id: string
    brand: string; model: string; year: number | null
    fipeValue: number | null; evaluatedValue: number | null
    result: string; intention: string | null
    notes: string | null
    createdAt: string
    evaluatedBy: { id: string; name: string }
    unit: { id: string; name: string } | null
  }[]
  hasOpenNegotiation: boolean
  openNegotiationId:  string | null
  _count: { photos: number; stockPendencies: number; evaluations: number }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function fmtKm(km: number | null): string {
  if (km == null) return '—'
  return new Intl.NumberFormat('pt-BR').format(km) + ' km'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const RESULT_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  APROVADO: { label: 'Aprovado',  icon: <CheckCircle2 className="h-4 w-4" />, className: 'text-emerald-700 bg-emerald-50' },
  RECUSADO: { label: 'Recusado', icon: <XCircle className="h-4 w-4" />,      className: 'text-red-700 bg-red-50' },
  PENDENTE: { label: 'Pendente', icon: <Clock className="h-4 w-4" />,         className: 'text-amber-700 bg-amber-50' },
}

// ── Aba info ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 shrink-0 w-40">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value ?? '—'}</span>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function EstoqueDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const { data: session } = useSession()
  const router = useRouter()
  const role = (session?.user as { role?: string })?.role ?? ''

  const canManage = canAccessModule(role, 'stock.manage')

  const [vehicle, setVehicle]   = useState<VehicleDetail | null>(null)
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('resumo')
  const [photoIdx, setPhotoIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/vehicles/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setVehicle(d.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  async function handleDelete() {
    if (!confirm('Tem certeza que deseja remover este veículo do estoque?')) return
    setDeleting(true)
    setDeleteError('')
    try {
      const res  = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        router.push('/estoque')
      } else {
        setDeleteError(data.error ?? 'Erro ao remover veículo.')
      }
    } catch (_) {
      setDeleteError('Erro de conexão.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-gray-200" />
          <div className="h-6 w-48 rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1 h-64 rounded-xl bg-gray-200" />
          <div className="lg:col-span-2 h-64 rounded-xl bg-gray-200" />
        </div>
      </div>
    )
  }

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Car className="h-14 w-14 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">Veículo não encontrado</h2>
        <Link href="/estoque" className="mt-4 text-sm text-brand-600 hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar ao estoque
        </Link>
      </div>
    )
  }

  const yearLabel = vehicle.modelYear
    ? `${vehicle.year ?? '—'}/${vehicle.modelYear}`
    : vehicle.year?.toString() ?? '—'

  const allPhotos = vehicle.photos.length > 0
    ? vehicle.photos
    : vehicle.mainPhotoUrl
      ? [{ id: 'main', url: vehicle.mainPhotoUrl, caption: null, isMain: true, order: 0 }]
      : []

  const TABS = [
    { id: 'resumo',    label: 'Resumo',        count: null },
    { id: 'ficha',     label: 'Ficha Técnica', count: null },
    { id: 'fotos',     label: 'Fotos',         count: vehicle._count.photos },
    { id: 'avaliacoes', label: 'Avaliações',   count: vehicle._count.evaluations },
    { id: 'cautelar',  label: 'Cautelar',      count: null },
    { id: 'precos',    label: 'Precificação',  count: null },
    { id: 'pendencias', label: 'Pendências',   count: vehicle._count.stockPendencies > 0 ? vehicle._count.stockPendencies : null },
  ]

  return (
    <div className="flex flex-col gap-6">

      {/* Navegação */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/estoque"
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Estoque
        </Link>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Link
                href={`/estoque/${id}/editar`}
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting || vehicle.hasOpenNegotiation}
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={vehicle.hasOpenNegotiation ? 'Veículo em negociação ativa' : 'Remover veículo'}
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Removendo...' : 'Remover'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Erro delete */}
      {deleteError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {/* Banner negociação aberta */}
      {vehicle.hasOpenNegotiation && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-indigo-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-indigo-800">
              Este veículo está vinculado a uma negociação em andamento.
            </p>
          </div>
          {vehicle.openNegotiationId && (
            <Link
              href={`/negociacoes/${vehicle.openNegotiationId}`}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Ver negociação
            </Link>
          )}
        </div>
      )}

      {/* Cabeçalho do veículo */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          {/* Foto thumbnail */}
          <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100">
            {allPhotos[0] ? (
              <Image
                src={allPhotos[0].url}
                alt={`${vehicle.brand} ${vehicle.model}`}
                fill className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Car className="h-8 w-8 text-gray-300" />
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <VehicleStatusBadge status={vehicle.stockStatus} size="md" />
              {vehicle.stockType    && <StockTypeBadge type={vehicle.stockType} />}
              {vehicle.conditionType && <ConditionBadge condition={vehicle.conditionType} />}
              {!vehicle.active && (
                <span className="rounded-full border border-gray-300 bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-500">
                  Inativo
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              {vehicle.brand} {vehicle.model}
              {vehicle.version ? <span className="text-base font-normal text-gray-500 ml-2">{vehicle.version}</span> : null}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span className="font-mono font-bold tracking-wider">{vehicle.plate ?? 'S/PLACA'}</span>
              <span>·</span>
              <span>{yearLabel}</span>
              <span>·</span>
              <span>{fmtKm(vehicle.km)}</span>
              {vehicle.unit && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {vehicle.unit.name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Preço + botão vender */}
        <div className="flex flex-col items-end gap-2">
          <p className="text-2xl font-bold text-brand-700">{fmt(vehicle.salePrice)}</p>
          <button
            disabled={vehicle.hasOpenNegotiation || !canManage}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={vehicle.hasOpenNegotiation ? 'Já existe uma negociação aberta para este veículo' : undefined}
          >
            <Handshake className="h-4 w-4" />
            Vender este veículo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100',
            ].join(' ')}
          >
            {tab.label}
            {tab.count != null && (
              <span className={[
                'rounded-full px-1.5 py-0.5 text-xs font-bold',
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700',
              ].join(' ')}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo das tabs */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

        {/* ── Resumo ── */}
        {activeTab === 'resumo' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Identificação
              </h3>
              <InfoRow label="Placa"    value={vehicle.plate    ?? '—'} />
              <InfoRow label="Chassi"   value={vehicle.chassi   ?? '—'} />
              <InfoRow label="Renavam"  value={vehicle.renavam  ?? '—'} />
              <InfoRow label="Ano/Fab." value={yearLabel} />
              <InfoRow label="KM"       value={fmtKm(vehicle.km)} />
              <InfoRow label="Cor"      value={vehicle.color} />
              <InfoRow label="Entrada"  value={fmtDate(vehicle.entryDate)} />
              <InfoRow label="Saída"    value={fmtDate(vehicle.exitDate)} />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Estoque
              </h3>
              <InfoRow label="Status"     value={<VehicleStatusBadge status={vehicle.stockStatus} />} />
              <InfoRow label="Localização" value={vehicle.stockLocation ?? '—'} />
              <InfoRow label="Tipo"       value={vehicle.stockType ? <StockTypeBadge type={vehicle.stockType} /> : '—'} />
              <InfoRow label="Condição"   value={vehicle.conditionType ? <ConditionBadge condition={vehicle.conditionType} /> : '—'} />
              <InfoRow label="Unidade"    value={vehicle.unit ? `${vehicle.unit.name}${vehicle.unit.city ? ` — ${vehicle.unit.city}/${vehicle.unit.state}` : ''}` : '—'} />
              <InfoRow label="Cautelar"   value={<CautelarBadge status={vehicle.cautelarStatus} />} />
              {vehicle.notes && (
                <div className="mt-4 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Observações</p>
                  <p className="text-sm text-gray-700">{vehicle.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Ficha Técnica ── */}
        {activeTab === 'ficha' && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
              <Car className="h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Marca / Modelo</p>
                <p className="text-sm font-semibold text-gray-900">{vehicle.brand} {vehicle.model}</p>
              </div>
            </div>
            {vehicle.version && (
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
                <FileText className="h-5 w-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Versão</p>
                  <p className="text-sm font-semibold text-gray-900">{vehicle.version}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
              <Calendar className="h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Ano Fab. / Modelo</p>
                <p className="text-sm font-semibold text-gray-900">{yearLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
              <Gauge className="h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Quilometragem</p>
                <p className="text-sm font-semibold text-gray-900">{fmtKm(vehicle.km)}</p>
              </div>
            </div>
            {vehicle.color && (
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
                <Palette className="h-5 w-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Cor</p>
                  <p className="text-sm font-semibold text-gray-900">{vehicle.color}</p>
                </div>
              </div>
            )}
            {vehicle.fuel && (
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
                <Fuel className="h-5 w-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Combustível</p>
                  <p className="text-sm font-semibold text-gray-900">{vehicle.fuel}</p>
                </div>
              </div>
            )}
            {vehicle.transmission && (
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
                <Cog className="h-5 w-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Câmbio</p>
                  <p className="text-sm font-semibold text-gray-900">{vehicle.transmission}</p>
                </div>
              </div>
            )}
            {vehicle.doors && (
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
                <DoorOpen className="h-5 w-5 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Portas</p>
                  <p className="text-sm font-semibold text-gray-900">{vehicle.doors}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
              <FileText className="h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Chassi</p>
                <p className="text-sm font-mono font-semibold text-gray-900">{vehicle.chassi ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
              <FileText className="h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Renavam</p>
                <p className="text-sm font-mono font-semibold text-gray-900">{vehicle.renavam ?? '—'}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Fotos ── */}
        {activeTab === 'fotos' && (
          <div>
            {allPhotos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
                <Camera className="h-12 w-12 mb-2" />
                <p className="text-sm">Nenhuma foto cadastrada</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Foto principal */}
                <div className="relative h-80 w-full overflow-hidden rounded-xl bg-gray-100">
                  <Image
                    src={allPhotos[photoIdx]?.url ?? ''}
                    alt={`Foto ${photoIdx + 1}`}
                    fill className="object-contain"
                  />
                </div>
                {/* Thumbnails */}
                {allPhotos.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {allPhotos.map((photo, i) => (
                      <button
                        key={photo.id}
                        onClick={() => setPhotoIdx(i)}
                        className={[
                          'relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                          i === photoIdx ? 'border-brand-500' : 'border-transparent',
                        ].join(' ')}
                      >
                        <Image src={photo.url} alt={`Thumb ${i + 1}`} fill className="object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 text-center">
                  {photoIdx + 1} / {allPhotos.length}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Avaliações ── */}
        {activeTab === 'avaliacoes' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                {vehicle._count.evaluations} avaliação{vehicle._count.evaluations !== 1 ? 'ões' : ''}
              </h3>
              <Link
                href={`/estoque/avaliacao?vehicleId=${id}`}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors flex items-center gap-1"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                Nova Avaliação
              </Link>
            </div>
            {vehicle.evaluations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <ClipboardCheck className="h-10 w-10 mb-2" />
                <p className="text-sm">Nenhuma avaliação registrada</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {vehicle.evaluations.map((ev) => {
                  const res = RESULT_CONFIG[ev.result] ?? RESULT_CONFIG.PENDENTE
                  return (
                    <div key={ev.id} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{ev.brand} {ev.model} {ev.year ?? ''}</p>
                          <p className="text-xs text-gray-500">{fmtDate(ev.createdAt)} · {ev.evaluatedBy.name}</p>
                          {ev.unit && <p className="text-xs text-gray-500">{ev.unit.name}</p>}
                        </div>
                        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${res.className}`}>
                          {res.icon} {res.label}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
                        <div><p className="text-xs text-gray-500">FIPE</p><p className="font-medium">{fmt(ev.fipeValue)}</p></div>
                        <div><p className="text-xs text-gray-500">Avaliado</p><p className="font-medium">{fmt(ev.evaluatedValue)}</p></div>
                      </div>
                      {ev.notes && <p className="mt-2 text-xs text-gray-600">{ev.notes}</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Cautelar ── */}
        {activeTab === 'cautelar' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-gray-400" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Status da Cautelar</p>
                <CautelarBadge status={vehicle.cautelarStatus} />
              </div>
            </div>
            {vehicle.cautelarNumber && (
              <InfoRow label="Número" value={vehicle.cautelarNumber} />
            )}
            {vehicle.cautelarNotes && (
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-xs font-medium text-gray-500 mb-1">Apontamentos / Observações</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{vehicle.cautelarNotes}</p>
              </div>
            )}
            {!vehicle.cautelarNumber && !vehicle.cautelarNotes && vehicle.cautelarStatus === 'SEM_CAUTELAR' && (
              <p className="text-sm text-gray-400">Cautelar não realizada.</p>
            )}
          </div>
        )}

        {/* ── Precificação ── */}
        {activeTab === 'precos' && (
          <div className="flex flex-col gap-6">
            {/* Resumo numérico (compra/venda/FIPE + margem) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-4 text-center">
                <DollarSign className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                <p className="text-xs text-gray-500">Preço de Compra</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{fmt(vehicle.purchasePrice)}</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-4 text-center border border-brand-200">
                <DollarSign className="h-6 w-6 text-brand-500 mx-auto mb-1" />
                <p className="text-xs text-brand-600">Preço de Venda</p>
                <p className="text-xl font-bold text-brand-700 mt-1">{fmt(vehicle.salePrice)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 text-center">
                <History className="h-6 w-6 text-gray-400 mx-auto mb-1" />
                <p className="text-xs text-gray-500">Tabela FIPE</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{fmt(vehicle.fipeValue)}</p>
              </div>
              {vehicle.purchasePrice != null && vehicle.salePrice != null && (
                <div className="sm:col-span-3 rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between">
                  <p className="text-sm font-medium text-emerald-700">Margem estimada</p>
                  <p className="text-lg font-bold text-emerald-800">
                    {fmt(vehicle.salePrice - vehicle.purchasePrice)}
                    {' '}
                    <span className="text-sm font-normal">
                      ({vehicle.purchasePrice > 0 ? ((vehicle.salePrice - vehicle.purchasePrice) / vehicle.purchasePrice * 100).toFixed(1) : '—'}%)
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Painel completo de precificação de venda + histórico */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-800">
                <DollarSign className="h-5 w-5 text-brand-600" />
                Precificação de Venda
              </h3>
              <VehicleSalePricingPanel vehicleId={id} canManage={canManage} />
            </div>
          </div>
        )}

        {/* ── Pendências ── */}
        {activeTab === 'pendencias' && (
          <div>
            {vehicle.stockPendencies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Tag className="h-10 w-10 mb-2" />
                <p className="text-sm">Nenhuma pendência registrada</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {vehicle.stockPendencies.map((p) => (
                  <div
                    key={p.id}
                    className={[
                      'flex items-start gap-3 rounded-lg border p-3',
                      p.resolved
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-amber-200 bg-amber-50',
                    ].join(' ')}
                  >
                    {p.resolved
                      ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                      : <Tag className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                    }
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${p.resolved ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {p.option.label}
                        {p.option.category && (
                          <span className="ml-2 text-xs font-normal opacity-70">{p.option.category}</span>
                        )}
                      </p>
                      {p.notes && <p className="mt-0.5 text-xs text-gray-600">{p.notes}</p>}
                      {p.resolved && p.resolvedBy && (
                        <p className="mt-0.5 text-xs text-emerald-600">
                          Resolvida por {p.resolvedBy.name}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-medium ${p.resolved ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {p.resolved ? 'Resolvida' : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Rodapé — info do registro */}
      <p className="text-center text-xs text-gray-400">
        Cadastrado em {fmtDate(vehicle.createdAt)} · Última atualização {fmtDate(vehicle.updatedAt)}
      </p>
    </div>
  )
}
