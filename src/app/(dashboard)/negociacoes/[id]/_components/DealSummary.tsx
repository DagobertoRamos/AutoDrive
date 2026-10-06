'use client'

// =============================================================================
// DealSummary — Painel-resumo no topo da página da negociação.
// Cabeçalho (número, situação, datas, ações) + negócio (veículo, cliente,
// equipe) + resumo financeiro com a composição do valor. Os números vêm de
// useDealActions → dealBalanceOf (mesma conta do card "Valores Detalhados" e
// da trava de finalização): o valor de venda ATUAL, nunca o valor antigo.
// =============================================================================

import { useState } from 'react'
import {
  User, Car, Users, DollarSign, ArrowUpCircle, CalendarDays, Truck, Phone, Mail, MapPin,
  Edit, CheckCircle2, RotateCcw, AlertTriangle, ShieldAlert, Ban, Clock, Lock,
} from 'lucide-react'
import { formatBRL, maskCPF, maskCNPJ, maskPhone, maskCEP } from '@/lib/masks'
import { useDealActions, type DealActionsActor, type DealActionsDeal } from '../_hooks/useDealActions'
import { dealMainRole, dealVehiclePrice } from '@/lib/negotiation-value'
import { VehiclePhotoImg } from '@/components/estoque/VehiclePhotoImg'
import DealCustomerModal, { type CustomerPerson, type CustomerLegacy } from './DealCustomerModal'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PersonLike extends CustomerPerson {
  nomeCompleto?: string | null
  type?:         string | null
  cpf?:          string | null
  cnpj?:         string | null
  email?:        string | null
  phone?:        string | null
  cep?:          string | null
  logradouro?:   string | null
  numero?:       string | null
  complemento?:  string | null
  bairro?:       string | null
  cidade?:       string | null
  estado?:       string | null
}

interface VehicleLike {
  role?:        string | null
  plate?:       string | null
  brand?:       string | null
  model?:       string | null
  version?:     string | null
  year?:        number | null
  modelYear?:   number | null
  color?:       string | null
  km?:          number | null
  agreedValue?: any | number | null
  vehicle?: {
    plate?:        string | null
    brand?:        string | null
    model?:        string | null
    version?:      string | null
    year?:         number | null
    modelYear?:    number | null
    color?:        string | null
    mainPhotoUrl?: string | null
    salePrice?:    any | number | null
  } | null
}

interface DealLike extends DealActionsDeal {
  dealNumber?: string | null
  type:        string
  status:      string
  purchaseAmount?: any | number | null
  person?:     PersonLike | null
  customer?:   CustomerLegacy | null
  seller?:     { id?: string; fullName?: string | null; user?: { id?: string; name?: string | null; email?: string | null; role?: string | null } | null; cargo?: string | null } | null
  manager?:    { id?: string; name?: string | null; email?: string | null } | null
  vehicles?:   VehicleLike[]
  createdAt?:  string | null
  saleDate?:   string | null
  deliveryDate?: string | null
  approvedAt?: string | null
  approvedBy?: { name?: string | null } | null
  cancelledReason?: string | null
  sellerNameFromSheet?: string | null
  isSellerProvisional?: boolean | null
}

// ── Constantes visuais ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', EM_PREENCHIMENTO: 'Em preenchimento',
  AGUARDANDO_LIBERACAO: 'Aguardando liberação', AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  LIBERADA: 'Liberada', APROVADA: 'Aprovada', RECUSADA: 'Recusada', DESAPROVADA: 'Desaprovada',
  DEVOLVIDA_PARA_CORRECAO: 'Devolvida p/ correção', AGUARDANDO_SINAL: 'Aguardando sinal',
  SINAL_RECEBIDO: 'Sinal recebido', RESERVADA: 'Reservada',
  AGUARDANDO_FINANCEIRO: 'Aguardando financeiro', FINANCEIRO_APROVADO: 'Financeiro aprovado',
  FINANCEIRO_REPROVADO: 'Financeiro reprovado', AGUARDANDO_DOCUMENTACAO: 'Aguardando documentação',
  DOCUMENTACAO_CONCLUIDA: 'Documentação concluída', AGUARDANDO_CONTRATO: 'Aguardando contrato',
  CONTRATO_GERADO: 'Contrato gerado', AGUARDANDO_ASSINATURA: 'Aguardando assinatura',
  ASSINADA: 'Assinada', AGUARDANDO_ENTREGA: 'Aguardando entrega', ENTREGUE: 'Entregue',
  EM_ANDAMENTO: 'Em andamento', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada',
  REABERTA: 'Reaberta', BLOQUEADA: 'Bloqueada',
}

