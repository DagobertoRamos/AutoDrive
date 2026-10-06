'use client'

// =============================================================================
// Lançamento completo (Centro Financeiro): único, parcelado (N x mensal) ou fixo
// mensal (vira FinancialRecurrence). Opcional: já pago/recebido e anexos
// (enviados depois de salvar, na 1ª parcela). Edição usa PATCH.
//   POST  /api/finance/center/entries        (único/parcelado)
//   POST  /api/finance/recurrences           (repetir mensalmente)
//   PATCH /api/finance/center/entries/[id]   (editar)
//   GET   /api/finance/center/deals-search    (vincular negociação → cliente/pagador e veículo)
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { Handshake, Loader2, Paperclip, Save, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoneyInput } from '@/components/ui/money-input'
import { CategorySelect } from './CategorySelect'
import { ATTACH_ACCEPT, uploadEntryAttachment } from './AttachmentsPanel'
import { ErrorLine, Field, Modal, PAYMENT_METHODS, brl, inputCls, postJson, todayYmd } from './ui'
import type { FinanceRefs } from './useFinanceRefs'

export type EntryType = 'RECEITA' | 'DESPESA'

export interface EntryFormValues {
  type: EntryType
  description: string
  amount: number | null
  dueDate: string
  competenceDate: string
  accountId: string
  categoryId: string
  costCenterId: string
  supplierId: string
  counterparty: string
  documentNumber: string
  paymentMethod: string
  notes: string
  /** Negociação vinculada (opcional). */
  dealId: string
  /** Veículo (carro da negociação escolhida). */
  vehicleId?: string
}

type Mode = 'unica' | 'parcelada' | 'mensal'

export const emptyEntryValues = (type: EntryType): EntryFormValues => ({
  type, description: '', amount: null, dueDate: todayYmd(), competenceDate: '', accountId: '', categoryId: '', costCenterId: '',
  supplierId: '', counterparty: '', documentNumber: '', paymentMethod: '', notes: '', dealId: '',
})

