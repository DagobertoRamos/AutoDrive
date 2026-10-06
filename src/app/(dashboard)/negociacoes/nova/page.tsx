'use client'

// =============================================================================
// /negociacoes/nova — Wizard multi-step 8 etapas de criação de negociação
// =============================================================================

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { GATE_NEGOTIATION, isGate, sameLabel, STAGE_SERVICES } from '@/lib/stock/intake-core'
import { formatCPF, normalizeCPF, isValidCPF } from '@/lib/br-docs/cpf'
import { formatCNPJ, normalizeCNPJ, isValidCNPJ } from '@/lib/br-docs/cnpj'
import { formatPhone, normalizePhone, isValidPhone } from '@/lib/br-docs/phone'
import { formatCEP, normalizeCEP, isCEPComplete } from '@/lib/br-docs/cep'
import { BankCombo } from '@/components/forms/BankCombo'
import { RequiredMark } from '@/components/ui/field'
import { HelpHint } from '@/components/ui/help-hint'
import { DEAL_HINTS } from '@/lib/glossary-deals'
import { isValidPlate, normalizePlate, formatPlate } from '@/lib/vehicles/plate'
import { draftTitle } from '@/lib/negotiation-drafts'
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
  Pencil,
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
  /** Vencimento (ex.: boleto de quitação). */
  dueDate?:    string
  /** Boleto/comprovante anexado (vinculado ao débito ao salvar). */
  receipt?:    { storageKey: string; publicUrl: string; fileName: string; fileType: string; mimeType: string; fileSize: number } | null
  /** Débito gerado sozinho a partir da quitação do veículo da troca. */
  auto?:       'QUITACAO_TROCA'
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
  /** Vencimento do boleto de quitação. */
  payoffDueDate?: string
  /** Boleto de quitação anexado. */
  payoffReceipt?: { storageKey: string; publicUrl: string; fileName: string; fileType: string; mimeType: string; fileSize: number } | null
  notes:          string
  vehicleId:      string | null
  evaluationId:   string | null
}

/** 2º, 3º… veículo da negociação (vendido, comprado ou recebido na troca). */
type ExtraVehicle = VehicleFields & { key: string }

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
  /** Forma do sinal/entrada (PIX, DINHEIRO, CARTAO_CREDITO…). */
  signalMethod?:      string
  /** Código de autorização do cartão (obrigatório quando há comprovante). */
  authorizationCode?: string
  /** Comprovante enviado no modal (vinculado ao pagamento ao salvar). */
  receipt?: { storageKey: string; publicUrl: string; fileName: string; fileType: string; mimeType: string; fileSize: number } | null
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
  /** Mais veículos do mesmo papel do principal (vendidos ou comprados). */
  extraVehicles:      ExtraVehicle[]
  /** Mais veículos recebidos na troca. */
  extraTradeVehicles: ExtraVehicle[]
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
  // Esteira de entrada: avaliação que já virou carro no estoque
  status?:             string | null
  modelYear?:          number | null
  manufactureYear?:    number | null
  suggestedSalePrice?: number | string | null
  vehicleId?:          string | null
  vehicle?:            { id: string; stockStatus: string | null; salePrice: number | string | null; purchasePrice: number | string | null } | null
}

/** Ano da avaliação (a API devolve modelo/fabricação; `year` é legado). */
const evalYear = (ev: EvaluationItem) => ev.modelYear ?? ev.manufactureYear ?? ev.year ?? null
const moneyMask = (v: number | string | null | undefined) => (v == null || v === '' ? '' : maskBRLInput(String(Math.round(Number(v) * 100))))

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
  extraVehicles: [], extraTradeVehicles: [],
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
  help,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  /** "?" com a explicação do termo (HelpHint). */
  help?: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-sm font-medium text-gray-700">
        {label} {required && <RequiredMark />}{help}
      </label>
      {children}
    </div>
  )
}

// ── VehicleCard — card rico com detalhes do veículo ──────────────────────────

/**
 * Reconstrói o card do veículo do estoque a partir do que já está no form.
 * O objeto rico da busca vive só enquanto a etapa está montada; sem isto o
 * veículo "sumia" ao voltar de etapa, editar a negociação ou abrir rascunho —
 * e só o usuário pode remover um veículo selecionado.
 */
/** Status em que "Salvar e Reenviar" manda a negociação de volta para aprovação. */
const RESUBMITTABLE = new Set(['RASCUNHO', 'EM_PREENCHIMENTO', 'REABERTA', 'DEVOLVIDA_PARA_CORRECAO'])