const STATUS_PILL: Record<string, string> = {
  RASCUNHO: 'bg-gray-100 text-gray-700',
  EM_PREENCHIMENTO: 'bg-slate-100 text-slate-700',
  AGUARDANDO_LIBERACAO: 'bg-amber-100 text-amber-800',
  AGUARDANDO_APROVACAO: 'bg-amber-100 text-amber-800',
  LIBERADA: 'bg-blue-100 text-blue-800',
  APROVADA: 'bg-blue-100 text-blue-800',
  RECUSADA: 'bg-red-100 text-red-700',
  DESAPROVADA: 'bg-red-100 text-red-700',
  DEVOLVIDA_PARA_CORRECAO: 'bg-orange-100 text-orange-800',
  ASSINADA: 'bg-green-100 text-green-800',
  AGUARDANDO_ENTREGA: 'bg-blue-100 text-blue-800',
  ENTREGUE: 'bg-emerald-100 text-emerald-800',
  FINALIZADA: 'bg-green-600 text-white',
  CANCELADA: 'bg-red-100 text-red-700',
  REABERTA: 'bg-amber-100 text-amber-800',
}

const TYPE_LABEL: Record<string, string> = { VENDA: 'Venda', COMPRA: 'Compra', TROCA: 'Troca', CONSIGNACAO: 'Consignação' }
const TYPE_PILL: Record<string, string>  = {
  VENDA: 'bg-green-100 text-green-800',
  COMPRA: 'bg-blue-100 text-blue-800',
  TROCA: 'bg-purple-100 text-purple-800',
  CONSIGNACAO: 'bg-amber-100 text-amber-800',
}

const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')

function maskDoc(v?: string | null): string {
  if (!v) return ''
  const d = v.replace(/\D/g, '')
  return d.length <= 11 ? maskCPF(d) : maskCNPJ(d)
}

// ── Componente principal ──────────────────────────────────────────────────────

export interface DealSummaryProps {
  deal:  DealLike
  actor: DealActionsActor
  onEdit:         () => void
  onFinalize:     () => void
  onForceFinalize: () => void
  onReopen:       () => void
  /** Aprovação (gerente+) — aparece só em status AGUARDANDO_APROVACAO/LIBERACAO. */
  onApprove?:      () => void
  /** Cancelamento — abre o modal de motivo no parent. */
  onCancelDeal?:   () => void
  /** Dados do cliente salvos pela janelinha — recarrega a negociação. */
  onCustomerSaved?: () => void
}

