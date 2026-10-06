'use client'

// Baixa de conta a pagar/receber — individual (valor, juros/multa, desconto)
// ou em lote (mesma data/conta/forma, pelo valor de cada lançamento).

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { MoneyInput } from '@/components/ui/money-input'
import { ErrorLine, Field, Modal, PAYMENT_METHODS, brl, inputCls, postJson, todayYmd } from './ui'
import type { RefAccount } from './useFinanceRefs'

export interface SettleTarget { id: string; description: string; amount: number; accountId: string | null; paymentMethod: string | null; linked: boolean }

export function SettleModal({ type, targets, accounts, onClose, onDone }: {
  type: 'RECEITA' | 'DESPESA'; targets: SettleTarget[]; accounts: RefAccount[]; onClose: () => void; onDone: (msg?: string) => void
}) {
  const single = targets.length === 1 ? targets[0] : null
  const [paidDate, setPaidDate] = useState(todayYmd())
  const [accountId, setAccountId] = useState(single?.accountId ?? '')
  const [method, setMethod] = useState(single?.paymentMethod ?? '')
  const [interest, setInterest] = useState<number | null>(null)
  const [discount, setDiscount] = useState<number | null>(null)
  const [paidOverride, setPaidOverride] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const isExpense = type === 'DESPESA'
  const total = targets.reduce((s, t) => s + t.amount, 0)
  const computed = single ? Math.round((single.amount + (interest ?? 0) - (discount ?? 0)) * 100) / 100 : total
  const paid = paidOverride ?? computed

  async function submit() {
    if (!paidDate) { setErr('Informe a data.'); return }
    if (single && !single.linked && !(paid > 0)) { setErr('Informe o valor pago.'); return }
    setBusy(true); setErr('')
    try {
      if (single) {
        const r = await postJson(`/api/finance/center/entries/${single.id}`, {
          action: 'settle', paidDate, accountId: accountId || null, paymentMethod: method || null,
          ...(single.linked ? {} : { paidAmount: paid, interestAmount: interest ?? 0, discountAmount: discount ?? 0 }),
        })
        if (!r.ok) { setErr(r.data.error ?? 'Não foi possível dar baixa.'); return }
        onDone()
      } else {
        const r = await postJson<{ done?: number; failed?: Array<{ description: string; error: string }> }>('/api/finance/center/entries/bulk', {
          action: 'settle', ids: targets.map((t) => t.id), paidDate, accountId: accountId || null, paymentMethod: method || null,
        })
        if (!r.ok) { setErr(r.data.error ?? 'Não foi possível dar baixa.'); return }
        const failed = r.data.failed ?? []
        onDone(failed.length ? `${r.data.done ?? 0} baixados. ${failed.length} com erro: ${failed.slice(0, 3).map((f) => `${f.description} (${f.error})`).join('; ')}` : undefined)
      }
    } catch {
      setErr('Erro de rede.')
    } finally {
      setBusy(false)
    }
  }

  const title = single ? (isExpense ? 'Pagar' : 'Receber') : `${isExpense ? 'Pagar' : 'Receber'} ${targets.length} lançamentos`
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Confirmar baixa</button>
      </>
    }>
      <div className="space-y-3">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          {single ? <p className="truncate font-medium text-gray-900">{single.description}</p> : <p className="text-gray-700">{targets.length} lançamentos selecionados</p>}
          <p className="tabular-nums text-gray-600">{brl(total)}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={isExpense ? 'Data do pagamento' : 'Data do recebimento'} required>
            <input type="date" className={inputCls} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </Field>
          <Field label="Conta">
            <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Forma de pagamento">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">—</option>
              {[...new Set([...(method ? [method] : []), ...PAYMENT_METHODS])].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          {single && !single.linked && (
            <>
              <Field label="Juros / multa"><MoneyInput className={inputCls} value={interest} onChange={(x) => { setInterest(x); setPaidOverride(null) }} /></Field>
              <Field label="Desconto"><MoneyInput className={inputCls} value={discount} onChange={(x) => { setDiscount(x); setPaidOverride(null) }} /></Field>
              <Field label={isExpense ? 'Valor pago' : 'Valor recebido'} required><MoneyInput className={inputCls} value={paid} onChange={setPaidOverride} /></Field>
            </>
          )}
        </div>
        <ErrorLine>{err}</ErrorLine>
      </div>
    </Modal>
  )
}
