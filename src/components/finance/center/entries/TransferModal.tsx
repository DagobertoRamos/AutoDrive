'use client'

// Transferência entre contas da loja (saída + entrada, fora da DRE).

import { useState } from 'react'
import { ArrowRightLeft, Loader2 } from 'lucide-react'
import { MoneyInput } from '@/components/ui/money-input'
import { WithHint } from '@/components/ui/help-hint'
import { ErrorLine, Field, Modal, inputCls, postJson, todayYmd } from './ui'
import type { RefAccount } from './useFinanceRefs'

export function TransferModal({ accounts, onClose, onDone }: { accounts: RefAccount[]; onClose: () => void; onDone: () => void }) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(todayYmd())
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    const msg = !fromId || !toId ? 'Informe as contas.' : fromId === toId ? 'Escolha contas diferentes.' : !(amount && amount > 0) ? 'Informe o valor.' : !date ? 'Informe a data.' : ''
    if (msg) { setErr(msg); return }
    setBusy(true); setErr('')
    const r = await postJson('/api/finance/transfers', { fromAccountId: fromId, toAccountId: toId, amount, date, description: description.trim() || null }).catch(() => null)
    setBusy(false)
    if (!r) { setErr('Erro de rede.'); return }
    if (!r.ok) { setErr(r.data.error ?? 'Não foi possível transferir.'); return }
    onDone()
  }

  return (
    <Modal title={<WithHint term="TRANSFERENCIA">Transferência entre contas</WithHint>} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}Transferir</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="De" required>
          <select className={inputCls} value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Para" required>
          <select className={inputCls} value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">—</option>
            {accounts.filter((a) => a.id !== fromId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Valor" required><MoneyInput className={inputCls} value={amount} onChange={setAmount} /></Field>
        <Field label="Data" required><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Descrição" className="sm:col-span-2"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></Field>
        <div className="sm:col-span-2"><ErrorLine>{err}</ErrorLine></div>
      </div>
    </Modal>
  )
}
