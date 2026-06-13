'use client'

// =============================================================================
// DealSummary — Painel-resumo no topo da página da negociação
// =============================================================================

import { useEffect, useState } from 'react'
import {
  User, Car, Users, DollarSign, Wallet, ArrowDownCircle, ArrowUpCircle,
  TrendingDown, History, Edit, CheckCircle2, RotateCcw, AlertTriangle, ShieldAlert, Ban,
} from 'lucide-react'
import { formatBRL, maskCPF, maskCNPJ, maskPhone, maskCEP } from '@/lib/masks'
import { useDealActions, type DealActionsActor, type DealActionsDeal } from '../_hooks/useDealActions'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PersonLike {
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
  } | null
}

interface DealLike extends DealActionsDeal {
  dealNumber?: string | null
  type:        string
  status:      string
  person?:     PersonLike | null
  customer?:   { name?: string | null; cpf?: string | null; email?: string | null; phone?: string | null; address?: string | null; city?: string | null; state?: string | null } | null
  seller?:     { id?: string; fullName?: string | null; user?: { id?: string; name?: string | null; email?: string | null; role?: string | null } | null; cargo?: string | null } | null
  manager?:    { id?: string; name?: string | null; email?: string | null } | null
  vehicles?:   VehicleLike[]
}

interface TimelineEvt {
  type: string
  icon: string
  title: string
  description?: string | null
  user?: string | null
  date: string
}

// ── Constantes visuais ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', EM_PREENCHIMENTO: 'Em Preenchimento',
  AGUARDANDO_LIBERACAO: 'Aguardando Liberação', AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  LIBERADA: 'Liberada', APROVADA: 'Aprovada', RECUSADA: 'Recusada', DESAPROVADA: 'Desaprovada',
  DEVOLVIDA_PARA_CORRECAO: 'Devolvida p/ Correção', AGUARDANDO_SINAL: 'Aguardando Sinal',
  SINAL_RECEBIDO: 'Sinal Recebido', RESERVADA: 'Reservada',
  AGUARDANDO_FINANCEIRO: 'Aguardando Financeiro', FINANCEIRO_APROVADO: 'Financeiro Aprovado',
  FINANCEIRO_REPROVADO: 'Financeiro Reprovado', AGUARDANDO_DOCUMENTACAO: 'Aguardando Documentação',
  DOCUMENTACAO_CONCLUIDA: 'Documentação Concluída', AGUARDANDO_CONTRATO: 'Aguardando Contrato',
  CONTRATO_GERADO: 'Contrato Gerado', AGUARDANDO_ASSINATURA: 'Aguardando Assinatura',
  ASSINADA: 'Assinada', AGUARDANDO_ENTREGA: 'Aguardando Entrega', ENTREGUE: 'Entregue',
  EM_ANDAMENTO: 'Em Andamento', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada',
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

const fmtDateTime = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR') : ''

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
}

