'use client'

// =============================================================================
// Baixa de um título (conta a pagar/receber): total ou parcial, com juros/multa
// e desconto. Valor da baixa menor que o saldo = parcial — o restante fica em
// aberto (com novo vencimento opcional) ou é quitado como desconto.
// POST /api/finance/center/entries/[id] { action: 'settle', ... } (regras em settlement-core).
// =============================================================================

import { useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoneyInput } from '@/components/ui/money-input'
import { planSettlement } from '@/lib/finance/settlement-core'
import { ErrorLine, Field, Modal, PAYMENT_METHODS, brl, dt, inputCls, postJson, todayYmd } from './ui'

export interface SettleTarget {
  id: string; description: string
  /** Saldo em aberto do título. */
  amount: number
  /** Valor original e já pago (título com baixas parciais). */
  original?: number | null; paid?: number | null
  dueDate?: string | null; counterparty?: string | null
  accountId: string | null; paymentMethod: string | null
  /** Comissão / custo de serviço do veículo: valor vem de outro módulo (sem juros/desconto nem parcial). */
  linked: boolean
  /** Motivo de não aceitar baixa parcial (null = aceita). */
  partialBlocked?: string | null
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function SettleModal({ type, target, accounts, onClose, onDone }: {
  type: 'RECEITA' | 'DESPESA'; target: SettleTarget; accounts: { id: string; name: string }[]
  onClose: () => void; onDone: (msg?: string) => void
}) {
  const isExpense = type === 'DESPESA'
  const saldo = r2(target.amount)
  const locked = !!target.linked || !!target.partialBlocked
  const today = todayYmd()
  const [paidDate, setPaidDate] = useState(today)
  const [accountId, setAccountId] = useState(target.accountId ?? '')
  const [method, setMethod] = useState(target.paymentMethod ?? '')
  const [principal, setPrincipal] = useState<number | null>(saldo)
  const [interest, setInterest] = useState<number | null>(null)
  const [discount, setDiscount] = useState<number | null>(null)
  const [remainder, setRemainder] = useState<'open' | 'discount'>('open')
  const [newDueDate, setNewDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const effPrincipal = locked ? saldo : principal
  const isPartialInput = effPrincipal != null && effPrincipal > 0 && saldo - effPrincipal > 0.005
  const plan = useMemo(() => planSettlement({
    remaining: saldo, principal: effPrincipal ?? 0, interest, discount,
    settleRemainderAsDiscount: isPartialInput && remainder === 'discount',
  }), [saldo, effPrincipal, interest, discount, isPartialInput, remainder])
  const partial = plan.ok && plan.kind === 'PARTIAL'
  const hasHistory = (target.paid ?? 0) > 0

  async function submit() {
    if (!paidDate) { setErr('Informe a data.'); return }
    if (paidDate > today) { setErr('A data da baixa não pode ser futura.'); return }
    if (!accountId) { setErr('Informe a conta.'); return }
    if (!plan.ok) { setErr(plan.error); return }
    if (partial && newDueDate && newDueDate < paidDate) { setErr('Novo vencimento anterior à data da baixa.'); return }
    setBusy(true); setErr('')
    try {
      const r = await postJson(`/api/finance/center/entries/${target.id}`, {
        action: 'settle', paidDate, accountId, paymentMethod: method || null,
        principalAmount: isPartialInput ? effPrincipal : null,
        interestAmount: target.linked ? 0 : interest ?? 0,
        discountAmount: target.linked ? 0 : discount ?? 0,
        settleRemainderAsDiscount: isPartialInput && remainder === 'discount',
        newDueDate: partial && newDueDate ? newDueDate : null,
        notes: notes.trim() || null,
      })
      if (!r.ok) { setErr(r.data.error ?? 'Não foi possível dar baixa.'); return }
      onDone()
    } catch {
      setErr('Erro de rede.')
    } finally {
      setBusy(false)
    }
  }

  const verb = isExpense ? 'Pagar' : 'Receber'
  return (
    <Modal title={verb} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary text-sm">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}{partial ? 'Baixar parcial' : 'Baixar'}
        </button>
      </>
    }>
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <p className="truncate text-sm font-medium text-gray-900">{target.description}</p>
          {(target.counterparty || target.dueDate) && (
            <p className="truncate text-[11px] text-gray-500">{[target.counterparty, target.dueDate ? `venc. ${dt(target.dueDate)}` : null].filter(Boolean).join(' · ')}</p>
          )}
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <Stat label="Valor original" value={brl(target.original ?? saldo)} />
            <Stat label="Já pago" value={brl(target.paid ?? 0)} tone={hasHistory ? 'text-emerald-700' : 'text-gray-500'} />
            <Stat label="Saldo em aberto" value={brl(saldo)} strong />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={isExpense ? 'Data do pagamento' : 'Data do recebimento'} required>
            <input type="date" className={inputCls} value={paidDate} max={today} onChange={(e) => setPaidDate(e.target.value)} />
          </Field>
          <Field label="Conta" required>
            <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Selecione</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Forma">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">—</option>
              {[...new Set([...(method ? [method] : []), ...PAYMENT_METHODS])].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Valor da baixa" required>
            {locked ? (
              <div className={cn(inputCls, 'flex items-center justify-between bg-gray-50 tabular-nums text-gray-700')} title={target.partialBlocked ?? 'Valor integral'}>
                {brl(saldo)}<Lock size={13} className="text-gray-400" />
              </div>
            ) : (
              <MoneyInput className={inputCls} value={principal} onChange={setPrincipal} />
            )}
          </Field>
          <Field label="Juros / multa"><MoneyInput className={inputCls} value={interest} onChange={setInterest} disabled={target.linked} /></Field>
          <Field label="Desconto"><MoneyInput className={inputCls} value={discount} onChange={setDiscount} disabled={target.linked} /></Field>
        </div>
        {locked && target.partialBlocked && <p className="text-[11px] text-gray-500">{target.partialBlocked}</p>}

        {isPartialInput && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm">
            <p className="text-xs font-medium text-amber-900">Restante: {brl(r2(saldo - (effPrincipal ?? 0)))}</p>
            <label className="flex items-center gap-2">
              <input type="radio" name="remainder" checked={remainder === 'open'} onChange={() => setRemainder('open')} />
              <span>Manter o restante em aberto</span>
            </label>
            {remainder === 'open' && (
              <div className="pl-6">
                <Field label="Novo vencimento do saldo" className="max-w-[12rem]">
                  <input type="date" className={inputCls} value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
                </Field>
              </div>
            )}
            <label className="flex items-center gap-2">
              <input type="radio" name="remainder" checked={remainder === 'discount'} onChange={() => setRemainder('discount')} />
              <span>Quitar o restante como desconto</span>
            </label>
          </div>
        )}

        <Field label="Observação"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>

        <div className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2.5 text-white">
          <span className="text-xs uppercase tracking-wide text-gray-300">{isExpense ? 'Total pago' : 'Total recebido'}</span>
          <span className="text-lg font-bold tabular-nums">{plan.ok ? brl(plan.paid) : '—'}</span>
        </div>
        {plan.ok && plan.kind === 'PARTIAL' && <p className="text-right text-xs text-gray-500">Saldo após a baixa: <b className="tabular-nums text-gray-800">{brl(plan.remainingAfter)}</b></p>}

        <ErrorLine>{err}</ErrorLine>
      </div>
    </Modal>
  )
}

function Stat({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('tabular-nums', strong ? 'text-sm font-bold text-gray-900' : 'font-semibold text-gray-700', tone)}>{value}</p>
    </div>
  )
}
