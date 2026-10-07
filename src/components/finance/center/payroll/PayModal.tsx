'use client'

// Pagamento da folha do colaborador: conta, data, o que pagar (salário/benefícios,
// comissões) e desconto dos adiantamentos. POST /api/finance/payroll/pay.

import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WithHint } from '@/components/ui/help-hint'
import { FieldLabel } from '@/components/ui/field'
import { Modal, Toggle, api, brl, dateBR, inputClass, todayYmd } from '../config/ui'
import type { PayrollEmployee, PayrollMonthData } from './types'

interface Props {
  employee: PayrollEmployee
  month: string
  accounts: PayrollMonthData['accounts']
  onClose: () => void
  onPaid: (text: string) => void
}

export default function PayModal({ employee, month, accounts, onClose, onPaid }: Props) {
  const pendingEntries = employee.entries.filter((e) => e.kind !== 'ADIANTAMENTO' && e.status === 'PREVISTO')
  const pendingComs = employee.commissions.filter((c) => !c.paid)
  const advances = employee.entries.filter((e) => e.kind === 'ADIANTAMENTO' && e.status === 'PAGO' && !e.discountedMonth)

  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0].id : '')
  const [paidDate, setPaidDate] = useState(todayYmd())
  const [entryIds, setEntryIds] = useState<Set<string>>(new Set(pendingEntries.map((e) => e.id)))
  const [comIds, setComIds] = useState<Set<string>>(new Set(pendingComs.map((c) => c.id)))
  const [discount, setDiscount] = useState(true)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); fn(n) }

  const preview = useMemo(() => {
    const sal = pendingEntries.filter((e) => entryIds.has(e.id))
    const salaryOnly = sal.filter((e) => e.kind === 'SALARIO').reduce((s, e) => s + e.amount, 0)
    const entriesTotal = sal.reduce((s, e) => s + e.amount, 0)
    const comTotal = pendingComs.filter((c) => comIds.has(c.id)).reduce((s, c) => s + c.value, 0)
    // Mesmo critério do servidor: adiantamentos inteiros, mais antigos primeiro, até o salário.
    let disc = 0
    if (discount) {
      for (const a of [...advances].sort((x, y) => (x.date ?? '').localeCompare(y.date ?? ''))) {
        if (disc + a.amount <= salaryOnly + 0.001) disc += a.amount
      }
    }
    return { entriesTotal, comTotal, disc, net: Math.max(0, entriesTotal + comTotal - disc) }
  }, [pendingEntries, pendingComs, advances, entryIds, comIds, discount])

  const submit = async () => {
    if (!accountId || !paidDate) { setError('Informe a conta e a data do pagamento.'); return }
    if (!entryIds.size && !comIds.size) { setError('Selecione o que pagar.'); return }
    setSaving(true); setError(null)
    const r = await api<{ result: { paidEntries: number; paidCommissions: number; discounted: number; total: number; held?: string[] } }>('/api/finance/payroll/pay', {
      method: 'POST',
      body: { month, userId: employee.userId, accountId, paidDate, entryIds: [...entryIds], commissionIds: [...comIds], discountAdvances: discount, note: note.trim() || null },
    })
    setSaving(false)
    if (!r.ok) { setError(r.error); return }
    const held = r.data?.result.held ?? []
    onPaid(`Pagamento de ${employee.name} registrado: ${brl(r.data?.result.total ?? 0)}.${held.length ? ` ${held.length} comissão(ões) aguardando recebimento.` : ''}`)
  }

  const Check = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={checked} onChange={onChange} />
  )

  return (
    <Modal
      title={`Pagar — ${employee.name}`}
      onClose={onClose}
      wide
      footer={<>
        <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
        <button onClick={submit} disabled={saving} className="btn-primary text-sm"><CheckCircle2 size={15} />{saving ? 'Pagando...' : `Pagar ${brl(preview.net)}`}</button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><FieldLabel required>Conta</FieldLabel>
            <select className={cn(inputClass, 'mt-1')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Selecione</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><FieldLabel required>Data do pagamento</FieldLabel><input type="date" className={cn(inputClass, 'mt-1')} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} /></div>
        </div>

        {pendingEntries.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Salário e benefícios</p>
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {pendingEntries.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <Check checked={entryIds.has(e.id)} onChange={() => toggle(entryIds, e.id, setEntryIds)} />
                  <span className="flex-1 truncate">{e.description}<span className="ml-2 text-xs text-gray-400">{dateBR(e.date)}</span></span>
                  <span className="tabular-nums">{brl(e.amount)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {pendingComs.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Comissões</p>
              <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setComIds(comIds.size === pendingComs.length ? new Set() : new Set(pendingComs.map((c) => c.id)))}>
                {comIds.size === pendingComs.length ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>
            <div className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
              {pendingComs.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <Check checked={comIds.has(c.id)} onChange={() => toggle(comIds, c.id, setComIds)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.description}</span>
                    <span className="text-xs text-gray-400">{c.label} · {c.status === 'PREVISTO' ? 'Prevista' : c.status === 'AJUSTADO' ? 'Ajustada' : 'Aprovada'}</span>
                  </span>
                  <span className="tabular-nums">{brl(c.value)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {advances.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2.5">
            <Toggle checked={discount} onChange={setDiscount} label={`Descontar adiantamentos no salário (${brl(advances.reduce((s, a) => s + a.amount, 0))})`} helpText="Vales e adiantamentos já pagos ao colaborador que ainda não foram abatidos. Na hora de pagar, saem do salário (os mais antigos primeiro)." />
          </div>
        )}

        <div><FieldLabel>Observação</FieldLabel><input className={cn(inputClass, 'mt-1')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></div>

        <div className="space-y-1 rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Salário e benefícios</span><span className="tabular-nums">{brl(preview.entriesTotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Comissões</span><span className="tabular-nums">{brl(preview.comTotal)}</span></div>
          {preview.disc > 0 && <div className="flex justify-between"><span className="text-gray-600">Adiantamentos descontados</span><span className="tabular-nums text-red-600">− {brl(preview.disc)}</span></div>}
          <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold"><WithHint text="Salário + benefícios + comissões do mês, menos os adiantamentos descontados.">Líquido a pagar</WithHint><span className="tabular-nums">{brl(preview.net)}</span></div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