export default function DealSummary({
  deal, actor, onEdit, onFinalize, onForceFinalize, onReopen, onApprove, onCancelDeal,
}: DealSummaryProps) {
  const a = useDealActions(deal, actor)
  const [timeline, setTimeline]   = useState<TimelineEvt[]>([])
  const [loadingTl, setLoadingTl] = useState(false)
  const [confirmForce, setConfirmForce] = useState(false)

  useEffect(() => {
    if (!deal?.id) return
    setLoadingTl(true)
    fetch(`/api/negotiations/${deal.id}/timeline`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setTimeline(Array.isArray(d?.data) ? d.data.slice(-12) : []))
      .catch(() => setTimeline([]))
      .finally(() => setLoadingTl(false))
  }, [deal?.id])

  const person      = deal.person ?? null
  const customer    = deal.customer ?? null
  const cliNome     = person?.nomeCompleto ?? customer?.name ?? null
  const cliDoc      = person?.cpf ?? person?.cnpj ?? customer?.cpf ?? null
  const cliPhone    = person?.phone ?? customer?.phone ?? null
  const cliEmail    = person?.email ?? customer?.email ?? null
  const cliCep      = person?.cep
  const cliLograd   = person?.logradouro
  const cliNumero   = person?.numero
  const cliComp     = person?.complemento
  const cliBairro   = person?.bairro
  const cliCidade   = person?.cidade ?? customer?.city
  const cliEstado   = person?.estado ?? customer?.state

  const vendido = (deal.vehicles ?? []).find(v => v.role === 'VENDIDO') ?? (deal.vehicles ?? [])[0]
  const vPlate  = vendido?.plate  ?? vendido?.vehicle?.plate
  const vBrand  = vendido?.brand  ?? vendido?.vehicle?.brand
  const vModel  = vendido?.model  ?? vendido?.vehicle?.model
  const vVersion = (vendido as any)?.version ?? vendido?.vehicle?.version
  const vYear   = vendido?.year   ?? vendido?.vehicle?.year
  const vModelYear = (vendido as any)?.modelYear ?? vendido?.vehicle?.modelYear
  const vColor  = vendido?.color  ?? vendido?.vehicle?.color
  const vKm     = vendido?.km
  const vPhoto  = vendido?.vehicle?.mainPhotoUrl ?? null
  const vValor  = deal.vehicleValue ?? deal.saleAmount

  const initial = (cliNome ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div className="space-y-4">
      {/* ── Header row ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-lg font-bold text-gray-900">
            {deal.dealNumber ?? deal.id.slice(0, 8)}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[deal.status] ?? 'bg-gray-100 text-gray-700'}`}>
            {STATUS_LABEL[deal.status] ?? deal.status}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_PILL[deal.type] ?? 'bg-gray-100 text-gray-700'}`}>
            {TYPE_LABEL[deal.type] ?? deal.type}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Aprovar (gerente+, status aguardando) */}
          {onApprove && ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'].includes(deal.status) && (
            <button
              onClick={onApprove}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              <CheckCircle2 size={14} /> Aprovar
            </button>
          )}

          {a.canEditNow && (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Edit size={14} /> Editar
            </button>
          )}

          {/* Cancelar */}
          {onCancelDeal && !['FINALIZADA', 'CANCELADA'].includes(deal.status) && (
            <button
              onClick={onCancelDeal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Ban size={14} /> Cancelar
            </button>
          )}

          {/* Finalizar */}
          <div className="relative group">
            <button
              onClick={onFinalize}
              disabled={!a.canFinalizeNow}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={14} /> Finalizar
            </button>
            {!a.canFinalizeNow && a.finalizeDisabledReason && (
              <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden whitespace-pre-wrap rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block max-w-xs">
                {a.finalizeDisabledReason}
              </div>
            )}
          </div>

          {a.canForceFinalize && !a.canFinalizeNow && a.isFinalizable && !a.isLocked && (
            <button
              onClick={() => setConfirmForce(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              title="Forçar finalização mesmo com saldo aberto (MASTER)"
            >
              <ShieldAlert size={14} /> Forçar finalização (MASTER)
            </button>
          )}

          {a.canReopenNow && (
            <button
              onClick={onReopen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              <RotateCcw size={14} /> Reabrir
            </button>
          )}
        </div>
      </div>

      {/* ── 3 colunas: Cliente / Veículo / Equipe ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Cliente */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <User size={15} className="text-brand-600" /> Cliente
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-semibold">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">{cliNome ?? '—'}</p>
              {cliDoc && <p className="text-xs text-gray-500">{maskDoc(cliDoc)}</p>}
            </div>
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            {cliPhone && <Row label="Telefone" value={maskPhone(cliPhone)} />}
            {cliEmail && <Row label="E-mail" value={cliEmail} />}
            {(cliCep || cliLograd || cliCidade) && (
              <div className="border-t border-gray-100 pt-2 text-xs text-gray-600">
                {cliCep && <p>CEP: {maskCEP(cliCep)}</p>}
                {(cliLograd || cliNumero) && <p>{[cliLograd, cliNumero].filter(Boolean).join(', ')}{cliComp ? ` — ${cliComp}` : ''}</p>}
                {(cliBairro || cliCidade || cliEstado) && (
                  <p>{[cliBairro, [cliCidade, cliEstado].filter(Boolean).join('/')].filter(Boolean).join(' — ')}</p>
                )}
              </div>
            )}
          </dl>
        </div>

        {/* Veículo */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Car size={15} className="text-brand-600" /> Veículo
          </div>
          {vendido ? (
            <div className="flex items-start gap-3">
              {vPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vPhoto} alt={vModel ?? 'veículo'} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                  <Car size={22} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {vPlate && (
                  <span className="inline-block rounded bg-gray-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                    {vPlate}
                  </span>
                )}
                <p className="mt-1 truncate font-medium text-gray-900">
                  {[vBrand, vModel].filter(Boolean).join(' ') || '—'}
                </p>
                {vVersion && <p className="truncate text-xs text-gray-500">{vVersion}</p>}
                <p className="mt-1 text-xs text-gray-600">
                  {[vYear && `Ano ${vYear}`, vModelYear && vModelYear !== vYear && `(modelo ${vModelYear})`].filter(Boolean).join(' ')}
                  {vColor ? `${(vYear || vModelYear) ? ' · ' : ''}${vColor}` : ''}
                  {vKm != null ? ` · ${Number(vKm).toLocaleString('pt-BR')} km` : ''}
                </p>
                {vValor != null && (
                  <p className="mt-1 text-sm font-semibold text-brand-700">{formatBRL(Number(vValor))}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm italic text-gray-400">Nenhum veículo vinculado.</p>
          )}
        </div>

        {/* Equipe */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Users size={15} className="text-brand-600" /> Equipe
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Vendedor</dt>
              <dd className="font-medium text-gray-800">
                {deal.seller?.user?.name ?? deal.seller?.fullName ?? 'Vendedor não informado'}
              </dd>
              {deal.seller?.cargo && <dd className="text-xs text-gray-500">{deal.seller.cargo}</dd>}
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Gerente responsável</dt>
              <dd className="font-medium text-gray-800">{deal.manager?.name ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* ── Strip Financeiro ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm md:grid-cols-5">
        <MiniCard
          icon={<DollarSign size={14} />}
          label="Total Bruto"
          value={formatBRL(a.balance.totalBruto)}
        />
        <MiniCard
          icon={<TrendingDown size={14} />}
          label="Total Líquido"
          value={formatBRL(a.balance.totalLiquido)}
          hint={a.balance.totalDiscountApproved > 0 ? `−${formatBRL(a.balance.totalDiscountApproved)} em descontos aprovados` : null}
        />
        <MiniCard
          icon={<Wallet size={14} />}
          label="Total Pago"
          value={formatBRL(a.balance.totalPago)}
        />
        <MiniCard
          icon={a.saldoStatus === 'zerado' ? <CheckCircle2 size={14} /> : a.saldoStatus === 'aberto' ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
          label="Saldo"
          value={formatBRL(a.saldo)}
          tone={a.saldoStatus === 'zerado' ? 'success' : a.saldoStatus === 'aberto' ? 'warn' : 'info'}
        />
        {a.balance.totalTroco > 0 && (
          <MiniCard
            icon={<ArrowDownCircle size={14} />}
            label="Troco"
            value={formatBRL(a.balance.totalTroco)}
            tone="info"
          />
        )}
      </div>

      {/* ── Timeline strip ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <History size={13} /> Histórico recente
        </div>
        {loadingTl ? (
          <p className="text-xs italic text-gray-400">Carregando…</p>
        ) : timeline.length === 0 ? (
          <p className="text-xs italic text-gray-400">Sem eventos registrados.</p>
        ) : (
          <ol className="flex gap-3 overflow-x-auto pb-1">
            {timeline.slice().reverse().map((ev, i) => (
              <li key={i} className="min-w-[180px] shrink-0 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="text-xs font-semibold text-gray-800">{ev.title}</p>
                {ev.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{ev.description}</p>}
                <p className="mt-1 text-[10px] text-gray-400">
                  {ev.user ? `${ev.user} · ` : ''}{fmtDateTime(ev.date)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Modal: Forçar finalização ────────────────────────────────────────── */}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <dt className="text-gray-500">{label}</dt>
      <dd className="truncate text-gray-800">{value}</dd>
    </div>
  )
}

function MiniCard({
  icon, label, value, hint, tone,
}: { icon: React.ReactNode; label: string; value: string; hint?: string | null; tone?: 'success' | 'warn' | 'info' }) {
  const toneCls =
    tone === 'success' ? 'text-green-700'
    : tone === 'warn' ? 'text-amber-700'
    : tone === 'info' ? 'text-blue-700'
    : 'text-gray-900'
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
        <span className="text-brand-600">{icon}</span>{label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold ${toneCls}`}>{value}</div>
      {hint && <div className="text-[10px] text-gray-500">{hint}</div>}
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
