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
  Save,
  AlertTriangle,
  AlertCircle,
  Building2,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Shield,
  ClipboardList,
  Paperclip,
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

// ── Pagamentos (novo modelo profissional multi-pagamento) ──────────────────
export type PaymentEntryType =
  | 'DINHEIRO' | 'PIX' | 'SINAL' | 'ENTRADA' | 'FINANCIAMENTO'
  | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'BOLETO' | 'DUPLICATA'
  | 'TRANSFERENCIA' | 'QUITACAO' | 'TROCO' | 'OUTRO'

export type PaymentEntryStatus = 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO'

export interface PaymentEntry {
  id:           string                  // uuid local
  type:         PaymentEntryType
  status:       PaymentEntryStatus
  amount:       string                  // BRL mascarado
  dueDate:      string                  // ISO date — data prevista de pagamento
  paidAt:       string                  // ISO date — data efetiva
  bank:         string
  cardBrand:    string
  installments: string                  // nº de parcelas
  /** Valor da parcela MANUAL (não auto-calculado) — vem da financeira. */
  installmentValue:        string       // BRL mascarado
  /** Prazo entre parcelas (dias). Ex.: 30, 60. */
  installmentIntervalDays: string
  firstDueDate: string                  // ISO date — primeiro vencimento
  /** Retorno da financeira em % (0,1 a 6,0). Só F&I/gerente/financeiro edita. */
  returnPct:    string                  // ex.: "1,4" (0–6)
  /** Placa do veículo deste pagamento (negociações em lote). */
  vehiclePlate: string
  pixKey:       string
  notes:        string
}

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

  // Pagamentos profissionais (multi-payment)
  payments:         PaymentEntry[]

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
  color:          string | null
  fuel:           string | null
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
  payments: [],
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

