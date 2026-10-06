'use client'

// =============================================================================
// Baixa em lote: mesma data, conta e forma para os títulos selecionados (um só
// tipo); cada item com seu valor (menor que o saldo = parcial), juros e
// desconto, ou "quitar restante" como desconto. Gera um lote com comprovante.
// POST /api/finance/center/settlements/batch
// =============================================================================

import { useMemo, useState } from 'react'
import { CheckCircle2, FileText, Loader2, Lock, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoneyInput } from '@/components/ui/money-input'
import { planSettlement } from '@/lib/finance/settlement-core'
import { BatchReceipt } from './BatchReceipt'
import { ErrorLine, Field, Modal, PAYMENT_METHODS, brl, dt, inputCls, postJson, todayYmd } from './ui'

export interface BulkTarget {
  id: string; description: string; dueDate: string | null; counterparty: string | null
  /** Saldo em aberto. */
  amount: number
  original?: number | null
  linked: boolean; partialBlocked?: string | null
  accountId: string | null; paymentMethod: string | null
}
interface ItemState { principal: number | null; interest: number | null; discount: number | null; quitar: boolean }
interface BatchResult { batchId: string; done: number; failed: { entryId: string; error: string }[]; total: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const cellInput = 'w-full min-w-[7.5rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400'

/** Conta/forma em comum entre os itens (sugestão inicial). */
const common = (xs: (string | null)[]) => (xs.length && xs.every((x) => x && x === xs[0]) ? xs[0] ?? '' : '')

export function BulkSettleModal({ type, targets, accounts, onClose, onChanged }: {
  type: 'RECEITA' | 'DESPESA'; targets: BulkTarget[]; accounts: { id: string; name: string }[]
  onClose: () => void; onChanged: () => void
}) {
  const isExpense = type === 'DESPESA'
  const today = todayYmd()
  const [paidDate, setPaidDate] = useState(today)
  const [accountId, setAccountId] = useState(() => common(targets.map((t) => t.accountId)))
  const [method, setMethod] = useState(() => common(targets.map((t) => t.paymentMethod)))
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<Record<string, ItemState>>(() => Object.fromEntries(targets.map((t) => [t.id, { principal: r2(t.amount), interest: null, discount: null, quitar: false }])))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<BatchResult | null>(null)
  const [receipt, setReceipt] = useState(false)

  const set = (id: string, patch: Partial<ItemState>) => setItems((s) => ({ ...s, [id]: { ...s[id], ...patch } }))
  const locked = (t: BulkTarget) => t.linked || !!t.partialBlocked

  const plans = useMemo(() => targets.map((t) => {
    const it = items[t.id]
    const principal = locked(t) ? r2(t.amount) : it.principal ?? 0
    const isPartial = principal > 0 && r2(t.amount) - principal > 0.005
    return { t, it, isPartial, plan: planSettlement({ remaining: t.amount, principal, interest: t.linked ? 0 : it.interest, discount: t.linked ? 0 : it.discount, settleRemainderAsDiscount: isPartial && it.quitar }) }
  }), [targets, items])

  const sum = plans.reduce((s, p) => {
    s.saldo += p.t.amount
    if (p.plan.ok) { s.principal += p.plan.principal; s.interest += p.plan.interest; s.discount += p.plan.discount; s.paid += p.plan.paid }
    return s
  }, { saldo: 0, principal: 0, interest: 0, discount: 0, paid: 0 })
  const invalid = plans.filter((p) => !p.plan.ok)

  const fillBalances = () => setItems((s) => Object.fromEntries(targets.map((t) => [t.id, { ...s[t.id], principal: r2(t.amount), quitar: false }])))
  const clearAdj = () => setItems((s) => Object.fromEntries(targets.map((t) => [t.id, { ...s[t.id], interest: null, discount: null }])))

  async function submit() {
    if (!paidDate) { setErr('Informe a data.'); return }
    if (paidDate > today) { setErr('A data da baixa não pode ser futura.'); return }
    if (!accountId) { setErr('Informe a conta.'); return }
    if (invalid.length) { setErr(`${invalid[0].t.description}: ${(invalid[0].plan as { error: string }).error}`); return }
    setBusy(true); setErr('')
    try {
      const r = await postJson<BatchResult>('/api/finance/center/settlements/batch', {
        type, paidDate, accountId, paymentMethod: method || null, description: description.trim() || null,
        items: plans.map(({ t, it, isPartial }) => ({
          entryId: t.id,
          principal: isPartial && !locked(t) ? it.principal : null,
          interest: t.linked ? 0 : it.interest ?? 0,
          discount: t.linked ? 0 : it.discount ?? 0,
          settleRemainderAsDiscount: isPartial && it.quitar,
        })),
      })
      if (!r.ok) { setErr(r.data.error ?? 'Não foi possível baixar o lote.'); return }
      setResult(r.data)
      onChanged()
    } catch {
      setErr('Erro de rede.')
    } finally {
      setBusy(false)
    }
  }

  const verb = isExpense ? 'Pagar' : 'Receber'
  const byId = new Map(targets.map((t) => [t.id, t]))

  if (result) {
    return (
      <>
        <Modal title="Baixa em lote" onClose={onClose} footer={
          <>
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Fechar</button>
            {result.done > 0 && <button type="button" onClick={() => setReceipt(true)} className="btn-primary text-sm"><FileText size={15} />Comprovante do lote</button>}
          </>
        }>
          <div className="space-y-3 text-sm">
            <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2.5', result.done ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
              {result.done ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <span className="font-medium">{result.done} de {targets.length} baixado(s)</span>
            </div>
            {result.failed.length > 0 && (
              <div className="rounded-lg border border-red-200">
                <p className="border-b border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">Não baixados ({result.failed.length})</p>
                <ul className="divide-y divide-gray-100">
                  {result.failed.map((f) => (
                    <li key={f.entryId} className="px-3 py-1.5 text-xs">
                      <p className="truncate font-medium text-gray-900">{byId.get(f.entryId)?.description ?? f.entryId}</p>
                      <p className="text-red-600">{f.error}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
        {receipt && <BatchReceipt batchId={result.batchId} onClose={() => setReceipt(false)} />}
      </>
    )
  }

  return (
    <Modal wide="xl" title={`${verb} em lote · ${targets.length} título(s)`} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary text-sm">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Baixar lote · {brl(r2(sum.paid))}
        </button>
      </>
    }>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <Field label="Descrição do lote"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></Field>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={fillBalances} className="btn-secondary text-xs">Preencher saldos</button>
          <button type="button" onClick={clearAdj} className="btn-secondary text-xs">Zerar juros/desc.</button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                {['Título', 'Saldo', 'Valor da baixa', 'Juros', 'Desconto', 'Quitar restante', 'Total pago'].map((h, i) => (
                  <th key={h} className={cn('whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500', i === 1 || i === 6 ? 'text-right' : '', i === 5 && 'text-center')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.map(({ t, it, isPartial, plan }) => (
                <tr key={t.id} className={cn(!plan.ok && 'bg-red-50/50')}>
                  <td className="max-w-[260px] px-2 py-1.5">
                    <p className="truncate font-medium text-gray-900" title={t.description}>{t.description}</p>
                    <p className="truncate text-[11px] text-gray-500">{[t.dueDate ? `venc. ${dt(t.dueDate)}` : null, t.counterparty].filter(Boolean).join(' · ')}</p>
                    {!plan.ok && <p className="text-[11px] text-red-600">{plan.error}</p>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-gray-700">
                    {brl(t.amount)}
                    {t.original != null && t.original - t.amount > 0.005 && <span className="block text-[10px] text-gray-400">de {brl(t.original)}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {locked(t) ? (
                      <div className={cn(cellInput, 'flex items-center justify-between bg-gray-50 tabular-nums text-gray-600')} title={t.partialBlocked ?? 'Valor integral'}>{brl(t.amount)}<Lock size={11} className="text-gray-400" /></div>
                    ) : (
                      <MoneyInput className={cellInput} value={it.principal} onChange={(v) => set(t.id, { principal: v })} aria-label="Valor da baixa" />
                    )}
                  </td>
                  <td className="px-2 py-1.5"><MoneyInput className={cellInput} value={it.interest} onChange={(v) => set(t.id, { interest: v })} disabled={t.linked} aria-label="Juros" /></td>
                  <td className="px-2 py-1.5"><MoneyInput className={cellInput} value={it.discount} onChange={(v) => set(t.id, { discount: v })} disabled={t.linked} aria-label="Desconto" /></td>
                  <td className="px-2 py-1.5 text-center">
                    {isPartial ? <input type="checkbox" checked={it.quitar} onChange={(e) => set(t.id, { quitar: e.target.checked })} aria-label="Quitar restante como desconto" className="rounded border-gray-300" /> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <span className="font-semibold tabular-nums text-gray-900">{plan.ok ? brl(plan.paid) : '—'}</span>
                    {plan.ok && plan.kind === 'PARTIAL' && <span className="block text-[10px] text-amber-700">parcial · resta {brl(plan.remainingAfter)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 text-xs font-semibold text-gray-900">
              <tr>
                <td className="px-2 py-2 uppercase tracking-wide text-gray-500">Total ({targets.length})</td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{brl(r2(sum.saldo))}</td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums">{brl(r2(sum.principal))}</td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums">{brl(r2(sum.interest))}</td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums">{brl(r2(sum.discount))}</td>
                <td />
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{brl(r2(sum.paid))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <ErrorLine>{err}</ErrorLine>
      </div>
    </Modal>
  )
}
