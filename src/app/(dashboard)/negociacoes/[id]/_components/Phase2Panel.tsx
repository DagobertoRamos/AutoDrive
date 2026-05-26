'use client'

// =============================================================================
// Phase2Panel — Layout de duas colunas (Itens | Pagamentos)
// Painel profissional para gerir veiculos, debitos, servicos, descontos,
// pagamentos, saldo e troco da negociacao.
// =============================================================================

import { useMemo, useState } from 'react'
import {
  Plus, Trash2, Edit2, Check, X, AlertTriangle, RotateCcw, Lock, DollarSign,
  Percent, Wallet, Car, Receipt, Wrench, Tag, CreditCard, Banknote, Building2,
  FileText, Coins,
} from 'lucide-react'
import { formatBRL, maskBRL, parseBRL, numberToBRLMask, maskCPF, maskCNPJ } from '@/lib/masks'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Phase2Payment {
  id?:            string
  type:           string
  value:          number | string
  bank?:          string | null
  cardBrand?:     string | null
  installments?:  number | null
  firstDueDate?:  string | null
  dueDate?:       string | null
  notes?:         string | null
}

export interface Phase2DiscountRequest {
  id:             string
  requestedById:  string
  requestedValue: number | string
  approvedValue?: number | string | null
  reason:         string
  status:         'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'CANCELADO'
  decidedById?:   string | null
  decidedAt?:     string | null
  decisionNote?:  string | null
  createdAt:      string
}

export interface Phase2Change {
  id:          string
  value:       number | string
  beneficiary: string
  document?:   string | null
  bank?:       string | null
  agency?:     string | null
  account?:    string | null
  pixKey?:     string | null
  reason?:     string | null
  createdAt:   string
}

export interface Phase2Vehicle {
  id:          string
  role:        string
  plate?:      string | null
  brand?:      string | null
  model?:      string | null
  year?:       number | null
  agreedValue?: number | string | null
  payoffValue?: number | string | null
  hasFinancing?: boolean
  vehicle?: { plate?: string | null; brand?: string | null; model?: string | null; year?: number | null } | null
}

export interface Phase2Debt {
  id:          string
  type:        string
  description?: string | null
  value:       number | string
  responsavel?: string | null
  vehicleRole?: string | null
  dueDate?:    string | null
}

export interface Phase2Service {
  id:    string
  name:  string
  value: number | string | null
}

interface Props {
  dealId:         string
  isLocked:       boolean
  canEdit:        boolean
  canApprove:     boolean
  canReopen:      boolean
  canForce:       boolean

  // Compat (mantidos para nao quebrar a chamada existente)
  vehicleValue:   number
  debtsTotal:     number
  servicesTotal:  number

  // Novos (opcionais) — habilitam o layout completo de duas colunas
  vehicles?:      Phase2Vehicle[]
  debts?:         Phase2Debt[]
  services?:      Phase2Service[]

  payments:       Phase2Payment[]
  discounts:      Phase2DiscountRequest[]
  changes:        Phase2Change[]
  onReload:       () => void
  onToast?:       (msg: string, kind?: 'success' | 'error') => void
}

// ── Constantes ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS: Array<[string, string]> = [
  ['DINHEIRO',        'Dinheiro'],
  ['PIX',             'PIX'],
  ['CARTAO_DEBITO',   'Cartao de Debito'],
  ['CARTAO_CREDITO',  'Cartao de Credito'],
  ['FINANCIAMENTO',   'Financiamento'],
  ['BOLETO',          'Boleto'],
  ['TRANSFERENCIA',   'Transferencia'],
  ['SINAL',           'Sinal / Entrada'],
  ['DUPLICATA',       'Duplicata'],
  ['OUTROS',          'Outros'],
]

const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS)

const PAYMENT_ICONS: Record<string, JSX.Element> = {
  DINHEIRO:       <Banknote size={14} />,
  PIX:            <Coins size={14} />,
  CARTAO_DEBITO:  <CreditCard size={14} />,
  CARTAO_CREDITO: <CreditCard size={14} />,
  FINANCIAMENTO:  <Building2 size={14} />,
  BOLETO:         <FileText size={14} />,
  TRANSFERENCIA:  <Building2 size={14} />,
  SINAL:          <Wallet size={14} />,
  DUPLICATA:      <FileText size={14} />,
  OUTROS:         <Wallet size={14} />,
}

const PAYMENT_TYPE_PILL: Record<string, string> = {
  DINHEIRO:       'bg-green-50  text-green-700  border-green-200',
  PIX:            'bg-teal-50   text-teal-700   border-teal-200',
  CARTAO_DEBITO:  'bg-sky-50    text-sky-700    border-sky-200',
  CARTAO_CREDITO: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  FINANCIAMENTO:  'bg-blue-50   text-blue-700   border-blue-200',
  BOLETO:         'bg-amber-50  text-amber-700  border-amber-200',
  TRANSFERENCIA:  'bg-cyan-50   text-cyan-700   border-cyan-200',
  SINAL:          'bg-purple-50 text-purple-700 border-purple-200',
  DUPLICATA:      'bg-orange-50 text-orange-700 border-orange-200',
  OUTROS:         'bg-gray-50   text-gray-700   border-gray-200',
}

