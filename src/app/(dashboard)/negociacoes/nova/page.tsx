'use client'

// =============================================================================
// /negociacoes/nova — Wizard multi-step 8 etapas de criação de negociação
// =============================================================================

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { formatCPF, normalizeCPF, isValidCPF } from '@/lib/br-docs/cpf'
import { formatCNPJ, normalizeCNPJ, isValidCNPJ } from '@/lib/br-docs/cnpj'
import { formatPhone, normalizePhone, isValidPhone } from '@/lib/br-docs/phone'
import { formatCEP, normalizeCEP, isCEPComplete } from '@/lib/br-docs/cep'
import { BankCombo } from '@/components/forms/BankCombo'
import {
  ArrowLeft,
  ArrowRight,
  Handshake,
  User,
  Car,
  FileText,
  DollarSign,
  Calendar,
  CheckCircle2,
  MessageSquare,
  TrendingUp,
  ShoppingCart,
  ArrowLeftRight,
  Package,
  Search,
  Loader2,
  Info,
  X,
  Trash2,
  Plus,
  AlertTriangle,
  AlertCircle,
  Building2,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Shield,
  ClipboardList,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type DealType = 'VENDA' | 'COMPRA' | 'TROCA' | 'CONSIGNACAO' | ''
type PersonType = 'FISICA' | 'JURIDICA'
type PaymentType = 'A_VISTA' | 'FINANCIADO' | 'CONSORCIO' | 'PARCELADO' | ''

interface DebtEntry {
  id:          string
  vehicleRole: string
  type:        string
  description: string
  value:       string
  responsavel: string
  notes:       string
}

interface VehicleFields {
  plate:          string
  brand:          string
  model:          string
  version:        string
  year:           string
  color:          string
  km:             string
  fuel:           string
  condition:      string
  vehicleValue:   string
  fipeValue:      string
  evaluatedValue: string
  agreedValue:    string
  hasFinancing:   boolean
  payoffValue:    string
  payoffBank:     string
  notes:          string
  vehicleId:      string | null
  evaluationId:   string | null
}

interface Unit   { id: string; name: string }
interface Seller { id: string; fullName: string; shortName: string | null; userId: string }

interface DealForm {
  // Step 0 - Tipo + Unidade
  type:   DealType
  unitId: string
  // Vendedor (selecionado no Resumo)
  sellerId: string

  // Step 1 - Cliente
  personType:        PersonType
  // Documento
  cpf:               string
  cnpj:              string
  personId:          string | null
  // PF
  nomeCompleto:      string
  rg:                string
  dataNascimento:    string
  nomeMae:           string
  // PJ
  razaoSocial:       string
  nomeFantasia:      string
  inscricaoEstadual: string
  socioAdmNome:      string
  socioAdmCpf:       string
  socioAdmPhone:     string
  socioAdmRg:              string
  socioAdmDataNascimento:  string
  socioAdmNomeMae:         string
  socioAdmEmail:           string
  socioAdmWhatsapp:        boolean
  socioAdmCep:             string
  socioAdmLogradouro:      string
  socioAdmNumero:          string
  socioAdmComplemento:     string
  socioAdmBairro:          string
  socioAdmCidade:          string
  socioAdmEstado:          string
  // Contato
  celular:           string
  email:             string
  whatsapp:          boolean
  // Endereço
  cep:               string
  logradouro:        string
  numero:            string
  complemento:       string
  bairro:            string
  cidade:            string
  estado:            string

  // Step 2 - Veículos
  vehicle:      VehicleFields
  tradeVehicle: VehicleFields
  consignMinValue:  string
  consignCommPct:   string
  consignDeadline:  string

  // Step 3 - Débitos
  debts: DebtEntry[]

  // Step 4 - Pagamento
  saleAmount:       string
  purchaseAmount:   string
  signalAmount:     string
  financedAmount:   string
  paymentType:      PaymentType
  paymentBank:      string
  documentationFee: string
  discountAmount:   string
  tradeValue:       string
  changeAmount:     string
  changeBeneficiary: string
  changeBeneficiaryCpf: string
  changeBank:        string
  changeAgency:      string
  changeAccount:     string
  changePix:        string
  payoffAmount:     string
  payoffBank:       string

  // Step 5 - Agendamento
  deliveryDate:    string
  receiptDate:     string
  schedulingNotes: string

  // Step 7 - Comentários
  notes:        string
  commentType:  string
}

// ── Interfaces de busca ───────────────────────────────────────────────────────

interface StockVehicle {
  id:              string
  plate:           string | null
  brand:           string | null
  model:           string | null
  version:         string | null
  year:            number | null
  modelYear:       number | null
  km:              number | null
  color:           string | null
  fuel:            string | null
  conditionType:   string | null
  salePrice:       number | null
  fipeValue:       number | null
  stockStatus:     string
  cautelarStatus:  string | null
  mainPhotoUrl:    string | null
  entryDate:       string | null
  stockPendencies: Array<{ id: string; notes: string | null; option: { id: string; label: string; category: string } }>
  _count:          { photos: number; stockPendencies: number }
  // Negociação aberta (se houver) — usado para travar seleção
  hasOpenNegotiation?:    boolean
  openNegotiationId?:     string | null
  openNegotiationNumber?: string | null
  openNegotiationSeller?: string | null
  openNegotiationUnit?:   string | null
}

interface EvaluationItem {
  id:             string
  plate:          string | null
  brand:          string | null
  model:          string | null
  year:           number | null
  km:             number | null
  evaluatedValue: number | null
  fipeValue:      number | null
  result:         string
  createdAt:      string
  ownerName:      string | null
}

// ── Constantes ────────────────────────────────────────────────────────────────

const EMPTY_VEHICLE: VehicleFields = {
  plate: '', brand: '', model: '', version: '', year: '', color: '', km: '',
  fuel: '', condition: 'USADO', vehicleValue: '', fipeValue: '',
  evaluatedValue: '', agreedValue: '', hasFinancing: false, payoffValue: '',
  payoffBank: '', notes: '', vehicleId: null, evaluationId: null,
}

const INITIAL_FORM: DealForm = {
  type: '', unitId: '', sellerId: '',
  personType: 'FISICA',
  cpf: '', cnpj: '', personId: null,
  nomeCompleto: '', rg: '', dataNascimento: '', nomeMae: '',
  razaoSocial: '', nomeFantasia: '', inscricaoEstadual: '',
  socioAdmNome: '', socioAdmCpf: '', socioAdmPhone: '',
  socioAdmRg: '', socioAdmDataNascimento: '', socioAdmNomeMae: '',
  socioAdmEmail: '', socioAdmWhatsapp: false,
  socioAdmCep: '', socioAdmLogradouro: '', socioAdmNumero: '',
  socioAdmComplemento: '', socioAdmBairro: '', socioAdmCidade: '', socioAdmEstado: '',
  celular: '', email: '', whatsapp: false,
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  vehicle: { ...EMPTY_VEHICLE },
  tradeVehicle: { ...EMPTY_VEHICLE },
  consignMinValue: '', consignCommPct: '', consignDeadline: '',
  debts: [],
  saleAmount: '', purchaseAmount: '', signalAmount: '', financedAmount: '',
  paymentType: '', paymentBank: '', documentationFee: '', discountAmount: '',
  tradeValue: '', changeAmount: '', changeBeneficiary: '', changePix: '',
  changeBeneficiaryCpf: '', changeBank: '', changeAgency: '', changeAccount: '',
  payoffAmount: '', payoffBank: '',
  deliveryDate: '', receiptDate: '', schedulingNotes: '',
  notes: '', commentType: '',
}

const DEAL_TYPES = [
  {
    value: 'VENDA' as DealType,
    label: 'Venda',
    desc: 'Venda de veículo do estoque ao cliente',
    icon: TrendingUp,
    color: 'border-green-300 bg-green-50 hover:border-green-400',
    selectedColor: 'border-green-500 bg-green-50 ring-2 ring-green-200',
    textColor: 'text-green-700',
    badgeCls: 'bg-green-100 text-green-800',
    infoBg: 'bg-green-50 border-green-200 text-green-800',
    info: 'Um veículo do estoque da loja será vendido ao cliente. Defina o veículo, os valores e as condições de pagamento.',
  },
  {
    value: 'COMPRA' as DealType,
    label: 'Compra',
    desc: 'Compra de veículo do cliente para o estoque',
    icon: ShoppingCart,
    color: 'border-blue-300 bg-blue-50 hover:border-blue-400',
    selectedColor: 'border-blue-500 bg-blue-50 ring-2 ring-blue-200',
    textColor: 'text-blue-700',
    badgeCls: 'bg-blue-100 text-blue-800',
    infoBg: 'bg-blue-50 border-blue-200 text-blue-800',
    info: 'A loja está comprando um veículo do cliente. O veículo entrará no estoque após a negociação.',
  },
  {
    value: 'TROCA' as DealType,
    label: 'Troca',
    desc: 'Cliente recebe um veículo e entrega outro',
    icon: ArrowLeftRight,
    color: 'border-purple-300 bg-purple-50 hover:border-purple-400',
    selectedColor: 'border-purple-500 bg-purple-50 ring-2 ring-purple-200',
    textColor: 'text-purple-700',
    badgeCls: 'bg-purple-100 text-purple-800',
    infoBg: 'bg-purple-50 border-purple-200 text-purple-800',
    info: 'O cliente entrega um veículo e recebe outro da loja. Pode haver diferença de valores a pagar ou receber.',
  },
  {
    value: 'CONSIGNACAO' as DealType,
    label: 'Consignação',
    desc: 'Veículo do cliente anunciado pela loja',
    icon: Package,
    color: 'border-amber-300 bg-amber-50 hover:border-amber-400',
    selectedColor: 'border-amber-500 bg-amber-50 ring-2 ring-amber-200',
    textColor: 'text-amber-700',
    badgeCls: 'bg-amber-100 text-amber-800',
    infoBg: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'O veículo do cliente ficará com a loja para venda. Defina o valor mínimo ao proprietário, a comissão e o prazo.',
  },
]

const STEPS = [
  { id: 'tipo',        label: 'Tipo',        icon: Handshake    },
  { id: 'cliente',     label: 'Cliente',     icon: User         },
  { id: 'veiculos',    label: 'Veículos',    icon: Car          },
  { id: 'debitos',     label: 'Débitos',     icon: FileText     },
  { id: 'pagamento',   label: 'Pagamento',   icon: DollarSign   },
  { id: 'agendamento', label: 'Agendamento', icon: Calendar     },
  { id: 'resumo',      label: 'Resumo',      icon: CheckCircle2 },
  { id: 'comentarios', label: 'Comentários', icon: MessageSquare },
]

const FUEL_OPTIONS = ['Gasolina', 'Etanol', 'Flex', 'Diesel', 'Elétrico', 'Híbrido', 'GNV']
const CONDITION_OPTIONS = [
  { value: 'ZERO_KM',  label: '0 km' },
  { value: 'SEMINOVO', label: 'Seminovo' },
  { value: 'USADO',    label: 'Usado' },
]
const PAYMENT_TYPES = [
  { value: 'A_VISTA',    label: 'À Vista' },
  { value: 'FINANCIADO', label: 'Financiado' },
  { value: 'CONSORCIO',  label: 'Consórcio' },
  { value: 'PARCELADO',  label: 'Parcelado' },
]
const DEBT_TYPES = [
  { value: 'MULTA',          label: 'Multa' },
  { value: 'IPVA',           label: 'IPVA' },
  { value: 'LICENCIAMENTO',  label: 'Licenciamento' },
  { value: 'FINANCIAMENTO',  label: 'Financiamento' },
  { value: 'DOCUMENTACAO',   label: 'Documentação' },
  { value: 'DESPACHANTE',    label: 'Despachante' },
  { value: 'CAUTELAR',       label: 'Cautelar' },
  { value: 'REPARO',         label: 'Reparo' },
  { value: 'OUTROS',         label: 'Outros' },
]
const DEBT_RESPONSAVEL = [
  { value: 'COMPRADOR', label: 'Comprador' },
  { value: 'VENDEDOR',  label: 'Vendedor' },
  { value: 'LOJA',      label: 'Loja' },
]
const COMMENT_TYPES = [
  { value: 'COMERCIAL',   label: 'Comercial' },
  { value: 'GERENCIAL',   label: 'Gerencial' },
  { value: 'FINANCEIRA',  label: 'Financeira' },
  { value: 'DOCUMENTAL',  label: 'Documental' },
]
const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtBRL = (s: string | number | null | undefined) => {
  const raw = typeof s === 'number' ? s : parseFloat(String(s ?? '').replace(',', '.'))
  return isNaN(raw) ? '—' : raw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const fmtDate = (s: string) => {
  if (!s) return '—'
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('pt-BR')
}

const genId = () => Math.random().toString(36).slice(2, 10)

// ── Máscara monetária BRL ─────────────────────────────────────────────────────
// Armazena como string formatada "1.500,00" e converte para float no envio
function maskBRLInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}
function parseBRLInput(value: string): number | null {
  const v = parseFloat(value.replace(/\./g, '').replace(',', '.'))
  return isNaN(v) ? null : v
}

// ── Cautelar helpers ──────────────────────────────────────────────────────────
const CAUTELAR_LABELS: Record<string, { label: string; color: string }> = {
  APROVADA:        { label: 'Aprovada',        color: 'text-green-700 bg-green-100' },
  REPROVADA:       { label: 'Reprovada',       color: 'text-red-700 bg-red-100' },
  PENDENTE:        { label: 'Pendente',         color: 'text-amber-700 bg-amber-100' },
  COM_APONTAMENTO: { label: 'Com apontamento', color: 'text-orange-700 bg-orange-100' },
  SEM_CAUTELAR:    { label: 'Sem cautelar',    color: 'text-gray-600 bg-gray-100' },
}

const inputCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── VehicleCard — card rico com detalhes do veículo ──────────────────────────

function VehicleCard({
  v,
  onSelect,
  selected,
}: {
  v: StockVehicle
  onSelect?: () => void
  selected?: boolean
}) {
  const caut = CAUTELAR_LABELS[v.cautelarStatus ?? 'SEM_CAUTELAR'] ?? CAUTELAR_LABELS.SEM_CAUTELAR
  const CautIcon = v.cautelarStatus === 'APROVADA' ? ShieldCheck
    : v.cautelarStatus === 'REPROVADA' ? ShieldX
    : v.cautelarStatus === 'COM_APONTAMENTO' ? ShieldAlert
    : Shield

  const locked = !selected && !!v.hasOpenNegotiation

  return (
    <button
      type="button"
      onClick={locked ? undefined : onSelect}
      disabled={locked}
      title={locked ? 'Veículo já está em negociação' : undefined}
      className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
        locked
          ? 'border-amber-300 bg-amber-50/40 opacity-90 cursor-not-allowed'
          : selected
            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100'
            : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
      }`}
    >
      {/* Tag de negociação aberta */}
      {locked && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-900">
          <AlertTriangle size={11} className="shrink-0" />
          <span className="leading-tight">
            Em negociação
            {v.openNegotiationSeller && <> pelo vendedor <strong>{v.openNegotiationSeller}</strong></>}
            {v.openNegotiationUnit   && <> · unidade <strong>{v.openNegotiationUnit}</strong></>}
            {v.openNegotiationNumber && <span className="ml-1 font-mono opacity-70">({v.openNegotiationNumber})</span>}
          </span>
        </div>
      )}
      {/* Linha principal */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight">
            {[v.brand, v.model, v.version ?? '', v.modelYear ?? v.year].filter(Boolean).join(' ')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">
            {v.plate ?? '—'}
            {v.color ? ` · ${v.color}` : ''}
            {v.fuel  ? ` · ${v.fuel}`  : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          {v.salePrice != null && (
            <p className="text-sm font-bold text-green-700">{fmtBRL(v.salePrice)}</p>
          )}
          {v.fipeValue != null && (
            <p className="text-[10px] text-gray-400">FIPE {fmtBRL(v.fipeValue)}</p>
          )}
        </div>
      </div>

      {/* Detalhes secundários */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {v.km != null && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
            {v.km.toLocaleString('pt-BR')} km
          </span>
        )}
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${caut.color}`}>
          <CautIcon size={10} />
          {caut.label}
        </span>
        {v._count.stockPendencies > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">
            <ClipboardList size={10} />
            {v._count.stockPendencies} pendência{v._count.stockPendencies !== 1 ? 's' : ''}
          </span>
        )}
        {v.conditionType && (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            {v.conditionType === 'ZERO_KM' ? '0 km' : v.conditionType === 'SEMINOVO' ? 'Seminovo' : 'Usado'}
          </span>
        )}
        {selected && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700">
            <CheckCircle2 size={10} />
            Selecionado
          </span>
        )}
      </div>

      {/* Pendências detalhadas (quando selecionado) */}
      {selected && v.stockPendencies.length > 0 && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
          <p className="text-[10px] font-semibold text-orange-800 mb-1">Pendências do veículo:</p>
          <ul className="space-y-0.5">
            {v.stockPendencies.map((p) => (
              <li key={p.id} className="text-[10px] text-orange-700">
                • {p.option.label}{p.notes ? ` — ${p.notes}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </button>
  )
}

// ── VehicleInlineSearch — busca inline com cards ──────────────────────────────

function VehicleInlineSearch({
  selected,
  onSelect,
  onClear,
  label,
}: {
  selected: StockVehicle | null
  onSelect: (v: StockVehicle) => void
  onClear: () => void
  label: string
}) {
  const [query,    setQuery]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [results,  setResults]  = useState<StockVehicle[]>([])
  const [searched, setSearched] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    setLoading(true)
    setSearched(true)
    setError(null)
    try {
      // Exibimos qualquer veículo "em estoque" — oculta apenas os que
      // efetivamente saíram (vendidos/cancelados/devolvidos/baixados).
      // Os EM_NEGOCIACAO/RESERVADO aparecem porém ficam com cartão travado.
      const qs = new URLSearchParams({ limit: '30' })
      if (q) qs.set('search', q)
      const res  = await fetch(`/api/vehicles?${qs.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.success === false) {
        setError(data?.error || `Falha ao buscar veículos (HTTP ${res.status}).`)
        setResults([])
        return
      }
      const list: StockVehicle[] = Array.isArray(data?.data) ? data.data : []
      const HIDDEN_STATUSES = ['VENDIDO', 'CANCELADO', 'DEVOLVIDO', 'BLOQUEADO']
      const visible = list.filter((v) => !HIDDEN_STATUSES.includes(v.stockStatus))
      visible.sort((a, b) => {
        const aLock = a.hasOpenNegotiation ? 1 : 0
        const bLock = b.hasOpenNegotiation ? 1 : 0
        return aLock - bLock
      })
      setResults(visible)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede ao buscar veículos.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Busca inicial ao montar (sem query) se não há selecionado
  useEffect(() => {
    if (!selected) doSearch('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleQueryChange = (val: string) => {
    setQuery(val)
    clearTimeout((handleQueryChange as { _t?: ReturnType<typeof setTimeout> })._t)
    ;(handleQueryChange as { _t?: ReturnType<typeof setTimeout> })._t =
      setTimeout(() => doSearch(val), 350)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>

      {/* Campo de busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="Buscar por placa, modelo, marca, ano..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
        </div>
        {loading && <Loader2 size={16} className="self-center animate-spin text-gray-400" />}
      </div>

      {/* Veículo selecionado */}
      {selected && (
        <div className="space-y-2">
          <VehicleCard v={selected} selected />
          <button
            type="button"
            onClick={() => { onClear(); setSearched(false); setResults([]); setQuery(''); doSearch('') }}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            <X size={12} />
            Remover seleção e buscar outro
          </button>
        </div>
      )}

      {/* Resultados em cards */}
      {!selected && (
        <>
          {!loading && error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertTriangle size={14} className="shrink-0" />
              {error}
            </div>
          )}
          {!loading && !error && searched && results.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle size={14} className="shrink-0" />
              Nenhum veículo disponível encontrado para esta busca.
            </div>
          )}
          {!loading && results.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {results.map((v) => (
                <VehicleCard key={v.id} v={v} onSelect={() => onSelect(v)} />
              ))}
            </div>
          )}
          {!loading && !searched && (
            <p className="text-center text-sm text-gray-400 py-4">
              Digite para buscar ou aguarde o carregamento dos disponíveis.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── EvaluationSearchModal ─────────────────────────────────────────────────────

function EvaluationSearchModal({
  onSelect,
  onClose,
}: {
  onSelect: (e: EvaluationItem) => void
  onClose: () => void
}) {
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [results, setResults]   = useState<EvaluationItem[]>([])
  const [searched, setSearched] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    setLoading(true)
    setSearched(true)
    try {
      const qs = q ? `&search=${encodeURIComponent(q)}` : ''
      const res = await fetch(`/api/negotiations/evaluations${qs}`)
      const data = await res.json()
      setResults(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (val: string) => {
    setQuery(val)
    clearTimeout((handleChange as { _t?: ReturnType<typeof setTimeout> })._t)
    ;(handleChange as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => doSearch(val), 400)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="font-semibold text-gray-900">Buscar Avaliação Aprovada</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-2">
            <input
              autoFocus
              className={`${inputCls} flex-1`}
              placeholder="Buscar por placa, modelo, proprietário..."
              value={query}
              onChange={(e) => handleChange(e.target.value)}
            />
            <button
              onClick={() => doSearch(query)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Search size={14} />
              Buscar
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8 text-gray-400">
                <Loader2 size={20} className="animate-spin mr-2" />
                <span className="text-sm">Buscando...</span>
              </div>
            )}
            {!loading && searched && results.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle size={14} className="shrink-0" />
                Não há avaliações aprovadas disponíveis. Preencha os dados manualmente.
              </div>
            )}
            {!loading && results.map((ev) => (
              <button
                key={ev.id}
                onClick={() => onSelect(ev)}
                className="w-full flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-left hover:bg-purple-50 hover:border-purple-200 transition-colors mb-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">
                      {[ev.brand, ev.model, ev.year].filter(Boolean).join(' ')}
                      {ev.plate && <span className="ml-1.5 font-mono text-xs text-gray-500">· {ev.plate}</span>}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Aprovada
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {ev.km != null ? `${ev.km.toLocaleString('pt-BR')} km` : ''}
                    {ev.ownerName ? ` · ${ev.ownerName}` : ''}
                    {ev.createdAt ? ` · ${new Date(ev.createdAt).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                </div>
                {ev.evaluatedValue != null && (
                  <span className="shrink-0 text-sm font-semibold text-purple-700">
                    {fmtBRL(ev.evaluatedValue)}
                  </span>
                )}
              </button>
            ))}
            {!loading && !searched && (
              <p className="text-center text-sm text-gray-400 py-6">
                Digite para buscar avaliações aprovadas.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── StepIndicator ─────────────────────────────────────────────────────────────

function StepIndicator({ step, onNavigate }: { step: number; onNavigate: (i: number) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const Icon      = s.icon
          const done      = i < step
          const current   = i === step
          const clickable = i < step
          return (
            <div key={s.id} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => clickable && onNavigate(i)}
                disabled={!clickable}
                className="flex flex-col items-center gap-1 disabled:cursor-default"
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    done    ? 'bg-green-700 text-white'
                    : current ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                    : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                </div>
                <span
                  className={`hidden text-[9px] font-medium sm:block ${
                    current ? 'text-brand-700' : done ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1 rounded ${i < step ? 'bg-brand-500' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── StepTipo ──────────────────────────────────────────────────────────────────

function StepTipo({
  type,
  unitId,
  onSelect,
  setField,
}: {
  type:     DealType
  unitId:   string
  onSelect: (t: DealType) => void
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
}) {
  const [units, setUnits] = useState<Unit[]>([])

  useEffect(() => {
    fetch('/api/units')
      .then((r) => r.json())
      .then((d) => {
        const list: Unit[] = Array.isArray(d?.data) ? d.data : []
        setUnits(list)
        if (list.length === 1 && !unitId) setField('unitId', list[0].id)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedDef = DEAL_TYPES.find((d) => d.value === type)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Tipo de Negociação</h2>
        <p className="text-sm text-gray-500">Escolha o tipo e a unidade responsável por esta negociação.</p>
      </div>

      {/* Unidade */}
      {units.length > 1 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 pb-1">
            Unidade responsável <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {units.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setField('unitId', u.id)}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                  unitId === u.id
                    ? 'border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-200'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300'
                }`}
              >
                <Building2 size={16} className={unitId === u.id ? 'text-brand-600' : 'text-gray-400'} />
                <span className="font-medium">{u.name}</span>
                {unitId === u.id && <CheckCircle2 size={14} className="ml-auto text-brand-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
      {units.length === 1 && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
          <Building2 size={14} className="text-brand-600 shrink-0" />
          <span>Unidade: <strong>{units[0].name}</strong></span>
        </div>
      )}

      {/* Tipo */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 pb-1">
          Tipo de negociação <span className="text-red-500">*</span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DEAL_TYPES.map((dt) => {
            const Icon     = dt.icon
            const selected = type === dt.value
            return (
              <button
                key={dt.value}
                type="button"
                onClick={() => onSelect(dt.value)}
                className={`relative flex items-start gap-4 rounded-xl border-2 p-5 text-left transition-all ${
                  selected ? dt.selectedColor : dt.color
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  selected ? 'bg-white/70' : 'bg-white/60'
                }`}>
                  <Icon size={20} className={dt.textColor} />
                </div>
                <div className="flex-1">
                  <p className={`font-bold ${dt.textColor}`}>{dt.label}</p>
                  <p className="mt-0.5 text-xs text-gray-600">{dt.desc}</p>
                </div>
                {selected && <CheckCircle2 size={18} className={`shrink-0 ${dt.textColor}`} />}
              </button>
            )
          })}
        </div>
        {selectedDef && (
          <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${selectedDef.infoBg}`}>
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>{selectedDef.info}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── StepCliente ───────────────────────────────────────────────────────────────

function StepCliente({
  form,
  setField,
  setFields,
}: {
  form: DealForm
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
  setFields: (updates: Partial<DealForm>) => void
}) {
  const [docSearching, setDocSearching]     = useState(false)
  const [docStatus, setDocStatus]           = useState<'idle' | 'found' | 'not_found'>('idle')
  const [cepLoading, setCepLoading]         = useState(false)
  const [cnpjLoading, setCnpjLoading]       = useState(false)
  const [socioAdmCepLoading, setSocioAdmCepLoading] = useState(false)
  const [socioAdmCpfLoading, setSocioAdmCpfLoading] = useState(false)
  const [socioAdmCpfStatus,  setSocioAdmCpfStatus]  = useState<'idle' | 'found' | 'not_found'>('idle')

  const isPF        = form.personType === 'FISICA'
  const rawDoc      = isPF ? normalizeCPF(form.cpf) : normalizeCNPJ(form.cnpj)
  const docComplete = isPF ? rawDoc.length === 11 : rawDoc.length === 14
  const docValid    = isPF ? isValidCPF(rawDoc) : isValidCNPJ(rawDoc)

  async function handleDocSearch() {
    if (!docComplete) return
    setDocSearching(true)
    setDocStatus('idle')
    try {
      const res  = await fetch(`/api/people/search?document=${encodeURIComponent(rawDoc)}`)
      const data = await res.json()
      if (data.found && data.person) {
        const p = data.person
        setDocStatus('found')
        setFields({
          personId:          p.id,
          nomeCompleto:      p.nomeCompleto      ?? '',
          rg:                p.rg                ?? '',
          dataNascimento:    p.dataNascimento
                               ? String(p.dataNascimento).slice(0, 10) : '',
          nomeMae:           p.nomeMae           ?? '',
          razaoSocial:       p.razaoSocial       ?? '',
          nomeFantasia:      p.nomeFantasia      ?? '',
          inscricaoEstadual: p.inscricaoEstadual ?? '',
          socioAdmNome:      p.socioAdmNome      ?? '',
          socioAdmCpf:       p.socioAdmCpf  ? formatCPF(p.socioAdmCpf)   : '',
          socioAdmPhone:     p.socioAdmPhone ? formatPhone(p.socioAdmPhone) : '',
          celular:           p.phone        ? formatPhone(p.phone) : '',
          whatsapp:          p.whatsapp     ?? false,
          email:             p.email        ?? '',
          cep:               p.cep          ? formatCEP(p.cep) : '',
          logradouro:        p.logradouro   ?? '',
          numero:            p.numero       ?? '',
          complemento:       p.complemento  ?? '',
          bairro:            p.bairro       ?? '',
          cidade:            p.cidade       ?? '',
          estado:            p.estado       ?? '',
        })
      } else {
        setDocStatus('not_found')
        setField('personId', null)
      }
    } catch {
      setDocStatus('not_found')
    } finally {
      setDocSearching(false)
    }
  }

  async function handleCepBlur() {
    const cep = normalizeCEP(form.cep)
    if (!isCEPComplete(cep)) return
    setCepLoading(true)
    try {
      const res  = await fetch(`/api/address/lookup-by-cep?cep=${cep}`)
      const data = await res.json()
      if (data.logradouro || data.bairro) {
        setFields({
          logradouro: data.logradouro ?? form.logradouro,
          bairro:     data.bairro     ?? form.bairro,
          cidade:     data.cidade     ?? form.cidade,
          estado:     data.estado     ?? form.estado,
        })
      }
    } catch { /* silently ignore */ } finally {
      setCepLoading(false)
    }
  }

  // Lookup CNPJ → preenche dados da empresa + endereço
  async function handleCnpjLookup() {
    const cnpj = normalizeCNPJ(form.cnpj)
    if (cnpj.length !== 14) return
    setCnpjLoading(true)
    try {
      const res  = await fetch(`/api/companies/lookup?cnpj=${cnpj}`)
      const data = await res.json()
      if (data.found) {
        setFields({
          razaoSocial:       data.razaoSocial       ?? form.razaoSocial,
          nomeFantasia:      data.nomeFantasia       ?? form.nomeFantasia,
          inscricaoEstadual: data.inscricaoEstadual  ?? form.inscricaoEstadual,
          cep:               data.cep ? formatCEP(data.cep) : form.cep,
          logradouro:        data.logradouro ?? form.logradouro,
          numero:            data.numero     ?? form.numero,
          complemento:       data.complemento ?? form.complemento,
          bairro:            data.bairro     ?? form.bairro,
          cidade:            data.cidade     ?? form.cidade,
          estado:            data.estado     ?? form.estado,
        })
      }
    } catch { /* silently ignore */ } finally {
      setCnpjLoading(false)
    }
  }

  // Busca de CPF do responsável legal (PJ) — auto-preenche se já cadastrado.
  async function handleSocioAdmCpfLookup() {
    const cpf = normalizeCPF(form.socioAdmCpf)
    if (cpf.length !== 11 || !isValidCPF(cpf)) return
    setSocioAdmCpfLoading(true)
    setSocioAdmCpfStatus('idle')
    try {
      const res  = await fetch(`/api/people/search?document=${cpf}`)
      const data = await res.json()
      if (data.found && data.person) {
        const p = data.person
        setSocioAdmCpfStatus('found')
        setFields({
          socioAdmNome:           p.nomeCompleto      ?? form.socioAdmNome,
          socioAdmRg:             p.rg                ?? form.socioAdmRg,
          socioAdmDataNascimento: p.dataNascimento
                                    ? String(p.dataNascimento).slice(0, 10)
                                    : form.socioAdmDataNascimento,
          socioAdmNomeMae:        p.nomeMae          ?? form.socioAdmNomeMae,
          socioAdmEmail:          p.email            ?? form.socioAdmEmail,
          socioAdmPhone:          p.phone ? formatPhone(p.phone) : form.socioAdmPhone,
          socioAdmWhatsapp:       p.whatsapp         ?? form.socioAdmWhatsapp,
          socioAdmCep:            p.cep ? formatCEP(p.cep) : form.socioAdmCep,
          socioAdmLogradouro:     p.logradouro       ?? form.socioAdmLogradouro,
          socioAdmNumero:         p.numero           ?? form.socioAdmNumero,
          socioAdmComplemento:    p.complemento      ?? form.socioAdmComplemento,
          socioAdmBairro:         p.bairro           ?? form.socioAdmBairro,
          socioAdmCidade:         p.cidade           ?? form.socioAdmCidade,
          socioAdmEstado:         p.estado           ?? form.socioAdmEstado,
        })
      } else {
        setSocioAdmCpfStatus('not_found')
      }
    } catch { /* silent */ } finally {
      setSocioAdmCpfLoading(false)
    }
  }

  // CEP do sócio administrador
  async function handleSocioAdmCepBlur() {
    const cep = normalizeCEP(form.socioAdmCep)
    if (!isCEPComplete(cep)) return
    setSocioAdmCepLoading(true)
    try {
      const res  = await fetch(`/api/address/lookup-by-cep?cep=${cep}`)
      const data = await res.json()
      if (data.logradouro || data.bairro) {
        setFields({
          socioAdmLogradouro: data.logradouro ?? form.socioAdmLogradouro,
          socioAdmBairro:     data.bairro     ?? form.socioAdmBairro,
          socioAdmCidade:     data.cidade     ?? form.socioAdmCidade,
          socioAdmEstado:     data.estado     ?? form.socioAdmEstado,
        })
      }
    } catch { /* silently ignore */ } finally {
      setSocioAdmCepLoading(false)
    }
  }

  // Validações inline (mostradas apenas quando o campo tem conteúdo)
  const celularRaw   = normalizePhone(form.celular)
  const cpfError     = form.cpf && rawDoc.length === 11 && !docValid
                         ? 'CPF inválido' : null
  const cnpjError    = form.cnpj && rawDoc.length === 14 && !docValid
                         ? 'CNPJ inválido' : null
  const celularError = form.celular && !isValidPhone(celularRaw)
                         ? 'Celular inválido' : null
  const emailError   = form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
                         ? 'E-mail inválido' : null

  const inputErr = `${inputCls} !border-red-400 focus:!border-red-500 focus:!ring-red-500`

  const title = form.type === 'COMPRA' || form.type === 'CONSIGNACAO'
    ? 'Proprietário / Vendedor' : 'Dados do Cliente'
  const subtitle = form.type === 'COMPRA'
    ? 'Informe os dados de quem está vendendo o veículo.'
    : form.type === 'CONSIGNACAO'
    ? 'Informe os dados do proprietário que consigna o veículo.'
    : 'Informe os dados do cliente comprador.'

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>

      {/* Toggle PF / PJ */}
      <div className="flex gap-3">
        {([['FISICA', 'Pessoa Física'], ['JURIDICA', 'Pessoa Jurídica']] as const).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setField('personType', v)
              setDocStatus('idle')
              setField('personId', null)
            }}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              form.personType === v
                ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-300'
                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Documento + Busca */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          {isPF ? 'CPF' : 'CNPJ'} <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <input
            className={`flex-1 ${isPF ? (cpfError ? inputErr : inputCls) : (cnpjError ? inputErr : inputCls)}`}
            placeholder={isPF ? '000.000.000-00' : '00.000.000/0001-00'}
            value={isPF ? form.cpf : form.cnpj}
            onChange={(e) => {
              const masked = isPF ? formatCPF(e.target.value) : formatCNPJ(e.target.value)
              setField(isPF ? 'cpf' : 'cnpj', masked)
              setDocStatus('idle')
              setField('personId', null)
            }}
            onBlur={() => {
              if (docComplete) {
                handleDocSearch()
                if (!isPF) handleCnpjLookup()
              }
            }}
          />
          <button
            type="button"
            onClick={() => { handleDocSearch(); if (!isPF) handleCnpjLookup() }}
            disabled={!docComplete || docSearching || cnpjLoading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            {(docSearching || cnpjLoading) ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
        </div>
        {isPF && cpfError  && <p className="text-xs text-red-600">{cpfError}</p>}
        {!isPF && cnpjError && <p className="text-xs text-red-600">{cnpjError}</p>}
      </div>

      {/* Banner: cliente encontrado */}
      {docStatus === 'found' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 size={14} className="shrink-0 text-green-600" />
          <span>
            Cliente já cadastrado. Dados preenchidos automaticamente.{' '}
            <span className="font-medium">Você pode editar os campos abaixo.</span>
          </span>
        </div>
      )}

      {/* Banner: não encontrado */}
      {docStatus === 'not_found' && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info size={14} className="shrink-0" />
          <span>Documento não encontrado. Preencha os dados abaixo para cadastrar o cliente.</span>
        </div>
      )}

      {/* ── Dados Pessoais (PF) ── */}
      {isPF && (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 pb-1">
            Dados Pessoais
          </p>
          <Field label="Nome completo" required>
            <input
              className={inputCls}
              value={form.nomeCompleto}
              onChange={(e) => setField('nomeCompleto', e.target.value)}
              placeholder="Nome completo do cliente"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="RG">
              <input
                className={inputCls}
                value={form.rg}
                onChange={(e) => setField('rg', e.target.value)}
                placeholder="00.000.000-0"
              />
            </Field>
            <Field label="Data de nascimento">
              <input
                className={inputCls}
                type="date"
                value={form.dataNascimento}
                onChange={(e) => setField('dataNascimento', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Nome da mãe">
            <input
              className={inputCls}
              value={form.nomeMae}
              onChange={(e) => setField('nomeMae', e.target.value)}
              placeholder="Nome completo da mãe"
            />
          </Field>
        </div>
      )}

      {/* ── Dados da Empresa (PJ) ── */}
      {!isPF && (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 pb-1">
            Dados da Empresa
          </p>
          <Field label="Razão social" required>
            <input
              className={inputCls}
              value={form.razaoSocial}
              onChange={(e) => setField('razaoSocial', e.target.value)}
              placeholder="Razão social da empresa"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome fantasia">
              <input
                className={inputCls}
                value={form.nomeFantasia}
                onChange={(e) => setField('nomeFantasia', e.target.value)}
                placeholder="Nome fantasia"
              />
            </Field>
            <Field label="Inscrição Estadual (IE)">
              <input
                className={inputCls}
                value={form.inscricaoEstadual}
                onChange={(e) => setField('inscricaoEstadual', e.target.value)}
                placeholder="IE ou ISENTO"
              />
            </Field>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 pb-1 pt-2">
            Sócio Administrador / Responsável
          </p>

          {/* Identidade */}
          <Field label="Nome completo do responsável" required>
            <input
              className={inputCls}
              value={form.socioAdmNome}
              onChange={(e) => setField('socioAdmNome', e.target.value)}
              placeholder="Nome completo"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="CPF" required>
              <div className="relative">
                <input
                  className={inputCls + ' pr-9'}
                  value={form.socioAdmCpf}
                  onChange={(e) => {
                    setField('socioAdmCpf', formatCPF(e.target.value))
                    setSocioAdmCpfStatus('idle')
                  }}
                  onBlur={handleSocioAdmCpfLookup}
                  placeholder="000.000.000-00"
                />
                {socioAdmCpfLoading && (
                  <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
                )}
                {!socioAdmCpfLoading && socioAdmCpfStatus === 'found' && (
                  <CheckCircle2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-green-600" />
                )}
              </div>
            </Field>
            <Field label="RG" required>
              <input
                className={inputCls}
                value={form.socioAdmRg}
                onChange={(e) => setField('socioAdmRg', e.target.value)}
                placeholder="00.000.000-0"
              />
            </Field>
          </div>
          {socioAdmCpfStatus === 'found' && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <CheckCircle2 size={13} className="shrink-0" />
              Responsável legal já cadastrado. Dados carregados automaticamente.
            </div>
          )}
          {socioAdmCpfStatus === 'not_found' && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <Info size={13} className="shrink-0" />
              Responsável legal não encontrado. Preencha os dados para cadastrar.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Data de nascimento" required>
              <input
                className={inputCls}
                type="date"
                value={form.socioAdmDataNascimento}
                onChange={(e) => setField('socioAdmDataNascimento', e.target.value)}
              />
            </Field>
            <Field label="Nome da mãe">
              <input
                className={inputCls}
                value={form.socioAdmNomeMae}
                onChange={(e) => setField('socioAdmNomeMae', e.target.value)}
                placeholder="Nome completo da mãe"
              />
            </Field>
          </div>

          {/* Contato do sócio */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Celular">
              <input
                className={inputCls}
                value={form.socioAdmPhone}
                onChange={(e) => setField('socioAdmPhone', formatPhone(e.target.value))}
                placeholder="(00) 00000-0000"
              />
            </Field>
            <Field label="E-mail">
              <input
                className={inputCls}
                type="email"
                value={form.socioAdmEmail}
                onChange={(e) => setField('socioAdmEmail', e.target.value)}
                placeholder="email@exemplo.com"
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.socioAdmWhatsapp}
              onChange={(e) => setField('socioAdmWhatsapp', e.target.checked)}
              className="accent-brand-600"
            />
            <span className="text-sm text-gray-700">Celular do responsável tem WhatsApp</span>
          </label>

          {/* Endereço do sócio */}
          <div className="flex items-end gap-3">
            <div className="w-44">
              <Field label="CEP">
                <input
                  className={inputCls}
                  placeholder="00000-000"
                  value={form.socioAdmCep}
                  onChange={(e) => setField('socioAdmCep', formatCEP(e.target.value))}
                  onBlur={handleSocioAdmCepBlur}
                />
              </Field>
            </div>
            {socioAdmCepLoading && <Loader2 size={16} className="mb-2.5 animate-spin text-gray-400" />}
          </div>
          <Field label="Logradouro">
            <input
              className={inputCls}
              placeholder="Rua, Avenida..."
              value={form.socioAdmLogradouro}
              onChange={(e) => setField('socioAdmLogradouro', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Número">
              <input
                className={inputCls}
                placeholder="N.º"
                value={form.socioAdmNumero}
                onChange={(e) => setField('socioAdmNumero', e.target.value)}
              />
            </Field>
            <div className="col-span-2">
              <Field label="Complemento">
                <input
                  className={inputCls}
                  placeholder="Apto, Bloco..."
                  value={form.socioAdmComplemento}
                  onChange={(e) => setField('socioAdmComplemento', e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Bairro">
              <input
                className={inputCls}
                value={form.socioAdmBairro}
                onChange={(e) => setField('socioAdmBairro', e.target.value)}
                placeholder="Bairro"
              />
            </Field>
            <Field label="Cidade">
              <input
                className={inputCls}
                value={form.socioAdmCidade}
                onChange={(e) => setField('socioAdmCidade', e.target.value)}
                placeholder="Cidade"
              />
            </Field>
            <Field label="Estado">
              <select
                className={inputCls}
                value={form.socioAdmEstado}
                onChange={(e) => setField('socioAdmEstado', e.target.value)}
              >
                <option value="">UF</option>
                {BR_STATES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </Field>
          </div>
        </div>
      )}

      {/* ── Contato ── */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 pb-1">
          Contato
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Celular <span className="text-red-500">*</span>
            </label>
            <input
              className={celularError ? inputErr : inputCls}
              placeholder="(00) 00000-0000"
              value={form.celular}
              onChange={(e) => setField('celular', formatPhone(e.target.value))}
            />
            {celularError && <p className="text-xs text-red-600">{celularError}</p>}
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">E-mail</label>
            <input
              className={emailError ? inputErr : inputCls}
              type="email"
              placeholder="email@exemplo.com"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
            />
            {emailError && <p className="text-xs text-red-600">{emailError}</p>}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.whatsapp}
            onChange={(e) => setField('whatsapp', e.target.checked)}
            className="accent-brand-600"
          />
          <span className="text-sm text-gray-700">Celular tem WhatsApp</span>
        </label>
      </div>

      {/* ── Endereço ── */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 pb-1">
          Endereço
        </p>
        <div className="flex items-end gap-3">
          <div className="w-44">
            <Field label="CEP">
              <input
                className={inputCls}
                placeholder="00000-000"
                value={form.cep}
                onChange={(e) => setField('cep', formatCEP(e.target.value))}
                onBlur={handleCepBlur}
              />
            </Field>
          </div>
          {cepLoading && <Loader2 size={16} className="mb-2.5 animate-spin text-gray-400" />}
        </div>
        <Field label="Logradouro">
          <input
            className={inputCls}
            placeholder="Rua, Avenida, etc."
            value={form.logradouro}
            onChange={(e) => setField('logradouro', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Número">
            <input
              className={inputCls}
              placeholder="N.º"
              value={form.numero}
              onChange={(e) => setField('numero', e.target.value)}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Complemento">
              <input
                className={inputCls}
                placeholder="Apto, Bloco, Sala..."
                value={form.complemento}
                onChange={(e) => setField('complemento', e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Bairro">
            <input
              className={inputCls}
              placeholder="Bairro"
              value={form.bairro}
              onChange={(e) => setField('bairro', e.target.value)}
            />
          </Field>
          <Field label="Cidade">
            <input
              className={inputCls}
              placeholder="Cidade"
              value={form.cidade}
              onChange={(e) => setField('cidade', e.target.value)}
            />
          </Field>
          <Field label="Estado">
            <select
              className={inputCls}
              value={form.estado}
              onChange={(e) => setField('estado', e.target.value)}
            >
              <option value="">UF</option>
              {BR_STATES.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    </div>
  )
}

// ── StepVeiculos ──────────────────────────────────────────────────────────────

function VehicleFormBlock({
  data,
  onChange,
  showValuation,
  showCondition,
}: {
  data: VehicleFields
  onChange: (k: keyof VehicleFields, v: string | boolean | null) => void
  showValuation?: boolean
  showCondition?: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Placa">
          <input
            className={`${inputCls} uppercase`}
            placeholder="AAA0A000"
            value={data.plate}
            onChange={(e) => onChange('plate', e.target.value)}
          />
        </Field>
        <Field label="Ano">
          <input
            className={inputCls}
            placeholder="2024"
            value={data.year}
            onChange={(e) => onChange('year', e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Marca">
          <input
            className={inputCls}
            placeholder="Toyota"
            value={data.brand}
            onChange={(e) => onChange('brand', e.target.value)}
          />
        </Field>
        <Field label="Modelo">
          <input
            className={inputCls}
            placeholder="Corolla"
            value={data.model}
            onChange={(e) => onChange('model', e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Cor">
          <input
            className={inputCls}
            placeholder="Branco"
            value={data.color}
            onChange={(e) => onChange('color', e.target.value)}
          />
        </Field>
        <Field label="KM">
          <input
            className={inputCls}
            placeholder="0"
            type="number"
            value={data.km}
            onChange={(e) => onChange('km', e.target.value)}
          />
        </Field>
        <Field label="Combustível">
          <select
            className={inputCls}
            value={data.fuel}
            onChange={(e) => onChange('fuel', e.target.value)}
          >
            <option value="">Selecione</option>
            {FUEL_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Field>
      </div>
      {showCondition !== false && (
        <Field label="Condição">
          <div className="flex gap-3">
            {CONDITION_OPTIONS.map((c) => (
              <label key={c.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={c.value}
                  checked={data.condition === c.value}
                  onChange={() => onChange('condition', c.value)}
                  className="accent-brand-600"
                />
                <span className="text-sm">{c.label}</span>
              </label>
            ))}
          </div>
        </Field>
      )}
      {showValuation ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Valor Avaliado (R$)">
              <input
                className={inputCls}
                placeholder="0,00"
                value={data.evaluatedValue}
                onChange={(e) => onChange('evaluatedValue', maskBRLInput(e.target.value))}
              />
            </Field>
            <Field label="Tabela FIPE (R$)">
              <input
                className={inputCls}
                placeholder="0,00"
                value={data.fipeValue}
                onChange={(e) => onChange('fipeValue', maskBRLInput(e.target.value))}
              />
            </Field>
            <Field label="Valor Aceito (R$)">
              <input
                className={inputCls}
                placeholder="0,00"
                value={data.agreedValue}
                onChange={(e) => onChange('agreedValue', maskBRLInput(e.target.value))}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <input
              type="checkbox"
              id="hasFinancing"
              checked={data.hasFinancing}
              onChange={(e) => onChange('hasFinancing', e.target.checked)}
              className="rounded border-gray-300 accent-brand-600"
            />
            <label htmlFor="hasFinancing" className="text-sm font-medium text-gray-700 cursor-pointer">
              Veículo possui financiamento / quitação pendente
            </label>
          </div>
          {data.hasFinancing && (
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Field label="Banco / Financiadora">
                <input
                  className={inputCls}
                  placeholder="Banco do Brasil"
                  value={data.payoffBank}
                  onChange={(e) => onChange('payoffBank', e.target.value)}
                />
              </Field>
              <Field label="Valor de Quitação (R$)">
                <input
                  className={inputCls}
                  placeholder="0,00"
                  value={data.payoffValue}
                  onChange={(e) => onChange('payoffValue', maskBRLInput(e.target.value))}
                />
              </Field>
            </div>
          )}
        </>
      ) : (
        <Field label="Valor do Veículo (R$)">
          <input
            className={inputCls}
            placeholder="0,00"
            value={data.vehicleValue}
            onChange={(e) => onChange('vehicleValue', maskBRLInput(e.target.value))}
          />
        </Field>
      )}
      <Field label="Observações">
        <textarea
          className={`${inputCls} min-h-16 resize-y`}
          placeholder="Observações sobre este veículo..."
          value={data.notes}
          onChange={(e) => onChange('notes', e.target.value)}
        />
      </Field>
    </div>
  )
}

function StepVeiculos({
  form,
  setVehicleField,
  setTradeVehicleField,
  setField,
}: {
  form: DealForm
  setVehicleField: (k: keyof VehicleFields, v: string | boolean | null) => void
  setTradeVehicleField: (k: keyof VehicleFields, v: string | boolean | null) => void
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
}) {
  // Veículo do estoque selecionado (objeto rico com cautelar etc.)
  const [selectedStock, setSelectedStock]       = useState<StockVehicle | null>(null)
  const [selectedTradeStock, setSelectedTradeStock] = useState<StockVehicle | null>(null)

  // Seleciona veículo principal (VENDA / TROCA saída)
  const handleSelectStock = (v: StockVehicle) => {
    setSelectedStock(v)
    setVehicleField('vehicleId', v.id)
    setVehicleField('plate', v.plate ?? '')
    setVehicleField('brand', v.brand ?? '')
    setVehicleField('model', v.model ?? '')
    setVehicleField('version', v.version ?? '')
    setVehicleField('year', v.modelYear ?? v.year ? String(v.modelYear ?? v.year) : '')
    setVehicleField('km',    v.km    != null ? String(v.km)    : '')
    setVehicleField('color', v.color ?? '')
    setVehicleField('fuel',  v.fuel  ?? '')
    if (v.salePrice != null)
      setVehicleField('vehicleValue', maskBRLInput(String(Math.round(Number(v.salePrice) * 100))))
  }

  // Seleciona avaliação para o veículo recebido na troca
  const handleSelectEvaluation = (ev: EvaluationItem) => {
    setTradeVehicleField('evaluationId', ev.id)
    setTradeVehicleField('plate', ev.plate ?? '')
    setTradeVehicleField('brand', ev.brand ?? '')
    setTradeVehicleField('model', ev.model ?? '')
    setTradeVehicleField('year',  ev.year != null ? String(ev.year) : '')
    setTradeVehicleField('km',    ev.km   != null ? String(ev.km)   : '')
    if (ev.evaluatedValue != null)
      setTradeVehicleField('evaluatedValue', maskBRLInput(String(Math.round(Number(ev.evaluatedValue) * 100))))
    if (ev.fipeValue != null)
      setTradeVehicleField('fipeValue', maskBRLInput(String(Math.round(Number(ev.fipeValue) * 100))))
  }

  const [showEvalModal, setShowEvalModal] = useState(false)

  const fi = (k: keyof DealForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setField(k, e.target.value as DealForm[typeof k])

  // Input monetário com máscara BRL
  const moneyInput = (k: keyof VehicleFields, placeholder = '0,00') => (
    <input
      className={inputCls}
      placeholder={placeholder}
      value={(form.vehicle as unknown as Record<string, unknown>)[k] as string}
      onChange={(e) => setVehicleField(k, maskBRLInput(e.target.value))}
    />
  )
  const tradeMoneyInput = (k: keyof VehicleFields, placeholder = '0,00') => (
    <input
      className={inputCls}
      placeholder={placeholder}
      value={(form.tradeVehicle as unknown as Record<string, unknown>)[k] as string}
      onChange={(e) => setTradeVehicleField(k, maskBRLInput(e.target.value))}
    />
  )

  return (
    <div className="space-y-6">
      {showEvalModal && (
        <EvaluationSearchModal onSelect={(ev) => { handleSelectEvaluation(ev); setShowEvalModal(false) }} onClose={() => setShowEvalModal(false)} />
      )}

      {/* ── VENDA: somente busca no estoque ── */}
      {form.type === 'VENDA' && (
        <div className="space-y-4">
          <div>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Veículo a Vender</h2>
            <p className="text-sm text-gray-500">Somente veículos disponíveis no estoque podem ser vendidos.</p>
          </div>
          <VehicleInlineSearch
            label="Estoque disponível"
            selected={selectedStock}
            onSelect={handleSelectStock}
            onClear={() => {
              setSelectedStock(null)
              setVehicleField('vehicleId', null)
              setVehicleField('plate', '')
              setVehicleField('brand', '')
              setVehicleField('model', '')
              setVehicleField('year', '')
            }}
          />
          {/* Valor de venda confirmado */}
          {selectedStock && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Confirmar valores</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Valor de Venda (R$)">
                  {moneyInput('vehicleValue')}
                </Field>
                <Field label="KM atual">
                  <input
                    className={inputCls}
                    placeholder="0"
                    value={form.vehicle.km}
                    onChange={(e) => setVehicleField('km', e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </div>
              <Field label="Observações">
                <textarea
                  className={`${inputCls} min-h-16 resize-y`}
                  placeholder="Observações sobre este veículo..."
                  value={form.vehicle.notes}
                  onChange={(e) => setVehicleField('notes', e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {/* ── TROCA ── */}
      {form.type === 'TROCA' && (
        <div className="space-y-6">
          {/* Veículo que sai (estoque) */}
          <div className="space-y-4">
            <div>
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Veículo que Sai da Loja</h2>
              <p className="text-sm text-gray-500">Selecione um veículo disponível no estoque.</p>
            </div>
            <VehicleInlineSearch
              label="Estoque disponível"
              selected={selectedStock}
              onSelect={handleSelectStock}
              onClear={() => {
                setSelectedStock(null)
                setVehicleField('vehicleId', null)
                setVehicleField('plate', '')
                setVehicleField('brand', '')
                setVehicleField('model', '')
              }}
            />
            {selectedStock && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Valores do veículo que sai</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Valor de Saída (R$)">
                    {moneyInput('vehicleValue')}
                  </Field>
                  <Field label="KM atual">
                    <input
                      className={inputCls}
                      placeholder="0"
                      value={form.vehicle.km}
                      onChange={(e) => setVehicleField('km', e.target.value.replace(/\D/g, ''))}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* Veículo recebido na troca */}
          <div className="border-t border-gray-200 pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
              <h3 className="font-semibold text-purple-900">Veículo Recebido na Troca</h3>
            </div>
            <div className="rounded-xl border-2 border-purple-200 bg-purple-50/40 p-4 space-y-4">
              <button
                type="button"
                onClick={() => setShowEvalModal(true)}
                className="flex items-center gap-2 rounded-lg border border-purple-300 bg-white px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 transition-colors"
              >
                <Search size={14} />
                Buscar Avaliação Aprovada
              </button>
              {form.tradeVehicle.evaluationId && (
                <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm">
                  <CheckCircle2 size={14} className="text-purple-600 shrink-0" />
                  <span className="text-purple-800 font-medium">
                    {[form.tradeVehicle.brand, form.tradeVehicle.model, form.tradeVehicle.year].filter(Boolean).join(' ')}
                    {form.tradeVehicle.plate && ` · ${form.tradeVehicle.plate}`}
                  </span>
                  <button type="button" onClick={() => setTradeVehicleField('evaluationId', null)} className="ml-auto text-purple-400 hover:text-red-500">
                    <X size={13} />
                  </button>
                </div>
              )}
              <VehicleFormBlock data={form.tradeVehicle} onChange={setTradeVehicleField} showValuation />
            </div>
          </div>
        </div>
      )}

      {/* ── COMPRA ── */}
      {form.type === 'COMPRA' && (
        <div className="space-y-4">
          <div>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Veículo a Comprar</h2>
            <p className="text-sm text-gray-500">Preencha os dados do veículo que será comprado do cliente.</p>
          </div>
          <VehicleFormBlock data={form.vehicle} onChange={setVehicleField} showValuation />
        </div>
      )}

      {/* ── CONSIGNAÇÃO ── */}
      {form.type === 'CONSIGNACAO' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Veículo em Consignação</h2>
              <p className="text-sm text-gray-500">Dados do veículo que será anunciado pela loja.</p>
            </div>
            <VehicleFormBlock data={form.vehicle} onChange={setVehicleField} showValuation={false} />
          </div>
          <div className="border-t border-gray-200 pt-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Parâmetros da Consignação</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Valor Mínimo ao Proprietário (R$)">
                <input
                  className={inputCls}
                  placeholder="0,00"
                  value={form.consignMinValue}
                  onChange={(e) => setField('consignMinValue', maskBRLInput(e.target.value))}
                />
              </Field>
              <Field label="Comissão da Loja (%)">
                <input className={inputCls} placeholder="10" type="number" min="0" max="100" value={form.consignCommPct} onChange={fi('consignCommPct')} />
              </Field>
              <Field label="Prazo (dias)">
                <input className={inputCls} placeholder="30" type="number" value={form.consignDeadline} onChange={fi('consignDeadline')} />
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── StepDebitos ───────────────────────────────────────────────────────────────

const EMPTY_DEBT = (): DebtEntry => ({
  id: genId(), vehicleRole: 'VENDIDO', type: '', description: '', value: '', responsavel: 'LOJA', notes: '',
})

function StepDebitos({
  form,
  setField,
}: {
  form: DealForm
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft]   = useState<DebtEntry>(EMPTY_DEBT())

  const setDraftField = (k: keyof DebtEntry, v: string) =>
    setDraft((p) => ({ ...p, [k]: v }))

  const addDebt = () => {
    setField('debts', [...form.debts, { ...draft }] as DealForm['debts'])
    setDraft(EMPTY_DEBT())
    setAdding(false)
  }

  const removeDebt = (id: string) =>
    setField('debts', form.debts.filter((d) => d.id !== id) as DealForm['debts'])

  const totalDebts = form.debts.reduce((sum, d) => sum + (parseBRLInput(d.value) ?? 0), 0)

  const isTraoca = form.type === 'TROCA'

  const debtsByRole = {
    VENDIDO: form.debts.filter((d) => d.vehicleRole === 'VENDIDO'),
    TROCA:   form.debts.filter((d) => d.vehicleRole === 'TROCA'),
    OTHER:   form.debts.filter((d) => !['VENDIDO', 'TROCA'].includes(d.vehicleRole)),
  }

  const DebtRow = ({ d }: { d: DebtEntry }) => (
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">
          {DEBT_TYPES.find((t) => t.value === d.type)?.label ?? d.type}
          {d.description && <span className="ml-1 font-normal text-gray-600">— {d.description}</span>}
        </p>
        <p className="text-xs text-gray-500">
          Resp.: {DEBT_RESPONSAVEL.find((r) => r.value === d.responsavel)?.label ?? d.responsavel}
          {d.notes && ` · ${d.notes}`}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-gray-800">{fmtBRL(d.value)}</span>
      <button type="button" onClick={() => removeDebt(d.id)} className="shrink-0 text-gray-400 hover:text-red-500 transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  )

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Débitos</h2>
      <p className="mb-5 text-sm text-gray-500">
        Registre multas, IPVA, financiamentos e outros débitos relacionados aos veículos desta negociação.
      </p>

      {form.debts.length === 0 && !adding && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400 justify-center mb-4">
          Nenhum débito cadastrado. Clique em + Adicionar Débito se houver.
        </div>
      )}

      {isTraoca && form.debts.length > 0 && (
        <div className="space-y-4 mb-4">
          {debtsByRole.VENDIDO.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Débitos do Veículo Vendido</p>
              <div className="space-y-2">
                {debtsByRole.VENDIDO.map((d) => <DebtRow key={d.id} d={d} />)}
              </div>
            </div>
          )}
          {debtsByRole.TROCA.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-500">Débitos do Veículo Recebido</p>
              <div className="space-y-2">
                {debtsByRole.TROCA.map((d) => <DebtRow key={d.id} d={d} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {!isTraoca && form.debts.length > 0 && (
        <div className="space-y-2 mb-4">
          {form.debts.map((d) => <DebtRow key={d.id} d={d} />)}
        </div>
      )}

      {form.debts.length > 0 && (
        <div className="flex justify-end mb-4">
          <span className="text-sm font-medium text-gray-600">Total de débitos: <strong>{fmtBRL(totalDebts)}</strong></span>
        </div>
      )}

      {adding && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4 space-y-3 mb-4">
          <p className="text-sm font-medium text-gray-800">Novo débito</p>
          <div className="grid grid-cols-2 gap-3">
            {isTraoca && (
              <Field label="Veículo">
                <select className={inputCls} value={draft.vehicleRole} onChange={(e) => setDraftField('vehicleRole', e.target.value)}>
                  <option value="VENDIDO">Veículo Vendido pela Loja</option>
                  <option value="TROCA">Veículo Recebido na Troca</option>
                </select>
              </Field>
            )}
            <Field label="Tipo">
              <select className={inputCls} value={draft.type} onChange={(e) => setDraftField('type', e.target.value)}>
                <option value="">Selecione</option>
                {DEBT_TYPES.map((dt) => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
              </select>
            </Field>
            <Field label="Responsável">
              <select className={inputCls} value={draft.responsavel} onChange={(e) => setDraftField('responsavel', e.target.value)}>
                {DEBT_RESPONSAVEL.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Descrição">
            <input className={inputCls} placeholder="Ex: Multa por excesso de velocidade" value={draft.description} onChange={(e) => setDraftField('description', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input className={inputCls} placeholder="0,00" value={draft.value} onChange={(e) => setDraftField('value', maskBRLInput(e.target.value))} />
            </Field>
            <Field label="Notas">
              <input className={inputCls} placeholder="Observação opcional" value={draft.notes} onChange={(e) => setDraftField('notes', e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setAdding(false); setDraft(EMPTY_DEBT()) }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={addDebt}
              disabled={!draft.type || !draft.value}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Plus size={13} />
              Adicionar
            </button>
          </div>
        </div>
      )}

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-brand-400 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors"
        >
          <Plus size={14} />
          Adicionar Débito
        </button>
      )}
    </div>
  )
}

// ── StepPagamento ─────────────────────────────────────────────────────────────

function StepPagamento({
  form,
  setField,
}: {
  form: DealForm
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
}) {
  // helper: input monetário com máscara BRL
  const $ = (k: keyof DealForm, placeholder = '0,00') => ({
    className:   inputCls,
    placeholder,
    value:       form[k] as string,
    onChange:    (e: React.ChangeEvent<HTMLInputElement>) => setField(k, maskBRLInput(e.target.value)),
  })

  const fi = (k: keyof DealForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setField(k, e.target.value as DealForm[typeof k])

  // ── Painel de conferência: total esperado vs total cadastrado ──────────────
  const sale       = parseBRLInput(form.saleAmount)       ?? 0
  const purchase   = parseBRLInput(form.purchaseAmount)   ?? 0
  const trade      = parseBRLInput(form.tradeValue)       ?? 0
  const docFee     = parseBRLInput(form.documentationFee) ?? 0
  const discount   = parseBRLInput(form.discountAmount)   ?? 0
  const signal     = parseBRLInput(form.signalAmount)     ?? 0
  const financed   = parseBRLInput(form.financedAmount)   ?? 0
  const payoff     = parseBRLInput(form.payoffAmount)     ?? 0
  const change     = parseBRLInput(form.changeAmount)     ?? 0
  const debtsTotal = form.debts.reduce((s, d) => s + (parseBRLInput(d.value) ?? 0), 0)

  // Total esperado por tipo
  // VENDA:      saleAmount + docFee - discount
  // COMPRA:     purchaseAmount + debts a cargo da LOJA
  // TROCA:      (sale - trade) + docFee - discount + payoff
  // CONSIG.:    consignMinValue (referência)
  let expected = 0
  if (form.type === 'VENDA')       expected = sale + docFee - discount
  else if (form.type === 'COMPRA') expected = purchase
  else if (form.type === 'TROCA')  expected = (sale - trade) + docFee - discount + payoff
  else if (form.type === 'CONSIGNACAO') expected = parseBRLInput(form.consignMinValue) ?? 0

  // Total cadastrado (entradas confirmadas)
  const cadastrado = signal + financed
  const diff       = expected - cadastrado          // > 0 = faltando; < 0 = sobrando
  const sobrando   = diff < 0 ? Math.abs(diff)      : 0
  const faltando   = diff > 0 ? diff                : 0
  // Quando há sobrando, exigir cadastro de troco com valor >= sobrando
  const trocoOk    = sobrando === 0 || (change >= sobrando - 0.01)

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Pagamento e Condições Financeiras</h2>
      <p className="mb-5 text-sm text-gray-500">Preencha os valores conforme o tipo de negociação.</p>

      {/* ── Painel de conferência financeira ──────────────────────────────── */}
      <div className={`mb-5 grid grid-cols-1 gap-3 rounded-xl border-2 p-4 sm:grid-cols-3 ${
        faltando > 0
          ? 'border-red-200 bg-red-50/40'
          : sobrando > 0
            ? (trocoOk ? 'border-green-200 bg-green-50/40' : 'border-amber-300 bg-amber-50/40')
            : 'border-blue-200 bg-blue-50/30'
      }`}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total da Operação</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{fmtBRL(expected)}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">
            Inclui documentação, descontos e ajustes
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Pagamentos Cadastrados</p>
          <p className="mt-1 text-lg font-bold text-gray-800">{fmtBRL(cadastrado)}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">
            Sinal + financiamento + entradas
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {faltando > 0 ? 'Faltando' : sobrando > 0 ? 'Sobrando (Troco)' : 'Diferença'}
          </p>
          <p className={`mt-1 text-lg font-bold ${
            faltando > 0 ? 'text-red-700' : sobrando > 0 ? 'text-green-700' : 'text-gray-700'
          }`}>
            {fmtBRL(faltando > 0 ? faltando : sobrando)}
          </p>
          <p className="mt-0.5 text-[10px] text-gray-500">
            {faltando > 0
              ? 'Cadastre mais pagamentos para fechar a negociação.'
              : sobrando > 0
                ? trocoOk
                  ? 'Troco devidamente cadastrado.'
                  : 'Cadastre o troco no campo abaixo para continuar.'
                : 'Fechamento financeiro OK ✓'}
          </p>
        </div>
        {debtsTotal > 0 && (
          <div className="sm:col-span-3 border-t border-gray-200 pt-2 text-xs text-gray-500">
            Débitos vinculados à negociação: <strong className="text-gray-700">{fmtBRL(debtsTotal)}</strong>
          </div>
        )}
      </div>

      <div className="space-y-4">

        {/* VENDA */}
        {form.type === 'VENDA' && (
          <>
            <Field label="Valor de Venda (R$)" required>
              <input {...$('saleAmount')} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sinal / Entrada (R$)">
                <input {...$('signalAmount')} />
              </Field>
              <Field label="Valor Financiado (R$)">
                <input {...$('financedAmount')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Forma de Pagamento">
                <select className={inputCls} value={form.paymentType} onChange={fi('paymentType')}>
                  <option value="">Selecione</option>
                  {PAYMENT_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                </select>
              </Field>
              <Field label="Banco / Financiadora">
                <BankCombo value={form.paymentBank} onChange={(v) => setField('paymentBank', v)} placeholder="Buscar banco..." />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Taxa de Documentação (R$)">
                <input {...$('documentationFee')} />
              </Field>
              <Field label="Desconto (R$)">
                <input {...$('discountAmount')} />
              </Field>
            </div>

            {/* Painel de Troco — aparece quando há sobra ao cliente */}
            {sobrando > 0 && (
              <div className="rounded-xl border-2 border-green-200 bg-green-50/40 p-4 space-y-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-green-800">
                  <DollarSign size={14} />
                  Cadastrar Troco ao Cliente
                </p>
                <p className="text-xs text-green-700">
                  Sobra detectada: <strong>{fmtBRL(sobrando)}</strong>.
                  Cadastre o troco com dados bancários do beneficiário.
                </p>
                <Field label="Valor do Troco (R$)" required>
                  <input {...$('changeAmount')} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Beneficiário">
                    <input className={inputCls} placeholder="Nome do titular"
                      value={form.changeBeneficiary}
                      onChange={fi('changeBeneficiary')} />
                  </Field>
                  <Field label="CPF/CNPJ do Beneficiário">
                    <input className={inputCls} placeholder="CPF ou CNPJ"
                      value={form.changeBeneficiaryCpf}
                      onChange={fi('changeBeneficiaryCpf')} />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Banco">
                    <BankCombo value={form.changeBank} onChange={(v) => setField('changeBank', v)} />
                  </Field>
                  <Field label="Agência">
                    <input className={inputCls} placeholder="0000"
                      value={form.changeAgency}
                      onChange={fi('changeAgency')} />
                  </Field>
                  <Field label="Conta">
                    <input className={inputCls} placeholder="00000-0"
                      value={form.changeAccount}
                      onChange={fi('changeAccount')} />
                  </Field>
                </div>
                <Field label="Chave PIX (opcional)">
                  <input className={inputCls} placeholder="CPF, e-mail, telefone ou chave aleatória"
                    value={form.changePix}
                    onChange={fi('changePix')} />
                </Field>
              </div>
            )}
          </>
        )}

        {/* COMPRA */}
        {form.type === 'COMPRA' && (
          <>
            <Field label="Valor de Compra (R$)" required>
              <input {...$('purchaseAmount')} />
            </Field>
            <Field label="Forma de Pagamento">
              <select className={inputCls} value={form.paymentType} onChange={fi('paymentType')}>
                <option value="">Selecione</option>
                {PAYMENT_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
            </Field>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-blue-800">
                <Info size={14} />
                Dados bancários do cliente para recebimento
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Beneficiário">
                  <input className={inputCls} placeholder="Nome do titular" value={form.changeBeneficiary} onChange={fi('changeBeneficiary')} />
                </Field>
                <Field label="PIX">
                  <input className={inputCls} placeholder="Chave PIX" value={form.changePix} onChange={fi('changePix')} />
                </Field>
              </div>
            </div>
            {form.vehicle.hasFinancing && (
              <div className="grid grid-cols-2 gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <Field label="Banco de Quitação">
                  <BankCombo value={form.payoffBank} onChange={(v) => setField('payoffBank', v)} />
                </Field>
                <Field label="Valor de Quitação (R$)">
                  <input {...$('payoffAmount')} />
                </Field>
              </div>
            )}
          </>
        )}

        {/* TROCA */}
        {form.type === 'TROCA' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Valor do Veículo Vendido (R$)" required>
                <input {...$('saleAmount')} />
              </Field>
              <Field label="Valor Aceito na Troca (R$)">
                <input {...$('tradeValue')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sinal (R$)">
                <input {...$('signalAmount')} />
              </Field>
              <Field label="Financiamento (R$)">
                <input {...$('financedAmount')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Banco / Financiadora">
                <BankCombo value={form.paymentBank} onChange={(v) => setField('paymentBank', v)} placeholder="Buscar banco..." />
              </Field>
              <Field label="Taxa de Documentação (R$)">
                <input {...$('documentationFee')} />
              </Field>
            </div>
            {form.tradeVehicle.hasFinancing && (
              <div className="grid grid-cols-2 gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <Field label="Banco Quitação (Veículo Recebido)">
                  <BankCombo value={form.payoffBank} onChange={(v) => setField('payoffBank', v)} />
                </Field>
                <Field label="Valor de Quitação (R$)">
                  <input {...$('payoffAmount')} />
                </Field>
              </div>
            )}
            <Field label="Troco ao Cliente (R$)">
              <input {...$('changeAmount')} />
            </Field>
            {form.changeAmount && parseBRLInput(form.changeAmount) !== null && parseBRLInput(form.changeAmount)! > 0 && (
              <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <Field label="Beneficiário (troco)">
                  <input className={inputCls} placeholder="Nome do titular" value={form.changeBeneficiary} onChange={fi('changeBeneficiary')} />
                </Field>
                <Field label="PIX">
                  <input className={inputCls} placeholder="Chave PIX" value={form.changePix} onChange={fi('changePix')} />
                </Field>
              </div>
            )}
          </>
        )}

        {/* CONSIGNAÇÃO */}
        {form.type === 'CONSIGNACAO' && (
          <>
            <Field label="Valor Mínimo ao Proprietário (R$)" required>
              <input {...$('consignMinValue')} />
            </Field>
            <Field label="Valor de Anúncio (R$)">
              <input {...$('saleAmount')} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Comissão da Loja (%)">
                <input className={inputCls} type="number" min="0" max="100" placeholder="10" value={form.consignCommPct} onChange={fi('consignCommPct')} />
              </Field>
              <Field label="Prazo (dias)">
                <input className={inputCls} type="number" placeholder="30" value={form.consignDeadline} onChange={fi('consignDeadline')} />
              </Field>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── StepAgendamento ───────────────────────────────────────────────────────────

function StepAgendamento({
  form,
  setField,
}: {
  form: DealForm
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
}) {
  const fi = (k: keyof DealForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setField(k, e.target.value as DealForm[typeof k])

  const hasDates = form.deliveryDate || form.receiptDate

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">
        {form.type === 'VENDA'       ? 'Agendamento de Entrega'
        : form.type === 'COMPRA'     ? 'Agendamento de Recebimento'
        : form.type === 'TROCA'      ? 'Agendamento de Entrega e Recebimento'
        : 'Agendamento da Consignação'}
      </h2>
      <p className="mb-5 text-sm text-gray-500">
        Defina as datas previstas. Este campo é opcional — pode ser preenchido depois.
      </p>

      {!hasDates && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-400 justify-center">
          <Calendar size={16} />
          Nenhum agendamento cadastrado. Preencha as datas abaixo.
        </div>
      )}

      <div className="space-y-4">
        {/* VENDA */}
        {form.type === 'VENDA' && (
          <Field label="Data de Entrega do Veículo">
            <input className={inputCls} type="date" value={form.deliveryDate} onChange={fi('deliveryDate')} />
          </Field>
        )}

        {/* TROCA */}
        {form.type === 'TROCA' && (
          <>
            <Field label="Data de Entrega do Veículo Vendido">
              <input className={inputCls} type="date" value={form.deliveryDate} onChange={fi('deliveryDate')} />
            </Field>
            <Field label="Data de Recebimento do Veículo da Troca">
              <input className={inputCls} type="date" value={form.receiptDate} onChange={fi('receiptDate')} />
            </Field>
          </>
        )}

        {/* COMPRA */}
        {form.type === 'COMPRA' && (
          <>
            <Field label="Data de Recebimento do Veículo">
              <input className={inputCls} type="date" value={form.receiptDate} onChange={fi('receiptDate')} />
            </Field>
            <Field label="Data Prevista de Pagamento">
              <input className={inputCls} type="date" value={form.deliveryDate} onChange={fi('deliveryDate')} />
            </Field>
          </>
        )}

        {/* CONSIGNAÇÃO */}
        {form.type === 'CONSIGNACAO' && (
          <>
            <Field label="Data de Entrada do Veículo">
              <input className={inputCls} type="date" value={form.receiptDate} onChange={fi('receiptDate')} />
            </Field>
            <Field label="Prazo Final da Consignação">
              <input className={inputCls} type="date" value={form.deliveryDate} onChange={fi('deliveryDate')} />
            </Field>
          </>
        )}

        <Field label="Observações do Agendamento">
          <textarea
            className={`${inputCls} min-h-16 resize-y`}
            placeholder="Horário, local de entrega, condições especiais..."
            value={form.schedulingNotes}
            onChange={fi('schedulingNotes')}
          />
        </Field>
      </div>
    </div>
  )
}

// ── StepResumo ────────────────────────────────────────────────────────────────

function StepResumo({
  form,
  setField,
}: {
  form: DealForm
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
}) {
  const { data: session } = useSession()
  const [sellers, setSellers] = useState<Seller[]>([])
  const isVendedor = session?.user?.role === 'VENDEDOR'

  useEffect(() => {
    const qs = form.unitId ? `?unitId=${form.unitId}` : ''
    fetch(`/api/sellers${qs}`)
      .then((r) => r.json())
      .then((d) => {
        const list: Seller[] = Array.isArray(d?.data) ? d.data : []
        setSellers(list)
        // Vendedor: auto-seleciona a si mesmo
        if (isVendedor && session?.user?.id) {
          const mine = list.find((s) => s.userId === session.user.id)
          if (mine && !form.sellerId) setField('sellerId', mine.id)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.unitId])

  const selectedType = DEAL_TYPES.find((d) => d.value === form.type)
  const totalDebts   = form.debts.reduce((s, d) => s + (parseBRLInput(d.value) ?? 0), 0)

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800">{value}</dd>
    </div>
  )

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Revisar e Confirmar</h2>
      <p className="mb-5 text-sm text-gray-500">Verifique todos os dados antes de salvar ou enviar para aprovação.</p>

      <div className="space-y-4">
        {/* Tipo */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Tipo</p>
          {selectedType && (
            <div className="flex items-center gap-3">
              <selectedType.icon size={18} className={selectedType.textColor} />
              <span className="font-semibold text-gray-800">{selectedType.label}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${selectedType.badgeCls}`}>{selectedType.label}</span>
            </div>
          )}
        </div>

        {/* Cliente */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Cliente / Pessoa</p>
          <dl className="space-y-1.5 text-sm">
            <Row label="Nome"
                 value={(form.personType === 'FISICA' ? form.nomeCompleto : form.razaoSocial) || '—'} />
            <Row label={form.personType === 'FISICA' ? 'CPF' : 'CNPJ'}         value={(form.personType === 'FISICA' ? form.cpf : form.cnpj) || '—'} />
            {form.email && <Row label="E-mail"    value={form.email} />}
            {form.celular && <Row label="Celular"   value={form.celular} />}
          </dl>
        </div>

        {/* Veículo Principal */}
        {(form.vehicle.brand || form.vehicle.plate) && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {form.type === 'COMPRA' ? 'Veículo a Comprar' : form.type === 'CONSIGNACAO' ? 'Veículo em Consignação' : 'Veículo Principal'}
            </p>
            <p className="text-sm text-gray-700">
              {[form.vehicle.brand, form.vehicle.model, form.vehicle.year].filter(Boolean).join(' ')}
              {form.vehicle.plate && <span className="ml-1.5 font-mono text-gray-500">· {form.vehicle.plate}</span>}
              {form.vehicle.km    && <span className="ml-1.5 text-gray-500">· {Number(form.vehicle.km).toLocaleString('pt-BR')} km</span>}
            </p>
            {form.vehicle.vehicleValue && (
              <p className="mt-1 text-sm font-semibold text-gray-800">{fmtBRL(form.vehicle.vehicleValue)}</p>
            )}
          </div>
        )}

        {/* Veículo Troca */}
        {form.type === 'TROCA' && (form.tradeVehicle.brand || form.tradeVehicle.plate) && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-500">Veículo Recebido na Troca</p>
            <p className="text-sm text-purple-800">
              {[form.tradeVehicle.brand, form.tradeVehicle.model, form.tradeVehicle.year].filter(Boolean).join(' ')}
              {form.tradeVehicle.plate && <span className="ml-1.5 font-mono">· {form.tradeVehicle.plate}</span>}
            </p>
            {form.tradeVehicle.agreedValue && (
              <p className="mt-1 text-sm font-semibold text-purple-700">Aceito: {fmtBRL(form.tradeVehicle.agreedValue)}</p>
            )}
            {form.tradeVehicle.hasFinancing && (
              <p className="mt-0.5 text-xs text-amber-700">Com financiamento — quitação: {fmtBRL(form.tradeVehicle.payoffValue)}</p>
            )}
          </div>
        )}

        {/* Débitos */}
        {form.debts.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Débitos ({form.debts.length})</p>
            <div className="space-y-1.5 text-sm">
              {form.debts.map((d) => (
                <div key={d.id} className="flex justify-between text-gray-700">
                  <span>{DEBT_TYPES.find((t) => t.value === d.type)?.label ?? d.type}{d.description ? ` — ${d.description}` : ''}</span>
                  <span className="font-medium">{fmtBRL(d.value)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold text-gray-800">
                <span>Total débitos</span>
                <span>{fmtBRL(totalDebts)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Financeiro */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Financeiro</p>
          <dl className="space-y-1.5 text-sm">
            {form.saleAmount      && <Row label="Venda / Anúncio"    value={fmtBRL(form.saleAmount)} />}
            {form.purchaseAmount  && <Row label="Compra"             value={fmtBRL(form.purchaseAmount)} />}
            {form.tradeValue      && <Row label="Troca aceita"        value={fmtBRL(form.tradeValue)} />}
            {form.signalAmount    && <Row label="Sinal / Entrada"     value={fmtBRL(form.signalAmount)} />}
            {form.financedAmount  && <Row label="Financiado"          value={fmtBRL(form.financedAmount)} />}
            {form.consignMinValue && <Row label="Mínimo proprietário" value={fmtBRL(form.consignMinValue)} />}
            {form.documentationFee && <Row label="Documentação"       value={fmtBRL(form.documentationFee)} />}
            {form.discountAmount  && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Desconto</dt>
                <dd className="font-medium text-red-600">- {fmtBRL(form.discountAmount)}</dd>
              </div>
            )}
            {form.changeAmount    && <Row label="Troco ao cliente"    value={fmtBRL(form.changeAmount)} />}
          </dl>
        </div>

        {/* Agendamento */}
        {(form.deliveryDate || form.receiptDate) && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Agendamento</p>
            <dl className="space-y-1.5 text-sm">
              {form.deliveryDate && <Row label={form.type === 'COMPRA' ? 'Pagamento previsto' : 'Entrega'} value={fmtDate(form.deliveryDate)} />}
              {form.receiptDate  && <Row label="Recebimento"                                               value={fmtDate(form.receiptDate)} />}
              {form.schedulingNotes && (
                <div>
                  <dt className="text-gray-500">Observações</dt>
                  <dd className="mt-0.5 text-gray-700">{form.schedulingNotes}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Comentários */}
        {form.notes && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Comentários</p>
            <p className="text-sm text-gray-700">{form.notes}</p>
            {form.commentType && (
              <span className="mt-1.5 inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                {COMMENT_TYPES.find((c) => c.value === form.commentType)?.label ?? form.commentType}
              </span>
            )}
          </div>
        )}

        {/* Vendedor responsável */}
        <div className="rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-brand-600" />
            <p className="text-sm font-semibold text-brand-800">Vendedor Responsável</p>
          </div>
          {isVendedor ? (
            <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-4 py-2.5 text-sm">
              <UserCheck size={14} className="text-brand-600 shrink-0" />
              <span className="font-medium text-brand-900">
                {sellers.find((s) => s.id === form.sellerId)?.fullName ?? 'Carregando...'}
              </span>
              <span className="ml-auto text-xs text-brand-500">(você)</span>
            </div>
          ) : (
            sellers.length > 0 ? (
              <select
                className={inputCls}
                value={form.sellerId}
                onChange={(e) => setField('sellerId', e.target.value)}
              >
                <option value="">Selecione o vendedor</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}{s.shortName ? ` (${s.shortName})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-500 italic">Nenhum vendedor cadastrado nesta unidade.</p>
            )
          )}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Salve como <strong>Rascunho</strong> para continuar depois, ou{' '}
            <strong>Envie para Aprovação</strong> quando estiver tudo certo.
          </span>
        </div>
      </div>
    </div>
  )
}

// ── StepComentarios ───────────────────────────────────────────────────────────

function StepComentarios({
  form,
  setField,
}: {
  form: DealForm
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
}) {
  const fi = (k: keyof DealForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setField(k, e.target.value as DealForm[typeof k])

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Comentários Internos</h2>
      <p className="mb-5 text-sm text-gray-500">Adicione observações internas sobre esta negociação. Campo opcional.</p>
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>Este campo ficará registrado como observação interna da negociação.</span>
        </div>
        <Field label="Tipo do comentário">
          <select className={inputCls} value={form.commentType} onChange={fi('commentType')}>
            <option value="">Selecione (opcional)</option>
            {COMMENT_TYPES.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
          </select>
        </Field>
        <Field label="Observações gerais">
          <textarea
            className={`${inputCls} min-h-32 resize-y`}
            placeholder="Condições especiais, notas para a equipe, histórico do cliente..."
            value={form.notes}
            onChange={fi('notes')}
          />
        </Field>
      </div>
    </div>
  )
}

// ── NovaNegociacaoPage ────────────────────────────────────────────────────────

export default function NovaNegociacaoPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const dealId       = searchParams.get('dealId') ?? ''
  const mode: 'create' | 'edit' = dealId ? 'edit' : 'create'

  const [step, setStep]     = useState(0)
  const [form, setForm]     = useState<DealForm>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [toast, setToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [hydrating, setHydrating] = useState(mode === 'edit')
  const [dealMeta,  setDealMeta]  = useState<{ dealNumber: string | null; status: string } | null>(null)

  // ── Hidratação em modo edição: carrega deal completo e popula o form ──────
  useEffect(() => {
    if (mode !== 'edit' || !dealId) return
    let alive = true
    setHydrating(true)
    ;(async () => {
      try {
        const res  = await fetch(`/api/negotiations/${dealId}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Falha ao carregar negociação.')
        const d = json.data
        if (!alive) return

        setDealMeta({ dealNumber: d.dealNumber ?? null, status: d.status })

        // Converte número → string com vírgula brasileira (compatível com maskBRLInput)
        const num = (n: number | string | null | undefined): string => {
          if (n == null || n === '') return ''
          const v = typeof n === 'number' ? n : parseFloat(String(n))
          if (isNaN(v)) return ''
          return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        }

        // Resgata Person/Customer
        const p = d.person ?? null
        const c = d.customer ?? null

        // Localiza veículo principal e veículo de troca
        const vMain  = Array.isArray(d.vehicles) ? d.vehicles.find((v: { role: string }) =>
                        ['VENDIDO', 'COMPRADO', 'CONSIGNADO'].includes(v.role)) ?? d.vehicles[0] ?? null : null
        const vTrade = Array.isArray(d.vehicles) ? d.vehicles.find((v: { role: string }) => v.role === 'TROCA') ?? null : null

        const mkVehicle = (v: typeof vMain): typeof INITIAL_FORM.vehicle => ({
          ...EMPTY_VEHICLE,
          plate:          v?.plate   ?? '',
          brand:          v?.brand   ?? '',
          model:          v?.model   ?? '',
          version:        '',
          year:           v?.year    ? String(v.year) : '',
          color:          v?.color   ?? '',
          km:             v?.km      ? String(v.km)  : '',
          fuel:           '',
          condition:      v?.condition ?? 'USADO',
          vehicleValue:   num(v?.agreedValue),
          fipeValue:      num(v?.fipeValue),
          evaluatedValue: num(v?.evaluatedValue),
          agreedValue:    num(v?.agreedValue),
          hasFinancing:   !!v?.hasFinancing,
          payoffValue:    num(v?.payoffValue),
          payoffBank:     v?.payoffBank ?? '',
          notes:          v?.notes ?? '',
          vehicleId:      v?.vehicleId ?? null,
          evaluationId:   null,
        })

        setForm({
          ...INITIAL_FORM,
          type:    (d.type ?? '') as DealForm['type'],
          unitId:  d.unitId   ?? '',
          sellerId: d.sellerId ?? '',
          // Cliente — prioriza Person, cai para Customer
          personId:     p?.id ?? null,
          personType:   (p?.type ?? 'FISICA') as DealForm['personType'],
          cpf:          p?.cpf ? formatCPF(p.cpf)   : '',
          cnpj:         p?.cnpj ? formatCNPJ(p.cnpj) : '',
          nomeCompleto: p?.nomeCompleto ?? c?.name ?? '',
          rg:           p?.rg            ?? '',
          dataNascimento: p?.dataNascimento ? String(p.dataNascimento).slice(0, 10) : '',
          nomeMae:      p?.nomeMae       ?? '',
          razaoSocial:  p?.razaoSocial   ?? '',
          nomeFantasia: p?.nomeFantasia  ?? '',
          inscricaoEstadual: p?.inscricaoEstadual ?? '',
          socioAdmNome:      p?.socioAdmNome      ?? '',
          socioAdmCpf:       p?.socioAdmCpf       ? formatCPF(p.socioAdmCpf)        : '',
          socioAdmPhone:     p?.socioAdmPhone     ? formatPhone(p.socioAdmPhone)    : '',
          socioAdmRg:             '',
          socioAdmDataNascimento: '',
          socioAdmNomeMae:        '',
          socioAdmEmail:          '',
          socioAdmWhatsapp:       false,
          socioAdmCep:        '', socioAdmLogradouro: '', socioAdmNumero: '',
          socioAdmComplemento:'', socioAdmBairro:     '', socioAdmCidade: '',
          socioAdmEstado:     '',
          celular:    p?.phone ? formatPhone(p.phone) : (c?.phone ? formatPhone(c.phone) : ''),
          email:      p?.email ?? c?.email ?? '',
          whatsapp:   false,
          cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
          vehicle:      mkVehicle(vMain),
          tradeVehicle: vTrade ? mkVehicle(vTrade) : { ...EMPTY_VEHICLE },
          consignMinValue: num(d.consignMinValue),
          consignCommPct:  d.consignCommPct ? String(d.consignCommPct) : '',
          consignDeadline: d.consignDeadline ? String(d.consignDeadline).slice(0, 10) : '',
          debts: Array.isArray(d.debts) ? d.debts.map((debt: { id: string; vehicleRole: string; type: string; description: string | null; value: number | string; responsavel: string; notes: string | null }) => ({
            id:          debt.id,
            vehicleRole: debt.vehicleRole ?? 'VENDIDO',
            type:        debt.type,
            description: debt.description ?? '',
            value:       num(debt.value),
            responsavel: debt.responsavel ?? 'LOJA',
            notes:       debt.notes ?? '',
          })) : [],
          saleAmount:       num(d.saleAmount),
          purchaseAmount:   num(d.purchaseAmount),
          signalAmount:     num(d.signalAmount),
          financedAmount:   num(d.financedAmount),
          paymentType:      (d.paymentType ?? '') as DealForm['paymentType'],
          paymentBank:      d.paymentBank ?? '',
          documentationFee: num(d.documentationFee),
          discountAmount:   num(d.discountAmount),
          tradeValue:       num(d.tradeValue),
          changeAmount:     num(d.changeAmount),
          changeBeneficiary: d.changeBeneficiary ?? '',
          changeBeneficiaryCpf: d.changeBeneficiaryCpf ?? '',
          changeBank:    d.changeBank    ?? '',
          changeAgency:  d.changeAgency  ?? '',
          changeAccount: d.changeAccount ?? '',
          changePix:     d.changePix     ?? '',
          payoffAmount:  num(d.payoffAmount),
          payoffBank:    d.payoffBank    ?? '',
          deliveryDate:  d.deliveryDate  ? String(d.deliveryDate).slice(0, 10) : '',
          receiptDate:   '',
          schedulingNotes: '',
          notes:        d.notes ?? '',
          commentType:  '',
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar a negociação para edição.')
      } finally {
        if (alive) setHydrating(false)
      }
    })()
    return () => { alive = false }
  }, [mode, dealId])

  // Auto-dismiss toast após 4s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const showToast = useCallback(
    (msg: string, ok = false) => setToast({ msg, ok }),
    [],
  )

  const setField = <K extends keyof DealForm>(k: K, v: DealForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }))

  const setFields = useCallback((updates: Partial<DealForm>) =>
    setForm((p) => ({ ...p, ...updates })), [])

  const setVehicleField = (k: keyof VehicleFields, v: string | boolean | null) =>
    setForm((p) => ({ ...p, vehicle: { ...p.vehicle, [k]: v as VehicleFields[typeof k] } }))

  const setTradeVehicleField = (k: keyof VehicleFields, v: string | boolean | null) =>
    setForm((p) => ({ ...p, tradeVehicle: { ...p.tradeVehicle, [k]: v as VehicleFields[typeof k] } }))

  // Validação por step — retorna lista de erros (vazio = pode avançar)
  const validateStep = (s: number): string[] => {
    const errs: string[] = []

    switch (s) {
      case 0:
        if (!form.unitId) errs.push('Selecione a unidade responsável.')
        if (!form.type)   errs.push('Selecione o tipo da negociação.')
        return errs

      case 1: {
        const celular = normalizePhone(form.celular)
        const cep     = normalizeCEP(form.cep)
        const email   = form.email.trim()

        if (form.personType === 'FISICA') {
          if (normalizeCPF(form.cpf).length !== 11 || !isValidCPF(normalizeCPF(form.cpf)))
            errs.push('CPF é obrigatório e deve ser válido.')
          if (!form.nomeCompleto)   errs.push('Nome completo é obrigatório.')
          if (!form.rg)             errs.push('RG é obrigatório.')
          if (!form.dataNascimento) errs.push('Data de nascimento é obrigatória.')
        } else {
          if (normalizeCNPJ(form.cnpj).length !== 14 || !isValidCNPJ(normalizeCNPJ(form.cnpj)))
            errs.push('CNPJ é obrigatório e deve ser válido.')
          if (!form.razaoSocial) errs.push('Razão social é obrigatória.')

          // Responsável legal — todos os campos PF
          if (normalizeCPF(form.socioAdmCpf).length !== 11 || !isValidCPF(normalizeCPF(form.socioAdmCpf)))
            errs.push('CPF do responsável legal é obrigatório e deve ser válido.')
          if (!form.socioAdmNome)            errs.push('Nome do responsável legal é obrigatório.')
          if (!form.socioAdmRg)              errs.push('RG do responsável legal é obrigatório.')
          if (!form.socioAdmDataNascimento)  errs.push('Data de nascimento do responsável legal é obrigatória.')
          if (normalizePhone(form.socioAdmPhone).length < 10)
            errs.push('Celular do responsável legal é obrigatório.')
          if (!form.socioAdmEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.socioAdmEmail))
            errs.push('E-mail do responsável legal é obrigatório e válido.')
          if (normalizeCEP(form.socioAdmCep).length !== 8)
            errs.push('CEP do responsável legal é obrigatório.')
          if (!form.socioAdmLogradouro) errs.push('Logradouro do responsável legal é obrigatório.')
          if (!form.socioAdmNumero)     errs.push('Número do responsável legal é obrigatório.')
          if (!form.socioAdmBairro)     errs.push('Bairro do responsável legal é obrigatório.')
          if (!form.socioAdmCidade)     errs.push('Cidade do responsável legal é obrigatória.')
          if (!form.socioAdmEstado)     errs.push('Estado do responsável legal é obrigatório.')
        }

        // Contato e endereço da pessoa principal
        if (celular.length < 10)
          errs.push('Celular é obrigatório.')
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          errs.push('E-mail é obrigatório e válido.')
        if (cep.length !== 8) errs.push('CEP é obrigatório.')
        if (!form.logradouro) errs.push('Logradouro é obrigatório.')
        if (!form.numero)     errs.push('Número é obrigatório.')
        if (!form.bairro)     errs.push('Bairro é obrigatório.')
        if (!form.cidade)     errs.push('Cidade é obrigatória.')
        if (!form.estado)     errs.push('Estado é obrigatório.')
        return errs
      }

      case 2:
        // Veículos: VENDA exige veículo selecionado do estoque
        if (form.type === 'VENDA' && !form.vehicle.vehicleId)
          errs.push('Selecione um veículo disponível do estoque para a venda.')
        if (form.type === 'TROCA' && !form.vehicle.vehicleId)
          errs.push('Selecione o veículo que será vendido pela loja.')
        if (form.type === 'TROCA' && !form.tradeVehicle.plate && !form.tradeVehicle.brand)
          errs.push('Adicione o veículo recebido na troca.')
        return errs

      case 3: return errs

      case 4: {
        if (form.type === 'VENDA'       && !parseBRLInput(form.saleAmount))       errs.push('Valor de venda é obrigatório.')
        if (form.type === 'COMPRA'      && !parseBRLInput(form.purchaseAmount))   errs.push('Valor de compra é obrigatório.')
        if (form.type === 'TROCA'       && !parseBRLInput(form.saleAmount))       errs.push('Valor do veículo vendido é obrigatório.')
        if (form.type === 'CONSIGNACAO' && !parseBRLInput(form.consignMinValue))  errs.push('Valor mínimo ao proprietário é obrigatório.')

        // ── Fechamento financeiro: faltando = 0; sobrando exige troco ──────
        // Aplicável a VENDA e TROCA (COMPRA/CONSIG têm fluxo diferente).
        if (errs.length === 0 && (form.type === 'VENDA' || form.type === 'TROCA')) {
          const sale     = parseBRLInput(form.saleAmount)       ?? 0
          const trade    = parseBRLInput(form.tradeValue)       ?? 0
          const docFee   = parseBRLInput(form.documentationFee) ?? 0
          const discount = parseBRLInput(form.discountAmount)   ?? 0
          const signal   = parseBRLInput(form.signalAmount)     ?? 0
          const financed = parseBRLInput(form.financedAmount)   ?? 0
          const payoff   = parseBRLInput(form.payoffAmount)     ?? 0
          const change   = parseBRLInput(form.changeAmount)     ?? 0

          const expected = form.type === 'VENDA'
            ? sale + docFee - discount
            : (sale - trade) + docFee - discount + payoff
          const cadastrado = signal + financed
          const diff       = expected - cadastrado

          if (diff > 0.01)
            errs.push(`Há valor faltando na negociação: ${diff.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Cadastre os pagamentos.`)
          else if (diff < -0.01) {
            const sobrandoVal = Math.abs(diff)
            if (change < sobrandoVal - 0.01) {
              errs.push(`Há valor sobrando (${sobrandoVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Cadastre o troco antes de avançar.`)
            }
            if (change > 0 && !form.changeBeneficiary)
              errs.push('Informe o beneficiário do troco.')
          }
        }
        return errs
      }

      default: return errs
    }
  }

  const canProceed = () => validateStep(step).length === 0

  const tryNext = () => {
    const errs = validateStep(step)
    if (errs.length === 0) {
      setStep((s) => Math.min(STEPS.length - 1, s + 1))
      return
    }
    showToast(errs[0], false)
  }

  const buildPayload = (submit: boolean) => {
    const v  = form.vehicle
    const tv = form.tradeVehicle
    const hasVehicle = v.plate || v.brand
    const hasTradeVehicle = form.type === 'TROCA' && (tv.plate || tv.brand)

    return {
      type:     form.type,
      unitId:   form.unitId   || undefined,
      sellerId: form.sellerId || undefined,
      submit,
      personId: form.personId ?? undefined,
      person: form.personId ? undefined : {
        type:              form.personType,
        cpf:               form.personType === 'FISICA'
                             ? normalizeCPF(form.cpf) || null : null,
        cnpj:              form.personType === 'JURIDICA'
                             ? normalizeCNPJ(form.cnpj) || null : null,
        nomeCompleto:      form.personType === 'FISICA'
                             ? form.nomeCompleto : form.razaoSocial,
        rg:                form.personType === 'FISICA' ? form.rg || null : null,
        dataNascimento:    form.personType === 'FISICA' && form.dataNascimento
                             ? form.dataNascimento : null,
        nomeMae:           form.personType === 'FISICA' ? form.nomeMae || null : null,
        razaoSocial:       form.personType === 'JURIDICA' ? form.razaoSocial || null : null,
        nomeFantasia:      form.personType === 'JURIDICA' ? form.nomeFantasia || null : null,
        inscricaoEstadual: form.personType === 'JURIDICA' ? form.inscricaoEstadual || null : null,
        socioAdmNome:      form.personType === 'JURIDICA' ? form.socioAdmNome || null : null,
        socioAdmCpf:       form.personType === 'JURIDICA'
                             ? normalizeCPF(form.socioAdmCpf) || null : null,
        socioAdmPhone:     form.personType === 'JURIDICA'
                             ? normalizePhone(form.socioAdmPhone) || null : null,
        socioAdmNomeMae:   form.personType === 'JURIDICA' ? form.socioAdmNomeMae   || null : null,
        socioAdmEmail:     form.personType === 'JURIDICA' ? form.socioAdmEmail     || null : null,
        socioAdmWhatsapp:  form.personType === 'JURIDICA' ? form.socioAdmWhatsapp  : false,
        // Extras de sócio adm (RG/data nasc./endereço) — armazenados em notes (JSON)
        socioAdmRg:             form.personType === 'JURIDICA' ? form.socioAdmRg             || null : null,
        socioAdmDataNascimento: form.personType === 'JURIDICA' ? form.socioAdmDataNascimento || null : null,
        socioAdmCep:            form.personType === 'JURIDICA' ? normalizeCEP(form.socioAdmCep) || null : null,
        socioAdmLogradouro:     form.personType === 'JURIDICA' ? form.socioAdmLogradouro     || null : null,
        socioAdmNumero:         form.personType === 'JURIDICA' ? form.socioAdmNumero         || null : null,
        socioAdmComplemento:    form.personType === 'JURIDICA' ? form.socioAdmComplemento    || null : null,
        socioAdmBairro:         form.personType === 'JURIDICA' ? form.socioAdmBairro         || null : null,
        socioAdmCidade:         form.personType === 'JURIDICA' ? form.socioAdmCidade         || null : null,
        socioAdmEstado:         form.personType === 'JURIDICA' ? form.socioAdmEstado         || null : null,
        email:             form.email   || null,
        phone:             normalizePhone(form.celular) || null,
        whatsapp:          form.whatsapp,
        cep:               normalizeCEP(form.cep) || null,
        logradouro:        form.logradouro  || null,
        numero:            form.numero      || null,
        complemento:       form.complemento || null,
        bairro:            form.bairro      || null,
        cidade:            form.cidade      || null,
        estado:            form.estado      || null,
      },
      vehicle: hasVehicle ? {
        role:           form.type === 'COMPRA' ? 'COMPRADO' : form.type === 'CONSIGNACAO' ? 'CONSIGNADO' : 'VENDIDO',
        vehicleId:      v.vehicleId ?? undefined,
        plate:          v.plate   || null,
        brand:          v.brand   || null,
        model:          v.model   || null,
        version:        v.version || null,
        year:           v.year    ? Number(v.year) : null,
        color:          v.color   || null,
        km:             v.km      ? Number(v.km)   : null,
        fuel:           v.fuel    || null,
        condition:      v.condition || null,
        agreedValue:    parseBRLInput(v.vehicleValue),
        evaluatedValue: parseBRLInput(v.evaluatedValue),
        fipeValue:      parseBRLInput(v.fipeValue),
        hasFinancing:   v.hasFinancing,
        payoffValue:    parseBRLInput(v.payoffValue),
        payoffBank:     v.payoffBank     || null,
        notes:          v.notes || null,
      } : undefined,
      tradeInVehicle: hasTradeVehicle ? {
        evaluationId:   tv.evaluationId ?? undefined,
        plate:          tv.plate   || null,
        brand:          tv.brand   || null,
        model:          tv.model   || null,
        year:           tv.year    ? Number(tv.year) : null,
        km:             tv.km      ? Number(tv.km)   : null,
        agreedValue:    parseBRLInput(tv.agreedValue),
        evaluatedValue: parseBRLInput(tv.evaluatedValue),
        fipeValue:      parseBRLInput(tv.fipeValue),
        hasFinancing:   tv.hasFinancing,
        payoffValue:    parseBRLInput(tv.payoffValue),
        payoffBank:     tv.payoffBank     || null,
        notes:          tv.notes || null,
      } : undefined,
      saleAmount:       parseBRLInput(form.saleAmount),
      purchaseAmount:   parseBRLInput(form.purchaseAmount),
      signalAmount:     parseBRLInput(form.signalAmount),
      financedAmount:   parseBRLInput(form.financedAmount),
      documentationFee: parseBRLInput(form.documentationFee),
      discountAmount:   parseBRLInput(form.discountAmount),
      tradeValue:       parseBRLInput(form.tradeValue),
      changeAmount:     parseBRLInput(form.changeAmount),
      payoffAmount:     parseBRLInput(form.payoffAmount),
      payoffBank:       form.payoffBank       || null,
      paymentType:      form.paymentType      || null,
      paymentBank:      form.paymentBank      || null,
      changeBeneficiary: form.changeBeneficiary || null,
      changePix:        form.changePix        || null,
      consignMinValue:  parseBRLInput(form.consignMinValue),
      consignCommPct:   form.consignCommPct   ? parseFloat(form.consignCommPct)   : null,
      consignDeadline:  form.consignDeadline  || null,
      deliveryDate:     form.deliveryDate     || null,
      notes: [form.notes, form.schedulingNotes].filter(Boolean).join('\n') || null,
      debts: form.debts.length > 0
        ? form.debts.map((d) => ({
            vehicleRole: d.vehicleRole,
            type:        d.type,
            description: d.description,
            value:       parseBRLInput(d.value) ?? 0,
            responsavel: d.responsavel,
            notes:       d.notes || null,
          }))
        : undefined,
    }
  }

  const handleSubmit = async (submit: boolean) => {
    setSaving(true)
    setError('')
    try {
      // ── Modo edição: PATCH no endpoint da negociação ────────────────────
      if (mode === 'edit' && dealId) {
        const res = await fetch(`/api/negotiations/${dealId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(buildPayload(submit)),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Erro ao atualizar negociação')
        showToast('Negociação atualizada com sucesso.', true)
        router.replace(`/negociacoes/${dealId}`)
        return
      }

      // ── Modo create: POST padrão ────────────────────────────────────────
      const res = await fetch('/api/negotiations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload(submit)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar negociação')
      router.replace(`/negociacoes/${data.data.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado')
      setSaving(false)
    }
  }

  const isLastStep = step === STEPS.length - 1
  const isFinalButtons = step === 6 || step === 7

  // ── Tela de loading durante hidratação (modo edição) ─────────────────────
  if (hydrating) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-3 py-24">
        <Loader2 size={28} className="animate-spin text-brand-600" />
        <p className="text-sm font-medium text-gray-700">Carregando negociação para edição…</p>
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={mode === 'edit' && dealId ? `/negociacoes/${dealId}` : '/negociacoes'}
          className="flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-500 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">
              {mode === 'edit' ? 'Editar Negociação' : 'Nova Negociação'}
            </h1>
            {mode === 'edit' && dealMeta?.dealNumber && (
              <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 font-mono text-xs font-medium text-brand-800">
                {dealMeta.dealNumber}
              </span>
            )}
            {mode === 'edit' && dealMeta?.status && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                {dealMeta.status}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Etapa {step + 1} de {STEPS.length} — {STEPS[step].label}
          </p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="h-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Step Indicator */}
      <StepIndicator step={step} onNavigate={setStep} />

      {/* Erro global */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Conteúdo do step */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {step === 0 && (
          <StepTipo
            type={form.type}
            unitId={form.unitId}
            onSelect={(t) => setField('type', t)}
            setField={setField}
          />
        )}
        {step === 1 && (
          <StepCliente
            form={form}
            setField={setField}
            setFields={setFields}
          />
        )}
        {step === 2 && (
          <StepVeiculos
            form={form}
            setVehicleField={setVehicleField}
            setTradeVehicleField={setTradeVehicleField}
            setField={setField}
          />
        )}
        {step === 3 && (
          <StepDebitos form={form} setField={setField} />
        )}
        {step === 4 && (
          <StepPagamento form={form} setField={setField} />
        )}
        {step === 5 && (
          <StepAgendamento form={form} setField={setField} />
        )}
        {step === 6 && (
          <StepResumo form={form} setField={setField} />
        )}
        {step === 7 && (
          <StepComentarios form={form} setField={setField} />
        )}
      </div>

      {/* Navegação */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowLeft size={14} />
          Anterior
        </button>

        {isFinalButtons ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileIconSm />
              )}
              {mode === 'edit' ? 'Salvar Alterações' : 'Salvar como Rascunho'}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {mode === 'edit' ? 'Salvar e Reenviar' : 'Enviar para Aprovação'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={tryNext}
            className={`flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors ${
              canProceed()
                ? 'bg-brand-600 hover:bg-brand-700'
                : 'bg-brand-300 hover:bg-brand-400'
            }`}
          >
            Próximo
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* Toast de erros de validação */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
          toast.ok
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200   bg-red-50   text-red-800'
        }`}>
          {toast.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          <span className="leading-snug">{toast.msg}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-1 -mr-1 -mt-1 rounded p-1 text-gray-400 hover:bg-white/40 hover:text-gray-700"
            aria-label="Fechar"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Ícone auxiliar ────────────────────────────────────────────────────────────

function FileIconSm() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