function stockFromForm(v: VehicleFields): StockVehicle | null {
  if (!v.vehicleId) return null
  const year = v.year ? Number(v.year) : null
  return {
    id: v.vehicleId, plate: v.plate || null, brand: v.brand || null, model: v.model || null,
    version: v.version || null, year, modelYear: year, km: v.km ? Number(v.km) : null,
    color: v.color || null, fuel: v.fuel || null, conditionType: null,
    salePrice: parseBRLInput(v.vehicleValue) ?? null, fipeValue: parseBRLInput(v.fipeValue) ?? null,
    stockStatus: '', cautelarStatus: null, mainPhotoUrl: null, entryDate: null,
    stockPendencies: [], _count: { photos: 0, stockPendencies: 0 },
  }
}

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
  // Carro ainda na esteira de entrada (compra, perícia, recebimento…): pode
  // vender, mas com aviso em destaque do que falta.
  const intakeOpen = (v.stockPendencies ?? []).filter((p) => p.option?.label && (isGate(p.option.label) || sameLabel(p.option.label, STAGE_SERVICES))).map((p) => p.option.label)
  const inPrep = intakeOpen.length > 0 || v.stockStatus === 'PENDENTE_PREPARACAO' || v.stockStatus === 'EM_SERVICO'

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
      {inPrep && (
        <div role="alert" className="mb-2 flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-[11px] text-orange-900">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-orange-600" />
          <span className="leading-snug">
            <strong>Ainda na preparação de entrada</strong>
            {intakeOpen.length > 0 ? <> — pendente: <strong>{intakeOpen.join(', ')}</strong></> : v.stockStatus === 'EM_SERVICO' ? ' — serviços em andamento' : ''}.
            {' '}Pode vender, mas confira antes de prometer prazo de entrega.
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

/** A loja ainda não concluiu a compra/troca deste carro (portão "Negociação de entrada" aberto). */
const entryPending = (v: StockVehicle) => (v.stockPendencies ?? []).some((p) => p.option?.label && sameLabel(p.option.label, GATE_NEGOTIATION))

/** Por que um carro encontrado na busca ainda não pode ser vendido. */
function notSellableReasons(v: StockVehicle, requireSalePrice: boolean): string[] {
  const r: string[] = []
  if (requireSalePrice && entryPending(v)) r.push('A compra/troca deste carro ainda não foi concluída (negociação de entrada pendente) — se é o carro que o cliente está entregando, adicione-o em "Veículo recebido na troca".')
  if (v.stockStatus === 'BLOQUEADO') r.push('Bloqueado no estoque.')
  if (v.stockStatus === 'EM_PRECIFICACAO') r.push('Em precificação: o gerente precisa definir o preço de venda no Estoque.')
  else if (requireSalePrice && !(v.salePrice != null && Number(v.salePrice) > 0)) r.push('Sem preço de venda: o gerente precisa precificar no Estoque.')
  if (requireSalePrice && v.hasOpenNegotiation) r.push(`Já está em outra negociação${v.openNegotiationNumber ? ` (nº ${v.openNegotiationNumber})` : ''}${v.openNegotiationSeller ? ` com ${v.openNegotiationSeller}` : ''}.`)
  // Pendências da esteira não impedem a venda (aviso no cartão); só entram aqui
  // como informação quando o carro já está bloqueado por outro motivo.
  const pend = (v.stockPendencies ?? []).map((p) => p.option?.label).filter(Boolean)
  if (r.length && pend.length) r.push(`Pendente na esteira: ${pend.join(', ')}.`)
  return r
}

function VehicleInlineSearch({
  selected,
  onSelect,
  onClear,
  label,
  requireSalePrice,
  excludeIds,
}: {
  selected: StockVehicle | null
  onSelect: (v: StockVehicle) => void
  onClear: () => void
  label: string
  /** Quando true, oculta veículos sem preço de venda definido (não-liberados). */
  requireSalePrice?: boolean
  /** Carros que já estão nesta negociação (não aparecem de novo). */
  excludeIds?: Array<string | null | undefined>
}) {
  const [query,    setQuery]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [results,  setResults]  = useState<StockVehicle[]>([])
  const [blocked,  setBlocked]  = useState<Array<{ v: StockVehicle; reasons: string[] }>>([])
  const [searched, setSearched] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  // Cada letra dispara uma busca; só a resposta da ÚLTIMA vale (uma antiga,
  // ex.: de "H", não pode sobrescrever a de "HB20").
  const seq = useRef(0)
  const excludeRef = useRef(excludeIds)
  useEffect(() => { excludeRef.current = excludeIds })

  const doSearch = useCallback(async (q: string) => {
    const my = ++seq.current
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
      if (my !== seq.current) return
      if (!res.ok || data?.success === false) {
        setError(data?.error || `Falha ao buscar veículos (HTTP ${res.status}).`)
        setResults([])
        return
      }
      const list: StockVehicle[] = Array.isArray(data?.data) ? data.data : []
      // Só ocultamos o que efetivamente saiu do estoque. Status nulos ou
      // desconhecidos passam (defesa contra dados antigos sem stockStatus).
      const HIDDEN_STATUSES = new Set(['VENDIDO', 'CANCELADO', 'DEVOLVIDO', 'BLOQUEADO', 'EM_PRECIFICACAO'])
      const taken = new Set((excludeRef.current ?? []).filter(Boolean) as string[])
      const visible = list
        .filter((v) => !taken.has(v.id))
        .filter((v) => !v.stockStatus || !HIDDEN_STATUSES.has(v.stockStatus))
        // Pra VENDA: só veículos liberados (com preço de venda definido pelo gerente).
        .filter((v) => !requireSalePrice || (v.salePrice != null && Number(v.salePrice) > 0))
        // Pra VENDA: oculta veículos já vinculados a outra negociação ATIVA
        // (AGUARDANDO_APROVACAO, APROVADA, AGUARDANDO_FINANCEIRO, FINALIZADA etc).
        // Sem isso, o mesmo Gol aparece pra vender 2x. Selecionado atual continua
        // visível (não some quando o user já escolheu).
        .filter((v) => !requireSalePrice || !v.hasOpenNegotiation || v.id === selected?.id)
        // Carro que a loja ainda não comprou (negociação de entrada aberta) não pode sair.
        .filter((v) => !requireSalePrice || !entryPending(v) || v.id === selected?.id)
      visible.sort((a, b) => {
        const aLock = a.hasOpenNegotiation ? 1 : 0
        const bLock = b.hasOpenNegotiation ? 1 : 0
        return aLock - bLock
      })
      // Top-3 mais recentes quando vazio (search inicial)
      const final = isInitial ? visible.slice(0, 3) : visible
      setResults(final)
      // Com busca: o que bateu mas ainda não pode ser vendido aparece com o motivo
      // (em vez de sumir sem explicação) — ex.: carro recém-avaliado na esteira.
      const shown = new Set(final.map((v) => v.id))
      const GONE = new Set(['VENDIDO', 'CANCELADO', 'DEVOLVIDO'])
      setBlocked(isInitial ? [] : list
        .filter((v) => !shown.has(v.id) && !taken.has(v.id) && !(v.stockStatus && GONE.has(v.stockStatus)))
        .map((v) => ({ v, reasons: notSellableReasons(v, !!requireSalePrice) }))
        .filter((x) => x.reasons.length > 0))
    } catch (e) {
      if (my !== seq.current) return
      setError(e instanceof Error ? e.message : 'Erro de rede ao buscar veículos.')
      setResults([])
      setBlocked([])
    } finally {
      if (my === seq.current) setLoading(false)
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

      {/* Resultados em cards — com carro escolhido, digitar busca outro para trocar */}
      {(!selected || query.trim().length > 0) && (
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
              {blocked.length ? 'Nenhum veículo liberado para venda nesta busca — veja abaixo o que falta.' : 'Nenhum veículo encontrado para esta busca.'}
            </div>
          )}
          {!loading && results.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {results.filter((v) => v.id !== selected?.id).map((v) => (
                <VehicleCard key={v.id} v={v} onSelect={() => { onSelect(v); setQuery('') }} />
              ))}
            </div>
          )}
          {!loading && blocked.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Encontrados, mas ainda não liberados para venda</p>
              {blocked.map(({ v, reasons }) => (
                <div key={v.id} className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-700">{[v.brand, v.model, v.version, v.modelYear ?? v.year].filter(Boolean).join(' ')}{v.plate && <span className="ml-2 font-mono text-xs text-gray-500">{v.plate}</span>}</p>
                    <Link href={`/estoque/${v.id}`} target="_blank" className="text-xs font-medium text-brand-700 hover:underline">Abrir no estoque</Link>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-amber-800">{reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
                </div>
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

  const evalSeq = useRef(0)
  const doSearch = useCallback(async (q: string) => {
    const my = ++evalSeq.current
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
      if (my !== evalSeq.current) return
      setResults(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [])
    } catch {
      if (my === evalSeq.current) setResults([])
    } finally {
      if (my === evalSeq.current) setLoading(false)
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
          <h3 className="font-semibold text-gray-900">Veículos avaliados e liberados</h3>
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
                      {[ev.brand, ev.model, evalYear(ev)].filter(Boolean).join(' ')}
                      {ev.plate && <span className="ml-1.5 font-mono text-xs text-gray-500">· {ev.plate}</span>}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Aprovada
                    </span>
                    {ev.vehicle && (
                      <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800" title="Já entrou no estoque pela esteira; aguarda a negociação de entrada">
                        No estoque
                      </span>
                    )}
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

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Tipo de Negociação</h2>

      {/* Unidade */}
      {units.length > 1 && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100 pb-1">
            Unidade responsável <RequiredMark />
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
          Tipo de negociação <RequiredMark />
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

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

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
          {isPF ? 'CPF' : 'CNPJ'} <RequiredMark />
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
          <span>Cliente já cadastrado.</span>
        </div>
      )}

      {/* Banner: não encontrado */}
      {docStatus === 'not_found' && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info size={14} className="shrink-0" />
          <span>Cliente não cadastrado.</span>
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
            <Field label="RG" required>
              <input
                className={inputCls}
                value={form.rg}
                onChange={(e) => setField('rg', e.target.value)}
                placeholder="00.000.000-0"
              />
            </Field>
            <Field label="Data de nascimento" required>
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
              Responsável já cadastrado.
            </div>
          )}
          {socioAdmCpfStatus === 'not_found' && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <Info size={13} className="shrink-0" />
              Responsável não cadastrado.
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
            <Field label="Celular" required>
              <input
                className={inputCls}
                value={form.socioAdmPhone}
                onChange={(e) => setField('socioAdmPhone', formatPhone(e.target.value))}
                placeholder="(00) 00000-0000"
              />
            </Field>
            <Field label="E-mail" required>
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
              <Field label="CEP" required>
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
          <Field label="Logradouro" required>
            <input
              className={inputCls}
              placeholder="Rua, Avenida..."
              value={form.socioAdmLogradouro}
              onChange={(e) => setField('socioAdmLogradouro', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Número" required>
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
            <Field label="Bairro" required>
              <input
                className={inputCls}
                value={form.socioAdmBairro}
                onChange={(e) => setField('socioAdmBairro', e.target.value)}
                placeholder="Bairro"
              />
            </Field>
            <Field label="Cidade" required>
              <input
                className={inputCls}
                value={form.socioAdmCidade}
                onChange={(e) => setField('socioAdmCidade', e.target.value)}
                placeholder="Cidade"
              />
            </Field>
            <Field label="Estado" required>
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
              Celular <RequiredMark />
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
            <label className="block text-sm font-medium text-gray-700">E-mail <RequiredMark /></label>
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
            <Field label="CEP" required>
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
        <Field label="Logradouro" required>
          <input
            className={inputCls}
            placeholder="Rua, Avenida, etc."
            value={form.logradouro}
            onChange={(e) => setField('logradouro', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Número" required>
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
          <Field label="Bairro" required>
            <input
              className={inputCls}
              placeholder="Bairro"
              value={form.bairro}
              onChange={(e) => setField('bairro', e.target.value)}
            />
          </Field>
          <Field label="Cidade" required>
            <input
              className={inputCls}
              placeholder="Cidade"
              value={form.cidade}
              onChange={(e) => setField('cidade', e.target.value)}
            />
          </Field>
          <Field label="Estado" required>
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
            <Field label="Valor Avaliado (R$)" help={<HelpHint {...DEAL_HINTS.VALOR_AVALIADO} size={12} />}>
              <input
                className={inputCls}
                placeholder="0,00"
                value={data.evaluatedValue}
                onChange={(e) => onChange('evaluatedValue', maskBRLInput(e.target.value))}
              />
            </Field>
            <Field label="Tabela FIPE (R$)" help={<HelpHint term="FIPE" size={12} />}>
              <input
                className={inputCls}
                placeholder="0,00"
                value={data.fipeValue}
                onChange={(e) => onChange('fipeValue', maskBRLInput(e.target.value))}
              />
            </Field>
            <Field label="Valor Aceito (R$)" help={<HelpHint {...DEAL_HINTS.VALOR_ACORDADO} size={12} />}>
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
              <Field label="Valor de Quitação (R$)" help={<HelpHint {...DEAL_HINTS.QUITACAO} size={12} />}>
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
            <p className="mt-1 text-xs text-gray-500">Solicite desconto para alterar o valor.</p>
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
  const [pickedStock, setSelectedStock] = useState<StockVehicle | null>(null)
  const selectedStock = form.vehicle.vehicleId
    ? (pickedStock?.id === form.vehicle.vehicleId ? pickedStock : stockFromForm(form.vehicle))
    : null
  // Veículos vindos de avaliação: na edição/rascunho o evaluationId pode não
  // vir junto, então "tem veículo" = há dados do veículo no form.
  const hasMainVehicle  = !!(form.vehicle.evaluationId || form.vehicle.plate || form.vehicle.brand)
  const hasTradeVehicle = !!(form.tradeVehicle.evaluationId || form.tradeVehicle.plate || form.tradeVehicle.brand)
  // Placa da troca: editável só quando a avaliação veio sem placa válida
  // (mantém o campo aberto enquanto o usuário digita).
  const [plateEditEvalId, setPlateEditEvalId] = useState<string | null>(null)
  const tradeEvalId = form.tradeVehicle.evaluationId
  const tradePlateEditable = !!tradeEvalId && (plateEditEvalId === tradeEvalId || !isValidPlate(form.tradeVehicle.plate))

  // ── Vários veículos ────────────────────────────────────────────────────────
  /** Soma valores mascarados (R$) e devolve mascarado ('' quando zero). */
  const sumBRL = (vals: Array<string | undefined>) => {
    const t = vals.reduce((acc, v) => acc + (parseBRLInput(v ?? '') ?? 0), 0)
    return t > 0 ? maskBRLInput(String(Math.round(t * 100))) : ''
  }
  const [addingOut, setAddingOut] = useState(false)
  const [showEvalModalTradeExtra, setShowEvalModalTradeExtra] = useState(false)
  const [showEvalModalCompraExtra, setShowEvalModalCompraExtra] = useState(false)
  const outIds = [form.vehicle.vehicleId, ...form.extraVehicles.map((x) => x.vehicleId)]

  /** Mais um carro do estoque saindo (VENDA/TROCA). */
  const addOutStock = (v: StockVehicle) => {
    if (outIds.includes(v.id)) { alert('Este veículo já está nesta negociação.'); return }
    const x: ExtraVehicle = {
      ...EMPTY_VEHICLE, key: genId(), vehicleId: v.id,
      plate: v.plate ?? '', brand: v.brand ?? '', model: v.model ?? '', version: v.version ?? '',
      year: v.modelYear ?? v.year ? String(v.modelYear ?? v.year) : '', km: v.km != null ? String(v.km) : '',
      color: v.color ?? '', fuel: v.fuel ?? '', vehicleValue: moneyMask(v.salePrice),
    }
    const list = [...form.extraVehicles, x]
    setField('extraVehicles', list)
    setField('saleAmount', sumBRL([form.vehicle.vehicleValue, ...list.map((e) => e.vehicleValue)]))
    setAddingOut(false)
  }
  const removeOut = (key: string) => {
    const list = form.extraVehicles.filter((x) => x.key !== key)
    setField('extraVehicles', list)
    if (form.type === 'COMPRA') setField('purchaseAmount', sumBRL([form.vehicle.vehicleValue, ...list.map((e) => e.vehicleValue)]))
    else setField('saleAmount', sumBRL([form.vehicle.vehicleValue, ...list.map((e) => e.vehicleValue)]))
  }
  const evalTaken = (ev: EvaluationItem, list: VehicleFields[]) =>
    list.some((v) => (ev.id && v.evaluationId === ev.id) || (!!ev.plate && normalizePlate(v.plate) === normalizePlate(ev.plate)))
  const vehicleFromEval = (ev: EvaluationItem): ExtraVehicle => ({
    ...EMPTY_VEHICLE, key: genId(), evaluationId: ev.id, vehicleId: ev.vehicle?.id ?? ev.vehicleId ?? null,
    plate: ev.plate ?? '', brand: ev.brand ?? '', model: ev.model ?? '',
    year: evalYear(ev) != null ? String(evalYear(ev)) : '', km: ev.km != null ? String(ev.km) : '',
    color: ev.color ?? '', fuel: ev.fuel ?? '',
    evaluatedValue: moneyMask(ev.evaluatedValue), fipeValue: moneyMask(ev.fipeValue),
  })
  /** Mais um carro comprado (COMPRA) — valor = o aprovado na avaliação. */
  const addCompraEval = (ev: EvaluationItem) => {
    if (evalTaken(ev, [form.vehicle, ...form.extraVehicles])) { alert('Este veículo já está nesta negociação.'); return }
    const x = vehicleFromEval(ev); x.vehicleValue = x.evaluatedValue
    const list = [...form.extraVehicles, x]
    setField('extraVehicles', list)
    setField('purchaseAmount', sumBRL([form.vehicle.vehicleValue, ...list.map((e) => e.vehicleValue)]))
  }
  /** Mais um carro recebido na troca — valor = o da avaliação aceita. */
  const addTradeEval = (ev: EvaluationItem) => {
    if (evalTaken(ev, [form.tradeVehicle, ...form.extraTradeVehicles])) { alert('Este veículo já está na troca.'); return }
    const x = vehicleFromEval(ev); x.agreedValue = x.evaluatedValue
    const list = [...form.extraTradeVehicles, x]
    setField('extraTradeVehicles', list)
    setField('tradeValue', sumBRL([form.tradeVehicle.agreedValue, ...list.map((e) => e.agreedValue)]))
  }
  const removeTrade = (key: string) => {
    const list = form.extraTradeVehicles.filter((x) => x.key !== key)
    setField('extraTradeVehicles', list)
    setField('tradeValue', sumBRL([form.tradeVehicle.agreedValue, ...list.map((e) => e.agreedValue)]))
  }
  const updTrade = (key: string, patch: Partial<VehicleFields>) =>
    setField('extraTradeVehicles', form.extraTradeVehicles.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const carLine = (v: VehicleFields) => [v.brand, v.model, v.year].filter(Boolean).join(' ') || 'Veículo'
  const carSub = (v: VehicleFields) => [v.km && `${Number(v.km).toLocaleString('pt-BR')} km`, v.color, v.fuel].filter(Boolean).join(' · ')

  /** Carros adicionais que saem (VENDA/TROCA) + botão para adicionar outro do estoque. */
  const renderOutExtras = () => (
    <div className="space-y-2">
      {form.extraVehicles.map((x, i) => (
        <div key={x.key} className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{i + 2}º veículo</p>
            <p className="text-sm font-semibold text-gray-900">{carLine(x)}{x.plate && <span className="ml-2 font-mono text-xs text-gray-500">{x.plate}</span>}</p>
            {carSub(x) && <p className="text-xs text-gray-600">{carSub(x)}</p>}
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Preço de venda</p>
              <p className="text-base font-bold text-emerald-700">{x.vehicleValue ? fmtBRL(x.vehicleValue) : '—'}</p>
            </div>
            <button type="button" onClick={() => { if (confirm('Remover este veículo da negociação?')) removeOut(x.key) }} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover veículo"><X size={14} /></button>
          </div>
        </div>
      ))}
      {addingOut ? (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Adicionar outro veículo</p>
            <button type="button" onClick={() => setAddingOut(false)} className="text-xs font-medium text-gray-500 hover:text-gray-800">Cancelar</button>
          </div>
          <VehicleInlineSearch label="Estoque disponível" selected={null} onSelect={addOutStock} onClear={() => {}} requireSalePrice excludeIds={outIds} />
        </div>
      ) : (
        <button type="button" onClick={() => setAddingOut(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-400 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
          <Plus size={14} />Adicionar outro veículo
        </button>
      )}
      {form.extraVehicles.length > 0 && (
        <p className="text-right text-sm text-gray-700">Total dos {form.extraVehicles.length + 1} veículos: <span className="font-bold text-emerald-700">{fmtBRL(form.saleAmount)}</span></p>
      )}
    </div>
  )

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
      // Espelha pro saleAmount global (valor da operação de venda) — soma dos carros.
      setField('saleAmount', sumBRL([masked, ...form.extraVehicles.map((e) => e.vehicleValue)]))
    }
  }

  // Boleto da quitação do veículo da troca (enviado antes de salvar a negociação).
  const [uploadingPayoff, setUploadingPayoff] = useState(false)
  const attachPayoff = async (file: File) => {
    setUploadingPayoff(true)
    try { const r = await uploadPendingFile(file); setField('tradeVehicle', { ...form.tradeVehicle, payoffReceipt: r }) }
    catch (e) { alert(e instanceof Error ? e.message : 'Não foi possível enviar o boleto.') }
    finally { setUploadingPayoff(false) }
  }

  // Seleciona avaliação para o veículo recebido na troca
  const handleSelectEvaluation = (ev: EvaluationItem) => {
    setTradeVehicleField('evaluationId', ev.id)
    setTradeVehicleField('vehicleId', ev.vehicle?.id ?? ev.vehicleId ?? null)
    setTradeVehicleField('plate', ev.plate ?? '')
    setTradeVehicleField('brand', ev.brand ?? '')
    setTradeVehicleField('model', ev.model ?? '')
    setTradeVehicleField('year',  evalYear(ev) != null ? String(evalYear(ev)) : '')
    setTradeVehicleField('km',    ev.km   != null ? String(ev.km)   : '')
    if (ev.evaluatedValue != null) {
      // Valor da avaliação (aprovado pelo gerente e aceito pelo cliente) = valor da troca.
      const masked = maskBRLInput(String(Math.round(Number(ev.evaluatedValue) * 100)))
      setTradeVehicleField('evaluatedValue', masked)
      setTradeVehicleField('agreedValue', masked)
      setField('tradeValue', sumBRL([masked, ...form.extraTradeVehicles.map((e) => e.agreedValue)]))
    }
    if (ev.fipeValue != null)
      setTradeVehicleField('fipeValue', maskBRLInput(String(Math.round(Number(ev.fipeValue) * 100))))
  }

  // Rascunhos em que o carro da troca foi escolhido antes desta correção: o
  // valor da avaliação estava guardado, mas não entrava como valor da troca.
  useEffect(() => {
    const ev = form.tradeVehicle.evaluatedValue
    if (form.tradeVehicle.evaluationId && ev && !form.tradeValue) {
      setField('tradeValue', ev)
      if (!form.tradeVehicle.agreedValue) setTradeVehicleField('agreedValue', ev)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tradeVehicle.evaluationId, form.tradeVehicle.evaluatedValue, form.tradeValue])

  const [showEvalModal, setShowEvalModal] = useState(false)
  // Modal separado pro fluxo COMPRA — preenche `form.vehicle` (não tradeVehicle)
  const [showEvalModalCompra, setShowEvalModalCompra] = useState(false)

  // Avaliação aprovada selecionada para COMPRA
  const handleSelectEvaluationCompra = (ev: EvaluationItem) => {
    setVehicleField('evaluationId', ev.id)
    setVehicleField('vehicleId', ev.vehicle?.id ?? ev.vehicleId ?? null)
    setVehicleField('plate', ev.plate ?? '')
    setVehicleField('brand', ev.brand ?? '')
    setVehicleField('model', ev.model ?? '')
    setVehicleField('year', evalYear(ev) != null ? String(evalYear(ev)) : '')
    setVehicleField('km',   ev.km   != null ? String(ev.km)   : '')
    setVehicleField('color', ev.color ?? '')
    setVehicleField('fuel',  ev.fuel  ?? '')
    if (ev.evaluatedValue != null) {
      const masked = maskBRLInput(String(Math.round(Number(ev.evaluatedValue) * 100)))
      setVehicleField('evaluatedValue', masked)
      // Preço de compra que será pago ao cliente = valor aprovado pelo gerente
      setVehicleField('vehicleValue', masked)
      // form.purchaseAmount é o que o backend persiste E o cálculo de
      // totalOperacao lê — soma dos carros comprados.
      setField('purchaseAmount', sumBRL([masked, ...form.extraVehicles.map((e) => e.vehicleValue)]))
    }
    if (ev.fipeValue != null) {
      setVehicleField('fipeValue', maskBRLInput(String(Math.round(Number(ev.fipeValue) * 100))))
    }
  }

  const fi = (k: keyof DealForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setField(k, e.target.value as DealForm[typeof k])

  // Consignação: veículo avaliado/liberado (muitas vezes já no estoque pela esteira).
  const [showEvalModalConsig, setShowEvalModalConsig] = useState(false)
  const handleSelectEvaluationConsig = (ev: EvaluationItem) => {
    setVehicleField('evaluationId', ev.id)
    setVehicleField('vehicleId', ev.vehicle?.id ?? ev.vehicleId ?? null)
    setVehicleField('plate', ev.plate ?? '')
    setVehicleField('brand', ev.brand ?? '')
    setVehicleField('model', ev.model ?? '')
    setVehicleField('year', evalYear(ev) != null ? String(evalYear(ev)) : '')
    setVehicleField('km', ev.km != null ? String(ev.km) : '')
    setVehicleField('color', ev.color ?? '')
    setVehicleField('fuel', ev.fuel ?? '')
    // Valor anunciado = preço de venda do estoque/sugerido; mínimo ao proprietário = valor avaliado.
    const anuncio = ev.vehicle?.salePrice ?? ev.suggestedSalePrice ?? null
    if (anuncio != null) setVehicleField('vehicleValue', moneyMask(anuncio))
    if (ev.evaluatedValue != null) {
      setVehicleField('evaluatedValue', moneyMask(ev.evaluatedValue))
      setField('consignMinValue', moneyMask(ev.vehicle?.purchasePrice ?? ev.evaluatedValue))
    }
    if (ev.fipeValue != null) setVehicleField('fipeValue', moneyMask(ev.fipeValue))
  }

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
          <h2 className="text-lg font-semibold text-gray-900">Veículo a Vender <RequiredMark /></h2>
          <VehicleInlineSearch
            label="Estoque disponível"
            selected={selectedStock}
            onSelect={handleSelectStock}
            requireSalePrice
            excludeIds={form.extraVehicles.map((x) => x.vehicleId)}
            onClear={() => {
              setSelectedStock(null)
              setVehicleField('vehicleId', null)
              setVehicleField('plate', '')
              setVehicleField('brand', '')
              setVehicleField('model', '')
              setVehicleField('year', '')
              setVehicleField('vehicleValue', '')
              setField('saleAmount', sumBRL(form.extraVehicles.map((e) => e.vehicleValue)))
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
                  Sem preço de venda. Peça ao gerente para precificar.
                </p>
              )}
            </div>
          )}
          {(selectedStock || form.extraVehicles.length > 0) && renderOutExtras()}
        </div>
      )}

      {/* ── TROCA ── */}
      {form.type === 'TROCA' && (
        <div className="space-y-6">
          {/* Veículo que sai (estoque) — mesmo padrão da VENDA */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Veículo que Sai da Loja <RequiredMark /></h2>
            <VehicleInlineSearch
              label="Estoque disponível"
              selected={selectedStock}
              onSelect={handleSelectStock}
              requireSalePrice
              excludeIds={form.extraVehicles.map((x) => x.vehicleId)}
              onClear={() => {
                setSelectedStock(null)
                setVehicleField('vehicleId', null)
                setVehicleField('plate', '')
                setVehicleField('brand', '')
                setVehicleField('model', '')
                setVehicleField('vehicleValue', '')
                setField('saleAmount', sumBRL(form.extraVehicles.map((e) => e.vehicleValue)))
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
                    Sem preço de venda. Peça ao gerente para precificar.
                  </p>
                )}
              </div>
            )}
            {(selectedStock || form.extraVehicles.length > 0) && renderOutExtras()}
          </div>

          {/* Veículo recebido na troca — sempre via avaliação liberada e aceita */}
          <div className="border-t border-gray-200 pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
              <h3 className="font-semibold text-purple-900">Veículo Recebido na Troca <RequiredMark /></h3>
            </div>

            {!hasTradeVehicle ? (
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
                      {tradePlateEditable && (
                        <label className="mt-2 flex items-center gap-2 text-xs font-medium text-gray-700">
                          Placa <RequiredMark />
                          <input
                            className={`${inputCls} w-32 font-mono uppercase`}
                            placeholder="AAA0A00"
                            value={formatPlate(form.tradeVehicle.plate)}
                            onChange={(e) => { setPlateEditEvalId(tradeEvalId); setTradeVehicleField('plate', normalizePlate(e.target.value)) }}
                          />
                        </label>
                      )}
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
                      setTradeVehicleField('vehicleId', null)
                      setTradeVehicleField('plate', '')
                      setTradeVehicleField('brand', '')
                      setTradeVehicleField('model', '')
                      setTradeVehicleField('year', '')
                      setTradeVehicleField('km', '')
                      setTradeVehicleField('color', '')
                      setTradeVehicleField('agreedValue', '')
                      setTradeVehicleField('evaluatedValue', '')
                      setTradeVehicleField('fipeValue', '')
                      setField('tradeValue', sumBRL(form.extraTradeVehicles.map((e) => e.agreedValue)))
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
                      <Field label="Valor da quitação" help={<HelpHint {...DEAL_HINTS.QUITACAO} size={12} />}>
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
                      <Field label="Vencimento do boleto">
                        <input
                          className={inputCls}
                          type="date"
                          value={form.tradeVehicle.payoffDueDate ?? ''}
                          onChange={(e) => setTradeVehicleField('payoffDueDate', e.target.value)}
                        />
                      </Field>
                      <Field label="Boleto de quitação">
                        {form.tradeVehicle.payoffReceipt ? (
                          <span className="flex items-center gap-2 py-2 text-xs"><a href={form.tradeVehicle.payoffReceipt.publicUrl} target="_blank" rel="noopener" className="truncate text-brand-700 underline">{form.tradeVehicle.payoffReceipt.fileName}</a><button type="button" onClick={() => setField('tradeVehicle', { ...form.tradeVehicle, payoffReceipt: null })} className="text-red-600 hover:underline">remover</button></span>
                        ) : (
                          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-purple-300 bg-white px-2.5 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 ${uploadingPayoff ? 'pointer-events-none opacity-60' : ''}`}>
                            {uploadingPayoff ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}{uploadingPayoff ? 'Enviando…' : 'Anexar boleto'}
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void attachPayoff(fl); e.target.value = '' }} />
                          </label>
                        )}
                      </Field>
                      <p className="col-span-2 text-[11px] text-purple-700/80">A quitação entra sozinha na etapa Débitos (débito do veículo recebido), com o boleto anexado.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mais carros recebidos na troca */}
            {showEvalModalTradeExtra && (
              <EvaluationSearchModal
                operation="TROCA"
                onSelect={(ev) => { addTradeEval(ev); setShowEvalModalTradeExtra(false) }}
                onClose={() => setShowEvalModalTradeExtra(false)}
              />
            )}
            {form.extraTradeVehicles.map((x, i) => (
              <div key={x.key} className="space-y-3 rounded-xl border-2 border-purple-200 bg-purple-50/40 p-4">
                <div className="flex items-start justify-between gap-3 rounded-lg border border-purple-200 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">{i + 2}º veículo da troca</p>
                    <p className="text-sm font-semibold text-gray-900">{carLine(x)}{x.plate && <span className="ml-2 font-mono text-xs text-gray-500">{x.plate}</span>}</p>
                    {carSub(x) && <p className="text-xs text-gray-600">{carSub(x)}</p>}
                    {!isValidPlate(x.plate) && (
                      <label className="mt-2 flex items-center gap-2 text-xs font-medium text-gray-700">
                        Placa <RequiredMark />
                        <input className={`${inputCls} w-32 font-mono uppercase`} placeholder="AAA0A00" value={formatPlate(x.plate)} onChange={(e) => updTrade(x.key, { plate: normalizePlate(e.target.value) })} />
                      </label>
                    )}
                    {x.agreedValue && <p className="mt-1 text-sm font-bold text-purple-700">Valor aceito: {fmtBRL(x.agreedValue)}</p>}
                  </div>
                  <button type="button" onClick={() => { if (confirm('Remover este veículo da troca?')) removeTrade(x.key) }} className="rounded-md p-1 text-purple-400 hover:bg-red-50 hover:text-red-600" title="Remover veículo da troca"><X size={14} /></button>
                </div>
                <div className="space-y-3 rounded-lg border border-purple-200 bg-white p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-purple-600" checked={x.hasFinancing} onChange={(e) => updTrade(x.key, { hasFinancing: e.target.checked })} />
                    <span className="text-gray-700">Possui financiamento ativo (quitação)</span>
                  </label>
                  {x.hasFinancing && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field label="Valor da quitação" help={<HelpHint {...DEAL_HINTS.QUITACAO} size={12} />}>
                        <input className={inputCls} inputMode="numeric" placeholder="0,00" value={x.payoffValue} onChange={(e) => updTrade(x.key, { payoffValue: maskBRLInput(e.target.value) })} />
                      </Field>
                      <Field label="Banco">
                        <BankCombo value={x.payoffBank} onChange={(v) => updTrade(x.key, { payoffBank: v })} placeholder="Buscar banco..." />
                      </Field>
                      <Field label="Vencimento do boleto">
                        <input className={inputCls} type="date" value={x.payoffDueDate ?? ''} onChange={(e) => updTrade(x.key, { payoffDueDate: e.target.value })} />
                      </Field>
                      <p className="text-[11px] text-purple-700/80 sm:col-span-3">A quitação entra sozinha na etapa Débitos; o boleto pode ser anexado lá.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {hasTradeVehicle && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setShowEvalModalTradeExtra(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-purple-400 bg-white px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50">
                  <Plus size={14} />Adicionar outro veículo na troca
                </button>
                {form.extraTradeVehicles.length > 0 && (
                  <p className="text-sm text-gray-700">Total da troca: <span className="font-bold text-purple-700">{fmtBRL(form.tradeValue)}</span></p>
                )}
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
            <p className="text-sm text-gray-500">Somente avaliações liberadas pelo gerente.</p>
          </div>

          {/* Avaliação já selecionada: card resumo + ações de trocar/remover */}
          {hasMainVehicle && (
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
                    setVehicleField('vehicleId', null)
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
          {!hasMainVehicle && (
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
          {hasMainVehicle && (
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
                  <Field label="Valor de Quitação (R$)" help={<HelpHint {...DEAL_HINTS.QUITACAO} size={12} />}>
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

          {/* Mais carros comprados do mesmo cliente */}
          {showEvalModalCompraExtra && (
            <EvaluationSearchModal
              operation="COMPRA"
              onSelect={(ev) => { addCompraEval(ev); setShowEvalModalCompraExtra(false) }}
              onClose={() => setShowEvalModalCompraExtra(false)}
            />
          )}
          {form.extraVehicles.map((x, i) => (
            <div key={x.key} className="flex items-start justify-between gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{i + 2}º veículo</p>
                <p className="text-sm font-bold text-gray-900">{carLine(x)}{x.plate && <span className="ml-2 font-mono text-xs text-gray-500">{x.plate}</span>}</p>
                {carSub(x) && <p className="text-xs text-gray-600">{carSub(x)}</p>}
                {x.vehicleValue && <p className="mt-1 text-xs font-medium text-emerald-700">Valor aprovado de compra: {fmtBRL(x.vehicleValue)}</p>}
              </div>
              <button type="button" onClick={() => { if (confirm('Remover este veículo da compra?')) removeOut(x.key) }} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remover veículo"><X size={14} /></button>
            </div>
          ))}
          {hasMainVehicle && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => setShowEvalModalCompraExtra(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-400 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                <Plus size={14} />Adicionar outro veículo
              </button>
              {form.extraVehicles.length > 0 && (
                <p className="text-sm text-gray-700">Total da compra: <span className="font-bold text-emerald-700">{fmtBRL(form.purchaseAmount)}</span></p>
              )}
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
            <h2 className="text-lg font-semibold text-gray-900">Veículo em Consignação</h2>
            {showEvalModalConsig && (
              <EvaluationSearchModal
                operation="CONSIGNACAO"
                onSelect={(ev) => { handleSelectEvaluationConsig(ev); setShowEvalModalConsig(false) }}
                onClose={() => setShowEvalModalConsig(false)}
              />
            )}
            {hasMainVehicle ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50/40 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Veículo liberado selecionado</p>
                  <p className="text-sm font-bold text-gray-900">{[form.vehicle.brand, form.vehicle.model, form.vehicle.year].filter(Boolean).join(' ')}{form.vehicle.plate && <span className="ml-2 font-mono text-xs text-gray-500">{form.vehicle.plate}</span>}</p>
                  {form.vehicle.vehicleId && <p className="text-[11px] text-emerald-700">Já está no estoque: a negociação de entrada será vinculada a ele.</p>}
                </div>
                <button type="button" onClick={() => { for (const k of ['plate', 'brand', 'model', 'year', 'km', 'color', 'fuel', 'vehicleValue', 'evaluatedValue', 'fipeValue'] as const) setVehicleField(k, ''); setVehicleField('evaluationId', ''); setVehicleField('vehicleId', null) }} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50">Trocar</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowEvalModalConsig(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-300 bg-brand-50/40 px-4 py-4 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                <Search size={16} />Selecionar veículo liberado no estoque
              </button>
            )}
            <VehicleFormBlock data={form.vehicle} onChange={setVehicleField} showValuation={false} lockValue={lockVehicleValue} />
          </div>
          <div className="border-t border-gray-200 pt-6 space-y-4">
            <h3 className="flex items-center gap-1.5 font-semibold text-gray-900">Parâmetros da Consignação<HelpHint {...DEAL_HINTS.CONSIGNACAO} /></h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Valor Mínimo ao Proprietário (R$)" required help={<HelpHint {...DEAL_HINTS.CONSIG_MINIMO} size={12} />}>
                <input
                  className={inputCls}
                  placeholder="0,00"
                  value={form.consignMinValue}
                  onChange={(e) => setField('consignMinValue', maskBRLInput(e.target.value))}
                />
              </Field>
              <Field label="Comissão da Loja (%)" help={<HelpHint {...DEAL_HINTS.CONSIG_COMISSAO} size={12} />}>
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

export const AUTO_PAYOFF_DEBT_ID = 'auto-quitacao-troca'

/** Envia boleto/comprovante antes de a negociação existir (fica pendente até salvar). */
async function uploadPendingFile(file: File): Promise<{ storageKey: string; publicUrl: string; fileName: string; fileType: string; mimeType: string; fileSize: number }> {
  const body = new FormData()
  body.append('file', await shrinkReceipt(file))
  const r = await fetch('/api/negotiations/receipts', { method: 'POST', body })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.success) throw new Error(j.error ?? `Falha ao enviar (HTTP ${r.status}).`)
  return j.data
}

/**
 * Quitação do veículo da troca → débito automático do veículo recebido (valor,
 * banco, vencimento e boleto). Responsável e notas editados em Débitos ficam.
 */
/** Débito automático de quitação: o do 1º carro da troca e um por carro adicional. */
const isAutoPayoffId = (id: string) => id === AUTO_PAYOFF_DEBT_ID || id.startsWith(`${AUTO_PAYOFF_DEBT_ID}:`)
const extraPayoffId = (key: string) => `${AUTO_PAYOFF_DEBT_ID}:${key}`

function applyPayoffDebt(p: DealForm): DealForm {
  const trades: Array<{ id: string; v: VehicleFields }> = p.type === 'TROCA'
    ? [{ id: AUTO_PAYOFF_DEBT_ID, v: p.tradeVehicle }, ...(p.extraTradeVehicles ?? []).map((x) => ({ id: extraPayoffId(x.key), v: x as VehicleFields }))]
    : []
  const wanted = new Map<string, DebtEntry>()
  for (const { id, v } of trades) {
    if (!v.hasFinancing || !((parseBRLInput(v.payoffValue) ?? 0) > 0)) continue
    const cur = p.debts.find((d) => d.id === id)
    wanted.set(id, {
      id, auto: 'QUITACAO_TROCA', vehicleRole: 'TROCA', type: 'FINANCIAMENTO',
      description: `Quitação de financiamento${v.payoffBank ? ` — ${v.payoffBank}` : ''}${v.plate ? ` (${v.plate})` : ''}`,
      value: v.payoffValue, dueDate: v.payoffDueDate ?? '', receipt: v.payoffReceipt ?? null,
      responsavel: cur?.responsavel ?? 'LOJA', notes: cur?.notes ?? '',
    })
  }
  const next: DebtEntry[] = []
  for (const d of p.debts) {
    if (!isAutoPayoffId(d.id)) { next.push(d); continue }
    const w = wanted.get(d.id)
    if (w) { next.push(w); wanted.delete(d.id) }
  }
  next.push(...wanted.values())
  return JSON.stringify(next) === JSON.stringify(p.debts) ? p : { ...p, debts: next }
}

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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [uploadingDebt, setUploadingDebt] = useState(false)

  const setDraftField = (k: keyof DebtEntry, v: string) =>
    setDraft((p) => ({ ...p, [k]: v }))

  const addDebt = () => {
    if (editingId) {
      setField('debts', form.debts.map((d) => (d.id === editingId ? { ...draft } : d)) as DealForm['debts'])
      // Quitação automática: o que mudar aqui volta para a etapa Veículos.
      if (draft.auto === 'QUITACAO_TROCA' && editingId === AUTO_PAYOFF_DEBT_ID) {
        setField('tradeVehicle', { ...form.tradeVehicle, payoffValue: draft.value, payoffDueDate: draft.dueDate ?? '', payoffReceipt: draft.receipt ?? null })
      } else if (draft.auto === 'QUITACAO_TROCA') {
        setField('extraTradeVehicles', form.extraTradeVehicles.map((x) => (extraPayoffId(x.key) === editingId ? { ...x, payoffValue: draft.value, payoffDueDate: draft.dueDate ?? '', payoffReceipt: draft.receipt ?? null } : x)))
      }
    } else {
      setField('debts', [...form.debts, { ...draft }] as DealForm['debts'])
    }
    setDraft(EMPTY_DEBT())
    setEditingId(null)
    setAdding(false)
  }

  const editDebt = (d: DebtEntry) => { setDraft({ ...d }); setEditingId(d.id); setAdding(true) }

  const removeDebt = (id: string) => {
    if (isAutoPayoffId(id)) {
      if (!confirm('Esta quitação vem do veículo da troca. Remover também desmarca "Possui financiamento" lá. Continuar?')) return
      if (id === AUTO_PAYOFF_DEBT_ID) setField('tradeVehicle', { ...form.tradeVehicle, hasFinancing: false, payoffValue: '', payoffDueDate: '', payoffReceipt: null })
      else setField('extraTradeVehicles', form.extraTradeVehicles.map((x) => (extraPayoffId(x.key) === id ? { ...x, hasFinancing: false, payoffValue: '', payoffDueDate: '', payoffReceipt: null } : x)))
    }
    setField('debts', form.debts.filter((d) => d.id !== id) as DealForm['debts'])
  }

  const attachDebtFile = async (file: File) => {
    setUploadingDebt(true)
    try { const r = await uploadPendingFile(file); setDraft((p) => ({ ...p, receipt: r })) }
    catch (e) { alert(e instanceof Error ? e.message : 'Não foi possível enviar o arquivo.') }
    finally { setUploadingDebt(false) }
  }

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
          {d.dueDate && ` · venc. ${new Date(`${d.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}`}
          {d.notes && ` · ${d.notes}`}
          {d.receipt && <a href={d.receipt.publicUrl} target="_blank" rel="noopener" className="ml-1 inline-flex items-center gap-0.5 text-brand-700 hover:underline"><Paperclip size={10} />boleto</a>}
          {d.auto === 'QUITACAO_TROCA' && <span className="ml-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">automático — do veículo da troca</span>}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-gray-800">{fmtBRL(d.value)}</span>
      <button type="button" onClick={() => editDebt(d)} title="Editar" className="shrink-0 text-gray-400 hover:text-brand-600 transition-colors">
        <Pencil size={14} />
      </button>
      <button type="button" onClick={() => removeDebt(d.id)} title="Excluir" className="shrink-0 text-gray-400 hover:text-red-500 transition-colors">
        <Trash2 size={14} />
      </button>
    </div>
  )

  return (
    <div>
      <h2 className="mb-5 flex items-center gap-1.5 text-lg font-semibold text-gray-900">Débitos<HelpHint {...DEAL_HINTS.DEBITOS} /></h2>

      {form.debts.length === 0 && !adding && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400 justify-center mb-4">
          Nenhum débito cadastrado.
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
          <p className="text-sm font-medium text-gray-800">{editingId ? 'Editar débito' : 'Novo débito'}</p>
          <div className="grid grid-cols-2 gap-3">
            {isTraoca && (
              <Field label="Veículo">
                <select className={inputCls} value={draft.vehicleRole} onChange={(e) => setDraftField('vehicleRole', e.target.value)}>
                  <option value="VENDIDO">Veículo Vendido pela Loja</option>
                  <option value="TROCA">Veículo Recebido na Troca</option>
                </select>
              </Field>
            )}
            <Field label="Tipo" required>
              <select className={inputCls} value={draft.type} onChange={(e) => setDraftField('type', e.target.value)}>
                <option value="">Selecione</option>
                {DEBT_TYPES.map((dt) => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
              </select>
            </Field>
            <Field label="Responsável" help={<HelpHint {...DEAL_HINTS.RESPONSAVEL_DEBITO} size={12} />}>
              <select className={inputCls} value={draft.responsavel} onChange={(e) => setDraftField('responsavel', e.target.value)}>
                {DEBT_RESPONSAVEL.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Descrição">
            <input className={inputCls} placeholder="Descrição" value={draft.description} onChange={(e) => setDraftField('description', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)" required>
              <input className={inputCls} placeholder="0,00" value={draft.value} onChange={(e) => setDraftField('value', maskBRLInput(e.target.value))} />
            </Field>
            <Field label="Vencimento">
              <input className={inputCls} type="date" value={draft.dueDate ?? ''} onChange={(e) => setDraftField('dueDate', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Notas">
              <input className={inputCls} value={draft.notes} onChange={(e) => setDraftField('notes', e.target.value)} />
            </Field>
            <Field label="Boleto / comprovante">
              {draft.receipt ? (
                <span className="flex items-center gap-2 py-2 text-xs"><a href={draft.receipt.publicUrl} target="_blank" rel="noopener" className="truncate text-brand-700 underline">{draft.receipt.fileName}</a><button type="button" onClick={() => setDraft((p) => ({ ...p, receipt: null }))} className="text-red-600 hover:underline">remover</button></span>
              ) : (
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-brand-300 bg-white px-2.5 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 ${uploadingDebt ? 'pointer-events-none opacity-60' : ''}`}>
                  {uploadingDebt ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}{uploadingDebt ? 'Enviando…' : 'Anexar'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void attachDebtFile(fl); e.target.value = '' }} />
                </label>
              )}
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setAdding(false); setEditingId(null); setDraft(EMPTY_DEBT()) }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={addDebt}
              disabled={!draft.type || !draft.value || uploadingDebt}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {editingId ? <Save size={13} /> : <Plus size={13} />}
              {editingId ? 'Salvar' : 'Adicionar'}
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

/** Formas que ENTRAM dinheiro (quitação e troco são débitos — ficam fora). */
const INCOMING_TYPES: PaymentEntryType[] = ['DINHEIRO', 'PIX', 'SINAL', 'ENTRADA', 'FINANCIAMENTO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'DUPLICATA', 'TRANSFERENCIA', 'OUTRO']

/** Como o cliente pagou o sinal/entrada. */
const SIGNAL_METHODS: Array<{ value: string; label: string }> = [
  { value: 'PIX', label: 'Pix' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
  { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'BOLETO', label: 'Boleto' },
]
const SIGNAL_METHOD_LABEL: Record<string, string> = Object.fromEntries(SIGNAL_METHODS.map((m) => [m.value, m.label]))

/** Reduz foto do comprovante antes de enviar (limite da hospedagem ~4 MB por envio). */
async function shrinkReceipt(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_500_000) return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const b = await new Promise<Blob | null>((res) => c.toBlob((x) => res(x), 'image/jpeg', 0.85))
    return b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file
  } catch { return file }
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

  const [entry, setEntry] = useState<PaymentEntry>(() => {
    const e = initial ?? buildEmpty()
    // Placa: sempre a do veículo que a loja está vendendo (ou comprando).
    return { ...e, vehiclePlate: e.vehiclePlate || vehiclePlates?.[0] || '' }
  })
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  async function uploadReceipt(file: File) {
    setUploading(true); setError('')
    try {
      const body = new FormData()
      body.append('file', await shrinkReceipt(file))
      const r = await fetch('/api/negotiations/receipts', { method: 'POST', body })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.success) throw new Error(j.error ?? `Falha ao enviar (HTTP ${r.status}).`)
      update('receipt', j.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o comprovante.')
    } finally { setUploading(false) }
  }

  const update = <K extends keyof PaymentEntry>(k: K, v: PaymentEntry[K]) => {
    setEntry((prev) => ({ ...prev, [k]: v }))
  }

  function handleSave() {
    const amount = parseBRLInput(entry.amount)
    if (!entry.type)                  return setError('Selecione o tipo de pagamento.')
    if (amount == null || amount <= 0) return setError('Informe um valor maior que zero.')
    if (isSignal && !entry.signalMethod) return setError('Informe como o cliente pagou o sinal/entrada (Pix, dinheiro, cartão…).')
    if (isCardPay && entry.receipt && !entry.authorizationCode?.trim()) return setError('Com o comprovante do cartão anexado, informe o código de autorização.')
    if (uploading) return setError('Aguarde o envio do comprovante terminar.')
    setError('')
    // Status não é escolhido aqui: quem confirma é o financeiro (Financeiro › Recebimentos).
    onSave({ ...entry, status: initial?.status ?? 'PENDENTE', signalMethod: isSignal ? entry.signalMethod : '' })
  }

  // Campos condicionais por tipo (sinal/entrada seguem a forma escolhida)
  const isSignal         = entry.type === 'SINAL' || entry.type === 'ENTRADA'
  const payVia           = isSignal ? (entry.signalMethod ?? '') : entry.type
  const isCardPay        = payVia === 'CARTAO_CREDITO' || payVia === 'CARTAO_DEBITO'
  const needsBank        = ['FINANCIAMENTO', 'BOLETO', 'TRANSFERENCIA', 'DUPLICATA', 'QUITACAO'].includes(entry.type)
  const needsCard        = isCardPay
  const needsParcelas    = ['CARTAO_CREDITO', 'FINANCIAMENTO', 'DUPLICATA'].includes(entry.type)
  const needsFirstDue    = ['FINANCIAMENTO', 'BOLETO', 'DUPLICATA'].includes(entry.type)
  const needsPix         = entry.type === 'PIX'
  // TRANSFERENCIA pra COMPRA precisa de Agência e Conta também
  const needsAgConta     = entry.type === 'TRANSFERENCIA'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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

          <div className={isSignal ? 'grid grid-cols-2 gap-3' : ''}>
            <Field label="Tipo de pagamento" required>
              <select className={inputCls} value={entry.type} onChange={(e) => update('type', e.target.value as PaymentEntryType)}>
                {(isCompra ? COMPRA_TYPES : INCOMING_TYPES).map((t) => (
                  <option key={t} value={t}>
                    {t === 'TRANSFERENCIA' && isCompra ? 'DOC / TED / TEF' : PAYMENT_ENTRY_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            {isSignal && (
              <Field label="Forma do sinal / entrada" required help={<HelpHint {...DEAL_HINTS.SINAL} size={12} />}>
                <select className={inputCls} value={entry.signalMethod ?? ''} onChange={(e) => update('signalMethod', e.target.value)}>
                  <option value="">Selecione</option>
                  {SIGNAL_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
            )}
          </div>
          {!isCompra && initial && initial.status !== 'PENDENTE' && (
            <p className="-mt-1 text-[11px] text-gray-500">Situação: {PAYMENT_STATUS_LABELS[initial.status]}</p>
          )}

          {/* Placa: sempre a do veículo vendido (preenchida sozinha) */}
          {entry.vehiclePlate && (
            <p className="text-xs text-gray-600">Veículo: <span className="font-mono font-semibold text-gray-800">{entry.vehiclePlate}</span></p>
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
            <Field label="Data de pagamento">
              <input
                className={inputCls}
                type="date"
                value={entry.dueDate}
                onChange={(e) => update('dueDate', e.target.value)}
              />
            </Field>
          </div>

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
          {isCardPay && (
            <Field label="Código de autorização" required={!!entry.receipt}>
              <input
                className={inputCls}
                placeholder="Nº de autorização"
                value={entry.authorizationCode ?? ''}
                onChange={(e) => update('authorizationCode', e.target.value.replace(/[^\w-]/g, '').slice(0, 40))}
              />
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
            <Field label="Retorno da financeira (%)" help={<HelpHint {...DEAL_HINTS.PERCENTUAL_RETORNO} size={12} />}>
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

          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            <p className="flex items-center gap-1.5 font-semibold"><Paperclip size={13} />Comprovante (foto ou PDF)</p>
            {entry.receipt ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <a href={entry.receipt.publicUrl} target="_blank" rel="noopener" className="truncate font-medium text-brand-700 underline">{entry.receipt.fileName}</a>
                <button type="button" onClick={() => update('receipt', null)} className="text-red-600 hover:underline">remover</button>
              </div>
            ) : (
              <label className={`mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-brand-300 bg-white px-2.5 py-1 font-medium text-brand-700 hover:bg-brand-50 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                {uploading ? 'Enviando…' : 'Anexar comprovante'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; if (fl) void uploadReceipt(fl); e.target.value = '' }} />
              </label>
            )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">Cadastrar Troco</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Valor excedente: <strong>{fmtBRL(excedente)}</strong>
          </div>
          <Field label="Valor do Troco (R$)" required help={<HelpHint {...DEAL_HINTS.TROCO} size={12} />}>
            <input
              className={inputCls}
              inputMode="numeric"
              placeholder="0,00"
              value={form.changeAmount}
              onChange={(e) => setField('changeAmount', maskBRLInput(e.target.value))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Beneficiário" required>
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
          <Field label="Chave PIX">
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
    ...form.extraVehicles.map((x) => x.plate),
    form.tradeVehicle?.plate,
    ...form.extraTradeVehicles.map((x) => x.plate),
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
      <h2 className="mb-5 text-lg font-semibold text-gray-900">Pagamentos</h2>

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
                    <p className="text-sm font-bold text-gray-900 whitespace-nowrap">{fmtBRL(form.extraVehicles.length ? (parseBRLInput(veiculoVendido.vehicleValue) ?? 0) : sale)}</p>
                  </div>
                </div>
                {form.extraVehicles.map((x) => (
                  <div key={x.key} className="mt-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{[x.brand, x.model, x.year].filter(Boolean).join(' ') || '—'}</p>
                        {x.plate && <p className="font-mono text-xs text-gray-500">{x.plate}</p>}
                      </div>
                      <p className="whitespace-nowrap text-sm font-bold text-gray-900">{fmtBRL(parseBRLInput(x.vehicleValue) ?? 0)}</p>
                    </div>
                  </div>
                ))}
                {form.extraVehicles.length > 0 && <p className="mt-1 text-right text-xs text-gray-600">Total dos veículos: <span className="font-semibold text-gray-900">{fmtBRL(sale)}</span></p>}
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
                    <p className="text-sm font-bold text-blue-700 whitespace-nowrap">− {fmtBRL(form.extraTradeVehicles.length ? (parseBRLInput(veiculoTroca.agreedValue) ?? 0) : trade)}</p>
                  </div>
                </div>
                {form.extraTradeVehicles.map((x) => (
                  <div key={x.key} className="mt-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{[x.brand, x.model, x.year].filter(Boolean).join(' ') || '—'}</p>
                        {x.plate && <p className="font-mono text-xs text-gray-500">{x.plate}</p>}
                      </div>
                      <p className="whitespace-nowrap text-sm font-bold text-blue-700">− {fmtBRL(parseBRLInput(x.agreedValue) ?? 0)}</p>
                    </div>
                  </div>
                ))}
                {form.extraTradeVehicles.length > 0 && <p className="mt-1 text-right text-xs text-gray-600">Total da troca: <span className="font-semibold text-blue-700">− {fmtBRL(trade)}</span></p>}
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
                            {PAYMENT_ENTRY_LABELS[p.type]}{(p.type === 'SINAL' || p.type === 'ENTRADA') && p.signalMethod ? ` · ${SIGNAL_METHOD_LABEL[p.signalMethod] ?? p.signalMethod}` : ''}
                          </span>
                          {p.receipt && <span title="Comprovante anexado" className="inline-flex items-center gap-0.5 text-[10px] text-brand-700"><Paperclip size={10} />comprovante</span>}
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_STATUS_COLOR[p.status]}`}>
                            {PAYMENT_STATUS_LABELS[p.status]}
                          </span>
                          {p.installments && (
                            <span className="text-[10px] text-gray-500">{p.installments}x</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-gray-900">{fmtBRL(parseBRLInput(p.amount) ?? 0)}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                          {p.dueDate && <span>Pagamento: {new Date(`${p.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}</span>}
                          {p.bank && <span>· {p.bank}</span>}
                          {p.pixKey && <span>· Pix</span>}
                        </div>
                        {p.notes && <p className="mt-1 text-[11px] text-gray-400 italic truncate">{p.notes}</p>}
                      </div>
                      {p.status === 'CONFIRMADO' ? (
                        <span className="text-[10px] text-gray-400" title="Confirmado pelo financeiro — não pode ser alterado aqui">Baixado</span>
                      ) : (
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
                      )}
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
          vehiclePlates={[form.vehicle?.plate, ...(form.type === 'COMPRA' ? [] : form.extraVehicles.map((x) => x.plate))].filter((p): p is string => !!p)}
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
      <h2 className="mb-5 text-lg font-semibold text-gray-900">Revisar e Confirmar</h2>

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
            {form.extraVehicles.map((x, i) => (
              <div key={x.key} className="mt-2 border-t border-gray-200 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{i + 2}º veículo</p>
                <p className="text-sm text-gray-700">
                  {[x.brand, x.model, x.year].filter(Boolean).join(' ')}
                  {x.plate && <span className="ml-1.5 font-mono text-gray-500">· {x.plate}</span>}
                </p>
                {x.vehicleValue && <p className="text-sm font-semibold text-gray-800">{fmtBRL(x.vehicleValue)}</p>}
              </div>
            ))}
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
            {form.extraTradeVehicles.map((x, i) => (
              <div key={x.key} className="mt-2 border-t border-purple-200 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">{i + 2}º veículo da troca</p>
                <p className="text-sm text-purple-800">
                  {[x.brand, x.model, x.year].filter(Boolean).join(' ')}
                  {x.plate && <span className="ml-1.5 font-mono">· {x.plate}</span>}
                </p>
                {x.agreedValue && <p className="text-sm font-semibold text-purple-700">Aceito: {fmtBRL(x.agreedValue)}</p>}
                {x.hasFinancing && <p className="text-xs text-amber-700">Com financiamento — quitação: {fmtBRL(x.payoffValue)}</p>}
              </div>
            ))}
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
      <h2 className="mb-5 text-lg font-semibold text-gray-900">Comentários Internos</h2>
      <div className="space-y-4">
        <Field label="Tipo do comentário">
          <select className={inputCls} value={form.commentType} onChange={fi('commentType')}>
            <option value="">Selecione</option>
            {COMMENT_TYPES.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
          </select>
        </Field>
        <Field label="Observações gerais">
          <textarea
            className={`${inputCls} min-h-32 resize-y`}
           
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

  // ── Rascunho automático (só na criação) ───────────────────────────────────
  // O assistente grava sozinho o que já foi preenchido e a etapa onde parou
  // (tabela deal_drafts — não é negociação, não gera número nem efeitos).
  // Retoma por /negociacoes/nova?rascunho=<id>; some ao salvar/enviar.
  const draftParam = searchParams.get('rascunho') ?? ''
  const [draftId, setDraftId]       = useState(draftParam)
  const [draftState, setDraftState] = useState<{ status: 'idle' | 'saving' | 'saved' | 'error'; at: string | null }>({ status: 'idle', at: null })
  const [draftReady, setDraftReady] = useState(!draftParam)
  const [openDrafts, setOpenDrafts] = useState<Array<{ id: string; title: string | null; step: number; updatedAt: string; type: string | null }>>([])
  const creatingDraft = useRef<Promise<string | null> | null>(null)

  useEffect(() => {
    if (mode !== 'create' || !draftParam) return
    let alive = true
    fetch(`/api/negotiations/drafts/${draftParam}`).then((r) => r.json()).then((j) => {
      if (!alive) return
      if (j?.success && j.data?.data?.form) {
        setForm({ ...INITIAL_FORM, ...(j.data.data.form as Partial<DealForm>) })
        setStep(Number(j.data.step) || 0)
        setDraftState({ status: 'saved', at: j.data.updatedAt })
      } else {
        setDraftId('')
      }
    }).catch(() => setDraftId('')).finally(() => { if (alive) setDraftReady(true) })
    return () => { alive = false }
  }, [mode, draftParam])

  // Rascunhos em aberto (aviso ao abrir uma negociação nova do zero).
  useEffect(() => {
    if (mode !== 'create' || draftParam) return
    fetch('/api/negotiations/drafts').then((r) => r.json())
      .then((j) => setOpenDrafts(Array.isArray(j?.data) ? j.data.filter((d: { mine?: boolean }) => d.mine).slice(0, 3) : []))
      .catch(() => undefined)
  }, [mode, draftParam])

  useEffect(() => {
    if (mode !== 'create' || !draftReady) return
    if (!form.type && step === 0) return // nada preenchido ainda
    const t = setTimeout(async () => {
      setDraftState((d) => ({ ...d, status: 'saving' }))
      const body = JSON.stringify({ data: { form }, step, type: form.type || null, title: draftTitle(form) })
      try {
        let id = draftId
        if (!id) {
          creatingDraft.current ??= fetch('/api/negotiations/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
            .then((r) => r.json()).then((j) => (j?.success ? (j.data.id as string) : null)).catch(() => null)
          id = (await creatingDraft.current) ?? ''
          if (!id) throw new Error('rascunho')
          setDraftId(id)
          window.history.replaceState(null, '', `/negociacoes/nova?rascunho=${id}`)
        } else {
          const r = await fetch(`/api/negotiations/drafts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
          if (!r.ok) throw new Error('rascunho')
        }
        setDraftState({ status: 'saved', at: new Date().toISOString() })
      } catch {
        setDraftState((d) => ({ ...d, status: 'error' }))
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [form, step, mode, draftReady, draftId])

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
        const allMains  = Array.isArray(d.vehicles) ? d.vehicles.filter((v: { role: string }) => ['VENDIDO', 'COMPRADO', 'CONSIGNADO'].includes(v.role)) : []
        const allTrades = Array.isArray(d.vehicles) ? d.vehicles.filter((v: { role: string }) => v.role === 'TROCA') : []
        const vMain  = allMains[0] ?? null
        const vTrade = allTrades[0] ?? null
        hadExtraVehicles.current = allMains.length > 1 || allTrades.length > 1

        const mkVehicle = (v: typeof vMain): typeof INITIAL_FORM.vehicle => ({
          ...EMPTY_VEHICLE,
          plate:          v?.plate   ?? '',
          brand:          v?.brand   ?? '',
          model:          v?.model   ?? '',
          version:        v?.vehicle?.version ?? '',
          year:           v?.year    ? String(v.year) : '',
          color:          v?.color   ?? '',
          km:             v?.km      ? String(v.km)  : '',
          fuel:           v?.vehicle?.fuel ?? '',
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
          ...(() => {
            let x: Record<string, string | null> = {}
            const m = /__socioAdmExtras__=(\{.*\})/.exec(String(p?.notes ?? ''))
            if (m) { try { x = JSON.parse(m[1]) } catch { x = {} } }
            const dn = x.socioAdmDataNascimento ?? ''
            return {
              socioAdmRg:             x.socioAdmRg ?? '',
              socioAdmDataNascimento: /^\d{4}-\d{2}-\d{2}/.test(dn) ? dn.slice(0, 10) : dn,
              socioAdmNomeMae:        p?.socioAdmNomeMae ?? '',
              socioAdmEmail:          p?.socioAdmEmail ?? '',
              socioAdmWhatsapp:       !!p?.socioAdmWhatsapp,
              socioAdmCep:        x.socioAdmCep ? formatCEP(x.socioAdmCep) : '', socioAdmLogradouro: x.socioAdmLogradouro ?? '', socioAdmNumero: x.socioAdmNumero ?? '',
              socioAdmComplemento: x.socioAdmComplemento ?? '', socioAdmBairro: x.socioAdmBairro ?? '', socioAdmCidade: x.socioAdmCidade ?? '',
              socioAdmEstado:     x.socioAdmEstado ?? '',
            }
          })(),
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
          extraVehicles:      allMains.slice(1).map((v: { id: string }) => ({ ...mkVehicle(v as typeof vMain), key: v.id })),
          extraTradeVehicles: allTrades.slice(1).map((v: { id: string }) => ({ ...mkVehicle(v as typeof vMain), key: v.id })),
          consignMinValue: num(d.consignMinValue),
          consignCommPct:  d.consignCommPct ? String(d.consignCommPct) : '',
          consignDeadline: d.consignDeadline ? String(d.consignDeadline).slice(0, 10) : '',
          debts: Array.isArray(d.debts) ? d.debts.map((debt: { id: string; vehicleRole: string; type: string; description: string | null; value: number | string; responsavel: string; notes: string | null; dueDate: string | null }) => ({
            id:          debt.id,
            vehicleRole: debt.vehicleRole ?? 'VENDIDO',
            type:        debt.type,
            description: debt.description ?? '',
            value:       num(debt.value),
            responsavel: debt.responsavel ?? 'LOJA',
            notes:       debt.notes ?? '',
            dueDate:     debt.dueDate ? String(debt.dueDate).slice(0, 10) : '',
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
          // Pagamentos exatamente como cadastrados (DealPayment). Só negociação
          // antiga, sem nenhum pagamento gravado, cai nos campos legados.
          payments: (() => {
            type Row = { id: string; type: string; status: string | null; value: number | string; method: string | null; bank: string | null; cardBrand: string | null; pixKey: string | null; installments: number | null; installmentValue: number | string | null; installmentIntervalDays: number | null; returnPct: number | string | null; vehiclePlate: string | null; firstDueDate: string | null; dueDate: string | null; paidAt: string | null; notes: string | null; authorizationCode: string | null }
            const day = (v: string | null) => (v ? String(v).slice(0, 10) : '')
            const rows: Row[] = Array.isArray(d.payments) ? d.payments : []
            if (rows.length) {
              return rows.map((r): PaymentEntry => ({
                ...EMPTY_PAYMENT(),
                id:           r.id,
                type:         (r.type === 'OUTROS' ? 'OUTRO' : r.type) as PaymentEntryType,
                status:       (r.status ?? 'PENDENTE') as PaymentEntryStatus,
                amount:       num(r.value),
                dueDate:      day(r.dueDate),
                paidAt:       day(r.paidAt),
                bank:         r.bank ?? '',
                cardBrand:    r.cardBrand ?? '',
                installments: r.installments ? String(r.installments) : '',
                installmentValue:        num(r.installmentValue),
                installmentIntervalDays: r.installmentIntervalDays ? String(r.installmentIntervalDays) : '',
                firstDueDate: day(r.firstDueDate),
                returnPct:    r.returnPct != null && r.returnPct !== '' ? String(r.returnPct).replace('.', ',') : '',
                vehiclePlate: r.vehiclePlate ?? '',
                pixKey:       r.pixKey ?? '',
                notes:        r.notes ?? '',
                signalMethod: r.method ?? undefined,
                authorizationCode: r.authorizationCode ?? undefined,
              }))
            }
            const list: PaymentEntry[] = []
            if ((parseBRLInput(num(d.signalAmount)) ?? 0) > 0) list.push({ ...EMPTY_PAYMENT(), type: 'SINAL', status: 'CONFIRMADO', amount: num(d.signalAmount) })
            if ((parseBRLInput(num(d.financedAmount)) ?? 0) > 0) list.push({ ...EMPTY_PAYMENT(), type: 'FINANCIAMENTO', status: 'PENDENTE', amount: num(d.financedAmount), bank: d.paymentBank ?? '' })
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

  // Edição: os débitos já salvos vêm do servidor (sem débito automático da quitação).
  // A negociação carregada já tinha mais de um veículo (a edição manda a lista inteira).
  const hadExtraVehicles = useRef(false)
  const syncPayoff = (p: DealForm) => (mode === 'edit' ? p : applyPayoffDebt(p))
  const setField = <K extends keyof DealForm>(k: K, v: DealForm[K]) =>
    setForm((p) => (k === 'tradeVehicle' || k === 'extraTradeVehicles' || k === 'type' ? syncPayoff({ ...p, [k]: v }) : { ...p, [k]: v }))

  const setFields = useCallback((updates: Partial<DealForm>) =>
    setForm((p) => ({ ...p, ...updates })), [])

  const setVehicleField = (k: keyof VehicleFields, v: string | boolean | null) =>
    setForm((p) => ({ ...p, vehicle: { ...p.vehicle, [k]: v as VehicleFields[typeof k] } }))

  const setTradeVehicleField = (k: keyof VehicleFields, v: string | boolean | null) =>
    setForm((p) => syncPayoff({ ...p, tradeVehicle: { ...p.tradeVehicle, [k]: v as VehicleFields[typeof k] } }))



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
        else if (form.type === 'TROCA' && !isValidPlate(form.tradeVehicle.plate))
          errs.push('Placa do veículo da troca inválida.')
        if (form.type === 'TROCA' && form.extraTradeVehicles.some((x) => !isValidPlate(x.plate)))
          errs.push('Placa inválida em um dos veículos adicionais da troca.')
        if ((form.type === 'VENDA' || form.type === 'TROCA') && form.extraVehicles.some((x) => !x.vehicleId))
          errs.push('Um dos veículos adicionais não está no estoque — remova-o e adicione de novo.')
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

  // Etapa Cliente: ao avançar, grava o cliente no cadastro (cria ou atualiza
  // pelo CPF/CNPJ) — fica disponível para as próximas negociações mesmo que
  // esta não seja concluída.
  const [savingClient, setSavingClient] = useState(false)
  const saveClient = async (): Promise<boolean> => {
    setSavingClient(true)
    try {
      const res = await fetch('/api/people/upsert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: form.personId ?? null, person: buildPersonPayload() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.data?.id) { showToast(data?.error ?? 'Não foi possível salvar o cliente no cadastro.', false); return false }
      setField('personId', data.data.id)
      showToast(data.data.created ? 'Cliente cadastrado — já disponível para as próximas negociações.' : 'Cadastro do cliente atualizado.', true)
      return true
    } catch {
      showToast('Sem conexão: o cliente não foi salvo. Tente de novo.', false)
      return false
    } finally {
      setSavingClient(false)
    }
  }

  const tryNext = async () => {
    const errs = validateStep(step)
    if (errs.length > 0) { showToast(errs[0], false); return }
    // Também na edição: o cliente alterado vai para o cadastro (e vincula o novo, se trocou o CPF).
    if (step === 1 && !(await saveClient())) return
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  // Dados do cliente (Person) — usados ao avançar da etapa Cliente (grava no
  // cadastro) e no envio final da negociação.
  const buildPersonPayload = () => ({
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
  })

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
      // Rascunho de uso único: o servidor recusa o segundo envio (outro aparelho).
      draftId:  mode === 'create' && draftId ? draftId : undefined,
      personId: form.personId ?? undefined,
      // Edição: sempre envia o cliente — o servidor grava no cadastro vinculado (personId).
      person: form.personId && mode !== 'edit' ? undefined : buildPersonPayload(),
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
      // Na edição, `null` = usuário removeu o veículo (ausente = não mexe).
      } : (mode === 'edit' ? null : undefined),
      tradeInVehicle: hasTradeVehicle ? {
        evaluationId:   tv.evaluationId ?? undefined,
        vehicleId:      tv.vehicleId ?? undefined,
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
      } : (mode === 'edit' ? null : undefined),
      // Vários veículos: só vai quando há (ou havia) carros adicionais — sem eles o
      // servidor segue o caminho de um veículo só.
      ...(form.extraVehicles.length || form.extraTradeVehicles.length || hadExtraVehicles.current ? {
        extraVehicles: (form.type === 'CONSIGNACAO' ? [] : form.extraVehicles).filter((x) => x.plate || x.brand || x.vehicleId).map((x) => ({
          vehicleId: x.vehicleId ?? undefined, evaluationId: x.evaluationId ?? undefined,
          plate: x.plate || null, brand: x.brand || null, model: x.model || null, version: x.version || null,
          year: x.year ? Number(x.year) : null, color: x.color || null, km: x.km ? Number(x.km) : null, fuel: x.fuel || null,
          agreedValue: parseBRLInput(x.vehicleValue), evaluatedValue: parseBRLInput(x.evaluatedValue), fipeValue: parseBRLInput(x.fipeValue),
          hasFinancing: x.hasFinancing, payoffValue: parseBRLInput(x.payoffValue), payoffBank: x.payoffBank || null, notes: x.notes || null,
        })),
        extraTradeInVehicles: (form.type === 'TROCA' ? form.extraTradeVehicles : []).filter((x) => x.plate || x.brand).map((x) => ({
          evaluationId: x.evaluationId ?? undefined, vehicleId: x.vehicleId ?? undefined,
          plate: x.plate || null, brand: x.brand || null, model: x.model || null,
          year: x.year ? Number(x.year) : null, km: x.km ? Number(x.km) : null, color: x.color || null,
          agreedValue: parseBRLInput(x.agreedValue), evaluatedValue: parseBRLInput(x.evaluatedValue), fipeValue: parseBRLInput(x.fipeValue),
          hasFinancing: x.hasFinancing, payoffValue: parseBRLInput(x.payoffValue), payoffBank: x.payoffBank || null, notes: x.notes || null,
        })),
      } : {}),
      saleAmount:       parseBRLInput(form.saleAmount),
      purchaseAmount:   parseBRLInput(form.purchaseAmount),
      // Os campos legados signalAmount/financedAmount/paymentType/paymentBank
      // são DERIVADOS do array form.payments (novo modelo multi-pagamento)
      // — backend continua aceitando shape antigo sem mudanças.
      signalAmount:     (() => {
        const sum = form.payments
          .filter((p) => p.status !== 'CANCELADO' && (p.type === 'SINAL' || p.type === 'ENTRADA'))
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
          id:           p.id,
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
          signalMethod:      p.signalMethod      || null,
          authorizationCode: p.authorizationCode || null,
          receipt:           p.receipt           ?? null,
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
            id:          d.id,
            vehicleRole: d.vehicleRole,
            type:        d.type,
            description: d.description,
            value:       parseBRLInput(d.value) ?? 0,
            responsavel: d.responsavel,
            notes:       d.notes || null,
            dueDate:     d.dueDate || null,
            receipt:     d.receipt ?? null,
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
        if (submit && dealMeta && RESUBMITTABLE.has(dealMeta.status)) {
          const sr = await fetch(`/api/negotiations/${dealId}/submit`, { method: 'POST' })
          const sd = await sr.json().catch(() => ({}))
          if (!sr.ok) throw new Error(`Alterações salvas, mas não foi possível reenviar: ${sd.error ?? 'erro'}`)
        }
        showToast(submit ? 'Negociação atualizada e reenviada para aprovação.' : 'Negociação atualizada com sucesso.', true)
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
      if (draftId) await fetch(`/api/negotiations/drafts/${draftId}`, { method: 'DELETE' }).catch(() => undefined)
      router.replace(`/negociacoes/${data.data.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado')
      setSaving(false)
    }
  }

  const isLastStep = step === STEPS.length - 1
  const isFinalButtons = step === 6 || step === 7

  // ── Tela de loading durante hidratação (modo edição) ─────────────────────
  if (mode === 'create' && !draftReady) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-3 py-24">
        <Loader2 size={28} className="animate-spin text-brand-600" />
        <p className="text-sm font-medium text-gray-700">Abrindo o rascunho da negociação…</p>
      </div>
    )
  }
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
          <p className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>Etapa {step + 1} de {STEPS.length} — {STEPS[step].label}</span>
            {mode === 'create' && draftState.status !== 'idle' && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${draftState.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}
                title="A negociação fica salva como rascunho: pode sair e continuar depois em Negociações.">
                {draftState.status === 'saving' ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                {draftState.status === 'saving' ? 'Salvando rascunho…'
                  : draftState.status === 'error' ? 'Rascunho não salvo'
                  : `Rascunho salvo${draftState.at ? ` às ${new Date(draftState.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''} · parou em ${STEPS[step].label}`}
              </span>
            )}
          </p>
        </div>
      </div>

      {mode === 'create' && !draftParam && !form.type && step === 0 && openDrafts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Você tem negociação em andamento:</p>
          <ul className="mt-1 space-y-1">
            {openDrafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs">{d.title || 'Sem cliente/veículo'} · parou em <b>{STEPS[d.step]?.label ?? '—'}</b> · {new Date(d.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                <Link href={`/negociacoes/nova?rascunho=${d.id}`} className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700">Continuar</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

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
            onClick={() => void tryNext()}
            disabled={savingClient}
            className={`flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-70 ${
              canProceed()
                ? 'bg-brand-600 hover:bg-brand-700'
                : 'bg-brand-300 hover:bg-brand-400'
            }`}
          >
            {savingClient ? <><Loader2 size={14} className="animate-spin" />Salvando cliente…</> : <>Próximo<ArrowRight size={14} /></>}
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