const CARD_BRANDS = ['VISA', 'MASTER', 'ELO', 'AMEX', 'HIPERCARD', 'OUTROS']

const ROLE_LABEL: Record<string, string> = {
  VENDIDO:    'Vendido',
  COMPRADO:   'Comprado',
  TROCA:      'Recebido (troca)',
  CONSIGNADO: 'Consignado',
}

const ROLE_PILL: Record<string, string> = {
  VENDIDO:    'bg-green-100  text-green-700',
  COMPRADO:   'bg-blue-100   text-blue-700',
  TROCA:      'bg-purple-100 text-purple-700',
  CONSIGNADO: 'bg-amber-100  text-amber-700',
}

const RESP_LABEL: Record<string, string> = {
  CLIENTE:    'Cliente paga',
  LOJA:       'Loja paga',
  COMPRADOR:  'Comprador paga',
  VENDEDOR:   'Vendedor paga',
}

const STATUS_PILL: Record<string, string> = {
  PENDENTE:  'bg-amber-100 text-amber-700',
  APROVADO:  'bg-green-100 text-green-700',
  RECUSADO:  'bg-red-100   text-red-700',
  CANCELADO: 'bg-gray-100  text-gray-600',
}

function toN(v: any): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

// Sale-side roles que compoem o total a receber pelo cliente
const SALE_ROLES = new Set(['VENDIDO'])
// Trade-side roles (loja recebe veiculo) — abatem do que o cliente deve
const RECEIVED_ROLES = new Set(['TROCA', 'COMPRADO', 'CONSIGNADO'])

// ── Componente principal ──────────────────────────────────────────────────────