export function EntryForm({ type, refs, initial, editId, onClose, onSaved }: {
  type: EntryType
  refs: FinanceRefs
  initial?: Partial<EntryFormValues>
  /** Com id: edição (sem parcelamento/recorrência). */
  editId?: string
  onClose: () => void
  onSaved: (firstEntryId?: string) => void
}) {
  const [v, setV] = useState<EntryFormValues>({ ...emptyEntryValues(type), ...initial })
  const [mode, setMode] = useState<Mode>('unica')
  const [count, setCount] = useState(2)
  const [until, setUntil] = useState('')
  const [paid, setPaid] = useState(false)
  const [paidDate, setPaidDate] = useState(todayYmd())
  const [paidAccount, setPaidAccount] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const set = <K extends keyof EntryFormValues>(k: K, val: EntryFormValues[K]) => setV((s) => ({ ...s, [k]: val }))
  // Cliente/pagador vem da negociação; só não sobrescreve o que foi digitado à mão.
  const autoParty = useRef<string | null>(null)
  const pickDeal = (d: DealOption | null) => {
    const manual = !!v.counterparty.trim() && v.counterparty !== autoParty.current
    const name = d?.customer ?? ''
    if (!manual) autoParty.current = name
    setV((s) => ({ ...s, dealId: d?.id ?? '', vehicleId: d?.vehicleId ?? undefined, counterparty: manual ? s.counterparty : name }))
  }
  const isExpense = v.type === 'DESPESA'
  const editing = !!editId
  const perInstallment = useMemo(() => (mode === 'parcelada' && v.amount && count > 1 ? Math.floor((v.amount * 100) / count) / 100 : null), [mode, v.amount, count])

  async function save() {
    const msg = v.description.trim().length < 2 ? 'Informe a descrição.'
      : !(v.amount && v.amount > 0) ? 'Informe o valor.'
      : !v.dueDate ? 'Informe o vencimento.'
      : mode === 'parcelada' && !(count >= 2 && count <= 120) ? 'Parcelas: de 2 a 120.'
      : mode === 'mensal' && until && until < v.dueDate ? 'A data final é anterior ao vencimento.'
      : paid && !paidDate ? 'Informe a data do pagamento.'
      : ''
    if (msg) { setErr(msg); return }
    setBusy(true); setErr('')
    const common = {
      description: v.description.trim(), accountId: v.accountId || null, categoryId: v.categoryId || null,
      costCenterId: v.costCenterId || null, supplierId: v.supplierId || null, counterparty: v.counterparty.trim() || null,
      notes: v.notes.trim() || null,
      ...(v.vehicleId ? { vehicleId: v.vehicleId } : {}),
    }
    const dealRef = editing ? { dealId: v.dealId || null } : v.dealId ? { dealId: v.dealId } : {}
    try {
      if (editing) {
        const r = await postJson(`/api/finance/center/entries/${editId}`, {
          ...common, ...dealRef, amount: v.amount, dueDate: v.dueDate, competenceDate: v.competenceDate || null,
          documentNumber: v.documentNumber.trim() || null, paymentMethod: v.paymentMethod || null,
        }, 'PATCH')
        if (!r.ok) { setErr(r.data.error ?? 'Não foi possível salvar.'); return }
        onSaved(editId)
        return
      }
      if (mode === 'mensal') {
        const r = await postJson('/api/finance/recurrences', {
          ...common, type: v.type, amount: v.amount, dayOfMonth: Number(v.dueDate.slice(8, 10)), startDate: v.dueDate, endDate: until || null,
        })
        if (!r.ok) { setErr(r.data.error ?? 'Não foi possível salvar.'); return }
        onSaved()
        return
      }
      const r = await postJson<{ data?: Array<{ id: string }> }>('/api/finance/center/entries', {
        ...common, ...dealRef, type: v.type, amount: v.amount, dueDate: v.dueDate, competenceDate: v.competenceDate || null,
        documentNumber: v.documentNumber.trim() || null, paymentMethod: v.paymentMethod || null,
        installments: mode === 'parcelada' ? count : 1,
        paid: paid ? { paidDate, accountId: paidAccount || v.accountId || null } : null,
      })
      if (!r.ok) { setErr(r.data.error ?? 'Não foi possível salvar.'); return }
      const firstId = r.data.data?.[0]?.id
      if (firstId && files.length) {
        for (const f of files) {
          const e = await uploadEntryAttachment(firstId, f)
          if (e) { setErr(`Lançamento salvo, mas o anexo falhou: ${e}`); onSaved(firstId); return }
        }
      }
      onSaved(firstId)
    } catch {
      setErr('Erro de rede.')
    } finally {
      setBusy(false)
    }
  }

  const title = editing ? 'Editar lançamento' : isExpense ? 'Nova conta a pagar' : 'Nova conta a receber'

  return (
    <Modal title={title} onClose={onClose} wide footer={
      <>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
        <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Salvar</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-6">
        {!editing && (
          <Field label="Tipo" required className="sm:col-span-2">
            <select className={inputCls} value={v.type} onChange={(e) => { set('type', e.target.value as EntryType); set('categoryId', '') }}>
              <option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option>
            </select>
          </Field>
        )}
        <Field label="Descrição" required className={editing ? 'sm:col-span-6' : 'sm:col-span-4'}>
          <input className={inputCls} value={v.description} onChange={(e) => set('description', e.target.value)} maxLength={240} autoFocus />
        </Field>

        <Field label={mode === 'parcelada' ? 'Valor total' : 'Valor'} required className="sm:col-span-2">
          <MoneyInput className={inputCls} value={v.amount} onChange={(x) => set('amount', x)} />
        </Field>
        <Field label={mode === 'parcelada' ? '1º vencimento' : mode === 'mensal' ? 'Primeiro vencimento' : 'Vencimento'} required className="sm:col-span-2">
          <input type="date" className={inputCls} value={v.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field label="Competência" className="sm:col-span-2">
          <input type="date" className={inputCls} value={v.competenceDate} placeholder={v.dueDate} onChange={(e) => set('competenceDate', e.target.value)} disabled={mode === 'mensal'} />
        </Field>

        <Field label="Categoria" className="sm:col-span-3">
          <CategorySelect className={inputCls} categories={refs.categories} kind={v.type} value={v.categoryId} onChange={(id) => set('categoryId', id)} />
        </Field>
        <Field label="Centro de custo" className="sm:col-span-3">
          <select className={inputCls} value={v.costCenterId} onChange={(e) => set('costCenterId', e.target.value)}>
            <option value="">—</option>
            {refs.costCenters.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} ` : ''}{c.name}</option>)}
          </select>
        </Field>

        <Field label="Conta" className="sm:col-span-2">
          <select className={inputCls} value={v.accountId} onChange={(e) => set('accountId', e.target.value)}>
            <option value="">—</option>
            {refs.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Fornecedor" className="sm:col-span-2">
          <select className={inputCls} value={v.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
            <option value="">—</option>
            {refs.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        {mode !== 'mensal' && (
          <Field label="Negociação" className="sm:col-span-6">
            <DealPicker value={v.dealId} onPick={pickDeal} />
          </Field>
        )}
        <Field label={isExpense ? 'Favorecido' : 'Cliente / pagador'} className="sm:col-span-2">
          <input className={inputCls} value={v.counterparty} onChange={(e) => set('counterparty', e.target.value)} maxLength={160} />
        </Field>

        <Field label="Nº do documento / NF" className="sm:col-span-3">
          <input className={inputCls} value={v.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} maxLength={80} disabled={mode === 'mensal'} />
        </Field>
        <Field label="Forma de pagamento" className="sm:col-span-3">
          <select className={inputCls} value={v.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} disabled={mode === 'mensal'}>
            <option value="">—</option>
            {[...new Set([...(v.paymentMethod ? [v.paymentMethod] : []), ...PAYMENT_METHODS])].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>

        <Field label="Observações" className="sm:col-span-6">
          <textarea rows={2} className={inputCls} value={v.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} />
        </Field>

        {!editing && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:col-span-6">
            <div className="flex flex-wrap gap-1.5">
              {([['unica', 'Única'], ['parcelada', 'Parcelada'], ['mensal', 'Repetir todo mês']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => { setMode(k); if (k === 'mensal') setPaid(false) }}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium', mode === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')}>{l}</button>
              ))}
            </div>
            {mode === 'parcelada' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Parcelas" required>
                  <input type="number" min={2} max={120} className={inputCls} value={count} onChange={(e) => setCount(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
                </Field>
                <div className="flex items-end pb-2 text-sm text-gray-600 sm:col-span-2">{perInstallment != null ? `${count}x de ${brl(perInstallment)}` : ''}</div>
              </div>
            )}
            {mode === 'mensal' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Até">
                  <input type="date" className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)} />
                </Field>
                <div className="flex items-end pb-2 text-sm text-gray-600 sm:col-span-2">{v.dueDate ? `Todo dia ${Number(v.dueDate.slice(8, 10))}` : ''}</div>
              </div>
            )}
            {mode !== 'mensal' && (
              <div className="mt-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="rounded border-gray-300" />
                  {isExpense ? 'Já pago' : 'Já recebido'}{mode === 'parcelada' ? ' (1ª parcela)' : ''}
                </label>
                {paid && (
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <Field label={isExpense ? 'Data do pagamento' : 'Data do recebimento'} required>
                      <input type="date" className={inputCls} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
                    </Field>
                    <Field label="Conta">
                      <select className={inputCls} value={paidAccount || v.accountId} onChange={(e) => setPaidAccount(e.target.value)}>
                        <option value="">—</option>
                        {refs.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!editing && mode !== 'mensal' && (
          <div className="sm:col-span-6">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:border-brand-400 hover:text-brand-700"><Paperclip size={13} />Anexar arquivo</button>
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  {f.name}
                  <button type="button" onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600" aria-label="Remover"><X size={12} /></button>
                </span>
              ))}
            </div>
            <input ref={fileInput} type="file" multiple accept={ATTACH_ACCEPT} className="hidden" onChange={(e) => { setFiles((xs) => [...xs, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
          </div>
        )}

        <div className="sm:col-span-6"><ErrorLine>{err}</ErrorLine></div>
      </div>
    </Modal>
  )
}

// ── Negociação vinculada ──────────────────────────────────────────────────────

interface DealOption {
  id: string; dealNumber: string | null; type: string; status: string
  customer: string | null; document: string | null; plate: string | null; vehicleId: string | null; vehicleTitle: string | null
}

const dealLabel = (d: DealOption) => [d.dealNumber ?? 'Negociação', d.customer, d.plate].filter(Boolean).join(' · ')

function DealPicker({ value, onPick }: { value: string; onPick: (d: DealOption | null) => void }) {
  const [selected, setSelected] = useState<DealOption | null>(null)
  const [q, setQ] = useState('')
  const [list, setList] = useState<DealOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // Edição/duplicação: mostra a negociação já vinculada.
  useEffect(() => {
    if (!value || selected?.id === value) return
    const ctrl = new AbortController()
    fetch(`/api/finance/center/deals-search?id=${encodeURIComponent(value)}`, { credentials: 'include', signal: ctrl.signal })
      .then((r) => r.json()).then((j) => { if (j?.data?.[0]) setSelected(j.data[0]) }).catch(() => undefined)
    return () => ctrl.abort()
  }, [value, selected?.id])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/finance/center/deals-search?q=${encodeURIComponent(term)}`, { credentials: 'include', signal: ctrl.signal })
        .then((r) => r.json()).then((j) => { setList(j?.data ?? []); setOpen(true) }).catch(() => undefined)
        .finally(() => setLoading(false))
    }, 300)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  if (value && selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
        <Handshake size={14} className="shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate text-gray-900">{dealLabel(selected)}</span>
        <button type="button" onClick={() => { setSelected(null); setQ(''); setList([]); onPick(null) }} className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700" aria-label="Remover vínculo"><X size={14} /></button>
      </div>
    )
  }

  const term = q.trim()
  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input className={cn(inputCls, 'pl-8')} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Número, cliente ou placa" />
      {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
      {open && term.length >= 2 && !loading && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {list.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">Nenhuma negociação.</li>}
          {list.map((d) => (
            <li key={d.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setSelected(d); setOpen(false); setQ(''); onPick(d) }}
                className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-gray-50">
                <span className="text-sm font-medium text-gray-900">{d.dealNumber ?? 'Negociação'}{d.customer ? ` · ${d.customer}` : ''}</span>
                <span className="text-[11px] text-gray-500">{[d.plate, d.vehicleTitle].filter(Boolean).join(' ') || '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