export default function DealSummary({
  deal, actor, onEdit, onFinalize, onForceFinalize, onReopen, onApprove, onCancelDeal, onCustomerSaved,
}: DealSummaryProps) {
  const a = useDealActions(deal, actor)
  const [confirmForce, setConfirmForce] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  // Contato/endereço não mexem em valores: GERENTE+ corrige em qualquer status (menos cancelada).
  const canEditCustomer = deal.status !== 'CANCELADA' && (['GERENTE', 'GERENTE_GERAL', 'ADM', 'MASTER'].includes(actor.role) || a.canEditNow)

  const person      = deal.person ?? null
  const customer    = deal.customer ?? null
  const cliNome     = person?.nomeCompleto ?? customer?.name ?? null
  const cliDoc      = person?.cpf ?? person?.cnpj ?? customer?.cpf ?? null
  const cliPhone    = person?.phone ?? customer?.phone ?? null
  const cliEmail    = person?.email ?? customer?.email ?? null
  const cliCep      = person?.cep
  const cliCidade   = person?.cidade ?? customer?.city
  const cliEstado   = person?.estado ?? customer?.state
  const street      = [person?.logradouro, person?.numero].filter(Boolean).join(', ') + (person?.complemento ? ` — ${person.complemento}` : '')
  const cityLine    = [person?.bairro, [cliCidade, cliEstado].filter(Boolean).join('/')].filter(Boolean).join(' · ')

  const main = dealMainRole(deal.type)
  const mainVehicles = (deal.vehicles ?? []).filter(v => v.role === main)
  const vendido = mainVehicles[0] ?? (deal.vehicles ?? [])[0]
  const vPlate  = vendido?.plate  ?? vendido?.vehicle?.plate
  const vBrand  = vendido?.brand  ?? vendido?.vehicle?.brand
  const vModel  = vendido?.model  ?? vendido?.vehicle?.model
  const vVersion = vendido?.version ?? vendido?.vehicle?.version
  const vYear   = vendido?.year   ?? vendido?.vehicle?.year
  const vModelYear = vendido?.modelYear ?? vendido?.vehicle?.modelYear
  const vColor  = vendido?.color  ?? vendido?.vehicle?.color
  const vKm     = vendido?.km
  const vPhoto  = vendido?.vehicle?.mainPhotoUrl ?? null
  // Valor ATUAL negociado do carro. Com mais de um carro na mesma ponta, o card
  // mostra o valor deste carro (o total da operação fica no resumo financeiro).
  const ownValue = mainVehicles.length > 1 && Number(vendido?.agreedValue) > 0 ? Number(vendido?.agreedValue) : null
  const vValor  = ownValue ?? dealVehiclePrice(deal as never)

  const initial = (cliNome ?? '?').trim().charAt(0).toUpperCase()
  const fin = a.summary
  const net = fin?.netTotal ?? a.balance.totalLiquido
  const rec = a.reconciliation
  const pct = (v?: number) => (net > 0 && v ? Math.min(100, Math.max(0, (v / net) * 100)) : 0)
  const tone = rec?.situacao === 'CONCILIADO' || rec?.situacao === 'SEM_VALOR' ? 'bg-green-50 text-green-800' : rec?.situacao === 'AGUARDANDO_CONCILIACAO' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'
  const sellerName = deal.seller?.user?.name ?? deal.seller?.fullName ?? deal.sellerNameFromSheet ?? null
  const priceLabel = deal.type === 'COMPRA' ? 'Valor de compra' : deal.type === 'CONSIGNACAO' ? 'Valor do veículo' : 'Valor de venda'
  const vehicleRoleLabel = deal.type === 'COMPRA' ? 'Veículo comprado' : deal.type === 'CONSIGNACAO' ? 'Veículo consignado' : 'Veículo vendido'
  const specs = [
    vYear ? (vModelYear && vModelYear !== vYear ? `${vYear}/${vModelYear}` : String(vYear)) : null,
    vColor,
    vKm != null ? `${Number(vKm).toLocaleString('pt-BR')} km` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-bold tracking-tight text-gray-900">{deal.dealNumber ?? deal.id.slice(0, 8)}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[deal.status] ?? 'bg-gray-100 text-gray-700'}`}>{STATUS_LABEL[deal.status] ?? deal.status}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_PILL[deal.type] ?? 'bg-gray-100 text-gray-700'}`}>{TYPE_LABEL[deal.type] ?? deal.type}</span>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            {deal.createdAt && <span className="inline-flex items-center gap-1"><CalendarDays size={12} />Criada em {fmtDate(deal.createdAt)}</span>}
            {deal.saleDate && <span>Venda em {fmtDate(deal.saleDate)}</span>}
            {deal.deliveryDate && <span className="inline-flex items-center gap-1"><Truck size={12} />Entrega prevista para {fmtDate(deal.deliveryDate)}</span>}
            {deal.approvedBy?.name && <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-green-600" />Aprovada por {deal.approvedBy.name}{deal.approvedAt ? ` em ${fmtDate(deal.approvedAt)}` : ''}</span>}
            {deal.status === 'CANCELADA' && deal.cancelledReason && <span className="text-red-600">Motivo do cancelamento: {deal.cancelledReason}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onApprove && ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'].includes(deal.status) && (
            <button onClick={onApprove} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700">
              <CheckCircle2 size={14} /> Aprovar
            </button>
          )}
          {a.canEditNow && (
            <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Edit size={14} /> Editar
            </button>
          )}
          {onCancelDeal && deal.status !== 'CANCELADA' && (deal.status !== 'FINALIZADA' || ['ADM', 'MASTER'].includes(actor.role)) && (
            <button onClick={onCancelDeal} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
              <Ban size={14} /> Cancelar
            </button>
          )}
          <div className="group relative">
            <button onClick={onFinalize} disabled={!a.canFinalizeNow} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
              <CheckCircle2 size={14} /> Finalizar
            </button>
            {!a.canFinalizeNow && a.finalizeDisabledReason && (
              <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-64 whitespace-pre-wrap rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
                {a.finalizeDisabledReason}
              </div>
            )}
          </div>
          {a.canForceFinalize && !a.canFinalizeNow && a.isFinalizable && !a.isLocked && (
            <button onClick={() => setConfirmForce(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100" title="Forçar finalização mesmo com saldo aberto (MASTER)">
              <ShieldAlert size={14} /> Forçar finalização
            </button>
          )}
          {a.canReopenNow && (
            <button onClick={onReopen} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100">
              <RotateCcw size={14} /> Reabrir
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ── Negócio: veículo + cliente + equipe ─────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            {vendido ? (
              <>
                {vPhoto ? (
                  <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:w-36">
                    <VehiclePhotoImg src={vPhoto} alt={vModel ?? 'veículo'} fill className="object-cover" sizes="144px" />
                  </div>
                ) : (
                  <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400 sm:w-36"><Car size={28} /></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {vPlate && <span className="rounded-md bg-gray-900 px-2 py-0.5 font-mono text-xs font-semibold tracking-wider text-white">{vPlate}</span>}
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{vehicleRoleLabel}</span>
                  </div>
                  <p className="mt-1 truncate text-lg font-semibold text-gray-900">{[vBrand, vModel].filter(Boolean).join(' ') || '—'}</p>
                  {vVersion && <p className="truncate text-sm text-gray-500">{vVersion}</p>}
                  {specs && <p className="mt-1 text-xs text-gray-500">{specs}</p>}
                </div>
                {vValor != null && (
                  <div className="shrink-0 sm:text-right">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{priceLabel}</p>
                    <p className="text-2xl font-bold tabular-nums text-gray-900">{formatBRL(Number(vValor))}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm italic text-gray-400">Nenhum veículo vinculado.</p>
            )}
          </div>

          <div className="grid grid-cols-1 divide-y divide-gray-100 border-t border-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {/* Cliente */}
            <div className="min-w-0 p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><User size={12} />Cliente</p>
                {(person || customer) && (
                  <button type="button" onClick={() => setShowCustomer(true)} className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline">
                    Ver dados do cliente
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">{initial}</div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900" title={cliNome ?? undefined}>{cliNome ?? 'Cliente não informado'}</p>
                  {cliDoc && <p className="text-xs tabular-nums text-gray-500">{maskDoc(cliDoc)}</p>}
                </div>
              </div>
              <div className="mt-3 space-y-1.5 text-sm">
                {cliPhone && <IconRow icon={<Phone size={13} />} value={maskPhone(cliPhone)} />}
                {cliEmail && <IconRow icon={<Mail size={13} />} value={cliEmail} />}
                {(street || cityLine || cliCep) && (
                  <IconRow icon={<MapPin size={13} />} value={[street, cityLine, cliCep && `CEP ${maskCEP(cliCep)}`].filter(Boolean).join(' · ')} wrap />
                )}
              </div>
            </div>

            {/* Equipe */}
            <div className="min-w-0 p-5">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><Users size={12} />Equipe</p>
              <dl className="space-y-3">
                <Person label="Vendedor" name={sellerName} hint={deal.seller?.cargo ?? null} empty="Vendedor não informado" badge={deal.isSellerProvisional ? 'Provisório' : null} />
                <Person label="Gerente responsável" name={deal.manager?.name ?? null} empty="Sem gerente vinculado ao vendedor" />
              </dl>
            </div>
          </div>
        </div>

        {/* ── Resumo financeiro ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><DollarSign size={12} />Resumo financeiro</p>
          <dl className="space-y-1.5 text-sm">
            <Money label={priceLabel} value={fin?.vehicleAmount ?? Number(vValor ?? 0)} />
            {!!fin?.debtAmount && <Money label="Débitos e despesas" value={fin.debtAmount} sign="+" />}
            {!!fin?.serviceAmount && <Money label="Serviços" value={fin.serviceAmount} sign="+" />}
            {!!fin?.warrantyAmount && <Money label="Garantias" value={fin.warrantyAmount} sign="+" />}
            {!!fin?.feeAmount && <Money label="Documentação" value={fin.feeAmount} sign="+" />}
            {!!fin?.discountApprovedTotal && <Money label="Descontos" value={fin.discountApprovedTotal} sign="−" tone="text-green-700" />}
            <div className="flex items-baseline justify-between border-t border-gray-100 pt-2">
              <dt className="font-semibold text-gray-800">Total da negociação</dt>
              <dd className="font-bold tabular-nums text-gray-900">{formatBRL(net)}</dd>
            </div>
          </dl>

          {/* Conciliação: só conta como recebido o que o financeiro conferiu. */}
          <div className="mt-4 rounded-xl bg-gray-50 p-3">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-200" role="img" aria-label={`Conciliado ${Math.round(pct(rec?.conciliado))}%, aguardando conciliação ${Math.round(pct(rec?.aguardando))}%`}>
              <div className="h-full bg-green-500" style={{ width: `${pct(rec?.conciliado)}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${pct(rec?.aguardando)}%` }} />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Legend dot="bg-green-500" label="Conciliado pelo financeiro" value={rec?.conciliado ?? 0} />
              <Legend dot="bg-amber-400" label="Aguardando conciliação" value={rec?.aguardando ?? 0} />
              <Legend dot="bg-gray-300" label="Falta lançar" value={rec?.faltaLancar ?? 0} />
            </dl>
          </div>

          <div className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2.5 ${tone}`}>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {rec?.situacao === 'CONCILIADO' ? <CheckCircle2 size={15} /> : rec?.situacao === 'AGUARDANDO_CONCILIACAO' ? <Clock size={15} /> : <ArrowUpCircle size={15} />}
              {rec?.situacao === 'CONCILIADO' ? 'Quitado e conciliado' : rec?.situacao === 'AGUARDANDO_CONCILIACAO' ? 'Falta conciliar' : 'Falta receber'}
            </span>
            <span className="text-lg font-bold tabular-nums">{formatBRL(rec?.naoConciliado ?? 0)}</span>
          </div>
          {!!rec?.excedente && <p className="mt-2 text-xs text-blue-700">Lançado acima do total: <strong className="tabular-nums">{formatBRL(rec.excedente)}</strong></p>}
          {a.releaseBlock && <p className="mt-2 flex items-start gap-1.5 text-[11px] text-gray-500"><Lock size={12} className="mt-0.5 shrink-0" />Veículo só é liberado (finalização e termo de entrega) com tudo conciliado.</p>}
          {a.balance.totalTroco > 0 && <p className="mt-2 text-xs text-gray-500">Troco a devolver ao cliente: <strong className="tabular-nums">{formatBRL(a.balance.totalTroco)}</strong></p>}
        </div>
      </div>

      {showCustomer && (
        <DealCustomerModal
          dealId={deal.id}
          person={person}
          customer={customer}
          canEdit={canEditCustomer}
          onClose={() => setShowCustomer(false)}
          onSaved={() => onCustomerSaved?.()}
        />
      )}

      {confirmForce && (
        <ForceFinalizeModal
          dealNumber={deal.dealNumber ?? deal.id.slice(0, 8)}
          balanceHint={a.finalizeDisabledReason ?? ''}
          onCancel={() => setConfirmForce(false)}
          onConfirm={() => { setConfirmForce(false); onForceFinalize() }}
        />
      )}
    </div>
  )
}

// ── Auxiliares ────────────────────────────────────────────────────────────────

function IconRow({ icon, value, wrap }: { icon: React.ReactNode; value: string; wrap?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-gray-700">
      <span className="mt-0.5 shrink-0 text-gray-400">{icon}</span>
      <span className={wrap ? 'text-xs leading-relaxed text-gray-600' : 'truncate'}>{value}</span>
    </div>
  )
}

function Person({ label, name, hint, empty, badge }: { label: string; name: string | null; hint?: string | null; empty: string; badge?: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${name ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-300'}`}>{(name ?? '?').trim().charAt(0).toUpperCase()}</div>
      <div className="min-w-0">
        <dt className="text-[11px] text-gray-400">{label}</dt>
        <dd className={`truncate text-sm ${name ? 'font-medium text-gray-900' : 'italic text-gray-400'}`}>
          {name ?? empty}
          {badge && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium not-italic text-orange-700">{badge}</span>}
        </dd>
        {hint && <dd className="text-xs text-gray-500">{hint}</dd>}
      </div>
    </div>
  )
}

function Legend({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-2 text-gray-600"><span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />{label}</dt>
      <dd className="tabular-nums text-gray-900">{formatBRL(value)}</dd>
    </div>
  )
}

function Money({ label, value, sign, tone }: { label: string; value: number; sign?: '+' | '−'; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-600">{sign && <span className="mr-1 text-gray-400">{sign}</span>}{label}</dt>
      <dd className={`tabular-nums ${tone ?? 'text-gray-900'}`}>{formatBRL(value)}</dd>
    </div>
  )
}

function ForceFinalizeModal({
  dealNumber, balanceHint, onCancel, onConfirm,
}: { dealNumber: string; balanceHint: string; onCancel: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('')
  const ok = typed.trim() === dealNumber.trim()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertTriangle size={16} /> Forçar finalização (MASTER)
          </h3>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
            Esta ação ignora as travas de saldo. Use apenas em casos excepcionais. {balanceHint}
          </p>
          <p className="text-gray-700">
            Para confirmar, digite o número da negociação <strong className="font-mono">{dealNumber}</strong>:
          </p>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={dealNumber}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={onCancel} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!ok}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Forçar finalização
          </button>
        </div>
      </div>
    </div>
  )
}