export default function Phase2Panel(props: Props) {
  const {
    dealId, isLocked, canEdit, canApprove, canReopen,
    vehicleValue, debtsTotal, servicesTotal,
    vehicles, debts, services,
    payments, discounts, changes, onReload, onToast,
  } = props

  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [editingPayment, setEditingPayment]     = useState<Phase2Payment | null>(null)
  const [discountModalOpen, setDiscountModalOpen] = useState(false)
  const [approveModal, setApproveModal] = useState<Phase2DiscountRequest | null>(null)
  const [rejectModal, setRejectModal]   = useState<Phase2DiscountRequest | null>(null)
  const [trocoModalOpen, setTrocoModalOpen] = useState(false)
  const [reopenModalOpen, setReopenModalOpen] = useState(false)

  // ── Calculos (multi-veiculo) ───────────────────────────────────────────────
  const totals = useMemo(() => {
    const veiculosVendidos = (vehicles ?? [])
      .filter(v => SALE_ROLES.has(v.role))
      .reduce((s, v) => s + toN(v.agreedValue), 0)
    const veiculosRecebidos = (vehicles ?? [])
      .filter(v => RECEIVED_ROLES.has(v.role))
      .reduce((s, v) => s + toN(v.agreedValue), 0)

    // Se nao recebemos vehicles novos, caimos no fallback antigo (vehicleValue)
    const totalVeiculosVendidos = veiculosVendidos > 0 ? veiculosVendidos : vehicleValue

    // Debits relevantes pro saldo: do veiculo vendido (loja repassa) e debitos genericos
    // do cliente. Debitos do veiculo recebido tipicamente sao quitacao (payoff) e
    // contam separadamente.
    const debitosRelevantes = debts
      ? debts
          .filter(d => {
            const r = (d.responsavel ?? '').toUpperCase()
            // por padrao todos os debitos compoem o total a cobrar do cliente
            return r !== 'LOJA' && r !== 'VENDEDOR'
          })
          .reduce((s, d) => s + toN(d.value), 0)
      : debtsTotal

    const debitosLoja = debts
      ? debts.filter(d => (d.responsavel ?? '').toUpperCase() === 'LOJA')
             .reduce((s, d) => s + toN(d.value), 0)
      : 0

    // Quitacao do veiculo recebido — soma de payoffValue
    const payoffsRecebidos = (vehicles ?? [])
      .filter(v => RECEIVED_ROLES.has(v.role) && v.hasFinancing)
      .reduce((s, v) => s + toN(v.payoffValue), 0)

    const totalServicos = services
      ? services.reduce((s, x) => s + toN(x.value), 0)
      : servicesTotal

    const totalDescontosAprovados = discounts
      .filter(d => d.status === 'APROVADO')
      .reduce((s, d) => s + toN(d.approvedValue ?? d.requestedValue), 0)

    // Total da operacao = veiculos vendidos + debitos do cliente + servicos
    //                     - veiculos recebidos + quitacao - descontos
    const totalOperacao =
      totalVeiculosVendidos
      + debitosRelevantes
      + totalServicos
      - veiculosRecebidos
      + payoffsRecebidos
      - totalDescontosAprovados

    const totalPagamentos = payments.reduce((s, p) => s + toN(p.value), 0)
    const totalTroco      = changes.reduce((s, c) => s + toN(c.value), 0)
    const diferenca       = totalOperacao - totalPagamentos

    return {
      totalVeiculosVendidos,
      veiculosRecebidos,
      debitosRelevantes,
      debitosLoja,
      payoffsRecebidos,
      totalServicos,
      totalDescontosAprovados,
      totalOperacao,
      totalPagamentos,
      totalTroco,
      diferenca,
    }
  }, [vehicles, debts, services, payments, discounts, changes, vehicleValue, debtsTotal, servicesTotal])

  const saldoStatus: 'aberto' | 'excedente' | 'zerado' =
    totals.diferenca > 0.009 ? 'aberto'
    : totals.diferenca < -0.009 ? 'excedente'
    : 'zerado'

  // ── Agrupamentos ───────────────────────────────────────────────────────────
  const debtsByVehicle = useMemo(() => {
    const map = new Map<string, Phase2Debt[]>()
    for (const d of (debts ?? [])) {
      const key = (d.vehicleRole ?? 'GERAL').toUpperCase()
      const arr = map.get(key) ?? []
      arr.push(d)
      map.set(key, arr)
    }
    return map
  }, [debts])

  // ── Handlers API ───────────────────────────────────────────────────────────
  async function deletePayment(id: string) {
    if (!confirm('Remover este pagamento?')) return
    const r = await fetch(`/api/negotiations/${dealId}/payments/${id}`, { method: 'DELETE' })
    if (!r.ok) { onToast?.('Erro ao remover pagamento', 'error'); return }
    onToast?.('Pagamento removido', 'success')
    onReload()
  }

  async function approveDiscount(req: Phase2DiscountRequest, approvedValue: number, note: string) {
    const r = await fetch(`/api/negotiations/${dealId}/discount-requests/${req.id}/approve`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedValue, decisionNote: note }),
    })
    if (!r.ok) { onToast?.('Erro ao aprovar', 'error'); return }
    onToast?.('Desconto aprovado', 'success')
    setApproveModal(null); onReload()
  }
  async function rejectDiscount(req: Phase2DiscountRequest, note: string) {
    const r = await fetch(`/api/negotiations/${dealId}/discount-requests/${req.id}/reject`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisionNote: note }),
    })
    if (!r.ok) { onToast?.('Erro ao recusar', 'error'); return }
    onToast?.('Desconto recusado', 'success')
    setRejectModal(null); onReload()
  }

  const vendidos  = (vehicles ?? []).filter(v => SALE_ROLES.has(v.role))
  const recebidos = (vehicles ?? []).filter(v => RECEIVED_ROLES.has(v.role))

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Lock banner */}
      {isLocked && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-amber-800">
            <Lock size={16} />
            <span className="text-sm font-medium">Venda finalizada — bloqueada para edicao</span>
          </div>
          {canReopen && (
            <button
              onClick={() => setReopenModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              <RotateCcw size={14} /> Reabrir
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ───────────── COLUNA ESQUERDA — ITENS DA NEGOCIACAO ───────────── */}
        <div className="space-y-4 lg:col-span-8">
          <SectionTitle icon={<Receipt size={16} />} title="Itens da Negociacao" />

          {/* Veiculos vendidos */}
          <Card>
            <SubHeader icon={<Car size={14} />} title="Veiculos vendidos" count={vendidos.length} />
            {vendidos.length === 0 ? (
              <Empty text={vehicleValue > 0
                ? `Valor de venda informado: ${formatBRL(vehicleValue)} (sem detalhamento de veiculo)`
                : 'Nenhum veiculo vendido registrado.'} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {vendidos.map(v => (
                  <VehicleItem key={v.id} v={v} pillCls="bg-green-100 text-green-700" />
                ))}
              </ul>
            )}
          </Card>

          {/* Veiculos recebidos */}
          {recebidos.length > 0 && (
            <Card>
              <SubHeader icon={<Car size={14} />} title="Veiculos recebidos" count={recebidos.length} />
              <ul className="divide-y divide-gray-100">
                {recebidos.map(v => (
                  <VehicleItem
                    key={v.id}
                    v={v}
                    pillCls={ROLE_PILL[v.role] ?? 'bg-gray-100 text-gray-700'}
                    showPayoff
                  />
                ))}
              </ul>
            </Card>
          )}

          {/* Debitos */}
          <Card>
            <SubHeader icon={<FileText size={14} />} title="Debitos" />
            {(!debts || debts.length === 0) ? (
              <Empty text={debtsTotal > 0
                ? `Total de debitos: ${formatBRL(debtsTotal)} (sem detalhamento)`
                : 'Nenhum debito cadastrado.'} />
            ) : (
              <div className="space-y-3">
                {Array.from(debtsByVehicle.entries()).map(([role, list]) => {
                  const subtotal = list.reduce((s, d) => s + toN(d.value), 0)
                  return (
                    <div key={role} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <Tag size={11} />
                          {role === 'VENDIDO'
                            ? 'Veiculo Vendido'
                            : role === 'TROCA'
                              ? 'Veiculo Recebido (Troca)'
                              : role === 'COMPRADO'
                                ? 'Veiculo Comprado'
                                : 'Outros'}
                        </span>
                        <span className="text-gray-600">{formatBRL(subtotal)}</span>
                      </div>
                      <ul className="divide-y divide-gray-100">
                        {list.map(d => (
                          <li key={d.id} className="flex items-start justify-between gap-2 py-1.5 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-800">
                                {d.type.replace(/_/g, ' ')}
                                {d.description && <span className="ml-1 font-normal text-gray-600">— {d.description}</span>}
                              </p>
                              <p className="text-xs text-gray-500">
                                {d.responsavel && (
                                  <span className="mr-2">Resp.: {RESP_LABEL[d.responsavel.toUpperCase()] ?? d.responsavel}</span>
                                )}
                                {d.dueDate && <span>Venc.: {new Date(d.dueDate).toLocaleDateString('pt-BR')}</span>}
                              </p>
                            </div>
                            <span className="shrink-0 text-sm font-medium text-gray-800">{formatBRL(toN(d.value))}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Servicos */}
          {(services && services.length > 0) || servicesTotal > 0 ? (
            <Card>
              <SubHeader icon={<Wrench size={14} />} title="Servicos adicionais" />
              {services && services.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {services.map(s => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="text-gray-800">{s.name}</span>
                      <span className="font-medium text-gray-800">{formatBRL(toN(s.value))}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty text={`Total de servicos: ${formatBRL(servicesTotal)}`} />
              )}
            </Card>
          ) : null}

          {/* Descontos aprovados */}
          {discounts.length > 0 && (
            <Card>
              <SubHeader icon={<Percent size={14} />} title="Descontos" count={discounts.length} />
              <ul className="divide-y divide-gray-100">
                {discounts.map(d => (
                  <li key={d.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[d.status]}`}>
                          {d.status}
                        </span>
                        <span className="text-gray-700">
                          Solicitado: <strong>{formatBRL(toN(d.requestedValue))}</strong>
                          {d.status === 'APROVADO' && d.approvedValue != null && (
                            <> · Aprovado: <strong>{formatBRL(toN(d.approvedValue))}</strong></>
                          )}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">Motivo: {d.reason}</p>
                      {d.decisionNote && <p className="text-xs text-gray-500">Decisao: {d.decisionNote}</p>}
                    </div>
                    {d.status === 'PENDENTE' && canApprove && !isLocked && (
                      <div className="flex gap-1">
                        <button onClick={() => setApproveModal(d)} className="rounded p-1 text-green-600 hover:bg-green-50" title="Aprovar"><Check size={16} /></button>
                        <button onClick={() => setRejectModal(d)} className="rounded p-1 text-red-600 hover:bg-red-50" title="Recusar"><X size={16} /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && !isLocked && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => setDiscountModalOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                  >
                    <Plus size={12} /> Solicitar novo desconto
                  </button>
                </div>
              )}
            </Card>
          )}

          {/* Botao adicionar desconto quando lista vazia */}
          {discounts.length === 0 && canEdit && !isLocked && (
            <button
              onClick={() => setDiscountModalOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3 text-sm font-medium text-gray-500 hover:border-brand-300 hover:text-brand-700"
            >
              <Percent size={14} /> Solicitar desconto
            </button>
          )}

          {/* Total da operacao */}
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wide text-brand-800">Total da operacao</span>
              <span className="text-xl font-bold text-brand-800">{formatBRL(totals.totalOperacao)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-brand-900/70">
              <Mini label="Veiculos vendidos"   value={formatBRL(totals.totalVeiculosVendidos)} />
              {totals.veiculosRecebidos > 0 && <Mini label="(-) Veiculos recebidos" value={formatBRL(totals.veiculosRecebidos)} />}
              {totals.debitosRelevantes > 0 && <Mini label="Debitos do cliente"     value={formatBRL(totals.debitosRelevantes)} />}
              {totals.payoffsRecebidos  > 0 && <Mini label="Quitacao recebidos"     value={formatBRL(totals.payoffsRecebidos)} />}
              {totals.totalServicos     > 0 && <Mini label="Servicos"               value={formatBRL(totals.totalServicos)} />}
              {totals.totalDescontosAprovados > 0 && <Mini label="(-) Descontos" value={formatBRL(totals.totalDescontosAprovados)} />}
            </div>
          </div>
        </div>

        {/* ───────────── COLUNA DIREITA — PAGAMENTOS ───────────── */}
        <div className="space-y-4 lg:col-span-4">
          <SectionTitle icon={<Wallet size={16} />} title="Pagamentos" />

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {payments.length} pagamento(s)
              </div>
              {canEdit && !isLocked && (
                <button
                  onClick={() => { setEditingPayment(null); setPaymentModalOpen(true) }}
                  className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  <Plus size={12} /> Novo pagamento
                </button>
              )}
            </div>

            {payments.length === 0 ? (
              <Empty text="Nenhum pagamento cadastrado." />
            ) : (
              <ul className="space-y-2">
                {payments.map(p => (
                  <li key={p.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PAYMENT_TYPE_PILL[p.type] ?? PAYMENT_TYPE_PILL.OUTROS}`}>
                            {PAYMENT_ICONS[p.type] ?? <Wallet size={11} />}
                            {PAYMENT_LABEL[p.type] ?? p.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="mt-1 text-base font-bold text-gray-900">{formatBRL(toN(p.value))}</p>
                        <div className="mt-0.5 space-y-0.5 text-[11px] text-gray-500">
                          {p.bank && <p>{p.bank}{p.cardBrand ? ` · ${p.cardBrand}` : ''}</p>}
                          {p.installments && <p>{p.installments}x parcelas</p>}
                          {p.firstDueDate && <p>1o venc.: {new Date(p.firstDueDate).toLocaleDateString('pt-BR')}</p>}
                          {p.dueDate && !p.firstDueDate && <p>Venc.: {new Date(p.dueDate).toLocaleDateString('pt-BR')}</p>}
                          {p.notes && <p className="line-clamp-2 italic">{p.notes}</p>}
                        </div>
                      </div>
                      {canEdit && !isLocked && (
                        <div className="flex shrink-0 flex-col gap-0.5">
                          <button
                            onClick={() => { setEditingPayment(p); setPaymentModalOpen(true) }}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"
                          ><Edit2 size={13} /></button>
                          <button
                            onClick={() => p.id && deletePayment(p.id)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-700" title="Remover"
                          ><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Totais e saldo */}
          <Card>
            <SubHeader icon={<DollarSign size={14} />} title="Saldo" />
            <dl className="space-y-1 text-sm">
              <Row label="Total da operacao"     value={formatBRL(totals.totalOperacao)} />
              <Row label="Total pagamentos"      value={formatBRL(totals.totalPagamentos)} />
              <div className="my-1 border-t border-gray-100" />
              <Row
                label="Diferenca"
                value={formatBRL(totals.diferenca)}
                strong
                tone={saldoStatus === 'zerado' ? 'green' : saldoStatus === 'aberto' ? 'amber' : 'blue'}
              />
              {totals.totalTroco > 0 && (
                <Row label="Troco cadastrado" value={formatBRL(totals.totalTroco)} muted />
              )}
            </dl>

            <div className={`mt-3 rounded-lg px-3 py-2.5 text-sm ${
              saldoStatus === 'zerado' ? 'bg-green-50 text-green-800'
              : saldoStatus === 'aberto' ? 'bg-amber-50 text-amber-800'
              : 'bg-blue-50 text-blue-800'
            }`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 text-xs">
                  {saldoStatus === 'zerado' && 'Saldo zerado — pronto para finalizar'}
                  {saldoStatus === 'aberto'  && `Em aberto: ${formatBRL(totals.diferenca)}`}
                  {saldoStatus === 'excedente' && `Excedente: ${formatBRL(-totals.diferenca)}`}
                </div>
                {!isLocked && canEdit && saldoStatus === 'aberto' && (
                  <button
                    onClick={() => { setEditingPayment(null); setPaymentModalOpen(true) }}
                    className="rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
                  >+ Pagamento</button>
                )}
                {!isLocked && canEdit && saldoStatus === 'excedente'
                  && totals.totalTroco + 0.009 < -totals.diferenca && (
                  <button
                    onClick={() => setTrocoModalOpen(true)}
                    className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                  >+ Troco</button>
                )}
              </div>
            </div>
          </Card>

          {/* Troco */}
          {changes.length > 0 && (
            <Card>
              <SubHeader icon={<Coins size={14} />} title="Troco" count={changes.length} />
              <ul className="space-y-2">
                {changes.map(c => (
                  <li key={c.id} className="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-blue-800">{formatBRL(toN(c.value))}</span>
                      <span className="text-xs text-blue-700">{c.beneficiary}</span>
                    </div>
                    {(c.bank || c.pixKey) && (
                      <p className="mt-0.5 text-[11px] text-blue-700/70">
                        {c.bank && <>Banco: {c.bank}</>}
                        {c.bank && c.pixKey && ' · '}
                        {c.pixKey && <>PIX: {c.pixKey}</>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* Modais */}
      {paymentModalOpen && (
        <PaymentModal
          dealId={dealId}
          initial={editingPayment}
          onClose={() => setPaymentModalOpen(false)}
          onSaved={() => { setPaymentModalOpen(false); onReload(); onToast?.('Pagamento salvo', 'success') }}
          onError={(m) => onToast?.(m, 'error')}
        />
      )}
      {discountModalOpen && (
        <DiscountModal
          dealId={dealId}
          onClose={() => setDiscountModalOpen(false)}
          onSaved={() => { setDiscountModalOpen(false); onReload(); onToast?.('Solicitacao enviada', 'success') }}
          onError={(m) => onToast?.(m, 'error')}
        />
      )}
      {approveModal && (
        <ApproveDiscountModal
          request={approveModal}
          onClose={() => setApproveModal(null)}
          onConfirm={(v, n) => approveDiscount(approveModal, v, n)}
        />
      )}
      {rejectModal && (
        <RejectDiscountModal
          request={rejectModal}
          onClose={() => setRejectModal(null)}
          onConfirm={(n) => rejectDiscount(rejectModal, n)}
        />
      )}
      {trocoModalOpen && (
        <TrocoModal
          dealId={dealId}
          excedente={-totals.diferenca - totals.totalTroco}
          onClose={() => setTrocoModalOpen(false)}
          onSaved={() => { setTrocoModalOpen(false); onReload(); onToast?.('Troco cadastrado', 'success') }}
          onError={(m) => onToast?.(m, 'error')}
        />
      )}
      {reopenModalOpen && (
        <ReopenModal
          dealId={dealId}
          onClose={() => setReopenModalOpen(false)}
          onSaved={() => { setReopenModalOpen(false); onReload(); onToast?.('Negociacao reaberta', 'success') }}
          onError={(m) => onToast?.(m, 'error')}
        />
      )}
    </div>
  )
}

// ── Helpers visuais ──────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">{children}</div>
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="flex items-center gap-2 px-1 text-sm font-semibold uppercase tracking-wide text-gray-600">
      {icon} {title}
    </h3>
  )
}

function SubHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
      {icon} {title}
      {typeof count === 'number' && (
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">{count}</span>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-xs italic text-gray-500">{text}</p>
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function Row({
  label, value, strong, muted, tone,
}: { label: string; value: string; strong?: boolean; muted?: boolean; tone?: 'green' | 'amber' | 'blue' }) {
  const toneCls =
    tone === 'green' ? 'text-green-700'
    : tone === 'amber' ? 'text-amber-700'
    : tone === 'blue' ? 'text-blue-700'
    : ''
  return (
    <div className="flex justify-between">
      <dt className={muted ? 'text-gray-500' : 'text-gray-600'}>{label}</dt>
      <dd className={`${strong ? 'font-semibold' : ''} ${toneCls || 'text-gray-800'}`}>{value}</dd>
    </div>
  )
}

function VehicleItem({ v, pillCls, showPayoff }: { v: Phase2Vehicle; pillCls: string; showPayoff?: boolean }) {
  const plate = v.plate ?? v.vehicle?.plate
  const brand = v.brand ?? v.vehicle?.brand
  const model = v.model ?? v.vehicle?.model
  const year  = v.year  ?? v.vehicle?.year
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pillCls}`}>
            {ROLE_LABEL[v.role] ?? v.role}
          </span>
          <p className="font-medium text-gray-900">
            {[brand, model, year].filter(Boolean).join(' ') || plate || 'Veiculo'}
          </p>
        </div>
        {plate && <p className="mt-0.5 font-mono text-[11px] text-gray-500">{plate}</p>}
        {showPayoff && v.hasFinancing && v.payoffValue != null && (
          <p className="mt-0.5 text-[11px] text-amber-700">
            Quitacao: {formatBRL(toN(v.payoffValue))}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold text-gray-900">
        {formatBRL(toN(v.agreedValue))}
      </span>
    </li>
  )
}

// ── PaymentModal ─────────────────────────────────────────────────────────────

function PaymentModal({
  dealId, initial, onClose, onSaved, onError,
}: {
  dealId: string
  initial: Phase2Payment | null
  onClose: () => void
  onSaved: () => void
  onError: (m: string) => void
}) {
  const [type, setType]     = useState(initial?.type ?? 'PIX')
  const [valueStr, setValueStr] = useState(initial ? numberToBRLMask(toN(initial.value)) : '')
  const [bank, setBank]     = useState(initial?.bank ?? '')
  const [cardBrand, setCardBrand] = useState(initial?.cardBrand ?? '')
  const [installments, setInstallments] = useState<string>(
    initial?.installments != null ? String(initial.installments) : '',
  )
  const [firstDueDate, setFirstDueDate] = useState(initial?.firstDueDate?.slice(0, 10) ?? '')
  const [dueDate, setDueDate]   = useState(initial?.dueDate?.slice(0, 10) ?? '')
  const [notes, setNotes]   = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const isCard         = type === 'CARTAO_CREDITO' || type === 'CARTAO_DEBITO'
  const isBankRelated  = type === 'FINANCIAMENTO' || type === 'BOLETO' || type === 'TRANSFERENCIA' || type === 'DUPLICATA'
  const isInstallable  = type === 'CARTAO_CREDITO' || type === 'FINANCIAMENTO' || type === 'DUPLICATA'
  const isPix          = type === 'PIX'
  const isCash         = type === 'DINHEIRO'

  // Parcela calculada (apenas UI)
  const parcelaValor = (() => {
    const v = parseBRL(valueStr) ?? 0
    const n = Number(installments) || 0
    return n > 0 && v > 0 ? v / n : 0
  })()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseBRL(valueStr)
    if (!amount || amount <= 0) { onError('Informe um valor valido'); return }
    setSaving(true)
    try {
      const url = initial?.id
        ? `/api/negotiations/${dealId}/payments/${initial.id}`
        : `/api/negotiations/${dealId}/payments`
      const r = await fetch(url, {
        method:  initial?.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: type,
          amount,
          bank: bank || null,
          cardBrand: isCard ? cardBrand || null : null,
          installments: isInstallable && installments ? Number(installments) : null,
          firstDueDate: isInstallable && firstDueDate ? firstDueDate : null,
          dueDate: dueDate || null,
          notes: notes || null,
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        onError(j?.error ?? 'Erro ao salvar')
        return
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <Modal title={initial ? 'Editar pagamento' : 'Novo pagamento'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Forma de pagamento">
            <select value={type} onChange={e => setType(e.target.value)} className="input">
              {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Valor">
            <input
              value={valueStr}
              onChange={e => setValueStr(maskBRL(e.target.value))}
              placeholder="0,00"
              className="input"
            />
          </Field>
        </div>

        <Field label="Data prevista">
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
        </Field>

        {/* Conditional fields */}
        {isPix && (
          <Field label="Chave PIX / favorecido">
            <input value={bank} onChange={e => setBank(e.target.value)} className="input" placeholder="Chave Pix ou nome do favorecido" />
          </Field>
        )}

        {isCash && (
          <Field label="Responsavel pelo recebimento">
            <input value={bank} onChange={e => setBank(e.target.value)} className="input" placeholder="Nome de quem recebeu" />
          </Field>
        )}

        {isBankRelated && (
          <Field label={type === 'FINANCIAMENTO' ? 'Banco / Financeira' : type === 'BOLETO' ? 'Banco emissor' : type === 'DUPLICATA' ? 'Sacado / Banco' : 'Banco'}>
            <input value={bank} onChange={e => setBank(e.target.value)} className="input" />
          </Field>
        )}

        {isCard && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bandeira">
              <select value={cardBrand} onChange={e => setCardBrand(e.target.value)} className="input">
                <option value="">Selecione</option>
                {CARD_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Adquirente / banco">
              <input value={bank} onChange={e => setBank(e.target.value)} className="input" placeholder="Ex: Stone, Cielo" />
            </Field>
          </div>
        )}

        {isInstallable && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Parcelas">
              <input
                value={installments}
                onChange={e => setInstallments(e.target.value.replace(/\D/g, ''))}
                className="input"
                placeholder="Ex: 12"
              />
            </Field>
            <Field label="1o vencimento">
              <input type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} className="input" />
            </Field>
            {parcelaValor > 0 && (
              <div className="col-span-2 -mt-1 text-xs text-gray-500">
                Sera {installments}x de <strong>{formatBRL(parcelaValor)}</strong>
                {type === 'DUPLICATA' && <span> · sera gerada lista de {installments} parcelas</span>}
              </div>
            )}
          </div>
        )}

        <Field label="Observacoes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input" rows={2} />
        </Field>

        <ModalFooter onClose={onClose} loading={saving} />
      </form>
    </Modal>
  )
}

// ── DiscountModal ────────────────────────────────────────────────────────────

function DiscountModal({
  dealId, onClose, onSaved, onError,
}: { dealId: string; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [valueStr, setValueStr] = useState('')
  const [reason, setReason]     = useState('')
  const [saving, setSaving]     = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const requestedValue = parseBRL(valueStr)
    if (!requestedValue || requestedValue <= 0) { onError('Informe o valor solicitado'); return }
    if (reason.trim().length < 5) { onError('Motivo e obrigatorio'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/negotiations/${dealId}/discount-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedValue, reason: reason.trim() }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); onError(j?.error ?? 'Erro'); return }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Solicitar desconto" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Valor solicitado">
          <input value={valueStr} onChange={e => setValueStr(maskBRL(e.target.value))} className="input" placeholder="0,00" />
        </Field>
        <Field label="Motivo">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="input" />
        </Field>
        <ModalFooter onClose={onClose} loading={saving} confirmLabel="Solicitar" />
      </form>
    </Modal>
  )
}

function ApproveDiscountModal({
  request, onClose, onConfirm,
}: { request: Phase2DiscountRequest; onClose: () => void; onConfirm: (v: number, note: string) => void }) {
  const [valueStr, setValueStr] = useState(numberToBRLMask(toN(request.requestedValue)))
  const [note, setNote] = useState('')
  return (
    <Modal title="Aprovar desconto" onClose={onClose}>
      <div className="mb-3 text-sm text-gray-600">
        Valor solicitado: <strong>{formatBRL(toN(request.requestedValue))}</strong>
      </div>
      <Field label="Valor aprovado (pode ajustar)">
        <input value={valueStr} onChange={e => setValueStr(maskBRL(e.target.value))} className="input" />
      </Field>
      <Field label="Observacao (opcional)">
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="input" />
      </Field>
      <ModalFooter
        onClose={onClose}
        onConfirm={() => {
          const v = parseBRL(valueStr)
          if (!v || v <= 0) return
          onConfirm(v, note)
        }}
        confirmLabel="Aprovar"
      />
    </Modal>
  )
}

function RejectDiscountModal({
  request, onClose, onConfirm,
}: { request: Phase2DiscountRequest; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <Modal title="Recusar desconto" onClose={onClose}>
      <div className="mb-3 text-sm text-gray-600">
        Valor solicitado: <strong>{formatBRL(toN(request.requestedValue))}</strong>
      </div>
      <Field label="Motivo da recusa (obrigatorio)">
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="input" />
      </Field>
      <ModalFooter
        onClose={onClose}
        onConfirm={() => {
          if (!note.trim()) return
          onConfirm(note.trim())
        }}
        confirmLabel="Recusar"
        danger
      />
    </Modal>
  )
}

// ── TrocoModal ───────────────────────────────────────────────────────────────

function TrocoModal({
  dealId, excedente, onClose, onSaved, onError,
}: { dealId: string; excedente: number; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [beneficiary, setBeneficiary] = useState('')
  const [document, setDocument] = useState('')
  const [bank, setBank]       = useState('')
  const [agency, setAgency]   = useState('')
  const [account, setAccount] = useState('')
  const [pixKey, setPixKey]   = useState('')
  const [valueStr, setValueStr] = useState(numberToBRLMask(Math.max(excedente, 0)))
  const [reason, setReason]   = useState('')
  const [saving, setSaving]   = useState(false)

  function maskDoc(v: string) {
    const d = v.replace(/\D/g, '')
    return d.length <= 11 ? maskCPF(v) : maskCNPJ(v)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseBRL(valueStr)
    if (!value || value <= 0) { onError('Valor invalido'); return }
    if (!beneficiary.trim()) { onError('Favorecido obrigatorio'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/negotiations/${dealId}/changes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value, beneficiary: beneficiary.trim(),
          document: document || null, bank: bank || null,
          agency: agency || null, account: account || null,
          pixKey: pixKey || null, reason: reason || null,
        }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); onError(j?.error ?? 'Erro'); return }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Cadastrar troco" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Favorecido"><input value={beneficiary} onChange={e => setBeneficiary(e.target.value)} className="input" /></Field>
        <Field label="CPF/CNPJ"><input value={document} onChange={e => setDocument(maskDoc(e.target.value))} className="input" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Banco"><input value={bank} onChange={e => setBank(e.target.value)} className="input" /></Field>
          <Field label="Agencia"><input value={agency} onChange={e => setAgency(e.target.value)} className="input" /></Field>
          <Field label="Conta"><input value={account} onChange={e => setAccount(e.target.value)} className="input" /></Field>
        </div>
        <Field label="Chave PIX"><input value={pixKey} onChange={e => setPixKey(e.target.value)} className="input" /></Field>
        <Field label="Valor"><input value={valueStr} onChange={e => setValueStr(maskBRL(e.target.value))} className="input" /></Field>
        <Field label="Motivo"><input value={reason} onChange={e => setReason(e.target.value)} className="input" /></Field>
        <ModalFooter onClose={onClose} loading={saving} />
      </form>
    </Modal>
  )
}

// ── ReopenModal ──────────────────────────────────────────────────────────────

function ReopenModal({
  dealId, onClose, onSaved, onError,
}: { dealId: string; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 10) { onError('Motivo deve ter ao menos 10 caracteres'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/negotiations/${dealId}/reopen`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); onError(j?.error ?? 'Erro'); return }
      onSaved()
    } finally { setSaving(false) }
  }
  return (
    <Modal title="Reabrir negociacao" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-gray-600">
          Esta acao reabrira a negociacao para edicao. Informe o motivo (min. 10 caracteres).
        </p>
        <Field label="Motivo">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="input" />
        </Field>
        <ModalFooter onClose={onClose} loading={saving} confirmLabel="Reabrir" />
      </form>
    </Modal>
  )
}

// ── Modal helpers ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} rounded-xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
        <style jsx global>{`
          .input {
            display: block;
            width: 100%;
            border-radius: 0.375rem;
            border: 1px solid #d1d5db;
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            color: #111827;
          }
          .input:focus { outline: none; border-color: #166534; box-shadow: 0 0 0 1px #166534; }
        `}</style>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  )
}

function ModalFooter({
  onClose, loading, onConfirm, confirmLabel, danger,
}: { onClose: () => void; loading?: boolean; onConfirm?: () => void; confirmLabel?: string; danger?: boolean }) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" onClick={onClose} className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
        Cancelar
      </button>
      <button
        type={onConfirm ? 'button' : 'submit'}
        onClick={onConfirm}
        disabled={loading}
        className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
          danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
        }`}
      >
        {loading ? 'Salvando...' : (confirmLabel ?? 'Salvar')}
      </button>
    </div>
  )
}

// Suppress unused-import warning for AlertTriangle (kept for future banners)
export const _kept = AlertTriangle
