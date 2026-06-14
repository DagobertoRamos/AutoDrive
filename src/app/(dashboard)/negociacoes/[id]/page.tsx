'use client'

// =============================================================================
// /negociacoes/[id] — Página de detalhe completa da negociação
// =============================================================================

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Handshake,
  User,
  Car,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  MoreVertical,
  Sheet,
  Settings2,
  FileText,
  Shield,
  Wrench,
  ChevronDown,
  ChevronUp,
  Database,
  Loader2,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Ban,
  Edit,
  MessageSquare,
  Pin,
} from 'lucide-react'
import { canAccessModule } from '@/lib/permissions'
import { maskBRL, parseBRL } from '@/lib/masks'
import { calculateNegotiationFinancialSummary, dealToFinancialInput } from '@/lib/negotiation-service'
import Phase2Panel from './_components/Phase2Panel'
import ReturnPanel from './_components/ReturnPanel'
import WarrantySalesPanel from './_components/WarrantySalesPanel'
import DealSummary from './_components/DealSummary'
import AttachmentUploader, { type Attachment } from './_components/AttachmentUploader'
import ContractsTab from './_components/ContractsTab'
import NfeTab from './_components/NfeTab'
import NotesPanel from './_components/NotesPanel'
import { useDealActions } from './_hooks/useDealActions'
import { isDealLocked, canAddPayment, canApproveDiscount, canReopen, canForceFinalize } from '@/lib/negotiation-rbac'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DealService {
  id:         string
  name:       string
  value:      string | number | null
  cost:       string | number | null
  supplier:   string | null
  commission: string | number | null
  notes:      string | null
}

interface DealVehicle {
  id:             string
  role:           string
  plate:          string | null
  brand:          string | null
  model:          string | null
  year:           number | null
  color:          string | null
  km:             number | null
  condition:      string | null
  agreedValue:    string | number | null
  evaluatedValue: string | number | null
  fipeValue:      string | number | null
  hasFinancing:   boolean
  payoffValue:    string | number | null
  payoffBank:     string | null
  notes:          string | null
  vehicle?: {
    plate:  string | null
    brand:  string | null
    model:  string | null
    year:   number | null
    color:  string | null
  } | null
}

interface DealDetail {
  id:                  string
  dealNumber:          string | null
  type:                string
  status:              string
  source:              string | null
  saleAmount:          string | number | null
  purchaseAmount:      string | number | null
  financedAmount:      string | number | null
  documentationFee:    string | number | null
  signalAmount:        string | number | null
  payoffAmount:        string | number | null
  payoffBank:          string | null
  discountAmount:      string | number | null
  servicesAmount:      string | number | null
  marginAmount:        string | number | null
  paymentBank:         string | null
  paymentType:         string | null
  consignMinValue:     string | number | null
  consignCommPct:      string | number | null
  consignDeadline:     string | null
  vehicleValue:        string | number | null
  tradeValue:          string | number | null
  totalDebts:          string | number | null
  totalPayments:       string | number | null
  balance:             string | number | null
  changeAmount:        string | number | null
  changeBeneficiary:   string | null
  changeBeneficiaryCpf: string | null
  changeBank:          string | null
  changeAgency:        string | null
  changeAccount:       string | null
  changePix:           string | null
  approvalNotes:       string | null
  approvedAt:          string | null
  deliveryDate:        string | null
  finalizedAt:         string | null
  cancelledAt:         string | null
  cancelledReason:     string | null
  notes:               string | null
  saleDate:            string | null
  isSellerProvisional: boolean
  sellerNameFromSheet: string | null
  createdAt:           string
  updatedAt:           string
  person: {
    nomeCompleto: string
    type:         string
    cpf:          string | null
    cnpj:         string | null
    email:        string | null
    phone:        string | null
  } | null
  customer: {
    id:    string
    name:  string
    email: string | null
    phone: string | null
    cpf:   string | null
  } | null
  seller: {
    id:        string
    fullName:  string | null
    shortName: string | null
    user:      { id: string; name: string | null; email: string | null } | null
  } | null
  manager: { id: string; name: string; email: string } | null
  approvedBy:  { id: string; name: string } | null
  cancelledBy: { id: string; name: string } | null
  vehicles:  DealVehicle[]
  services:  DealService[]
  pendencies: Array<{
    id:          string
    type:        string
    status:      string
    priority:    string
    description: string | null
  }>
  sheetImportRows: Array<{
    id:             string
    sheetName:      string | null
    externalId:     string | null
    rawData:        Record<string, string> | null
    referenceMonth: string | null
    sellerName:     string | null
    customerName:   string | null
    plate:          string | null
    vehicleModel:   string | null
    status:         string
    createdAt:      string
  }>
  statusHistory: Array<{
    id:             string
    previousStatus: string | null
    newStatus:      string
    reason:         string | null
    createdAt:      string
    changedByUser:  { name: string } | null
  }>
}

interface TimelineEvent {
  type:        string
  icon:        string
  title:       string
  description: string | null
  user:        string | null
  date:        string
}

interface AuditEntry {
  id:        string
  action:    string
  field:     string | null
  oldValue:  string | null
  newValue:  string | null
  user:      { name: string } | null
  createdAt: string
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO:                'Rascunho',
  EM_PREENCHIMENTO:         'Em Preenchimento',
  AGUARDANDO_LIBERACAO:     'Aguardando Liberação',
  AGUARDANDO_APROVACAO:     'Aguardando Aprovação',
  LIBERADA:                 'Liberada',
  APROVADA:                 'Aprovada',
  RECUSADA:                 'Recusada',
  DESAPROVADA:              'Desaprovada',
  DEVOLVIDA_PARA_CORRECAO:  'Devolvida p/ Correção',
  AGUARDANDO_SINAL:         'Aguardando Sinal',
  SINAL_RECEBIDO:           'Sinal Recebido',
  RESERVADA:                'Reservada',
  AGUARDANDO_FINANCEIRO:    'Aguardando Financeiro',
  FINANCEIRO_APROVADO:      'Financeiro Aprovado',
  FINANCEIRO_REPROVADO:     'Financeiro Reprovado',
  AGUARDANDO_DOCUMENTACAO:  'Aguardando Documentação',
  DOCUMENTACAO_CONCLUIDA:   'Documentação Concluída',
  AGUARDANDO_CONTRATO:      'Aguardando Contrato',
  CONTRATO_GERADO:          'Contrato Gerado',
  AGUARDANDO_ASSINATURA:    'Aguardando Assinatura',
  ASSINADA:                 'Assinada',
  AGUARDANDO_ENTREGA:       'Aguardando Entrega',
  ENTREGUE:                 'Entregue',
  EM_ANDAMENTO:             'Em Andamento',
  FINALIZADA:               'Finalizada',
  CANCELADA:                'Cancelada',
  REABERTA:                 'Reaberta',
  BLOQUEADA:                'Bloqueada',
}

const STATUS_COLOR: Record<string, string> = {
  RASCUNHO:                'bg-gray-100    text-gray-600',
  EM_PREENCHIMENTO:         'bg-slate-100   text-slate-700',
  AGUARDANDO_LIBERACAO:     'bg-amber-100   text-amber-800',
  AGUARDANDO_APROVACAO:     'bg-amber-100   text-amber-800',
  LIBERADA:                 'bg-blue-100    text-blue-800',
  APROVADA:                 'bg-blue-100    text-blue-800',
  RECUSADA:                 'bg-red-100     text-red-800',
  DESAPROVADA:              'bg-red-100     text-red-800',
  DEVOLVIDA_PARA_CORRECAO:  'bg-orange-100  text-orange-800',
  AGUARDANDO_SINAL:         'bg-yellow-100  text-yellow-800',
  SINAL_RECEBIDO:           'bg-lime-100    text-lime-800',
  RESERVADA:                'bg-cyan-100    text-cyan-800',
  AGUARDANDO_FINANCEIRO:    'bg-indigo-100  text-indigo-800',
  FINANCEIRO_APROVADO:      'bg-teal-100    text-teal-800',
  FINANCEIRO_REPROVADO:     'bg-rose-100    text-rose-800',
  AGUARDANDO_DOCUMENTACAO:  'bg-violet-100  text-violet-800',
  DOCUMENTACAO_CONCLUIDA:   'bg-emerald-100 text-emerald-800',
  AGUARDANDO_CONTRATO:      'bg-fuchsia-100 text-fuchsia-800',
  CONTRATO_GERADO:          'bg-sky-100     text-sky-800',
  AGUARDANDO_ASSINATURA:    'bg-purple-100  text-purple-800',
  ASSINADA:                 'bg-green-100   text-green-800',
  AGUARDANDO_ENTREGA:       'bg-blue-100    text-blue-800',
  ENTREGUE:                 'bg-emerald-100 text-emerald-800',
  EM_ANDAMENTO:             'bg-blue-100    text-blue-800',
  FINALIZADA:               'bg-green-600   text-white',
  CANCELADA:                'bg-red-100     text-red-800',
  REABERTA:                 'bg-orange-100  text-orange-800',
  BLOQUEADA:                'bg-gray-200    text-gray-700',
}

const TYPE_LABEL: Record<string, string> = {
  VENDA: 'Venda', COMPRA: 'Compra', TROCA: 'Troca', CONSIGNACAO: 'Consignação',
}

