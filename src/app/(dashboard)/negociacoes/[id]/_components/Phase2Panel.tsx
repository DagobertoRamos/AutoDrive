'use client'

// =============================================================================
// Phase2Panel — Gestão de pagamentos, descontos, troco, saldo e reabertura
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Trash2, Edit2, Check, X, AlertTriangle, RotateCcw, Lock, DollarSign, Percent, Wallet,
} from 'lucide-react'
import { formatBRL, maskBRL, parseBRL, numberToBRLMask, maskCPF, maskCNPJ } from '@/lib/masks'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Phase2Payment {
  id?:           string
  type:          string
  value:         number | string
  bank?:         string | null
  cardBrand?:    string | null
  installments?: number | null
  firstDueDate?: string | null
  dueDate?:      string | null
  notes?:        string | null
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

interface Props {
  dealId:         string
  isLocked:       boolean
  canEdit:        boolean
  canApprove:     boolean
  canReopen:      boolean
  canForce:       boolean
  vehicleValue:   number
  debtsTotal:     number
  servicesTotal:  number
  payments:       Phase2Payment[]
  discounts:      Phase2DiscountRequest[]
  changes:        Phase2Change[]
  onReload:       () => void
  onToast?:       (msg: string, kind?: 'success' | 'error') => void
}

const PAYMENT_METHODS = [
  ['DINHEIRO', 'Dinheiro'],
  ['PIX', 'PIX'],
  ['CARTAO_DEBITO', 'Cartão de Débito'],
  ['CARTAO_CREDITO', 'Cartão de Crédito'],
  ['FINANCIAMENTO', 'Financiamento'],
  ['BOLETO', 'Boleto'],
  ['TRANSFERENCIA', 'Transferência'],
  ['SINAL', 'Sinal'],
  ['DUPLICATA', 'Duplicata'],
  ['OUTROS', 'Outros'],
] as const

const CARD_BRANDS = ['VISA', 'MASTER', 'ELO', 'AMEX', 'HIPERCARD', 'OUTROS']

const STATUS_PILL: Record<string, string> = {
  PENDENTE:  'bg-amber-100 text-amber-700',
  APROVADO:  'bg-green-100 text-green-700',
  RECUSADO:  'bg-red-100 text-red-700',
  CANCELADO: 'bg-gray-100 text-gray-600',
}

function toN(v: any): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Phase2Panel(props: Props) {
  const {
    dealId, isLocked, canEdit, canApprove, canReopen, canForce,
    vehicleValue, debtsTotal, servicesTotal,
    payments, discounts, changes, onReload, onToast,
  } = props

  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [editingPayment, setEditingPayment]     = useState<Phase2Payment | null>(null)
  const [discountModalOpen, setDiscountModalOpen] = useState(false)
  const [approveModal, setApproveModal] = useState<Phase2DiscountRequest | null>(null)
  const [rejectModal, setRejectModal]   = useState<Phase2DiscountRequest | null>(null)
  const [trocoModalOpen, setTrocoModalOpen] = useState(false)
  const [reopenModalOpen, setReopenModalOpen] = useState(false)

  // ── Saldo ───────────────────────────────────────────────────────────────────
  const balance = useMemo(() => {
    const totalBruto = vehicleValue + debtsTotal + servicesTotal
    const discountApproved = discounts
      .filter(d => d.status === 'APROVADO')
      .reduce((s, d) => s + toN(d.approvedValue ?? d.requestedValue), 0)
    const totalLiquido = totalBruto - discountApproved
    const totalPago    = payments.reduce((s, p) => s + toN(p.value), 0)
    const totalTroco   = changes.reduce((s, c) => s + toN(c.value), 0)
    const saldo        = totalLiquido - totalPago
    return { totalBruto, totalLiquido, totalPago, saldo, totalTroco, discountApproved }
  }, [vehicleValue, debtsTotal, servicesTotal, discounts, payments, changes])

  const saldoStatus: 'aberto' | 'excedente' | 'zerado' =
    balance.saldo > 0.009 ? 'aberto'
    : balance.saldo < -0.009 ? 'excedente'
    : 'zerado'

  // ── Handlers API ────────────────────────────────────────────────────────────

  async function deletePayment(id: string) {
    if (!confirm('Remover este pagamento?')) return
    const r = await fetch(`/api/negotiations/${dealId}/payments/${id}`, { method: 'DELETE' })
    if (!r.ok) { onToast?.('Erro ao remover', 'error'); return }
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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Lock banner */}
      {isLocked && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-amber-800">
            <Lock size={16} />
            <span className="text-sm font-medium">Venda finalizada — bloqueada para edição</span>
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

      {/* Pagamentos */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Wallet size={15} /> Pagamentos
          </h3>
          {canEdit && !isLocked && (
            <button
              onClick={() => { setEditingPayment(null); setPaymentModalOpen(true) }}
              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              <Plus size={12} /> Adicionar pagamento
            </button>
          )}
        </div>
        {payments.length === 0 ? (
          <p className="text-sm italic text-gray-400">Nenhum pagamento cadastrado.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {payments.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-800">{p.type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500">
                    {formatBRL(toN(p.value))}
                    {p.bank ? ` — ${p.bank}` : ''}
                    {p.installments ? ` — ${p.installments}x` : ''}
                  </p>
                </div>
                {canEdit && !isLocked && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingPayment(p); setPaymentModalOpen(true) }}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title="Editar"
                    ><Edit2 size={14} /></button>
                    <button
                      onClick={() => p.id && deletePayment(p.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-700"
                      title="Remover"
                    ><Trash2 size={14} /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Descontos */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Percent size={15} /> Descontos
          </h3>
          {canEdit && !isLocked && (
            <button
              onClick={() => setDiscountModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              <Plus size={12} /> Solicitar desconto
            </button>
          )}
        </div>
        {discounts.length === 0 ? (
          <p className="text-sm italic text-gray-400">Nenhuma solicitação.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {discounts.map(d => (
              <li key={d.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[d.status]}`}>
                      {d.status}
                    </span>
                    <span className="text-gray-700">
                      Solicitado: {formatBRL(toN(d.requestedValue))}
                      {d.status === 'APROVADO' && d.approvedValue != null && (
                        <> · Aprovado: <strong>{formatBRL(toN(d.approvedValue))}</strong></>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Motivo: {d.reason}</p>
                  {d.decisionNote && <p className="text-xs text-gray-500">Decisão: {d.decisionNote}</p>}
                </div>
                {d.status === 'PENDENTE' && canApprove && !isLocked && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setApproveModal(d)}
                      className="rounded p-1 text-green-600 hover:bg-green-50"
                      title="Aprovar"
                    ><Check size={16} /></button>
                    <button
                      onClick={() => setRejectModal(d)}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      title="Recusar"
                    ><X size={16} /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Resumo Financeiro */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <DollarSign size={15} /> Resumo Financeiro
        </h3>
        <dl className="space-y-1 text-sm">
          <Row label="Total Bruto"           value={formatBRL(balance.totalBruto)} />
          <Row label="Descontos aprovados"   value={formatBRL(-balance.discountApproved)} muted />
          <Row label="Total Líquido"         value={formatBRL(balance.totalLiquido)} strong />
          <Row label="Total Pago"            value={formatBRL(balance.totalPago)} />
          <Row label="Saldo"                 value={formatBRL(balance.saldo)} strong />
          {balance.totalTroco > 0 && <Row label="Troco cadastrado" value={formatBRL(balance.totalTroco)} muted />}
        </dl>
        <div className={`mt-4 flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm ${
          saldoStatus === 'zerado' ? 'bg-green-50 text-green-800'
          : saldoStatus === 'aberto' ? 'bg-amber-50 text-amber-800'
          : 'bg-blue-50 text-blue-800'
        }`}>
          <span className="font-medium">
            {saldoStatus === 'zerado' && 'Saldo zerado — pronto para finalizar'}
            {saldoStatus === 'aberto' && `Existem ${formatBRL(balance.saldo)} em aberto`}
            {saldoStatus === 'excedente' && `Valor excedente de ${formatBRL(-balance.saldo)}`}
          </span>
          {!isLocked && canEdit && saldoStatus === 'aberto' && (
            <button
              onClick={() => { setEditingPayment(null); setPaymentModalOpen(true) }}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >Adicionar pagamento</button>
          )}
          {!isLocked && canEdit && saldoStatus === 'excedente' && balance.totalTroco + 0.009 < -balance.saldo && (
            <button
              onClick={() => setTrocoModalOpen(true)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >Cadastrar troco</button>
          )}
        </div>
        {changes.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
            <p className="font-semibold uppercase tracking-wide">Trocos:</p>
            {changes.map(c => (
              <p key={c.id}>
                {formatBRL(toN(c.value))} → {c.beneficiary}{c.bank ? ` (${c.bank})` : ''}
              </p>
            ))}
          </div>
        )}
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
          onSaved={() => { setDiscountModalOpen(false); onReload(); onToast?.('Solicitação enviada', 'success') }}
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
          excedente={-balance.saldo - balance.totalTroco}
          onClose={() => setTrocoModalOpen(false)}
          onSaved={() => { setTrocoModalOpen(false); onReload(); onToast?.('Troco cadastrado', 'success') }}
          onError={(m) => onToast?.(m, 'error')}
        />
      )}
      {reopenModalOpen && (
        <ReopenModal
          dealId={dealId}
          onClose={() => setReopenModalOpen(false)}
          onSaved={() => { setReopenModalOpen(false); onReload(); onToast?.('Negociação reaberta', 'success') }}
          onError={(m) => onToast?.(m, 'error')}
        />
      )}
    </div>
  )
}

// ── Row ─────────────────────────────────────────────────────────────────────

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={muted ? 'text-gray-500' : 'text-gray-600'}>{label}</dt>
      <dd className={`${strong ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>{value}</dd>
    </div>
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
  const [installments, setInstallments] = useState(initial?.installments ?? '')
  const [firstDueDate, setFirstDueDate] = useState(initial?.firstDueDate?.slice(0, 10) ?? '')
  const [dueDate, setDueDate]   = useState(initial?.dueDate?.slice(0, 10) ?? '')
  const [notes, setNotes]   = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const isCard = type === 'CARTAO_CREDITO' || type === 'CARTAO_DEBITO'
  const isBankRelated = type === 'FINANCIAMENTO' || type === 'BOLETO' || type === 'TRANSFERENCIA'
  const isInstallable = type === 'CARTAO_CREDITO' || type === 'FINANCIAMENTO' || type === 'DUPLICATA'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseBRL(valueStr)
    if (!amount || amount <= 0) { onError('Informe um valor válido'); return }
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
    <Modal title={initial ? 'Editar pagamento' : 'Novo pagamento'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
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
        <Field label="Data prevista">
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
        </Field>
        {isBankRelated && (
          <Field label="Banco / Financiadora">
            <input value={bank} onChange={e => setBank(e.target.value)} className="input" />
          </Field>
        )}
        {isCard && (
          <Field label="Bandeira">
            <select value={cardBrand} onChange={e => setCardBrand(e.target.value)} className="input">
              <option value="">Selecione</option>
              {CARD_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
        )}
        {isInstallable && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Parcelas">
              <input
                value={installments as any}
                onChange={e => setInstallments(e.target.value.replace(/\D/g, ''))}
                className="input"
              />
            </Field>
            <Field label="1º vencimento">
              <input type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} className="input" />
            </Field>
          </div>
        )}
        <Field label="Observações">
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
    if (reason.trim().length < 5) { onError('Motivo é obrigatório'); return }
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
      <Field label="Observação (opcional)">
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
      <Field label="Motivo da recusa (obrigatório)">
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
    if (!value || value <= 0) { onError('Valor inválido'); return }
    if (!beneficiary.trim()) { onError('Favorecido obrigatório'); return }
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
          <Field label="Agência"><input value={agency} onChange={e => setAgency(e.target.value)} className="input" /></Field>
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
    <Modal title="Reabrir negociação" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-gray-600">
          Esta ação reabrirá a negociação para edição. Informe o motivo (mín. 10 caracteres).
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
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