// fmtBRL — formata moeda em BRL aceitando vários formatos de entrada.
//
// BUG anterior: usava parseFloat("4.200,00".replace(',', '.')) →
// parseFloat("4.200.00") → 4.2 (parseFloat para no 2º ponto). Daí
// R$ 4.200,00 virava R$ 4,20. Solução: remover TODOS os pontos (milhar)
// antes de trocar a vírgula decimal. Mesmo padrão usado em parseBRLInput.
const fmtBRL = (s: string | number | null | undefined) => {
  if (s == null || s === '') return '—'
  const n = typeof s === 'number'
    ? s
    : parseFloat(String(s).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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
  requireSalePrice,
}: {
  selected: StockVehicle | null
  onSelect: (v: StockVehicle) => void
  onClear: () => void
  label: string
  /** Quando true, oculta veículos sem preço de venda definido (não-liberados). */
  requireSalePrice?: boolean
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
      // includeInactive=true também traz veículos recém-cadastrados que ainda
      // não foram aprovados — eles aparecem com tag mas seleção fica livre.
      // Vazio: busca limitada (20) e depois slice(3) após filtros — garante
      // ter material mesmo se o filtro derrubar muitos. Com query: até 50.
      const isInitial = !q.trim()
      const qs = new URLSearchParams({
        limit: isInitial ? '20' : '50',
        includeInactive: 'true',
      })
      if (q) qs.set('search', q)
      const res  = await fetch(`/api/vehicles?${qs.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.success === false) {
        setError(data?.error || `Falha ao buscar veículos (HTTP ${res.status}).`)
        setResults([])
        return
      }
      const list: StockVehicle[] = Array.isArray(data?.data) ? data.data : []
      // Só ocultamos o que efetivamente saiu do estoque. Status nulos ou
      // desconhecidos passam (defesa contra dados antigos sem stockStatus).
      const HIDDEN_STATUSES = new Set(['VENDIDO', 'CANCELADO', 'DEVOLVIDO', 'BLOQUEADO', 'EM_PRECIFICACAO'])
      const visible = list
        .filter((v) => !v.stockStatus || !HIDDEN_STATUSES.has(v.stockStatus))
        // Pra VENDA: só veículos liberados (com preço de venda definido pelo gerente).
        .filter((v) => !requireSalePrice || (v.salePrice != null && Number(v.salePrice) > 0))
        // Pra VENDA: oculta veículos já vinculados a outra negociação ATIVA
        // (AGUARDANDO_APROVACAO, APROVADA, AGUARDANDO_FINANCEIRO, FINALIZADA etc).
        // Sem isso, o mesmo Gol aparece pra vender 2x. Selecionado atual continua
        // visível (não some quando o user já escolheu).
        .filter((v) => !requireSalePrice || !v.hasOpenNegotiation || v.id === selected?.id)
      visible.sort((a, b) => {
        const aLock = a.hasOpenNegotiation ? 1 : 0
        const bLock = b.hasOpenNegotiation ? 1 : 0
        return aLock - bLock
      })
      // Top-3 mais recentes quando vazio (search inicial)
      const final = isInitial ? visible.slice(0, 3) : visible
      setResults(final)
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
  operation,
  title,
  emptyHint,
}: {
  onSelect: (e: EvaluationItem) => void
  onClose: () => void
  /** TROCA | COMPRA | CONSIGNACAO — filtra availableFor + decisão do cliente. */
  operation?: 'TROCA' | 'COMPRA' | 'CONSIGNACAO'
  title?: string
  emptyHint?: string
}) {
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [results, setResults]   = useState<EvaluationItem[]>([])
  const [searched, setSearched] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    setLoading(true)
    setSearched(true)
    try {
      const params = new URLSearchParams()
      const query = q.trim()
      if (query) params.set('search', query)
      if (operation) params.set('operation', operation)
      // Vazio: limita aos 3 mais recentes (busca enxuta). Com query: até 20.
      params.set('limit', query ? '20' : '3')
      const url = `/api/negotiations/evaluations?${params.toString()}`
      const res = await fetch(url)
      const data = await res.json()
      setResults(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [operation])
  void title; void emptyHint  // reservados para uso futuro de header customizado

  // Busca instantânea ao digitar — debounce curto (250ms) para feedback
  // rápido sem inundar a API.
  const handleChange = (val: string) => {
    setQuery(val)
    clearTimeout((handleChange as { _t?: ReturnType<typeof setTimeout> })._t)
    ;(handleChange as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => doSearch(val), 250)
  }

  // Carrega lista inicial assim que o modal abre (sem precisar clicar Buscar)
  useEffect(() => { doSearch('') }, [doSearch])

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
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold">
                      Nenhum veículo avaliado disponível{operation ? ` para ${operation.toLowerCase()}` : ''}.
                    </p>
                    <p className="mt-1 text-xs text-amber-700/90">
                      Para aparecer aqui, o veículo precisa estar: <strong>avaliado</strong> ·
                      {' '}<strong>precificado</strong> ·
                      {' '}<strong>liberado pelo gerente</strong> ·
                      {' '}e <strong>aceito pelo cliente</strong>.
                    </p>
                    <Link
                      href="/estoque/avaliacao"
                      className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                    >
                      + Fazer nova avaliação
                    </Link>
                  </div>
                </div>
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
  lockValue,
}: {
  data: VehicleFields
  onChange: (k: keyof VehicleFields, v: string | boolean | null) => void
  showValuation?: boolean
  showCondition?: boolean
  /**
   * Quando true (papel VENDEDOR/VENDEDOR_LIDER), o valor do veículo fica
   * somente-leitura. Para alterar é necessário abrir um pedido de desconto
   * (workflow da Fase 2). Gerente/MASTER/ADM ignoram a trava.
   */
  lockValue?: boolean
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
                <BankCombo
                  value={data.payoffBank}
                  onChange={(v) => onChange('payoffBank', v)}
                  placeholder="Buscar banco..."
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
            className={`${inputCls} ${lockValue ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
            placeholder="0,00"
            value={data.vehicleValue}
            readOnly={lockValue}
            title={lockValue ? 'Solicite desconto para alterar o valor' : undefined}
            onChange={(e) => { if (lockValue) return; onChange('vehicleValue', maskBRLInput(e.target.value)) }}
          />
          {lockValue && (
            <p className="mt-1 text-xs text-gray-500">
              Valor protegido. Solicite desconto para alterar (workflow disponível em breve).
            </p>
          )}
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
  lockVehicleValue,
}: {
  form: DealForm
  setVehicleField: (k: keyof VehicleFields, v: string | boolean | null) => void
  setTradeVehicleField: (k: keyof VehicleFields, v: string | boolean | null) => void
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
  lockVehicleValue?: boolean
}) {
  // Veículo do estoque selecionado (objeto rico com cautelar etc.)
  const [selectedStock, setSelectedStock]       = useState<StockVehicle | null>(null)
  const [selectedTradeStock, setSelectedTradeStock] = useState<StockVehicle | null>(null)

  // Seleciona veículo principal (VENDA / TROCA saída).
  // O preço de venda cadastrado pelo gerente (salePrice) vai pra DOIS campos:
  //   • form.vehicle.vehicleValue → exibido no card resumo do veículo
  //   • form.saleAmount           → usado no payload final e como base do saldo
  // Sem o segundo, o saleAmount fica vazio e a venda vai "zerada" pro backend.
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
    if (v.salePrice != null) {
      const masked = maskBRLInput(String(Math.round(Number(v.salePrice) * 100)))
      setVehicleField('vehicleValue', masked)
      // Espelha pro saleAmount global (valor da operação de venda).
      setField('saleAmount', masked)
    }
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
  // Modal separado pro fluxo COMPRA — preenche `form.vehicle` (não tradeVehicle)
  const [showEvalModalCompra, setShowEvalModalCompra] = useState(false)

  // Avaliação aprovada selecionada para COMPRA
  const handleSelectEvaluationCompra = (ev: EvaluationItem) => {
    setVehicleField('evaluationId', ev.id)
    setVehicleField('plate', ev.plate ?? '')
    setVehicleField('brand', ev.brand ?? '')
    setVehicleField('model', ev.model ?? '')
    setVehicleField('year', ev.year != null ? String(ev.year) : '')
    setVehicleField('km',   ev.km   != null ? String(ev.km)   : '')
    setVehicleField('color', ev.color ?? '')
    setVehicleField('fuel',  ev.fuel  ?? '')
    if (ev.evaluatedValue != null) {
      const masked = maskBRLInput(String(Math.round(Number(ev.evaluatedValue) * 100)))
      setVehicleField('evaluatedValue', masked)
      // Preço de compra que será pago ao cliente = valor aprovado pelo gerente
      setVehicleField('vehicleValue', masked)
      // form.purchaseAmount é o que o backend persiste E o cálculo de
      // totalOperacao lê — precisa estar sincronizado com vehicleValue.
      setField('purchaseAmount', masked)
    }
    if (ev.fipeValue != null) {
      setVehicleField('fipeValue', maskBRLInput(String(Math.round(Number(ev.fipeValue) * 100))))
    }
  }

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
        <EvaluationSearchModal
          operation="TROCA"
          onSelect={(ev) => { handleSelectEvaluation(ev); setShowEvalModal(false) }}
          onClose={() => setShowEvalModal(false)}
        />
      )}

      {/* ── VENDA: somente busca no estoque (veículos LIBERADOS) ── */}
      {form.type === 'VENDA' && (
        <div className="space-y-4">
          <div>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Veículo a Vender</h2>
            <p className="text-sm text-gray-500">Somente veículos liberados no estoque (precificados pelo gerente) podem ser vendidos.</p>
          </div>
          <VehicleInlineSearch
            label="Estoque disponível"
            selected={selectedStock}
            onSelect={handleSelectStock}
            requireSalePrice
            onClear={() => {
              setSelectedStock(null)
              setVehicleField('vehicleId', null)
              setVehicleField('plate', '')
              setVehicleField('brand', '')
              setVehicleField('model', '')
              setVehicleField('year', '')
              setField('saleAmount', '')
            }}
          />
          {/* Veículo selecionado — dados já cadastrados, sem solicitar novamente */}
          {selectedStock && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Veículo selecionado</p>
                  <p className="mt-1 text-base font-semibold text-gray-900">
                    {[selectedStock.brand, selectedStock.model, selectedStock.year ?? selectedStock.modelYear].filter(Boolean).join(' ')}
                    {selectedStock.plate && <span className="ml-2 font-mono text-sm text-gray-500">{selectedStock.plate}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {[selectedStock.km != null && `${Number(selectedStock.km).toLocaleString('pt-BR')} km`, selectedStock.color, selectedStock.fuel].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Preço de venda</p>
                  <p className="text-xl font-bold text-emerald-700">
                    {selectedStock.salePrice != null
                      ? fmtBRL(selectedStock.salePrice)
                      : <span className="text-amber-700 text-sm">Sem precificação</span>}
                  </p>
                </div>
              </div>
              {selectedStock.salePrice == null && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Veículo ainda sem preço de venda. Peça ao gerente para precificar no módulo Estoque antes de iniciar a venda.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TROCA ── */}
      {form.type === 'TROCA' && (
        <div className="space-y-6">
          {/* Veículo que sai (estoque) — mesmo padrão da VENDA */}
          <div className="space-y-4">
            <div>
              <h2 className="mb-1 text-lg font-semibold text-gray-900">Veículo que Sai da Loja</h2>
              <p className="text-sm text-gray-500">
                Somente veículos liberados no estoque (precificados pelo gerente)
                e fora de outra negociação ativa podem ser trocados.
              </p>
            </div>
            <VehicleInlineSearch
              label="Estoque disponível"
              selected={selectedStock}
              onSelect={handleSelectStock}
              requireSalePrice
              onClear={() => {
                setSelectedStock(null)
                setVehicleField('vehicleId', null)
                setVehicleField('plate', '')
                setVehicleField('brand', '')
                setVehicleField('model', '')
                setField('saleAmount', '')
              }}
            />
            {selectedStock && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Veículo que sai</p>
                    <p className="mt-1 text-base font-semibold text-gray-900">
                      {[selectedStock.brand, selectedStock.model, selectedStock.year ?? selectedStock.modelYear].filter(Boolean).join(' ')}
                      {selectedStock.plate && <span className="ml-2 font-mono text-sm text-gray-500">{selectedStock.plate}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {[selectedStock.km != null && `${Number(selectedStock.km).toLocaleString('pt-BR')} km`, selectedStock.color, selectedStock.fuel].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Preço de venda</p>
                    <p className="text-xl font-bold text-emerald-700">
                      {selectedStock.salePrice != null
                        ? fmtBRL(selectedStock.salePrice)
                        : <span className="text-amber-700 text-sm">Sem precificação</span>}
                    </p>
                  </div>
                </div>
                {selectedStock.salePrice == null && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Veículo ainda sem preço de venda. Peça ao gerente para precificar no módulo Estoque antes de iniciar a troca.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Veículo recebido na troca — sempre via avaliação liberada e aceita */}
          <div className="border-t border-gray-200 pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
              <h3 className="font-semibold text-purple-900">Veículo Recebido na Troca</h3>
            </div>

            {!form.tradeVehicle.evaluationId ? (
              <div className="rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/40 p-6 text-center space-y-3">
                <p className="text-sm text-purple-900 font-medium">Nenhum veículo da troca adicionado.</p>
                <p className="text-xs text-purple-700/80">
                  Apenas veículos com proposta liberada pelo gerente e <strong>aceita pelo cliente</strong> podem entrar
                  na troca. Cadastre uma avaliação se ainda não existir.
                </p>
                <button
                  type="button"
                  onClick={() => setShowEvalModal(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 transition-colors"
                >
                  <Search size={14} />
                  Adicionar veículo avaliado
                </button>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-purple-200 bg-purple-50/40 p-4 space-y-3">
                {/* Card resumo do veículo selecionado (read-only, dados travados) */}
                <div className="flex items-start justify-between gap-3 rounded-lg border border-purple-200 bg-white px-3 py-2.5">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {[form.tradeVehicle.brand, form.tradeVehicle.model, form.tradeVehicle.year].filter(Boolean).join(' ')}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600">
                        {form.tradeVehicle.plate && <span className="font-mono">{form.tradeVehicle.plate}</span>}
                        {form.tradeVehicle.km && <span className="ml-2">{Number(form.tradeVehicle.km).toLocaleString('pt-BR')} km</span>}
                        {form.tradeVehicle.color && <span className="ml-2">{form.tradeVehicle.color}</span>}
                      </p>
                      {form.tradeVehicle.agreedValue && (
                        <p className="mt-1 text-sm font-bold text-purple-700">
                          Valor aceito: {fmtBRL(form.tradeVehicle.agreedValue)}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm('Remover este veículo da troca?')) return
                      setTradeVehicleField('evaluationId', null)
                      setTradeVehicleField('plate', '')
                      setTradeVehicleField('brand', '')
                      setTradeVehicleField('model', '')
                      setTradeVehicleField('year', '')
                      setTradeVehicleField('km', '')
                      setTradeVehicleField('color', '')
                      setTradeVehicleField('agreedValue', '')
                      setTradeVehicleField('evaluatedValue', '')
                      setTradeVehicleField('fipeValue', '')
                      setField('tradeValue', '')
                    }}
                    className="rounded-md p-1 text-purple-400 hover:bg-red-50 hover:text-red-600"
                    title="Remover veículo da troca"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Apenas campos OPERACIONAIS livres (financiamento/quitação) — resto trava */}
                <div className="rounded-lg border border-purple-200 bg-white p-3 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-700">
                    Campos operacionais (editáveis)
                  </p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-purple-600"
                      checked={form.tradeVehicle.hasFinancing}
                      onChange={(e) => setTradeVehicleField('hasFinancing', e.target.checked)}
                    />
                    <span className="text-gray-700">Possui financiamento ativo (quitação)</span>
                  </label>
                  {form.tradeVehicle.hasFinancing && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Valor da quitação">
                        <input
                          className={inputCls}
                          inputMode="numeric"
                          placeholder="0,00"
                          value={form.tradeVehicle.payoffValue}
                          onChange={(e) => setTradeVehicleField('payoffValue', maskBRLInput(e.target.value))}
                        />
                      </Field>
                      <Field label="Banco">
                        <BankCombo
                          value={form.tradeVehicle.payoffBank}
                          onChange={(v) => setTradeVehicleField('payoffBank', v)}
                          placeholder="Buscar banco..."
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COMPRA ── */}
      {form.type === 'COMPRA' && (
        <div className="space-y-4">
          {showEvalModalCompra && (
            <EvaluationSearchModal
              operation="COMPRA"
              onSelect={(ev) => { handleSelectEvaluationCompra(ev); setShowEvalModalCompra(false) }}
              onClose={() => setShowEvalModalCompra(false)}
            />
          )}

          <div>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Veículo a Comprar</h2>
            <p className="text-sm text-gray-500">
              Compras só podem ser feitas a partir de avaliações <strong>finalizadas e liberadas pelo gerente</strong>.
              Se o veículo ainda não foi avaliado, faça uma nova avaliação antes.
            </p>
          </div>

          {/* Avaliação já selecionada: card resumo + ações de trocar/remover */}
          {form.vehicle.evaluationId && (
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">Avaliação selecionada</p>
                  <p className="text-sm font-bold text-gray-900">
                    {[form.vehicle.brand, form.vehicle.model, form.vehicle.year].filter(Boolean).join(' ')}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
                    {form.vehicle.plate && <span className="font-mono">Placa: {form.vehicle.plate}</span>}
                    {form.vehicle.km    && <span>{form.vehicle.km} km</span>}
                    {form.vehicle.color && <span>{form.vehicle.color}</span>}
                  </div>
                  {form.vehicle.evaluatedValue && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">
                      Valor aprovado de compra: R$ {form.vehicle.evaluatedValue}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm('Trocar avaliação selecionada?')) return
                    setVehicleField('evaluationId', '')
                    setVehicleField('plate', '')
                    setVehicleField('brand', '')
                    setVehicleField('model', '')
                    setVehicleField('year', '')
                    setVehicleField('km', '')
                    setVehicleField('color', '')
                    setVehicleField('fuel', '')
                    setVehicleField('vehicleValue', '')
                    setVehicleField('evaluatedValue', '')
                    setVehicleField('fipeValue', '')
                  }}
                  className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  Trocar
                </button>
              </div>
            </div>
          )}

          {/* Seleção: busca avaliação OU faz nova */}
          {!form.vehicle.evaluationId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowEvalModalCompra(true)}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-brand-300 bg-brand-50/40 px-4 py-6 text-sm font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
              >
                <Search size={16} />
                Selecionar avaliação liberada
              </button>
              <Link
                href="/estoque/avaliacao"
                target="_blank"
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-6 text-sm font-semibold text-gray-700 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
              >
                <Plus size={16} />
                Fazer nova avaliação
              </Link>
            </div>
          )}

          {/* Quando avaliação está selecionada, mostramos APENAS o toggle de
              financiamento — os dados do veículo já estão no card acima.
              Mantemos o VehicleFormBlock só pra reusar a lógica do quitação. */}
          {form.vehicle.evaluationId && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!form.vehicle.hasFinancing}
                  onChange={(e) => setVehicleField('hasFinancing', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="font-medium text-gray-700">Veículo possui financiamento / quitação pendente</span>
              </label>
              {form.vehicle.hasFinancing && (
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <Field label="Banco / Financiadora">
                    <BankCombo
                      value={form.vehicle.payoffBank}
                      onChange={(v) => setVehicleField('payoffBank', v)}
                      placeholder="Buscar banco..."
                    />
                  </Field>
                  <Field label="Valor de Quitação (R$)">
                    <input
                      className={inputCls}
                      placeholder="0,00"
                      value={form.vehicle.payoffValue}
                      onChange={(e) => setVehicleField('payoffValue', maskBRLInput(e.target.value))}
                    />
                  </Field>
                </div>
              )}
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

          {/* Bloco mantido pra TS — não renderiza, evita refatorar imports */}
          {false && form.vehicle.evaluationId && (
            <VehicleFormBlock
              data={form.vehicle}
              onChange={setVehicleField}
              showValuation
              lockValue={true /* vendedor não altera valor de compra; é o que o gerente aprovou */}
            />
          )}
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
            <VehicleFormBlock data={form.vehicle} onChange={setVehicleField} showValuation={false} lockValue={lockVehicleValue} />
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

// ── Labels dos tipos de pagamento (UI) ────────────────────────────────────
const PAYMENT_ENTRY_LABELS: Record<PaymentEntryType, string> = {
  DINHEIRO:        'Dinheiro',
  PIX:             'Pix',
  SINAL:           'Sinal',
  ENTRADA:         'Entrada',
  FINANCIAMENTO:   'Financiamento',
  CARTAO_CREDITO:  'Cartão de Crédito',
  CARTAO_DEBITO:   'Cartão de Débito',
  BOLETO:          'Boleto',
  DUPLICATA:       'Duplicata',
  TRANSFERENCIA:   'Transferência',
  QUITACAO:        'Quitação',
  TROCO:           'Troco de Troca',
  OUTRO:           'Outro',
}

const PAYMENT_STATUS_LABELS: Record<PaymentEntryStatus, string> = {
  PENDENTE:    'Pendente',
  CONFIRMADO:  'Confirmado',
  CANCELADO:   'Cancelado',
}

const PAYMENT_STATUS_COLOR: Record<PaymentEntryStatus, string> = {
  PENDENTE:    'bg-amber-100 text-amber-800 border-amber-200',
  CONFIRMADO:  'bg-emerald-100 text-emerald-800 border-emerald-200',
  CANCELADO:   'bg-gray-100 text-gray-500 border-gray-200',
}

const EMPTY_PAYMENT = (): PaymentEntry => ({
  id:           `tmp_${Math.random().toString(36).slice(2, 11)}`,
  type:         'DINHEIRO',
  status:       'PENDENTE',
  amount:       '',
  dueDate:      '',
  paidAt:       '',
  bank:         '',
  cardBrand:    '',
  installments: '',
  installmentValue:        '',
  installmentIntervalDays: '30',
  firstDueDate:            '',
  returnPct:               '',
  vehiclePlate:            '',
  pixKey:       '',
  notes:        '',
})

// ── PaymentModal (novo cadastro/edição profissional) ──────────────────────
function PaymentModal({
  initial,
  onSave,
  onClose,
  dealType,
  suggestedAmount,
  userRole,
  vehiclePlates,
}: {
  initial?: PaymentEntry
  onSave:   (entry: PaymentEntry) => void
  onClose:  () => void
  /** Filtra os tipos de pagamento conforme o contexto da negociação. */
  dealType?: DealType
  /** Valor sugerido (saldo em aberto) — pré-preenche o campo Valor. */
  suggestedAmount?: number
  /** Papel do usuário logado — controla Status e Retorno (%). */
  userRole?: string
  /** Placas dos veículos da negociação (para identificar lote multi-veículo). */
  vehiclePlates?: string[]
}) {
  // Vendedor vê Status sempre "Pendente" e travado. Quem PODE editar status +
  // cadastrar retorno (% da financeira) é F&I / gerente / financeiro / master.
  // Política simples até ter módulo de permissões granular pra "ficha":
  const isVendedorOnly =
    !userRole || ['VENDEDOR', 'VENDEDOR_LIDER'].includes(userRole)
  const canEditFichaFields = !isVendedorOnly
  // Tipos válidos pra COMPRA — loja paga o cliente, então só formas de
  // transferência reais. Quitação NÃO é forma de pagamento — é débito do
  // veículo (cadastra na etapa "Veículo" via "possui financiamento") e
  // entra automaticamente como dedução do valor pago ao cliente.
  const COMPRA_TYPES: PaymentEntryType[] = ['DINHEIRO', 'PIX', 'TRANSFERENCIA']

  const isCompra = dealType === 'COMPRA'

  const buildEmpty = (): PaymentEntry => {
    const e = EMPTY_PAYMENT()
    if (isCompra) e.type = 'PIX' // default mais comum
    if (suggestedAmount && suggestedAmount > 0) {
      e.amount = maskBRLInput(String(Math.round(suggestedAmount * 100)))
    }
    return e
  }

  const [entry, setEntry] = useState<PaymentEntry>(initial ?? buildEmpty())
  const [error, setError] = useState('')

  const update = <K extends keyof PaymentEntry>(k: K, v: PaymentEntry[K]) => {
    setEntry((prev) => ({ ...prev, [k]: v }))
  }

  function handleSave() {
    const amount = parseBRLInput(entry.amount)
    if (!entry.type)                  return setError('Selecione o tipo de pagamento.')
    if (amount == null || amount <= 0) return setError('Informe um valor maior que zero.')
    setError('')
    onSave(entry)
  }

  // Campos condicionais por tipo
  const needsBank        = ['FINANCIAMENTO', 'BOLETO', 'TRANSFERENCIA', 'DUPLICATA', 'QUITACAO'].includes(entry.type)
  const needsCard        = entry.type === 'CARTAO_CREDITO' || entry.type === 'CARTAO_DEBITO'
  const needsParcelas    = ['CARTAO_CREDITO', 'FINANCIAMENTO', 'DUPLICATA'].includes(entry.type)
  const needsFirstDue    = ['FINANCIAMENTO', 'BOLETO', 'DUPLICATA'].includes(entry.type)
  const needsPix         = entry.type === 'PIX'
  // TRANSFERENCIA pra COMPRA precisa de Agência e Conta também
  const needsAgConta     = entry.type === 'TRANSFERENCIA'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">
            {initial ? 'Editar Pagamento' : 'Novo Pagamento'}
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-3">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={14} />{error}
            </div>
          )}

          <div className={isCompra ? '' : 'grid grid-cols-2 gap-3'}>
            <Field label="Tipo de pagamento" required>
              <select className={inputCls} value={entry.type} onChange={(e) => update('type', e.target.value as PaymentEntryType)}>
                {(isCompra ? COMPRA_TYPES : Object.keys(PAYMENT_ENTRY_LABELS) as PaymentEntryType[]).map((t) => (
                  <option key={t} value={t}>
                    {t === 'TRANSFERENCIA' && isCompra ? 'DOC / TED / TEF' : PAYMENT_ENTRY_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            {/* Status removido pra COMPRA — loja-paga-cliente é evento direto.
                Em VENDA/TROCA o Status continua útil para rastrear pendências. */}
            {!isCompra && (
              <Field label={isVendedorOnly ? 'Status (gerente/F&I altera)' : 'Status'}>
                <select
                  className={`${inputCls} ${isVendedorOnly ? 'cursor-not-allowed bg-gray-100 text-gray-500' : ''}`}
                  value={isVendedorOnly ? 'PENDENTE' : entry.status}
                  disabled={isVendedorOnly}
                  onChange={(e) => update('status', e.target.value as PaymentEntryStatus)}
                >
                  {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentEntryStatus[]).map((s) => (
                    <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {/* Placa do veículo — só aparece se houver mais de 1 veículo no negócio (lote) */}
          {vehiclePlates && vehiclePlates.length > 1 && (
            <Field label="Placa do veículo">
              <select
                className={inputCls}
                value={entry.vehiclePlate}
                onChange={(e) => update('vehiclePlate', e.target.value)}
              >
                <option value="">— selecione a placa —</option>
                {vehiclePlates.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)" required>
              <input
                className={inputCls}
                inputMode="numeric"
                placeholder="0,00"
                value={entry.amount}
                onChange={(e) => update('amount', maskBRLInput(e.target.value))}
              />
            </Field>
            <Field label="Data prevista de pagamento">
              <input
                className={inputCls}
                type="date"
                value={entry.dueDate}
                onChange={(e) => update('dueDate', e.target.value)}
              />
            </Field>
          </div>

          {entry.status === 'CONFIRMADO' && (
            <Field label="Data de pagamento">
              <input
                className={inputCls}
                type="date"
                value={entry.paidAt}
                onChange={(e) => update('paidAt', e.target.value)}
              />
            </Field>
          )}

          {/* Campos condicionais por tipo */}
          {needsBank && (
            <Field label="Banco / Financeira">
              <BankCombo value={entry.bank} onChange={(v) => update('bank', v)} placeholder="Buscar banco..." />
            </Field>
          )}

          {/* DOC/TED/TEF: precisa Agência e Conta (e CPF/CNPJ do favorecido) */}
          {needsAgConta && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Agência">
                <input
                  className={inputCls}
                  placeholder="0000"
                  value={entry.cardBrand /* reusa o campo como Agência pra evitar nova coluna no DealPayment */}
                  onChange={(e) => update('cardBrand', e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </Field>
              <Field label="Conta">
                <input
                  className={inputCls}
                  placeholder="00000-0"
                  value={entry.pixKey /* reusa o campo como Conta */}
                  onChange={(e) => update('pixKey', e.target.value)}
                />
              </Field>
            </div>
          )}

          {needsCard && (
            <Field label="Bandeira do cartão">
              <select className={inputCls} value={entry.cardBrand} onChange={(e) => update('cardBrand', e.target.value)}>
                <option value="">Selecione</option>
                <option value="VISA">Visa</option>
                <option value="MASTER">Mastercard</option>
                <option value="ELO">Elo</option>
                <option value="HIPER">Hipercard</option>
                <option value="AMEX">American Express</option>
                <option value="OUTRO">Outro</option>
              </select>
            </Field>
          )}

          {needsParcelas && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Nº de parcelas">
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    max={120}
                    placeholder="48"
                    value={entry.installments}
                    onChange={(e) => update('installments', e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
                <Field label="Valor da parcela (R$)">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    placeholder="Conforme a financeira"
                    value={entry.installmentValue}
                    onChange={(e) => update('installmentValue', maskBRLInput(e.target.value))}
                  />
                </Field>
                <Field label="Prazo entre parcelas (dias)">
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    max={365}
                    placeholder="30"
                    value={entry.installmentIntervalDays}
                    onChange={(e) => update('installmentIntervalDays', e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </div>
              <p className="text-[11px] text-gray-500 -mt-1">
                Valor e prazo devem ser cadastrados conforme retornar da financeira (sem cálculo automático).
              </p>
            </>
          )}

          {needsFirstDue && (
            <Field label="Primeiro vencimento">
              <input
                className={inputCls}
                type="date"
                value={entry.firstDueDate}
                onChange={(e) => update('firstDueDate', e.target.value)}
              />
            </Field>
          )}

          {/* Retorno (%) da financeira — só F&I/gerente/financeiro/master */}
          {needsBank && canEditFichaFields && (
            <Field label="Retorno da financeira (%)">
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder="ex.: 1,4"
                value={entry.returnPct}
                onChange={(e) => {
                  // aceita 0–6 com até 1 decimal (vírgula ou ponto)
                  const cleaned = e.target.value.replace(/[^\d.,]/g, '').replace('.', ',')
                  const [int, dec] = cleaned.split(',')
                  const safeInt = (int ?? '').slice(0, 1)  // 0..9 -> validamos depois
                  const safeDec = (dec ?? '').slice(0, 1)
                  const composed = safeDec !== undefined && cleaned.includes(',')
                    ? `${safeInt},${safeDec}`
                    : safeInt
                  // limite 0,1 a 6,0
                  const n = parseFloat(composed.replace(',', '.'))
                  if (!Number.isNaN(n) && n > 6) return update('returnPct', '6,0')
                  update('returnPct', composed)
                }}
              />
              <p className="text-[11px] text-gray-400 mt-1">Intervalo aceito: 0,1% a 6,0%.</p>
            </Field>
          )}

          {needsPix && (
            <Field label="Chave PIX">
              <input
                className={inputCls}
                placeholder="CPF, e-mail, telefone ou chave aleatória"
                value={entry.pixKey}
                onChange={(e) => update('pixKey', e.target.value)}
              />
            </Field>
          )}

          <Field label="Observações">
            <textarea
              className={`${inputCls} min-h-16 resize-y`}
              placeholder="Detalhes adicionais sobre este pagamento..."
              value={entry.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </Field>

          <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            <Paperclip size={13} className="mt-0.5 shrink-0" />
            <span>
              <strong>Comprovante (foto/PDF):</strong> após salvar a negociação,
              anexe o comprovante deste pagamento direto no <em>Resumo Financeiro</em> do
              detalhe — cada linha tem botão <em>Anexar</em>. Aceita JPG, PNG, WEBP, PDF e XML.
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Salvar pagamento
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ChangeModal (cadastro de troco) ───────────────────────────────────────
function ChangeModal({
  form,
  setField,
  excedente,
  onClose,
}: {
  form: DealForm
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
  excedente: number
  onClose:   () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">Cadastrar Troco</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Valor excedente detectado: <strong>{fmtBRL(excedente)}</strong>. Cadastre os dados do beneficiário.
          </div>
          <Field label="Valor do Troco (R$)" required>
            <input
              className={inputCls}
              inputMode="numeric"
              placeholder="0,00"
              value={form.changeAmount}
              onChange={(e) => setField('changeAmount', maskBRLInput(e.target.value))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Beneficiário">
              <input className={inputCls} placeholder="Nome do titular"
                value={form.changeBeneficiary}
                onChange={(e) => setField('changeBeneficiary', e.target.value)} />
            </Field>
            <Field label="CPF/CNPJ do Beneficiário">
              <input className={inputCls} placeholder="CPF ou CNPJ"
                value={form.changeBeneficiaryCpf}
                onChange={(e) => setField('changeBeneficiaryCpf', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Banco">
              <BankCombo value={form.changeBank} onChange={(v) => setField('changeBank', v)} />
            </Field>
            <Field label="Agência">
              <input className={inputCls} placeholder="0000"
                value={form.changeAgency}
                onChange={(e) => setField('changeAgency', e.target.value)} />
            </Field>
            <Field label="Conta">
              <input className={inputCls} placeholder="00000-0"
                value={form.changeAccount}
                onChange={(e) => setField('changeAccount', e.target.value)} />
            </Field>
          </div>
          <Field label="Chave PIX (opcional)">
            <input className={inputCls} placeholder="CPF, e-mail, telefone ou chave aleatória"
              value={form.changePix}
              onChange={(e) => setField('changePix', e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Salvar troco
          </button>
        </div>
      </div>
    </div>
  )
}

// ── StepPagamento (NOVA — 2 colunas profissional) ─────────────────────────
function StepPagamento({
  form,
  setField,
}: {
  form: DealForm
  setField: <K extends keyof DealForm>(k: K, v: DealForm[K]) => void
}) {
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string })?.role
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editing,     setEditing]     = useState<PaymentEntry | null>(null)
  const [trocoOpen,   setTrocoOpen]   = useState(false)

  // Placas de todos os veículos da negociação (lote multi-veículo)
  const vehiclePlates = [
    form.vehicle?.plate,
    form.tradeVehicle?.plate,
  ].filter((p): p is string => !!p && p.trim().length > 0)

  // ── Itens da Negociação ──────────────────────────────────────────────────
  const sale     = parseBRLInput(form.saleAmount)        ?? 0
  const purchase = parseBRLInput(form.purchaseAmount)    ?? 0
  const trade    = parseBRLInput(form.tradeValue)        ?? 0
  const docFee   = parseBRLInput(form.documentationFee)  ?? 0
  const discount = parseBRLInput(form.discountAmount)    ?? 0
  const payoff   = parseBRLInput(form.payoffAmount)      ?? 0
  const change   = parseBRLInput(form.changeAmount)      ?? 0
  const consignMin = parseBRLInput(form.consignMinValue) ?? 0

  // Veículos da negociação
  const veiculoVendido  = form.type === 'VENDA' || form.type === 'TROCA' ? form.vehicle      : null
  const veiculoCompra   = form.type === 'COMPRA' ? form.vehicle                              : null
  const veiculoTroca    = form.type === 'TROCA' ? form.tradeVehicle                          : null
  const veiculoConsig   = form.type === 'CONSIGNACAO' ? form.vehicle                         : null

  // Débitos por veículo (agrupados por vehicleRole)
  const debtsByRole = form.debts.reduce<Record<string, DebtEntry[]>>((acc, d) => {
    const k = d.vehicleRole || 'GERAL'
    if (!acc[k]) acc[k] = []
    acc[k].push(d)
    return acc
  }, {})

  // Débitos que entram no total (cliente paga / incluído na negociação)
  const debtsCliente = form.debts.reduce((s, d) => {
    const v = parseBRLInput(d.value) ?? 0
    return ['CLIENTE', 'COMPRADOR'].includes(String(d.responsavel ?? '').toUpperCase())
      ? s + v
      : s
  }, 0)

  // Total da operação
  //
  // COMPRA: a loja paga ao cliente pelo carro. O valor financeiro real que
  // a loja desembolsa é:
  //   purchase  (valor aprovado pelo gerente)
  // - débitosVendedor (débitos que o CLIENTE-vendedor paga → abate do valor)
  // + débitosComprador (débitos que a LOJA assume → soma ao custo)
  //
  // Por exemplo:
  //   purchase                 = R$ 110.000 (gerente aprovou)
  //   IPVA (cliente paga)      = R$ 4.520   → cliente recebe 105.480
  //   transferência (loja paga)= R$ 600     → loja desembolsa 110.600
  //
  // O `totalOperacao` mostra QUANTO a loja precisa cobrir em pagamentos.
  // Os pagamentos cadastrados (cash/Pix/transferência ao cliente) devem
  // somar exatamente esse valor — saldo zero permite finalizar.
  const debtsVendedor = form.debts.reduce((s, d) => {
    const v = parseBRLInput(d.value) ?? 0
    return ['VENDEDOR'].includes(String(d.responsavel ?? '').toUpperCase()) ? s + v : s
  }, 0)
  let totalOperacao = 0
  if (form.type === 'VENDA')             totalOperacao = sale + docFee + debtsCliente - discount
  // COMPRA: a loja paga ao CLIENTE a parte líquida do valor de compra.
  //   purchase           = valor aprovado pelo gerente (110.000)
  // - debtsVendedor      = débitos do cliente que ele abate (multa, IPVA dele)
  // - payoffCompra       = quitação do financiamento do veículo (loja paga
  //                        direto ao banco, sai do valor do cliente)
  // + debtsCliente       = débitos que a loja ASSUME por fora (ex: doc, taxas)
  //
  // Exemplo:
  //   purchase=110.000 - debtVend=132,90 - payoff=80.000 + debtLoja=4.520
  //   = 34.387,10 (total a desembolsar em pagamentos)
  else if (form.type === 'COMPRA') {
    const payoffCompra = parseBRLInput(form.vehicle?.payoffValue ?? '') ?? 0
    totalOperacao = Math.max(0, purchase - debtsVendedor - payoffCompra + debtsCliente)
  }
  else if (form.type === 'TROCA')        totalOperacao = (sale - trade) + docFee + debtsCliente - discount + payoff
  else if (form.type === 'CONSIGNACAO')  totalOperacao = consignMin

  // Pagamentos cadastrados (soma valor; descarta CANCELADO)
  const totalPagamentos = form.payments.reduce((s, p) => {
    if (p.status === 'CANCELADO') return s
    return s + (parseBRLInput(p.amount) ?? 0)
  }, 0)

  const diferenca = totalOperacao - totalPagamentos
  const emAberto  = diferenca > 0.01  ? diferenca         : 0
  const excedente = diferenca < -0.01 ? Math.abs(diferenca) : 0
  const trocoOk   = excedente === 0 || (change >= excedente - 0.01)

  // ── Handlers de pagamento ────────────────────────────────────────────────
  function handleAddPayment(p: PaymentEntry) {
    setField('payments', editing
      ? form.payments.map((x) => x.id === editing.id ? p : x)
      : [...form.payments, p]
    )
    setModalOpen(false)
    setEditing(null)
  }
  function handleRemovePayment(id: string) {
    if (!confirm('Remover este pagamento?')) return
    setField('payments', form.payments.filter((p) => p.id !== id))
  }
  function handleEditPayment(p: PaymentEntry) {
    setEditing(p)
    setModalOpen(true)
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Pagamentos</h2>
      <p className="mb-5 text-sm text-gray-500">
        Confira os itens à esquerda e cadastre os pagamentos à direita. O sistema calcula automaticamente o saldo.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* ─── COLUNA ESQUERDA: ITENS DA NEGOCIAÇÃO ─────────────────────── */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Car size={14} className="text-brand-600" />
              Itens da Negociação
            </h3>

            {/* Veículos vendidos */}
            {veiculoVendido && (sale > 0 || veiculoVendido.plate) && (
              <div className="mb-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {form.type === 'VENDA' ? 'Veículo vendido' : 'Veículo vendido ao cliente'}
                </p>
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {[veiculoVendido.brand, veiculoVendido.model, veiculoVendido.year].filter(Boolean).join(' ') || '—'}
                      </p>
                      {veiculoVendido.plate && (
                        <p className="text-xs text-gray-500 font-mono">{veiculoVendido.plate}</p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-gray-900 whitespace-nowrap">{fmtBRL(sale)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Veículo de troca (recebido) */}
            {veiculoTroca && (trade > 0 || veiculoTroca.plate) && (
              <div className="mb-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Veículo recebido na troca
                </p>
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {[veiculoTroca.brand, veiculoTroca.model, veiculoTroca.year].filter(Boolean).join(' ') || '—'}
                      </p>
                      {veiculoTroca.plate && (
                        <p className="text-xs text-gray-500 font-mono">{veiculoTroca.plate}</p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-blue-700 whitespace-nowrap">− {fmtBRL(trade)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Veículo de compra */}
            {veiculoCompra && (purchase > 0 || veiculoCompra.plate) && (
              <div className="mb-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Veículo comprado</p>
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {[veiculoCompra.brand, veiculoCompra.model, veiculoCompra.year].filter(Boolean).join(' ') || '—'}
                      </p>
                      {veiculoCompra.plate && (
                        <p className="text-xs text-gray-500 font-mono">{veiculoCompra.plate}</p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-gray-900 whitespace-nowrap">{fmtBRL(purchase)}</p>
                  </div>
                  {/* Quitação de financiamento — abate do valor pago ao cliente */}
                  {form.type === 'COMPRA' && veiculoCompra.hasFinancing && parseBRLInput(veiculoCompra.payoffValue ?? '') && (
                    <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 text-xs">
                      <span className="text-amber-700">
                        − Quitação financiamento
                        {veiculoCompra.payoffBank && <span className="ml-1 text-gray-500">({veiculoCompra.payoffBank})</span>}
                      </span>
                      <span className="font-semibold text-amber-700 whitespace-nowrap">
                        − {fmtBRL(parseBRLInput(veiculoCompra.payoffValue ?? '') ?? 0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Veículo consignação */}
            {veiculoConsig && consignMin > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Veículo consignado</p>
                <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {[veiculoConsig.brand, veiculoConsig.model, veiculoConsig.year].filter(Boolean).join(' ') || '—'}
                      </p>
                      {veiculoConsig.plate && (
                        <p className="text-xs text-gray-500 font-mono">{veiculoConsig.plate}</p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-purple-700 whitespace-nowrap">{fmtBRL(consignMin)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Débitos por veículo */}
            {form.debts.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Débitos</p>
                <div className="space-y-1.5">
                  {Object.entries(debtsByRole).map(([role, list]) => {
                    const subtotal = list.reduce((s, d) => s + (parseBRLInput(d.value) ?? 0), 0)
                    return (
                      <div key={role} className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                            {role === 'VENDIDO' ? 'Veículo vendido'
                              : role === 'TROCA'    ? 'Veículo recebido'
                              : role === 'COMPRADO' ? 'Veículo comprado'
                              : 'Geral'}
                          </p>
                          <p className="text-xs font-semibold text-amber-900">{fmtBRL(subtotal)}</p>
                        </div>
                        <div className="space-y-0.5">
                          {list.map((d, i) => (
                            <div key={i} className="flex items-center justify-between text-xs text-gray-700">
                              <span className="truncate">
                                {d.type} {d.description ? `· ${d.description}` : ''}
                                <span className="text-gray-400 ml-1">({d.responsavel || '—'})</span>
                              </span>
                              <span className="whitespace-nowrap font-medium">{fmtBRL(parseBRLInput(d.value) ?? 0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Serviços / Taxa de documentação */}
            {(docFee > 0 || discount > 0 || payoff > 0) && (
              <div className="mb-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Outros</p>
                <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-2.5 text-xs text-gray-700">
                  {docFee > 0 && (
                    <div className="flex items-center justify-between">
                      <span>Taxa de documentação</span>
                      <span className="font-medium">{fmtBRL(docFee)}</span>
                    </div>
                  )}
                  {payoff > 0 && (
                    <div className="flex items-center justify-between">
                      <span>Quitação de financiamento</span>
                      <span className="font-medium">{fmtBRL(payoff)}</span>
                    </div>
                  )}
                  {discount > 0 && (
                    <div className="flex items-center justify-between text-emerald-700">
                      <span>Desconto aprovado</span>
                      <span className="font-medium">− {fmtBRL(discount)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border-t border-gray-200 pt-3 mt-2">
              <div className="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-3 text-white">
                <span className="text-sm font-medium">Total da Operação</span>
                <span className="text-xl font-bold">{fmtBRL(totalOperacao)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── COLUNA DIREITA: PAGAMENTOS ─────────────────────────────────── */}
        <div className="lg:col-span-5 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <DollarSign size={14} className="text-brand-600" />
                Pagamentos
              </h3>
              <button
                type="button"
                onClick={() => { setEditing(null); setModalOpen(true) }}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <Plus size={13} />Novo Pagamento
              </button>
            </div>

            {/* Lista de pagamentos */}
            {form.payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 py-8 text-center text-xs text-gray-400">
                <DollarSign size={20} />
                <p>Nenhum pagamento cadastrado</p>
                <p>Clique em &quot;+ Novo Pagamento&quot; para adicionar</p>
              </div>
            ) : (
              <div className="space-y-2">
                {form.payments.map((p) => (
                  <div key={p.id} className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                            {PAYMENT_ENTRY_LABELS[p.type]}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_STATUS_COLOR[p.status]}`}>
                            {PAYMENT_STATUS_LABELS[p.status]}
                          </span>
                          {p.installments && (
                            <span className="text-[10px] text-gray-500">{p.installments}x</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-gray-900">{fmtBRL(parseBRLInput(p.amount) ?? 0)}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                          {p.dueDate && <span>Venc: {new Date(p.dueDate).toLocaleDateString('pt-BR')}</span>}
                          {p.bank && <span>· {p.bank}</span>}
                          {p.pixKey && <span>· Pix</span>}
                        </div>
                        {p.notes && <p className="mt-1 text-[11px] text-gray-400 italic truncate">{p.notes}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button type="button" onClick={() => handleEditPayment(p)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          title="Editar">
                          <Save size={12} />
                        </button>
                        <button type="button" onClick={() => handleRemovePayment(p.id)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Excluir">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Resumo financeiro */}
            <div className="mt-4 space-y-1 border-t border-gray-200 pt-3 text-xs">
              <div className="flex items-center justify-between text-gray-600">
                <span>Total pagamentos</span>
                <span className="font-semibold">{fmtBRL(totalPagamentos)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Total da operação</span>
                <span className="font-semibold">{fmtBRL(totalOperacao)}</span>
              </div>
            </div>

            {/* Banner Saldo */}
            <div className={`mt-3 rounded-lg border-2 p-3 ${
              emAberto > 0
                ? 'border-amber-300 bg-amber-50'
                : excedente > 0
                  ? (trocoOk ? 'border-emerald-300 bg-emerald-50' : 'border-blue-300 bg-blue-50')
                  : 'border-emerald-300 bg-emerald-50'
            }`}>
              {emAberto > 0 && (
                <>
                  <p className="text-xs font-semibold text-amber-900">Existe valor em aberto</p>
                  <p className="mt-0.5 text-base font-bold text-amber-900">{fmtBRL(emAberto)}</p>
                  <button
                    type="button"
                    onClick={() => { setEditing(null); setModalOpen(true) }}
                    className="mt-2 inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                  >
                    <Plus size={11} />Adicionar pagamento
                  </button>
                </>
              )}
              {excedente > 0 && (
                <>
                  <p className="text-xs font-semibold text-blue-900">Valor excedente</p>
                  <p className="mt-0.5 text-base font-bold text-blue-900">{fmtBRL(excedente)}</p>
                  {!trocoOk && (
                    <button
                      type="button"
                      onClick={() => setTrocoOpen(true)}
                      className="mt-2 inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                    >
                      <DollarSign size={11} />Cadastrar troco
                    </button>
                  )}
                  {trocoOk && (
                    <p className="mt-1 text-[11px] text-emerald-700">✓ Troco cadastrado em {fmtBRL(change)}</p>
                  )}
                </>
              )}
              {emAberto === 0 && excedente === 0 && (
                <p className="text-xs font-semibold text-emerald-900">✓ Saldo zerado — pronto para finalizar</p>
              )}
            </div>

            {/* Troco já cadastrado (resumo) */}
            {change > 0 && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Troco</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">{form.changeBeneficiary || '—'}</span>
                  <span className="font-bold text-gray-900">{fmtBRL(change)}</span>
                </div>
                <button type="button" onClick={() => setTrocoOpen(true)} className="mt-1 text-[10px] text-brand-600 hover:underline">
                  Editar troco
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modais */}
      {modalOpen && (
        <PaymentModal
          initial={editing ?? undefined}
          onSave={handleAddPayment}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          dealType={form.type}
          /* Pré-preenche com o que ainda falta cobrir (saldo em aberto).
             Só quando NÃO está editando — edição preserva o valor original. */
          suggestedAmount={!editing && emAberto > 0 ? emAberto : undefined}
          userRole={userRole}
          vehiclePlates={vehiclePlates}
        />
      )}
      {trocoOpen && (
        <ChangeModal
          form={form}
          setField={setField}
          excedente={excedente}
          onClose={() => setTrocoOpen(false)}
        />
      )}
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

// Linha rótulo/valor do resumo. Componente estático (só usa props) — definido em
// escopo de módulo para não ser recriado a cada render de StepResumo.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800">{value}</dd>
    </div>
  )
}

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

  // Pagamentos cadastrados (descarta cancelados)
  const activePayments  = form.payments.filter((p) => p.status !== 'CANCELADO')
  const totalPagamentos = activePayments.reduce((s, p) => s + (parseBRLInput(p.amount) ?? 0), 0)

  // Total da operação espelhando StepPagamento
  const sale     = parseBRLInput(form.saleAmount)        ?? 0
  const purchase = parseBRLInput(form.purchaseAmount)    ?? 0
  const trade    = parseBRLInput(form.tradeValue)        ?? 0
  const docFee   = parseBRLInput(form.documentationFee)  ?? 0
  const discount = parseBRLInput(form.discountAmount)    ?? 0
  const payoff   = parseBRLInput(form.payoffAmount)      ?? 0
  const debtsCliente  = form.debts.reduce((s, d) => {
    const v = parseBRLInput(d.value) ?? 0
    return ['CLIENTE', 'COMPRADOR'].includes(String(d.responsavel ?? '').toUpperCase()) ? s + v : s
  }, 0)
  const debtsVendedor = form.debts.reduce((s, d) => {
    const v = parseBRLInput(d.value) ?? 0
    return String(d.responsavel ?? '').toUpperCase() === 'VENDEDOR' ? s + v : s
  }, 0)
  let totalOperacao = 0
  if (form.type === 'VENDA')             totalOperacao = sale + docFee + debtsCliente - discount
  else if (form.type === 'COMPRA') {
    const payoffCompra = parseBRLInput(form.vehicle?.payoffValue ?? '') ?? 0
    totalOperacao = Math.max(0, purchase - debtsVendedor - payoffCompra + debtsCliente)
  }
  else if (form.type === 'TROCA')        totalOperacao = (sale - trade) + docFee + debtsCliente - discount + payoff
  else if (form.type === 'CONSIGNACAO')  totalOperacao = parseBRLInput(form.consignMinValue) ?? 0

  const saldo = totalOperacao - totalPagamentos

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

        {/* Pagamentos detalhados — só aparece se houver pagamentos cadastrados */}
        {activePayments.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Pagamentos ({activePayments.length})
            </p>
            <ul className="divide-y divide-gray-200">
              {activePayments.map((p) => {
                const installments = p.installments ? Number(p.installments) : 0
                const installmentValue = parseBRLInput(p.installmentValue) ?? 0
                return (
                  <li key={p.id} className="py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-800">
                          {PAYMENT_ENTRY_LABELS[p.type] ?? p.type}
                          {p.vehiclePlate && (
                            <span className="ml-2 rounded-full bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-700">
                              {p.vehiclePlate}
                            </span>
                          )}
                          {p.status && p.status !== 'PENDENTE' && (
                            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PAYMENT_STATUS_COLOR[p.status]}`}>
                              {PAYMENT_STATUS_LABELS[p.status]}
                            </span>
                          )}
                        </p>
                        <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                          {p.bank && <div>Banco: <span className="text-gray-800">{p.bank}</span></div>}
                          {installments > 0 && (
                            <div>
                              Parcelas: <span className="text-gray-800">{installments}x</span>
                              {installmentValue > 0 && <> · {fmtBRL(installmentValue)} cada</>}
                              {p.installmentIntervalDays && <> · a cada {p.installmentIntervalDays} dias</>}
                            </div>
                          )}
                          {p.firstDueDate && <div>1º vencimento: <span className="text-gray-800">{fmtDate(p.firstDueDate)}</span></div>}
                          {p.dueDate      && !p.firstDueDate && <div>Previsto p/: <span className="text-gray-800">{fmtDate(p.dueDate)}</span></div>}
                          {p.paidAt       && <div>Pago em: <span className="text-gray-800">{fmtDate(p.paidAt)}</span></div>}
                          {p.returnPct    && <div>Retorno financeira: <span className="font-medium text-emerald-700">{p.returnPct}%</span></div>}
                          {p.pixKey       && <div>PIX: <span className="font-mono text-gray-800">{p.pixKey}</span></div>}
                          {p.cardBrand    && <div>Bandeira: <span className="text-gray-800">{p.cardBrand}</span></div>}
                          {p.notes        && <div className="text-gray-500 italic">{p.notes}</div>}
                        </div>
                      </div>
                      <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
                        {fmtBRL(p.amount)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Troco — bloco destacado pro financeiro ver valor + dados bancários */}
        {(form.changeAmount || form.changeBeneficiary || form.changePix || form.changeBank) && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Troco a pagar ao cliente
                </p>
                <p className="mt-0.5 text-[11px] text-amber-700/80">
                  Financeiro: use estes dados para efetuar o pagamento.
                </p>
              </div>
              {form.changeAmount && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-amber-700">Valor</p>
                  <p className="text-xl font-bold text-amber-900">{fmtBRL(form.changeAmount)}</p>
                </div>
              )}
            </div>

            <dl className="space-y-1.5 text-sm text-amber-900">
              {form.changeBeneficiary    && <Row label="Beneficiário"        value={form.changeBeneficiary} />}
              {form.changeBeneficiaryCpf && <Row label="CPF/CNPJ"            value={form.changeBeneficiaryCpf} />}
            </dl>

            {/* Dados bancários (só aparece se algum estiver preenchido) */}
            {(form.changeBank || form.changeAgency || form.changeAccount) && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-white/60 p-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Conta para depósito / transferência
                </p>
                <dl className="space-y-1 text-sm text-amber-900">
                  {form.changeBank    && <Row label="Banco"   value={form.changeBank} />}
                  {form.changeAgency  && <Row label="Agência" value={form.changeAgency} />}
                  {form.changeAccount && <Row label="Conta"   value={form.changeAccount} />}
                </dl>
              </div>
            )}

            {form.changePix && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-white/60 p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  Chave PIX
                </p>
                <p className="break-all font-mono text-sm text-amber-900">{form.changePix}</p>
              </div>
            )}
          </div>
        )}

        {/* Totais consolidados — sempre aparece quando há totalOperacao calculável */}
        {totalOperacao > 0 && (
          <div className={`rounded-xl border-2 p-4 ${
            Math.abs(saldo) < 0.01
              ? 'border-emerald-300 bg-emerald-50'
              : saldo > 0
                ? 'border-amber-300 bg-amber-50'
                : 'border-blue-300 bg-blue-50'
          }`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Totais</p>
            <dl className="space-y-1.5 text-sm">
              <Row label="Total da operação" value={fmtBRL(totalOperacao)} />
              <Row label="Total pagamentos"  value={fmtBRL(totalPagamentos)} />
              <div className="flex justify-between border-t border-current/20 pt-2 text-base font-bold">
                <dt className="text-gray-700">
                  {Math.abs(saldo) < 0.01 ? 'Saldo' : saldo > 0 ? 'Em aberto' : 'Excedente (troco)'}
                </dt>
                <dd className={
                  Math.abs(saldo) < 0.01 ? 'text-emerald-700'
                    : saldo > 0 ? 'text-amber-800' : 'text-blue-800'
                }>
                  {fmtBRL(Math.abs(saldo))}
                </dd>
              </div>
            </dl>
          </div>
        )}

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
  const { data: sessionTop } = useSession()
  const userRole = sessionTop?.user?.role ?? ''
  // Vendedores não podem alterar o valor do veículo diretamente — para isso
  // existe (ou existirá) o workflow de solicitação de desconto (Fase 2).
  const lockVehicleValue = userRole === 'VENDEDOR' || userRole === 'VENDEDOR_LIDER'

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
          whatsapp:   !!p?.whatsapp,
          cep:         p?.cep         ? formatCEP(p.cep) : '',
          logradouro:  p?.logradouro  ?? '',
          numero:      p?.numero      ?? '',
          complemento: p?.complemento ?? '',
          bairro:      p?.bairro      ?? '',
          cidade:      p?.cidade      ?? c?.city  ?? '',
          estado:      p?.estado      ?? c?.state ?? '',
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
          // Reconstrói o array `payments` a partir dos dados legados pra
          // que o usuário veja seus pagamentos antigos quando reabrir a edição.
          payments: (() => {
            const list: PaymentEntry[] = []
            const signal = parseBRLInput(num(d.signalAmount))
            if (signal && signal > 0) {
              list.push({
                ...EMPTY_PAYMENT(),
                type: 'SINAL',
                status: 'CONFIRMADO',
                amount: num(d.signalAmount),
                bank: d.paymentBank ?? '',
              })
            }
            const financed = parseBRLInput(num(d.financedAmount))
            if (financed && financed > 0) {
              list.push({
                ...EMPTY_PAYMENT(),
                type: 'FINANCIAMENTO',
                status: 'PENDENTE',
                amount: num(d.financedAmount),
                bank: d.paymentBank ?? '',
              })
            }
            return list
          })(),
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
        // Usa o novo modelo: total cadastrado = soma dos pagamentos do array
        // form.payments (descartando CANCELADO).
        if (errs.length === 0 && (form.type === 'VENDA' || form.type === 'TROCA')) {
          const sale     = parseBRLInput(form.saleAmount)       ?? 0
          const trade    = parseBRLInput(form.tradeValue)       ?? 0
          const docFee   = parseBRLInput(form.documentationFee) ?? 0
          const discount = parseBRLInput(form.discountAmount)   ?? 0
          const payoff   = parseBRLInput(form.payoffAmount)     ?? 0
          const change   = parseBRLInput(form.changeAmount)     ?? 0
          // Débitos que o cliente paga / são incluídos na negociação
          const debtsCliente = form.debts.reduce((s, d) => {
            const v = parseBRLInput(d.value) ?? 0
            return ['CLIENTE', 'COMPRADOR'].includes(String(d.responsavel ?? '').toUpperCase())
              ? s + v
              : s
          }, 0)

          const expected = form.type === 'VENDA'
            ? sale + docFee + debtsCliente - discount
            : (sale - trade) + docFee + debtsCliente - discount + payoff
          // Soma do array de pagamentos profissional
          const cadastrado = form.payments.reduce((s, p) => {
            if (p.status === 'CANCELADO') return s
            return s + (parseBRLInput(p.amount) ?? 0)
          }, 0)
          const diff = expected - cadastrado

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
      // Os campos legados signalAmount/financedAmount/paymentType/paymentBank
      // são DERIVADOS do array form.payments (novo modelo multi-pagamento)
      // — backend continua aceitando shape antigo sem mudanças.
      signalAmount:     (() => {
        const sum = form.payments
          .filter((p) => p.status !== 'CANCELADO' && (p.type === 'SINAL' || p.type === 'ENTRADA' || p.type === 'DINHEIRO' || p.type === 'PIX'))
          .reduce((s, p) => s + (parseBRLInput(p.amount) ?? 0), 0)
        return sum > 0 ? sum : parseBRLInput(form.signalAmount)
      })(),
      financedAmount:   (() => {
        const sum = form.payments
          .filter((p) => p.status !== 'CANCELADO' && p.type === 'FINANCIAMENTO')
          .reduce((s, p) => s + (parseBRLInput(p.amount) ?? 0), 0)
        return sum > 0 ? sum : parseBRLInput(form.financedAmount)
      })(),
      documentationFee: parseBRLInput(form.documentationFee),
      discountAmount:   parseBRLInput(form.discountAmount),
      tradeValue:       parseBRLInput(form.tradeValue),
      changeAmount:     parseBRLInput(form.changeAmount),
      payoffAmount:     parseBRLInput(form.payoffAmount),
      payoffBank:       form.payoffBank       || null,
      paymentType:      (form.payments.find((p) => p.status !== 'CANCELADO')?.type ?? form.paymentType) || null,
      paymentBank:      (form.payments.find((p) => p.bank)?.bank ?? form.paymentBank) || null,
      // Novo array completo de pagamentos — backend pode persistir se aceitar
      payments:         form.payments
        .filter((p) => p.status !== 'CANCELADO')
        .map((p) => ({
          type:         p.type,
          status:       p.status,
          amount:       parseBRLInput(p.amount) ?? 0,
          dueDate:      p.dueDate      || null,
          paidAt:       p.paidAt       || null,
          bank:         p.bank         || null,
          cardBrand:    p.cardBrand    || null,
          installments: p.installments ? Number(p.installments) : null,
          installmentValue:        parseBRLInput(p.installmentValue) ?? null,
          installmentIntervalDays: p.installmentIntervalDays ? Number(p.installmentIntervalDays) : null,
          firstDueDate: p.firstDueDate || null,
          returnPct:    p.returnPct ? parseFloat(p.returnPct.replace(',', '.')) : null,
          vehiclePlate: p.vehiclePlate || null,
          pixKey:       p.pixKey       || null,
          notes:        p.notes        || null,
        })),
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
            lockVehicleValue={lockVehicleValue}
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