const TYPE_COLOR: Record<string, string> = {
  VENDA:       'bg-green-100  text-green-800',
  COMPRA:      'bg-blue-100   text-blue-800',
  TROCA:       'bg-purple-100 text-purple-800',
  CONSIGNACAO: 'bg-amber-100  text-amber-800',
}

const ROLE_LABEL: Record<string, string> = {
  VENDIDO:    'Vendido',
  COMPRADO:   'Comprado',
  TROCA:      'Troca',
  CONSIGNADO: 'Consignado',
}

const fmtBRL = (v: string | number | null | undefined) =>
  v != null && v !== '' && Number(v) !== 0
    ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('pt-BR') : null

const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('pt-BR') : null

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return 'agora mesmo'
  if (mins < 60)  return `há ${mins} min`
  if (hours < 24) return `há ${hours}h`
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-800 break-all">{value}</dd>
    </div>
  )
}

function ValueRow({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  if (!value) return null
  return (
    <div className={`flex justify-between py-1.5 text-sm ${highlight ? 'font-bold text-brand-700' : ''}`}>
      <span className={highlight ? '' : 'text-gray-500'}>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function SectionCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
        {icon && <span className="text-brand-600">{icon}</span>}
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
      ))}
    </div>
  )
}

function SheetDataAccordion({ rows }: { rows: DealDetail['sheetImportRows'] }) {
  const [open, setOpen] = useState(false)
  if (!rows || rows.length === 0) return null

  const latest = rows[0]
  const raw    = latest.rawData as Record<string, string> | null ?? {}

  const displayFields: { label: string; key: string }[] = [
    { label: 'Revenda Saída',                key: 'revendaSaida' },
    { label: 'Dia da Venda',                  key: 'saleDate' },
    { label: 'Vendedor',                      key: 'sellerName' },
    { label: 'Placa',                         key: 'plate' },
    { label: 'Modelo',                        key: 'vehicle' },
    { label: 'STATUS',                        key: 'statusMain' },
    { label: 'PENDENCIA',                     key: 'statusDetail' },
    { label: 'Negociação Saida ID',           key: 'negotiation' },
    { label: 'Negociação Saida Tipo',         key: 'dealType' },
    { label: 'Cliente Negociação Saida',      key: 'customerName' },
    { label: 'Valor Venda',                   key: 'saleValue' },
    { label: 'Valor Doc',                     key: 'docValue' },
    { label: 'Aba',                           key: '__sheetName' },
    { label: 'Banco',                         key: 'bank' },
    { label: 'Valor Financiado',              key: 'financedValue' },
    { label: 'Tipo Retorno (R)',              key: 'returnType' },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between border-b border-indigo-100 bg-indigo-50 px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Database size={15} className="text-indigo-600" />
          <span className="font-semibold text-indigo-800">Dados da Planilha</span>
          {latest.sheetName && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
              {latest.referenceMonth ?? latest.sheetName}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-indigo-500" /> : <ChevronDown size={16} className="text-indigo-500" />}
      </button>
      {open && (
        <div className="p-4">
          <dl className="divide-y divide-gray-50">
            {displayFields.map(({ label, key }) => {
              const val = raw[key] ?? (key === '__sheetName' ? latest.sheetName : null)
              if (!val) return null
              return (
                <div key={key} className="flex items-start justify-between gap-4 py-1.5 text-sm">
                  <dt className="shrink-0 text-gray-500">{label}</dt>
                  <dd className="text-right font-medium text-gray-800 break-all">{val}</dd>
                </div>
              )
            })}
          </dl>
          {latest.externalId && (
            <p className="mt-3 text-xs text-gray-400">
              ID externo: <span className="font-mono">{latest.externalId}</span>
              {' · '}Importado em {new Date(latest.createdAt).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Resumo Financeiro (read-only, top-down) ──────────────────────────────────

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DINHEIRO:        'Dinheiro',
  PIX:             'PIX',
  TRANSFERENCIA:   'Transferência',
  CARTAO_DEBITO:   'Cartão de Débito',
  CARTAO_CREDITO:  'Cartão de Crédito',
  FINANCIAMENTO:   'Financiamento',
  BOLETO:          'Boleto',
  CHEQUE:          'Cheque',
  QUITACAO:        'Quitação',
}

interface FinancialReviewProps {
  deal:        DealDetail
  attachments: Attachment[]
  onReload:    () => void
  onToast:     (msg: string, ok?: boolean) => void
}

function FinancialReview({ deal, attachments, onReload, onToast }: FinancialReviewProps) {
  const anyDeal = deal as any
  const debts: Array<{ id: string; type?: string; description?: string | null; value: number | string; responsavel?: string | null }> = anyDeal.debts ?? []
  const payments: Array<{ id?: string; type: string; value: number | string; bank?: string | null; agency?: string | null; account?: string | null; pixKey?: string | null; installments?: number | null }> = anyDeal.payments ?? []
  const changes: Array<{ id: string; value: number | string; beneficiary: string; bank?: string | null; agency?: string | null; account?: string | null; pixKey?: string | null }> = anyDeal.changes ?? []

  const byPayment = (id?: string) => attachments.filter((a) => a.paymentId === id && a.category === 'COMPROVANTE_PAGAMENTO')
  const byDebt    = (id: string)  => attachments.filter((a) => a.debtId    === id && a.category === 'COMPROVANTE_DEBITO')
  const byPayoff  = (vehId: string) => attachments.filter((a) => a.vehicleId === vehId && a.category === 'COMPROVANTE_QUITACAO')
  const byChange  = (id: string)  => attachments.filter((a) => a.changeId  === id && a.category === 'COMPROVANTE_TROCO')

  const isCompra = deal.type === 'COMPRA'
  const vehicleLabel = isCompra ? 'Veículo Comprado' : deal.type === 'TROCA' ? 'Veículo Vendido' : deal.type === 'CONSIGNACAO' ? 'Valor de Anúncio' : 'Veículo Vendido'

  const compraVehicle = deal.vehicles.find((v) => v.role === 'COMPRADO' || v.role === 'TROCA')
  const baseValue = Number(
    (isCompra ? deal.purchaseAmount : deal.saleAmount) ?? deal.vehicleValue ?? compraVehicle?.agreedValue ?? 0,
  )

  const debtsTotal = debts.reduce((s, d) => s + Number(d.value ?? 0), 0)

  // Quitação: tratada como débito (subtrai)
  const payoffFromVehicle = deal.vehicles.reduce((s, v) => s + (v.hasFinancing ? Number(v.payoffValue ?? 0) : 0), 0)
  const payoffFromDeal    = Number(deal.payoffAmount ?? 0)
  const payoffTotal       = payoffFromVehicle || payoffFromDeal

  const subtotal = Math.max(0, baseValue - debtsTotal - payoffTotal)

  const paymentsTotal = payments.reduce((s, p) => s + Number(p.value ?? 0), 0)
  const changesTotal  = changes.reduce((s, c) => s + Number(c.value ?? 0), 0)

  // Valor a ser pago ao cliente (COMPRA): subtotal coberto via pagamentos cadastrados.
  // Se não há pagamentos ainda, o "a pagar" é o próprio subtotal.
  const valorAPagar = isCompra ? (paymentsTotal > 0 ? paymentsTotal : subtotal) : subtotal

  return (
    <SectionCard title="Resumo Financeiro" icon={<DollarSign size={15} />}>
      <div className="space-y-4">
        {/* 1) Veículo */}
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{vehicleLabel}</p>
              {compraVehicle && (
                <p className="mt-0.5 text-sm font-medium text-gray-800">
                  {[compraVehicle.brand, compraVehicle.model, compraVehicle.year].filter(Boolean).join(' ')}
                  {compraVehicle.plate && <span className="ml-2 font-mono text-xs text-gray-500">{compraVehicle.plate}</span>}
                </p>
              )}
            </div>
            <span className="text-lg font-semibold text-gray-900">{fmtBRL(baseValue) ?? '—'}</span>
          </div>
        </div>

        {/* 2) Débitos */}
        {(debts.length > 0 || payoffTotal > 0) && (
          <div className="rounded-lg border border-gray-100 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Débitos</p>
              <span className="text-sm font-semibold text-red-600">− {fmtBRL(debtsTotal + payoffTotal)}</span>
            </div>
            <ul className="divide-y divide-gray-50">
              {debts.map((d) => (
                <li key={d.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">
                      {(d.type ?? 'Débito').replace(/_/g, ' ')}
                      {d.description && <span className="text-gray-400"> · {d.description}</span>}
                    </span>
                    <span className="text-gray-800">− {fmtBRL(d.value)}</span>
                  </div>
                  <div className="mt-1.5">
                    <AttachmentUploader
                      dealId={deal.id}
                      category="COMPROVANTE_DEBITO"
                      linkKey="debtId"
                      linkValue={d.id}
                      attachments={byDebt(d.id)}
                      compact
                      onChange={onReload}
                      onToast={onToast}
                    />
                  </div>
                </li>
              ))}
              {deal.vehicles.filter((v) => v.hasFinancing && Number(v.payoffValue ?? 0) > 0).map((v) => (
                <li key={`payoff-${v.id}`} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">
                      Quitação de financiamento
                      {v.payoffBank && <span className="text-gray-400"> · {v.payoffBank}</span>}
                      {v.plate     && <span className="text-gray-400"> · {v.plate}</span>}
                    </span>
                    <span className="text-gray-800">− {fmtBRL(v.payoffValue)}</span>
                  </div>
                  <div className="mt-1.5">
                    <AttachmentUploader
                      dealId={deal.id}
                      category="COMPROVANTE_QUITACAO"
                      linkKey="vehicleId"
                      linkValue={v.id}
                      attachments={byPayoff(v.id)}
                      compact
                      onChange={onReload}
                      onToast={onToast}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 3) Subtotal */}
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
          <span className="text-sm font-semibold text-gray-700">Subtotal</span>
          <span className="text-base font-semibold text-gray-900">{fmtBRL(subtotal) ?? '—'}</span>
        </div>

        {/* 4) Dados de pagamento do cliente */}
        {payments.length > 0 && (
          <div className="rounded-lg border border-gray-100 px-4 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              {isCompra ? 'Dados de pagamento do cliente' : 'Pagamentos recebidos'}
            </p>
            <ul className="divide-y divide-gray-50">
              {payments.map((p, i) => {
                const dest = [p.bank, p.agency && `Ag ${p.agency}`, p.account && `Cc ${p.account}`].filter(Boolean).join(' · ')
                return (
                  <li key={p.id ?? i} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">{PAYMENT_TYPE_LABEL[p.type] ?? p.type}</span>
                      <span className="text-gray-900">{fmtBRL(p.value) ?? '—'}</span>
                    </div>
                    {(dest || p.pixKey) && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {dest}
                        {p.pixKey && <>{dest ? ' · ' : ''}PIX: <span className="font-mono">{p.pixKey}</span></>}
                      </p>
                    )}
                    {p.id && (
                      <div className="mt-1.5">
                        <AttachmentUploader
                          dealId={deal.id}
                          category="COMPROVANTE_PAGAMENTO"
                          linkKey="paymentId"
                          linkValue={p.id}
                          attachments={byPayment(p.id)}
                          compact
                          onChange={onReload}
                          onToast={onToast}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Troco ao cliente (excedente) */}
        {changesTotal > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Troco ao cliente</p>
              <span className="text-sm font-semibold text-amber-800">{fmtBRL(changesTotal)}</span>
            </div>
            <ul className="divide-y divide-amber-100">
              {changes.map((c) => (
                <li key={c.id} className="py-1.5 text-xs text-amber-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.beneficiary}</span>
                    <span>{fmtBRL(c.value)}</span>
                  </div>
                  {(c.bank || c.pixKey) && (
                    <p className="mt-0.5 text-[11px] text-amber-700">
                      {[c.bank, c.agency && `Ag ${c.agency}`, c.account && `Cc ${c.account}`].filter(Boolean).join(' · ')}
                      {c.pixKey && <> · PIX <span className="font-mono">{c.pixKey}</span></>}
                    </p>
                  )}
                  <div className="mt-1.5">
                    <AttachmentUploader
                      dealId={deal.id}
                      category="COMPROVANTE_TROCO"
                      linkKey="changeId"
                      linkValue={c.id}
                      attachments={byChange(c.id)}
                      compact
                      onChange={onReload}
                      onToast={onToast}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 5) Valor a ser pago ao cliente */}
        {isCompra && (
          <div className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
            <span className="text-sm font-semibold text-brand-800">Valor a ser pago ao cliente</span>
            <span className="text-lg font-bold text-brand-700">{fmtBRL(valorAPagar) ?? '—'}</span>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function TotalOperationCard({ deal }: { deal: DealDetail }) {
  const anyDeal = deal as any
  const debts: Array<{ value: number | string }> = anyDeal.debts ?? []
  const isCompra = deal.type === 'COMPRA'
  const baseValue = Number((isCompra ? deal.purchaseAmount : deal.saleAmount) ?? deal.vehicleValue ?? 0)
  const debtsTotal = debts.reduce((s, d) => s + Number(d.value ?? 0), 0)
  const payoffTotal = deal.vehicles.reduce((s, v) => s + (v.hasFinancing ? Number(v.payoffValue ?? 0) : 0), 0) || Number(deal.payoffAmount ?? 0)
  const total = isCompra
    ? Math.max(0, baseValue - debtsTotal - payoffTotal)
    : baseValue

  return (
    <div className="flex items-center justify-between rounded-2xl border border-brand-300 bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-4 text-white shadow-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-100">Total da Operação</p>
        <p className="mt-0.5 text-xs text-brand-100/80">
          {isCompra ? 'Valor líquido após débitos e quitação' : 'Valor consolidado da negociação'}
        </p>
      </div>
      <span className="text-2xl font-bold">{fmtBRL(total) ?? '—'}</span>
    </div>
  )
}

// ── DealValuesCard (resumo financeiro CLEAN, read-only) ─────────────────────

const PAYMENT_TYPE_LABEL_DV: Record<string, string> = {
  DINHEIRO:        'Dinheiro',
  PIX:             'PIX',
  TRANSFERENCIA:   'Transferência',
  CARTAO_DEBITO:   'Cartão de Débito',
  CARTAO_CREDITO:  'Cartão de Crédito',
  FINANCIAMENTO:   'Financiamento',
  BOLETO:          'Boleto',
  CHEQUE:          'Cheque',
  DUPLICATA:       'Duplicata',
  SINAL:           'Sinal',
  QUITACAO:        'Quitação',
  OUTRO:           'Outro',
}

function DealValuesCard({ deal }: { deal: DealDetail }) {
  const anyDeal = deal as any

  // Fonte ÚNICA de verdade — mesma usada pelo backend e por Phase2Panel.
  // Garante que paidTotal NUNCA fica zerado se há payments confirmados/pendentes,
  // e que CANCELADO/ESTORNADO nunca conta como pago.
  const f = calculateNegotiationFinancialSummary(dealToFinancialInput(deal))

  const baseValue        = f.vehicleAmount
  const totalDebts       = f.debtAmount
  const discount         = f.discountApprovedTotal
  const docFee           = f.feeAmount
  const totalOperacao    = f.netTotal
  const totalPayments    = f.paidTotal
  const saldo            = f.openBalance
  const ok               = f.paymentStatus === 'QUITADO'

  const payments: Array<{ id?: string; type: string; status?: string; value: number | string; bank?: string | null; agency?: string | null; account?: string | null; pixKey?: string | null; installments?: number | null; installmentValue?: number | string | null; installmentIntervalDays?: number | null; firstDueDate?: string | null; vehiclePlate?: string | null; returnPct?: number | string | null }> = anyDeal.payments ?? []
  const changes: Array<{ id: string; value: number | string; beneficiary: string; bank?: string | null; agency?: string | null; account?: string | null; pixKey?: string | null }> = anyDeal.changes ?? []
  const debts: Array<{ id: string; type?: string; description?: string | null; value: number | string; responsavel?: string | null }> = anyDeal.debts ?? []
  const isCompra = deal.type === 'COMPRA'

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <DollarSign size={15} className="text-brand-600" />
          <h3 className="font-semibold text-gray-800">Valores Detalhados</h3>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
          ok ? 'bg-emerald-100 text-emerald-700'
             : saldo > 0 ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
        }`}>
          {ok ? '✓ Saldo zerado' : saldo > 0 ? `Em aberto: ${fmtBRL(saldo)}` : `Excedente: ${fmtBRL(Math.abs(saldo))}`}
        </span>
      </div>

      <div className="p-4">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="py-2 text-gray-700">{isCompra ? 'Valor de compra do veículo' : 'Valor do veículo'}</td>
              <td className="py-2 text-right font-medium text-gray-900">{fmtBRL(baseValue) ?? '—'}</td>
            </tr>
            {docFee > 0 && (
              <tr>
                <td className="py-2 text-gray-700">+ Taxa de documentação</td>
                <td className="py-2 text-right font-medium text-gray-900">{fmtBRL(docFee)}</td>
              </tr>
            )}
            {debts.length > 0 && (
              <>
                <tr>
                  <td className="py-2 font-medium text-gray-700">{isCompra ? '− Débitos' : '+ Débitos'}</td>
                  <td className="py-2 text-right font-medium text-gray-900">{fmtBRL(totalDebts)}</td>
                </tr>
                {debts.map((d) => (
                  <tr key={d.id} className="text-xs text-gray-500">
                    <td className="py-1 pl-4">· {(d.type ?? '').replace(/_/g, ' ')}{d.description ? ` — ${d.description}` : ''}{d.responsavel ? ` (${d.responsavel.toLowerCase()})` : ''}</td>
                    <td className="py-1 text-right">{fmtBRL(d.value)}</td>
                  </tr>
                ))}
              </>
            )}
            {discount > 0 && (
              <tr>
                <td className="py-2 text-red-600">− Desconto</td>
                <td className="py-2 text-right font-medium text-red-600">- {fmtBRL(discount)}</td>
              </tr>
            )}
            <tr className="bg-gray-50">
              <td className="py-2 text-sm font-semibold text-gray-800">Total da operação</td>
              <td className="py-2 text-right text-base font-bold text-gray-900">{fmtBRL(totalOperacao)}</td>
            </tr>

            {payments.length > 0 && (
              <>
                <tr>
                  <td colSpan={2} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Pagamentos ({payments.length})
                  </td>
                </tr>
                {payments.map((p, i) => (
                  <tr key={p.id ?? i} className={p.status === 'CANCELADO' ? 'text-gray-400 line-through' : 'text-gray-700'}>
                    <td className="py-1.5">
                      <span>{PAYMENT_TYPE_LABEL_DV[p.type] ?? p.type}</span>
                      {p.bank && <span className="ml-1 text-xs text-gray-500">· {p.bank}</span>}
                      {p.installments && Number(p.installments) > 0 && (
                        <span className="ml-1 text-xs text-gray-500">
                          · {p.installments}x{p.installmentValue ? ` ${fmtBRL(p.installmentValue)}` : ''}
                          {p.installmentIntervalDays ? ` / ${p.installmentIntervalDays}d` : ''}
                        </span>
                      )}
                      {p.vehiclePlate && (
                        <span className="ml-1 rounded bg-gray-100 px-1 font-mono text-[10px]">{p.vehiclePlate}</span>
                      )}
                      {p.status && p.status !== 'PENDENTE' && p.status !== 'CANCELADO' && (
                        <span className="ml-1 rounded bg-green-100 px-1 text-[10px] text-green-700">{p.status}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-medium">{fmtBRL(p.value)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 text-sm font-medium text-gray-700">Total pago</td>
                  <td className="py-1.5 text-right font-semibold text-gray-900">{fmtBRL(totalPayments)}</td>
                </tr>
              </>
            )}

            {changes.length > 0 && (
              <>
                <tr>
                  <td colSpan={2} className="pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Troco ao cliente
                  </td>
                </tr>
                {changes.map((c) => (
                  <tr key={c.id} className="text-amber-800">
                    <td className="py-1.5">
                      {c.beneficiary}
                      {c.bank && <span className="ml-1 text-xs">· {c.bank}{c.agency ? ` ag ${c.agency}` : ''}{c.account ? ` cc ${c.account}` : ''}</span>}
                      {c.pixKey && <span className="ml-1 text-xs">· PIX <span className="font-mono">{c.pixKey}</span></span>}
                    </td>
                    <td className="py-1.5 text-right font-medium">{fmtBRL(c.value)}</td>
                  </tr>
                ))}
              </>
            )}

            <tr className={`${ok ? 'bg-emerald-50' : saldo > 0 ? 'bg-amber-50' : 'bg-blue-50'}`}>
              <td className={`py-2.5 text-sm font-bold ${ok ? 'text-emerald-800' : saldo > 0 ? 'text-amber-800' : 'text-blue-800'}`}>
                {ok ? 'Saldo' : saldo > 0 ? 'Em aberto' : 'Excedente (troco)'}
              </td>
              <td className={`py-2.5 text-right text-base font-bold ${ok ? 'text-emerald-700' : saldo > 0 ? 'text-amber-800' : 'text-blue-700'}`}>
                {fmtBRL(Math.abs(saldo))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Modal de motivo ───────────────────────────────────────────────────────────

interface MotiveModalProps {
  title:     string
  onConfirm: (reason: string) => void
  onCancel:  () => void
  loading:   boolean
}

function MotiveModal({ title, onConfirm, onCancel, loading }: MotiveModalProps) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-1 text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mb-4 text-sm text-gray-500">Informe o motivo (obrigatório).</p>
        <textarea
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 min-h-24 resize-y"
          placeholder="Descreva o motivo..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason)}
            disabled={!reason.trim() || loading}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de sinal ────────────────────────────────────────────────────────────

interface SignalModalProps {
  onConfirm: (value: string, notes: string) => void
  onCancel:  () => void
  loading:   boolean
}

function SignalModal({ onConfirm, onCancel, loading }: SignalModalProps) {
  const [value, setVal]   = useState('')
  const [notes, setNotes] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-1 text-lg font-semibold text-gray-900">Registrar Sinal</h3>
        <p className="mb-4 text-sm text-gray-500">Informe o valor recebido como sinal.</p>
        <label className="mb-1 block text-sm font-medium text-gray-700">Valor (R$)</label>
        <input
          type="text"
          inputMode="numeric"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="0,00"
          value={maskBRL(value)}
          onChange={(e) => setVal(maskBRL(e.target.value))}
        />
        <label className="mb-1 block text-sm font-medium text-gray-700">Observações</label>
        <textarea
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 min-h-16 resize-y"
          placeholder="Opcional..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => value && onConfirm(value, notes)}
            disabled={!value || loading}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Actions Menu ──────────────────────────────────────────────────────────────

type ModalType = 'reject' | 'cancel' | 'return' | 'signal' | null

interface ActionsDropdownProps {
  deal:      DealDetail
  role:      string | undefined
  onAction:  (action: string, payload?: Record<string, unknown>) => Promise<void>
  onOpenModal: (m: ModalType) => void
  activeTab:   string
  setTab:      (t: string) => void
  isManager:   boolean
  onEdit:      () => void
  actions:     ReturnType<typeof useDealActions>
  onForceFinalize: () => void
}

function ActionsDropdown({ deal, role, onAction, onOpenModal, activeTab, setTab, isManager, onEdit, actions, onForceFinalize }: ActionsDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const canSubmit  = ['RASCUNHO', 'EM_PREENCHIMENTO', 'DEVOLVIDA_PARA_CORRECAO'].includes(deal.status)
  const canApprove = isManager && ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'].includes(deal.status)
  const canReturn  = isManager && ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'].includes(deal.status)
  const canSignal  = ['APROVADA', 'LIBERADA', 'AGUARDANDO_SINAL'].includes(deal.status)
  const canFinalize = actions.canFinalizeNow
  const showForce   = actions.canForceFinalize && !actions.canFinalizeNow && actions.isFinalizable && !actions.isLocked
  const canReopen   = actions.canReopenNow
  const canCancel  = !['FINALIZADA', 'CANCELADA'].includes(deal.status)

  const item = (onClick: () => void, icon: React.ReactNode, label: string, cls = 'text-gray-700 hover:bg-gray-50') => (
    <button onClick={() => { onClick(); setOpen(false) }} className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm ${cls}`}>
      {icon} {label}
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
      >
        <MoreVertical size={15} /> Ações <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
          {item(() => { onEdit(); setOpen(false) }, <Edit size={14} className="text-gray-400" />, 'Editar negociação')}
          {canSubmit && item(() => onAction('submit'), <Send size={14} className="text-blue-400" />, 'Enviar para aprovação', 'text-blue-700 hover:bg-blue-50')}
          {canApprove && (
            <>
              <div className="my-1 border-t border-gray-100" />
              {item(() => onAction('approve'), <CheckCircle2 size={14} className="text-green-400" />, 'Aprovar', 'text-green-700 hover:bg-green-50')}
              {item(() => onOpenModal('reject'), <XCircle size={14} className="text-red-400" />, 'Desaprovar', 'text-red-700 hover:bg-red-50')}
            </>
          )}
          {canReturn && item(() => onOpenModal('return'), <RotateCcw size={14} className="text-orange-400" />, 'Devolver p/ correção', 'text-orange-700 hover:bg-orange-50')}
          {canSignal && (
            <>
              <div className="my-1 border-t border-gray-100" />
              {item(() => onOpenModal('signal'), <DollarSign size={14} className="text-teal-400" />, 'Registrar Sinal', 'text-teal-700 hover:bg-teal-50')}
            </>
          )}
          {canFinalize
            ? item(() => onAction('finalize'), <CheckCircle2 size={14} className="text-green-400" />, 'Finalizar negociação', 'text-green-700 hover:bg-green-50')
            : actions.isFinalizable && !actions.isLocked && (
              <div className="px-3 py-2 text-xs text-gray-400" title={actions.finalizeDisabledReason ?? ''}>
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="opacity-40" /> Finalizar (bloqueado)
                </span>
                {actions.finalizeDisabledReason && (
                  <p className="mt-1 text-[10px] text-gray-400">{actions.finalizeDisabledReason}</p>
                )}
              </div>
            )}
          {showForce && item(() => { onForceFinalize(); setOpen(false) }, <CheckCircle2 size={14} className="text-red-500" />, 'Forçar finalização (MASTER)', 'text-red-700 hover:bg-red-50')}
          {canReopen && item(() => onAction('reopen'), <RotateCcw size={14} className="text-orange-400" />, 'Reabrir negociação', 'text-orange-700 hover:bg-orange-50')}
          <div className="my-1 border-t border-gray-100" />
          {item(() => setTab('timeline'), <Clock size={14} className="text-gray-400" />, 'Ver Timeline')}
          {isManager && item(() => setTab('auditoria'), <Shield size={14} className="text-gray-400" />, 'Ver Auditoria')}
          {canCancel && (
            <>
              <div className="my-1 border-t border-gray-100" />
              {item(() => onOpenModal('cancel'), <Ban size={14} className="text-red-400" />, 'Cancelar negociação', 'text-red-700 hover:bg-red-50')}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

type Tab = 'resumo' | 'veiculos' | 'valores' | 'servicos' | 'contratos' | 'nfe' | 'renave' | 'garantias' | 'anotacoes' | 'timeline' | 'auditoria'

// Status em que abas Contratos/NFe ficam visíveis (após aprovação)
const POST_APPROVAL_STATUSES = new Set([
  'APROVADA', 'LIBERADA', 'SINAL_RECEBIDO', 'RESERVADA',
  'AGUARDANDO_FINANCEIRO', 'FINANCEIRO_APROVADO',
  'AGUARDANDO_DOCUMENTACAO', 'DOCUMENTACAO_CONCLUIDA',
  'AGUARDANDO_CONTRATO', 'CONTRATO_GERADO',
  'AGUARDANDO_ASSINATURA', 'ASSINADA',
  'AGUARDANDO_ENTREGA', 'ENTREGUE',
  'EM_ANDAMENTO', 'FINALIZADA',
])

export default function NegociacaoDetailPage() {
  const { data: session, status } = useSession()
  const router   = useRouter()
  const { id }   = useParams<{ id: string }>()
  const role     = (session?.user as { role?: string })?.role

  const [deal, setDeal]       = useState<DealDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState(false)
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null)
  const [tab, setTab]         = useState<Tab>('resumo')
  const [modal, setModal]     = useState<ModalType>(null)

  // Timeline & Audit
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [audit, setAudit]       = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading]       = useState(false)

  // Anexos (comprovantes, contratos, NFe)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const loadAttachments = useCallback(() => {
    if (!id) return
    fetch(`/api/negotiations/${id}/attachments`)
      .then((r) => r.json())
      .then((d) => setAttachments(d.data ?? []))
      .catch(() => {})
  }, [id])
  useEffect(() => { loadAttachments() }, [loadAttachments])

  // Add service modal
  const [showAddService, setShowAddService] = useState(false)
  const [newService, setNewService] = useState({ name: '', value: '', cost: '', supplier: '', commission: '', notes: '' })
  const [savingService, setSavingService] = useState(false)

  const isManager = ['GERENTE', 'MASTER', 'ADM'].includes(role ?? '')
  const isAdm     = ['MASTER', 'ADM'].includes(role ?? '')

  // Estado consolidado de ações (saldo + RBAC)
  const actor = { id: (session?.user as any)?.id, role: role ?? '', tenantId: (session?.user as any)?.tenantId ?? null, sellerId: null }
  const actions = useDealActions(deal as any, actor)
  const [showForceConfirm, setShowForceConfirm] = useState(false)
  const [forceTyped, setForceTyped]             = useState('')

  useEffect(() => {
    if (status === 'authenticated' && !canAccessModule(role, 'negotiations')) {
      router.replace('/inicio')
    }
  }, [status, role, router])

  const loadDeal = useCallback(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/negotiations/${id}`)
      .then((r) => r.json())
      .then((d) => setDeal(d.data ?? null))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { loadDeal() }, [loadDeal])

  // Load timeline when tab selected
  useEffect(() => {
    if (tab !== 'timeline' || !id) return
    setTimelineLoading(true)
    fetch(`/api/negotiations/${id}/timeline`)
      .then((r) => r.json())
      .then((d) => setTimeline(d.data ?? []))
      .catch(() => {})
      .finally(() => setTimelineLoading(false))
  }, [tab, id])

  // Load audit when tab selected
  useEffect(() => {
    if (tab !== 'auditoria' || !id) return
    setAuditLoading(true)
    fetch(`/api/negotiations/${id}/audit`)
      .then((r) => r.json())
      .then((d) => setAudit(d.data ?? []))
      .catch(() => {})
      .finally(() => setAuditLoading(false))
  }, [tab, id])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const showToast = (msg: string, ok = true) => setToast({ msg, ok })

  const handleAction = async (action: string, payload?: Record<string, unknown>) => {
    setActing(true)
    setModal(null)
    try {
      const res = await fetch(`/api/negotiations/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      })
      let data: any = null
      try { data = await res.json() } catch { /* sem body */ }
      if (!res.ok) {
        const msg = data?.error ?? `Falha ao executar (${res.status})`
        throw new Error(msg)
      }
      // Mensagens específicas por ação
      const okMsg =
        action === 'finalize'
          ? (data?.commissionResult
              ? `Negociação finalizada. Comissões geradas: ${data.commissionResult.created}.`
              : 'Negociação finalizada com sucesso.')
          : 'Ação realizada com sucesso!'
      showToast(okMsg)
      // Sempre recarrega via GET para garantir que todas as relações venham populadas.
      // Respostas de endpoints de ação devolvem apenas o registro atualizado (sem
      // customer/seller/vehicles), e setar deal com payload parcial quebra a UI.
      loadDeal()
    } catch (e: unknown) {
      console.error('[negotiation action]', action, e)
      showToast(e instanceof Error ? e.message : 'Erro inesperado', false)
    } finally {
      setActing(false)
    }
  }

  const handleAddService = async () => {
    if (!newService.name) return
    setSavingService(true)
    try {
      const res = await fetch(`/api/negotiations/${id}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       newService.name,
          value:      newService.value      ? parseBRL(newService.value)        : null,
          cost:       newService.cost       ? parseBRL(newService.cost)         : null,
          supplier:   newService.supplier   || null,
          commission: newService.commission ? parseBRL(newService.commission)   : null,
          notes:      newService.notes      || null,
        }),
      })
      if (!res.ok) throw new Error('Erro ao adicionar serviço')
      showToast('Serviço adicionado!')
      setShowAddService(false)
      setNewService({ name: '', value: '', cost: '', supplier: '', commission: '', notes: '' })
      loadDeal()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro', false)
    } finally {
      setSavingService(false)
    }
  }

  // ── Loading & Not found ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl space-y-4">
        <div className="h-16 animate-pulse rounded-xl bg-gray-200" />
        <div className="h-10 animate-pulse rounded-xl bg-gray-100" />
        <Skeleton />
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-300 py-24">
        <AlertCircle size={32} className="text-gray-400" />
        <p className="text-gray-500">Negociação não encontrada</p>
        <Link href="/negociacoes" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Voltar
        </Link>
      </div>
    )
  }

  const showPostApproval = POST_APPROVAL_STATUSES.has(deal.status)
  // Aba "Garantias" só aparece se o deal tem garantia contratada OU se a
  // política permite cadastrar pós-aprovação (sempre permitido pra MASTER/ADM).
  const hasWarranties = ((deal as any).warranties?.length ?? 0) > 0
  const showGarantias = showPostApproval && (hasWarranties || isManager)

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'resumo' as Tab, label: 'Resumo',  icon: <Handshake size={14} /> },
    { id: 'veiculos',    label: 'Veículos',      icon: <Car size={14} /> },
    { id: 'valores',     label: 'Valores',       icon: <DollarSign size={14} /> },
    { id: 'servicos',    label: 'Serviços',      icon: <Wrench size={14} /> },
    ...(showPostApproval ? [
      { id: 'contratos' as Tab, label: 'Contratos',  icon: <FileText size={14} /> },
      { id: 'nfe'       as Tab, label: 'NF-e',       icon: <FileText size={14} /> },
      { id: 'renave'    as Tab, label: 'RENAVE',     icon: <Shield size={14} /> },
      ...(showGarantias
        ? [{ id: 'garantias' as Tab, label: 'Garantias', icon: <Shield size={14} /> }]
        : []),
      { id: 'anotacoes' as Tab, label: 'Anotações',  icon: <MessageSquare size={14} /> },
    ] : []),
    { id: 'timeline',    label: 'Timeline',      icon: <Clock size={14} /> },
    ...(isManager ? [{ id: 'auditoria' as Tab, label: 'Auditoria', icon: <Shield size={14} /> }] : []),
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
          toast.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Modais */}
      {modal === 'reject' && (
        <MotiveModal
          title="Desaprovar Negociação"
          onConfirm={(reason) => handleAction('reject', { reason })}
          onCancel={() => setModal(null)}
          loading={acting}
        />
      )}
      {modal === 'cancel' && (
        <MotiveModal
          title="Cancelar Negociação"
          onConfirm={(reason) => handleAction('cancel', { reason })}
          onCancel={() => setModal(null)}
          loading={acting}
        />
      )}
      {modal === 'return' && (
        <MotiveModal
          title="Devolver para Correção"
          onConfirm={(reason) => handleAction('return-correction', { reason })}
          onCancel={() => setModal(null)}
          loading={acting}
        />
      )}
      {modal === 'signal' && (
        <SignalModal
          onConfirm={(value, notes) => handleAction('signal', { value: parseBRL(value) ?? 0, notes })}
          onCancel={() => setModal(null)}
          loading={acting}
        />
      )}

      {/* Modal: Forçar finalização (MASTER) */}
      {showForceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-red-700">
                <AlertTriangle size={16} /> Forçar finalização (MASTER)
              </h3>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                Esta ação ignora as travas de saldo. Use apenas em casos excepcionais.
                {actions.finalizeDisabledReason ? ` ${actions.finalizeDisabledReason}` : ''}
              </p>
              <p className="text-gray-700">
                Para confirmar, digite o número da negociação{' '}
                <strong className="font-mono">{deal.dealNumber ?? deal.id.slice(0, 8)}</strong>:
              </p>
              <input
                value={forceTyped}
                onChange={e => setForceTyped(e.target.value)}
                placeholder={deal.dealNumber ?? deal.id.slice(0, 8)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button onClick={() => setShowForceConfirm(false)} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if ((forceTyped.trim()) !== (deal.dealNumber ?? deal.id.slice(0, 8)).trim()) return
                  setShowForceConfirm(false)
                  handleAction('finalize', { force: true })
                }}
                disabled={(forceTyped.trim()) !== (deal.dealNumber ?? deal.id.slice(0, 8)).trim()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Forçar finalização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel-resumo (Phase 2) — único cabeçalho com ações primárias.
          Aprovar + Editar + Cancelar + Finalizar + Reabrir + Forçar (MASTER)
          ficam todos aqui. O footer mantém o dropdown Ações com secundários
          (Devolver, Sinal, Timeline, Auditoria, etc). */}
      <DealSummary
        deal={deal as any}
        actor={actor}
        onEdit={() => router.push(`/negociacoes/${id}/editar`)}
        onFinalize={() => handleAction('finalize')}
        onForceFinalize={() => handleAction('finalize', { force: true })}
        onReopen={() => handleAction('reopen')}
        onApprove={() => handleAction('approve')}
        onCancelDeal={() => setModal('cancel')}
      />

      {/* Breadcrumb compacto + loading inline */}
      <nav className="flex items-center justify-between gap-1 text-sm text-gray-500">
        <div className="flex items-center gap-1">
          <Link href="/negociacoes" className="hover:text-gray-700">Negociações</Link>
          <span>/</span>
          <span className="font-mono text-gray-700">{deal.dealNumber ?? deal.id.slice(0, 8)}</span>
        </div>
        {acting && (
          <span className="flex items-center gap-1.5 text-xs text-brand-600">
            <Loader2 size={12} className="animate-spin" /> Executando...
          </span>
        )}
      </nav>

      {/* Header e barra primária de ações REMOVIDOS — todas as ações
          (Aprovar/Editar/Cancelar/Finalizar/Reabrir/Forçar) ficam concentradas
          no header do DealSummary acima. Ações secundárias (Devolver, Sinal,
          Timeline, Auditoria) ficam no dropdown Ações do rodapé. */}

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-brand-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo das abas */}

      {/* ── ABA: RESUMO ── */}
      {tab === 'resumo' && (
        <div className="space-y-4">
          {/* Row: Cliente + Vendedor */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* ── Cliente ── */}
            <SectionCard title="Cliente" icon={<User size={15} />}>
              {deal.person ? (
                <>
                  <dl>
                    <InfoRow label="Nome"     value={deal.person.nomeCompleto} />
                    <InfoRow label="Tipo"     value={deal.person.type === 'FISICA' ? 'Pessoa Física' : 'Pessoa Jurídica'} />
                    <InfoRow label="CPF"      value={deal.person.cpf}  />
                    <InfoRow label="CNPJ"     value={deal.person.cnpj} />
                    <InfoRow label="E-mail"   value={deal.person.email} />
                    <InfoRow label="Telefone" value={deal.person.phone} />
                  </dl>
                  {deal.source === 'PLANILHA' && !deal.person.cpf && !deal.person.phone && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      Cadastro importado incompleto. Necessário complementar dados do cliente.
                    </div>
                  )}
                </>
              ) : deal.customer ? (
                <>
                  <dl>
                    <InfoRow label="Nome"     value={deal.customer.name} />
                    <InfoRow label="E-mail"   value={deal.customer.email} />
                    <InfoRow label="Telefone" value={deal.customer.phone} />
                    <InfoRow label="CPF"      value={deal.customer.cpf} />
                  </dl>
                  {deal.source === 'PLANILHA' && !deal.customer.cpf && !deal.customer.phone && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      Cadastro importado incompleto. Necessário complementar dados do cliente.
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  {deal.source === 'PLANILHA' ? 'Cliente não vinculado automaticamente' : 'Sem dados de cliente'}
                </p>
              )}
            </SectionCard>

            {/* ── Vendedor / Equipe ── */}
            <SectionCard title="Equipe" icon={<Settings2 size={15} />}>
              <dl>
                <div className="py-1.5 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Vendedor</p>
                  <p className="mt-0.5 font-medium text-gray-800">
                    {deal.seller?.user?.name ?? deal.seller?.fullName ?? deal.sellerNameFromSheet ?? 'Vendedor não informado'}
                    {deal.isSellerProvisional && (
                      <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Provisório</span>
                    )}
                  </p>
                  {deal.sellerNameFromSheet && deal.seller?.user?.name !== deal.sellerNameFromSheet && (
                    <p className="text-xs text-gray-400 mt-0.5">Planilha: {deal.sellerNameFromSheet}</p>
                  )}
                </div>
                {deal.manager && (
                  <div className="py-1.5 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Gerente</p>
                    <p className="mt-0.5 font-medium text-gray-800">{deal.manager.name}</p>
                  </div>
                )}
                {deal.approvedBy && (
                  <div className="py-1.5 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Aprovado por</p>
                    <p className="mt-0.5 font-medium text-gray-800">{deal.approvedBy.name}</p>
                    {deal.approvedAt && <p className="text-xs text-gray-400">{fmtDateTime(deal.approvedAt)}</p>}
                  </div>
                )}
              </dl>
              {deal.isSellerProvisional && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  Vendedor vinculado provisoriamente. Revisar e corrigir o responsável da negociação.
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Veículo(s) ── */}
          {deal.vehicles.length > 0 && (
            <SectionCard title={`Veículo${deal.vehicles.length > 1 ? 's' : ''} (${deal.vehicles.length})`} icon={<Car size={15} />}>
              <div className="divide-y divide-gray-50">
                {deal.vehicles.map((dv) => {
                  const plate = dv.plate ?? dv.vehicle?.plate
                  const brand = dv.brand ?? dv.vehicle?.brand
                  const model = dv.model ?? dv.vehicle?.model
                  const year  = dv.year  ?? dv.vehicle?.year
                  const color = dv.color ?? dv.vehicle?.color
                  return (
                    <div key={dv.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-medium text-gray-800">
                          {[brand, model, year].filter(Boolean).join(' ') || plate || 'Veículo não identificado'}
                        </p>
                        <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                          {ROLE_LABEL[dv.role] ?? dv.role}
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 md:grid-cols-3">
                        {plate  ? <InfoRow label="Placa"  value={plate} />  : <div className="py-1.5 text-sm"><dt className="text-gray-400 text-xs">Placa</dt><dd className="text-gray-400 text-xs italic">Não informado</dd></div>}
                        {brand  && <InfoRow label="Marca"  value={brand} />}
                        {model  ? <InfoRow label="Modelo" value={model} />  : <div className="py-1.5 text-sm"><dt className="text-gray-400 text-xs">Modelo</dt><dd className="text-gray-400 text-xs italic">Não informado</dd></div>}
                        {year   && <InfoRow label="Ano"    value={String(year)} />}
                        {color  && <InfoRow label="Cor"    value={color} />}
                        {dv.km  != null && <InfoRow label="KM" value={Number(dv.km).toLocaleString('pt-BR')} />}
                        {fmtBRL(dv.agreedValue) && <InfoRow label="Valor" value={fmtBRL(dv.agreedValue)!} />}
                      </dl>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          )}
          {deal.vehicles.length === 0 && (
            <SectionCard title="Veículo" icon={<Car size={15} />}>
              <p className="text-sm text-gray-400 italic">
                {deal.source === 'PLANILHA' ? 'Veículo não vinculado automaticamente' : 'Nenhum veículo vinculado'}
              </p>
            </SectionCard>
          )}

          {/* FinancialReview + TotalOperationCard removidos: redundavam com o
              Phase2Panel logo abaixo. Para enxugar o resumo do gerente,
              mantemos APENAS o Phase2Panel (mais completo, com botões de
              ação inline e a sessão de itens/pagamentos/saldo lado a lado).
              Se precisar reativar, descomente os blocos antigos. */}

          {/* ── Valores Detalhados (clean, read-only) ── */}
          <DealValuesCard deal={deal} />

          {/* Editor de pagamentos / débitos / troco / descontos — movido pra
              aba "Valores". Mantém o resumo limpo. Pra adicionar, use os
              botões abaixo OU vá direto à aba. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-600">
            <span>Precisa adicionar pagamentos, débitos ou troco?</span>
            <button
              type="button"
              onClick={() => setTab('valores')}
              className="rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700"
            >
              Editar valores e pagamentos
            </button>
          </div>

          {/* ── Status ── */}
          <SectionCard title="Status" icon={<Calendar size={15} />}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLOR[deal.status] ?? 'bg-gray-100 text-gray-700'}`}>
                {STATUS_LABEL[deal.status] ?? deal.status}
              </span>
              <span className="text-xs text-gray-400">Criada em {fmtDateTime(deal.createdAt)}</span>
              {deal.finalizedAt && <span className="text-xs text-green-700">· Finalizada em {fmtDateTime(deal.finalizedAt)}</span>}
              {deal.cancelledAt && <span className="text-xs text-red-700">· Cancelada em {fmtDateTime(deal.cancelledAt)}</span>}
            </div>
            {deal.cancelledReason && (
              <p className="mt-2 text-xs text-red-600">Motivo: {deal.cancelledReason}</p>
            )}
          </SectionCard>

          {/* ── Agendamento ── */}
          <SectionCard title="Agendamento" icon={<Calendar size={15} />}>
            <dl className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
              <InfoRow label="Data da Venda"    value={fmtDate(deal.saleDate)} />
              <InfoRow label="Entrega prevista" value={fmtDate(deal.deliveryDate)} />
            </dl>
            {!deal.saleDate && !deal.deliveryDate && (
              <p className="text-sm text-gray-400 italic">Nenhum agendamento cadastrado</p>
            )}
          </SectionCard>

          {/* ── Pendências ── */}
          {(deal.pendencies ?? []).length > 0 && (
            <SectionCard title={`Pendências (${deal.pendencies.length})`} icon={<AlertTriangle size={15} />}>
              <ul className="divide-y divide-gray-50">
                {deal.pendencies.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{p.type.replace(/_/g, ' ')}</p>
                      {p.description && <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{p.description}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.priority === 'ALTA' ? 'bg-red-100 text-red-700' :
                      p.priority === 'MEDIA' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {p.priority}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* ── Observações ── */}
          {deal.notes && (
            <SectionCard title="Observações" icon={<FileText size={15} />}>
              <p className="whitespace-pre-line text-sm text-gray-700">{deal.notes}</p>
            </SectionCard>
          )}

          {/* ── Dados da Planilha (accordion) ── */}
          {deal.source === 'PLANILHA' && (
            <SheetDataAccordion rows={deal.sheetImportRows ?? []} />
          )}

          {/* ── Histórico ── */}
          {deal.statusHistory.length > 0 && (
            <SectionCard title="Histórico" icon={<Clock size={15} />}>
              <ol className="space-y-2 border-l-2 border-gray-100 pl-4">
                {[...deal.statusHistory].reverse().map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <div className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-brand-200 ring-2 ring-white" />
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-gray-800">{STATUS_LABEL[h.newStatus] ?? h.newStatus}</span>
                      {h.previousStatus && (
                        <span className="text-xs text-gray-400">← {STATUS_LABEL[h.previousStatus] ?? h.previousStatus}</span>
                      )}
                      <span className="ml-auto text-xs text-gray-400">{fmtDateTime(h.createdAt)}</span>
                    </div>
                    {(h.reason || h.changedByUser) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {h.changedByUser?.name && <>{h.changedByUser.name}{h.reason ? ' · ' : ''}</>}
                        {h.reason}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}

          {/* ── Botão Ações (rodapé) ── */}
          <div className="flex items-center justify-end gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <span className="mr-auto text-xs text-gray-500">Operações da negociação</span>
            <ActionsDropdown
              deal={deal}
              role={role}
              onAction={handleAction}
              onOpenModal={setModal}
              activeTab={tab}
              setTab={(t) => setTab(t as Tab)}
              isManager={isManager}
              onEdit={() => router.push(`/negociacoes/${id}/editar`)}
              actions={actions}
              onForceFinalize={() => { setForceTyped(''); setShowForceConfirm(true) }}
            />
          </div>
        </div>
      )}

      {/* ── ABA: VEÍCULOS ── */}
      {tab === 'veiculos' && (
        <div className="space-y-4">
          {deal.vehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 py-16">
              <Car size={28} className="text-gray-400" />
              <p className="text-gray-500">Nenhum veículo vinculado</p>
            </div>
          ) : (
            deal.vehicles.map((dv) => {
              const plate = dv.plate ?? dv.vehicle?.plate
              const brand = dv.brand ?? dv.vehicle?.brand
              const model = dv.model ?? dv.vehicle?.model
              const year  = dv.year  ?? dv.vehicle?.year
              const color = dv.color ?? dv.vehicle?.color
              return (
                <div key={dv.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Car size={15} className="text-brand-600" />
                      <span className="font-semibold text-gray-800">
                        {[brand, model, year].filter(Boolean).join(' ') || plate || 'Veículo'}
                      </span>
                    </div>
                    <span className="rounded-full bg-brand-100 px-3 py-0.5 text-xs font-semibold text-brand-800">
                      {ROLE_LABEL[dv.role] ?? dv.role}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 p-4 md:grid-cols-3">
                    <dl className="col-span-2 md:col-span-3 grid grid-cols-2 gap-x-6 md:grid-cols-3">
                      {plate  && <InfoRow label="Placa"     value={plate} />}
                      {brand  && <InfoRow label="Marca"     value={brand} />}
                      {model  && <InfoRow label="Modelo"    value={model} />}
                      {year   && <InfoRow label="Ano"       value={String(year)} />}
                      {color  && <InfoRow label="Cor"       value={color} />}
                      {dv.km  != null && <InfoRow label="KM" value={Number(dv.km).toLocaleString('pt-BR')} />}
                      {dv.condition && <InfoRow label="Condição" value={dv.condition} />}
                      {fmtBRL(dv.agreedValue)    && <InfoRow label="Valor Acordado"  value={fmtBRL(dv.agreedValue)!}    />}
                      {fmtBRL(dv.evaluatedValue) && <InfoRow label="Valor Avaliado"  value={fmtBRL(dv.evaluatedValue)!} />}
                      {fmtBRL(dv.fipeValue)      && <InfoRow label="FIPE"            value={fmtBRL(dv.fipeValue)!}      />}
                    </dl>
                    {dv.hasFinancing && (
                      <div className="col-span-2 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 md:col-span-3">
                        <p className="mb-1 text-xs font-semibold uppercase text-amber-700">Financiamento / Quitação</p>
                        <dl className="grid grid-cols-2 gap-x-6">
                          <InfoRow label="Banco"  value={dv.payoffBank} />
                          <InfoRow label="Valor"  value={fmtBRL(dv.payoffValue)} />
                        </dl>
                      </div>
                    )}
                    {dv.notes && (
                      <p className="col-span-2 mt-3 text-xs text-gray-500 md:col-span-3">
                        <span className="font-medium">Obs: </span>{dv.notes}
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── ABA: VALORES ── */}
      {tab === 'valores' && (
        <div className="space-y-4">
          {/* Editor inline de pagamentos / débitos / descontos / troco */}
          {(() => {
            const anyDeal = deal as any
            const actorV = { id: (session?.user as any)?.id, role: role ?? '', tenantId: (session?.user as any)?.tenantId, sellerId: null }
            return (
              <Phase2Panel
                dealId={deal.id}
                isLocked={isDealLocked(deal.status)}
                canEdit={canAddPayment(actorV, deal as any)}
                canApprove={canApproveDiscount(actorV, deal as any)}
                canReopen={canReopen(actorV, deal as any)}
                canForce={canForceFinalize(actorV)}
                vehicleValue={Number(deal.saleAmount ?? deal.vehicleValue ?? deal.vehicles.find((v) => Number(v.agreedValue ?? 0) > 0)?.agreedValue ?? 0)}
                debtsTotal={(anyDeal.debts ?? []).reduce((s: number, d: any) => s + Number(d.value ?? 0), 0)}
                servicesTotal={(deal.services ?? []).reduce((s: number, x: any) => s + Number(x.value ?? 0), 0)}
                vehicles={deal.vehicles as any}
                debts={anyDeal.debts ?? []}
                services={deal.services as any}
                payments={anyDeal.payments ?? []}
                discounts={anyDeal.discountRequests ?? []}
                changes={anyDeal.changes ?? []}
                onReload={loadDeal}
                onToast={(m, k) => showToast(m, k !== 'error')}
              />
            )
          })()}

          {/* Retorno financeiro + Garantia (módulo Retorno/Garantia) */}
          <ReturnPanel
            dealId={deal.id}
            canEdit={!isDealLocked(deal.status)}
            onReload={loadDeal}
            onToast={(m, kind) => showToast(m, kind !== 'error')}
          />
          <WarrantySalesPanel
            dealId={deal.id}
            canEdit={!isDealLocked(deal.status)}
            onReload={loadDeal}
            onToast={(m, kind) => showToast(m, kind !== 'error')}
          />

        <SectionCard title="Resumo Financeiro (legado)" icon={<DollarSign size={15} />}>
          <div className="divide-y divide-gray-100">
            {/* VENDA */}
            {deal.type === 'VENDA' && (
              <>
                <ValueRow label="Valor de Venda"        value={fmtBRL(deal.saleAmount)} />
                <ValueRow label="Sinal / Entrada"        value={fmtBRL(deal.signalAmount)} />
                <ValueRow label="Valor Financiado"       value={fmtBRL(deal.financedAmount)} />
                {deal.paymentBank && <ValueRow label="Banco / Financiadora" value={deal.paymentBank} />}
                {deal.paymentType && <ValueRow label="Forma de Pagamento"   value={deal.paymentType} />}
                <ValueRow label="Taxa de Documentação"   value={fmtBRL(deal.documentationFee)} />
                <ValueRow label="Serviços"               value={fmtBRL(deal.servicesAmount)} />
                <ValueRow label="Desconto"               value={fmtBRL(deal.discountAmount)} />
              </>
            )}
            {/* COMPRA */}
            {deal.type === 'COMPRA' && (
              <>
                <ValueRow label="Valor de Compra"   value={fmtBRL(deal.purchaseAmount)} />
                {deal.paymentType && <ValueRow label="Forma de Pagamento" value={deal.paymentType} />}
                {deal.changeBeneficiary && <ValueRow label="Beneficiário"    value={deal.changeBeneficiary} />}
                {deal.changePix && <ValueRow label="PIX" value={deal.changePix} />}
                {deal.payoffBank && <ValueRow label="Banco Quitação"  value={deal.payoffBank} />}
                <ValueRow label="Valor Quitação"    value={fmtBRL(deal.payoffAmount)} />
              </>
            )}
            {/* TROCA */}
            {deal.type === 'TROCA' && (
              <>
                <ValueRow label="Veículo Vendido"    value={fmtBRL(deal.saleAmount)} />
                <ValueRow label="Veículo Recebido (aceito)" value={fmtBRL(deal.tradeValue)} />
                <ValueRow label="Sinal"              value={fmtBRL(deal.signalAmount)} />
                <ValueRow label="Financiado"         value={fmtBRL(deal.financedAmount)} />
                <ValueRow label="Quitação"           value={fmtBRL(deal.payoffAmount)} />
                {deal.payoffBank && <ValueRow label="Banco Quitação" value={deal.payoffBank} />}
                <ValueRow label="Taxa de Documentação" value={fmtBRL(deal.documentationFee)} />
                <ValueRow label="Troco ao Cliente"   value={fmtBRL(deal.changeAmount)} />
                {deal.changeBeneficiary && <ValueRow label="Beneficiário" value={deal.changeBeneficiary} />}
              </>
            )}
            {/* CONSIGNAÇÃO */}
            {deal.type === 'CONSIGNACAO' && (
              <>
                <ValueRow label="Valor Mínimo ao Proprietário" value={fmtBRL(deal.consignMinValue)} />
                <ValueRow label="Valor de Anúncio"             value={fmtBRL(deal.saleAmount)} />
                {deal.consignCommPct != null && <ValueRow label="Comissão da Loja (%)" value={`${Number(deal.consignCommPct)}%`} />}
                {deal.consignDeadline && <ValueRow label="Prazo"   value={`${deal.consignDeadline} dias`} />}
              </>
            )}

            {/* Totais */}
            <div className="pt-2">
              <ValueRow label="Total Débitos"    value={fmtBRL(deal.totalDebts)} />
              <ValueRow label="Total Pagamentos" value={fmtBRL(deal.totalPayments)} />
              <ValueRow label="Saldo"            value={fmtBRL(deal.balance)} />
              <ValueRow label="Margem"           value={fmtBRL(deal.marginAmount)} highlight />
            </div>
          </div>
        </SectionCard>
        </div>
      )}

      {/* ── ABA: SERVIÇOS ── */}
      {tab === 'servicos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{deal.services.length} serviço(s) vinculado(s)</p>
            {isManager && (
              <button
                onClick={() => setShowAddService(true)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
              >
                + Adicionar Serviço
              </button>
            )}
          </div>

          {/* Modal adicionar serviço */}
          {showAddService && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Adicionar Serviço</h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nome *</label>
                    <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={newService.name} onChange={(e) => setNewService((p) => ({ ...p, name: e.target.value }))} placeholder="Ex: Revisão, Polimento..." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Valor (R$)</label>
                      <input type="text" inputMode="numeric" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={maskBRL(newService.value)} onChange={(e) => setNewService((p) => ({ ...p, value: maskBRL(e.target.value) }))} placeholder="0,00" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Custo (R$)</label>
                      <input type="text" inputMode="numeric" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={maskBRL(newService.cost)} onChange={(e) => setNewService((p) => ({ ...p, cost: maskBRL(e.target.value) }))} placeholder="0,00" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Fornecedor</label>
                      <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={newService.supplier} onChange={(e) => setNewService((p) => ({ ...p, supplier: e.target.value }))} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Comissão (R$)</label>
                      <input type="text" inputMode="numeric" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" value={maskBRL(newService.commission)} onChange={(e) => setNewService((p) => ({ ...p, commission: maskBRL(e.target.value) }))} placeholder="0,00" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Observações</label>
                    <textarea className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 min-h-16 resize-y" value={newService.notes} onChange={(e) => setNewService((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setShowAddService(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
                  <button onClick={handleAddService} disabled={!newService.name || savingService} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                    {savingService && <Loader2 size={13} className="animate-spin" />}
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/*
            Comissões automáticas: ao finalizar a negociação, o backend gera
            CommissionCalculation (status PREVISTO) via /lib/commission-generator.
            Endpoints úteis (POST):
              - /api/negotiations/[id]/commissions/preview     (dryRun, qualquer leitor)
              - /api/negotiations/[id]/commissions/regenerate  (MASTER|ADM|GERENTE_GERAL)
          */}
          {deal.services.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 py-16">
              <Wrench size={28} className="text-gray-400" />
              <p className="text-gray-500">Nenhum serviço adicionado</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      {['Serviço', 'Valor', 'Custo', 'Fornecedor', 'Comissão'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {deal.services.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                        <td className="px-4 py-3 text-gray-700">{fmtBRL(s.value) ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{fmtBRL(s.cost) ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{s.supplier ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{fmtBRL(s.commission) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-gray-700">Total</td>
                      <td className="px-4 py-3 font-bold text-brand-700" colSpan={4}>
                        {fmtBRL(deal.services.reduce((acc, s) => acc + Number(s.value ?? 0), 0)) ?? '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ABA: CONTRATOS & TERMOS ── */}
      {tab === 'contratos' && showPostApproval && (
        <ContractsTab
          dealId={deal.id}
          dealType={deal.type}
          attachments={attachments}
          onReloadAttachments={loadAttachments}
          onToast={showToast}
        />
      )}

      {/* ── ABA: NFe ── */}
      {tab === 'nfe' && showPostApproval && (
        <NfeTab
          dealId={deal.id}
          attachments={attachments}
          onReload={loadAttachments}
          onToast={showToast}
        />
      )}

      {/* ── ABA: RENAVE (shell + estado vazio) ── */}
      {tab === 'renave' && showPostApproval && (
        <SectionCard title="RENAVE" icon={<Shield size={15} />}>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Shield size={28} className="text-gray-300" />
            <div>
              <p className="font-medium text-gray-700">Nenhum registro RENAVE</p>
              <p className="mt-1 text-xs text-gray-500">
                Quando a integração RENAVE for cadastrada, entrada/saída, protocolo e pendências aparecerão aqui.
              </p>
            </div>
            {isManager && (
              <button
                onClick={() => showToast('Integração RENAVE em desenvolvimento.', true)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                + Registrar manualmente
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── ABA: GARANTIAS (condicional) ── */}
      {tab === 'garantias' && showPostApproval && showGarantias && (
        <SectionCard title="Garantias" icon={<Shield size={15} />}>
          {hasWarranties ? (
            <ul className="divide-y divide-gray-100">
              {((deal as any).warranties ?? []).map((w: any) => (
                <li key={w.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{w.type ?? w.name ?? 'Garantia'}</p>
                    <p className="text-xs text-gray-500">
                      {w.supplier && `${w.supplier} · `}
                      {w.startsAt && `de ${fmtDate(w.startsAt)} `}
                      {w.endsAt && `até ${fmtDate(w.endsAt)}`}
                    </p>
                  </div>
                  <span className="font-semibold text-gray-900">{fmtBRL(w.value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Shield size={28} className="text-gray-300" />
              <div>
                <p className="font-medium text-gray-700">Nenhuma garantia contratada</p>
                <p className="mt-1 text-xs text-gray-500">Adicione garantias contratadas pelo cliente nesta negociação.</p>
              </div>
              <Link
                href="/garantias"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                + Adicionar garantia
              </Link>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── ABA: ANOTAÇÕES ── */}
      {tab === 'anotacoes' && showPostApproval && (
        <NotesPanel
          dealId={deal.id}
          attachments={attachments}
          onReload={loadAttachments}
          onToast={showToast}
        />
      )}

      {/* ── ABA: TIMELINE ── */}
      {tab === 'timeline' && (
        <SectionCard title="Timeline da Negociação" icon={<Clock size={15} />}>
          {timelineLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-brand-600" />
            </div>
          ) : timeline.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
              <Clock size={24} />
              <p className="text-sm">Sem eventos na timeline</p>
              <p className="text-xs text-gray-300">Veja o histórico de status abaixo</p>
            </div>
          ) : (
            <ol className="space-y-0">
              {timeline.map((ev, i) => (
                <li key={i} className="relative flex gap-4 pb-6">
                  <div className="relative flex flex-col items-center">
                    <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm">
                      {ev.icon || '•'}
                    </div>
                    {i < timeline.length - 1 && (
                      <div className="absolute top-8 h-full w-0.5 bg-gray-200" />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="font-medium text-gray-800 text-sm">{ev.title}</p>
                    {ev.description && <p className="text-xs text-gray-500 mt-0.5">{ev.description}</p>}
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                      {ev.user && <span>{ev.user}</span>}
                      <span>·</span>
                      <span>{relativeTime(ev.date)}</span>
                      <span>·</span>
                      <span>{fmtDateTime(ev.date)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {/* Histórico de status como fallback */}
          {deal.statusHistory.length > 0 && (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Histórico de Status</p>
              <ol className="space-y-2 border-l-2 border-gray-100 pl-4">
                {deal.statusHistory.map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <div className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-brand-200 ring-2 ring-white" />
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-gray-800">{STATUS_LABEL[h.newStatus] ?? h.newStatus}</span>
                      {h.previousStatus && (
                        <span className="text-xs text-gray-400">← {STATUS_LABEL[h.previousStatus] ?? h.previousStatus}</span>
                      )}
                      <span className="ml-auto text-xs text-gray-400">{fmtDateTime(h.createdAt)}</span>
                    </div>
                    {(h.reason || h.changedByUser) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {h.changedByUser?.name && <>{h.changedByUser.name} · </>}
                        {h.reason}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── ABA: AUDITORIA ── */}
      {tab === 'auditoria' && isManager && (
        <SectionCard title="Log de Auditoria" icon={<Shield size={15} />}>
          {auditLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin text-brand-600" />
            </div>
          ) : audit.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
              <Shield size={24} />
              <p className="text-sm">Sem registros de auditoria</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    {['Ação', 'Campo', 'Valor Anterior', 'Valor Novo', 'Usuário', 'Data'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {audit.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{a.action}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">{a.field ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-red-600 max-w-[120px] truncate">{a.oldValue ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-green-700 max-w-[120px] truncate">{a.newValue ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{a.user?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{fmtDateTime(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
