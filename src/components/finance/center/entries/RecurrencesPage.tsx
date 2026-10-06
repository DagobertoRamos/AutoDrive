'use client'

// =============================================================================
// Financeiro › Despesas e receitas fixas (FinancialRecurrence): lista,
// cadastro/edição, pausar/retomar e encerrar. Consome /api/finance/recurrences.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pause, Pencil, Play, Plus, Repeat, Save, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint } from '@/components/ui/help-hint'
import { MoneyInput } from '@/components/ui/money-input'
import { CategorySelect } from './CategorySelect'
import { ErrorLine, Field, Modal, brl, dt, inputCls, postJson, todayYmd } from './ui'
import { useFinanceRefs, type FinanceRefs } from './useFinanceRefs'

type Kind = 'RECEITA' | 'DESPESA'
interface Rec {
  id: string; type: Kind; description: string; amount: number; dayOfMonth: number; startDate: string; endDate: string | null; active: boolean
  accountId: string | null; categoryId: string | null; costCenterId: string | null; supplierId: string | null; employeeUserId: string | null
  counterparty: string | null; notes: string | null
  category: { id: string; name: string; code: string | null } | null; account: { id: string; name: string } | null
  employee: { id: string; name: string } | null
  nextDueDate: string | null; generated: number
}

export function RecurrencesPage() {
  const { refs } = useFinanceRefs()
  const [rows, setRows] = useState<Rec[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState<'' | Kind>('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Rec | 'new' | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams(); if (type) qs.set('type', type)
    const j = await fetch(`/api/finance/recurrences?${qs}`, { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    setRows(j?.success ? j.data : [])
    if (!j?.success) setMsg(j?.error ?? 'Não foi possível carregar.')
    setLoading(false)
  }, [type])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const visible = rows.filter((r) => showInactive || r.active)
  const monthly = (k: Kind) => rows.filter((r) => r.active && r.type === k).reduce((s, r) => s + r.amount, 0)

  async function setActive(r: Rec, active: boolean) {
    if (!active && !confirm(`Pausar "${r.description}"? Os lançamentos futuros em aberto serão cancelados.`)) return
    const res = await postJson(`/api/finance/recurrences/${r.id}`, active ? { active: true, ...(r.endDate && r.endDate < todayYmd() ? { endDate: null } : {}) } : { active: false }, 'PATCH')
    setMsg(res.ok ? '' : res.data.error ?? 'Não foi possível alterar.')
    await load()
  }
  async function end(r: Rec) {
    if (!confirm(`Encerrar "${r.description}"? Os lançamentos futuros em aberto serão cancelados.`)) return
    const res = await fetch(`/api/finance/recurrences/${r.id}`, { method: 'DELETE', credentials: 'include' })
    setMsg(res.ok ? '' : 'Não foi possível encerrar.')
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-1.5 text-xl font-bold text-gray-900">Despesas e receitas fixas<HelpHint term="RECORRENCIA" size={15} /></h1>
        {refs.canManage && <button type="button" onClick={() => setEditing('new')} className="btn-primary text-sm"><Plus size={15} />Nova</button>}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-gray-500">Despesas fixas / mês</p><p className="text-base font-bold tabular-nums text-red-700">{brl(monthly('DESPESA'))}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5"><p className="text-[11px] uppercase tracking-wide text-gray-500">Receitas fixas / mês</p><p className="text-base font-bold tabular-nums text-emerald-700">{brl(monthly('RECEITA'))}</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select className={cn(inputCls, 'w-auto')} value={type} onChange={(e) => setType(e.target.value as '' | Kind)}>
          <option value="">Despesas e receitas</option><option value="DESPESA">Despesas</option><option value="RECEITA">Receitas</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded border-gray-300" />Mostrar pausadas e encerradas</label>
      </div>
      {msg && <ErrorLine>{msg}</ErrorLine>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Descrição', 'Categoria', 'Dia', 'Valor', 'Próxima', 'Situação', ''].map((h, i) => <th key={i} className={cn('whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Valor' && 'text-right')}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto animate-spin text-gray-300" /></td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="py-14 text-center"><Repeat size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma despesa ou receita fixa.</p></td></tr>
              ) : visible.map((r) => {
                const ended = !r.active && !!r.endDate && r.endDate <= todayYmd()
                return (
                  <tr key={r.id} className={cn('hover:bg-gray-50', !r.active && 'opacity-60')}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-900">{r.description}</p>
                      <p className="text-[11px] text-gray-500">
                        <span className={r.type === 'RECEITA' ? 'text-emerald-700' : 'text-red-600'}>{r.type === 'RECEITA' ? 'Receita' : 'Despesa'}</span>
                        {(r.employee?.name ?? r.counterparty) && <> · {r.employee?.name ?? r.counterparty}</>}
                        {r.account && <> · {r.account.name}</>}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{r.category ? `${r.category.code ? `${r.category.code} ` : ''}${r.category.name}` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700">{r.dayOfMonth}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-gray-900">{brl(r.amount)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-600">{dt(r.nextDueDate)}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', r.active ? 'bg-emerald-100 text-emerald-800' : ended ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-800')}>{r.active ? 'Ativa' : ended ? 'Encerrada' : 'Pausada'}</span>
                      {r.endDate && r.active && <span className="ml-1 text-[11px] text-gray-400">até {dt(r.endDate)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right">
                      {refs.canManage && (
                        <>
                          <button type="button" title="Editar" aria-label="Editar" onClick={() => setEditing(r)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil size={15} /></button>
                          {r.active
                            ? <button type="button" title="Pausar" aria-label="Pausar" onClick={() => void setActive(r, false)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600"><Pause size={15} /></button>
                            : <button type="button" title="Retomar" aria-label="Retomar" onClick={() => void setActive(r, true)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600"><Play size={15} /></button>}
                          {!ended && <button type="button" title="Encerrar" aria-label="Encerrar" onClick={() => void end(r)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Square size={15} /></button>}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <RecurrenceForm refs={refs} rec={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />}
    </div>
  )
}

function RecurrenceForm({ refs, rec, onClose, onSaved }: { refs: FinanceRefs; rec: Rec | null; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<Kind>(rec?.type ?? 'DESPESA')
  const [description, setDescription] = useState(rec?.description ?? '')
  const [amount, setAmount] = useState<number | null>(rec?.amount ?? null)
  const [day, setDay] = useState<number>(rec?.dayOfMonth ?? 10)
  const [startDate, setStartDate] = useState(rec?.startDate ?? todayYmd())
  const [endDate, setEndDate] = useState(rec?.endDate ?? '')
  const [accountId, setAccountId] = useState(rec?.accountId ?? '')
  const [categoryId, setCategoryId] = useState(rec?.categoryId ?? '')
  const [costCenterId, setCostCenterId] = useState(rec?.costCenterId ?? '')
  const [supplierId, setSupplierId] = useState(rec?.supplierId ?? '')
  const [counterparty, setCounterparty] = useState(rec?.counterparty ?? '')
  const [notes, setNotes] = useState(rec?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    const msg = description.trim().length < 2 ? 'Informe a descrição.' : !(amount && amount > 0) ? 'Informe o valor.'
      : !(day >= 1 && day <= 31) ? 'Dia do vencimento: 1 a 31.' : !startDate ? 'Informe o início.'
      : endDate && endDate < startDate ? 'A data final é anterior ao início.' : ''
    if (msg) { setErr(msg); return }
    setBusy(true); setErr('')
    const body = {
      type, description: description.trim(), amount, dayOfMonth: day, startDate, endDate: endDate || null,
      accountId: accountId || null, categoryId: categoryId || null, costCenterId: costCenterId || null,
      supplierId: supplierId || null, counterparty: counterparty.trim() || null, notes: notes.trim() || null,
    }
    const r = await postJson(rec ? `/api/finance/recurrences/${rec.id}` : '/api/finance/recurrences', body, rec ? 'PATCH' : 'POST').catch(() => null)
    setBusy(false)
    if (!r) { setErr('Erro de rede.'); return }
    if (!r.ok) { setErr(r.data.error ?? 'Não foi possível salvar.'); return }
    onSaved()
  }

  return (
    <Modal title={rec ? 'Editar fixa' : 'Nova despesa ou receita fixa'} onClose={onClose} wide footer={
      <>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
        <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Salvar</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="Tipo" required className="sm:col-span-2">
          <select className={inputCls} value={type} onChange={(e) => { setType(e.target.value as Kind); setCategoryId('') }}><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option></select>
        </Field>
        <Field label="Descrição" required className="sm:col-span-4"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={240} autoFocus /></Field>
        <Field label="Valor" required className="sm:col-span-2"><MoneyInput className={inputCls} value={amount} onChange={setAmount} /></Field>
        <Field label="Dia do vencimento" required className="sm:col-span-2"><input type="number" min={1} max={31} className={inputCls} value={day} onChange={(e) => setDay(Math.floor(Number(e.target.value) || 0))} /></Field>
        <Field label="Conta" className="sm:col-span-2">
          <select className={inputCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">—</option>{refs.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        <Field label="Início" required className="sm:col-span-3"><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Até" className="sm:col-span-3"><input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        <Field label="Categoria" className="sm:col-span-3"><CategorySelect className={inputCls} categories={refs.categories} kind={type} value={categoryId} onChange={setCategoryId} /></Field>
        <Field label="Centro de custo" className="sm:col-span-3">
          <select className={inputCls} value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}><option value="">—</option>{refs.costCenters.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} ` : ''}{c.name}</option>)}</select>
        </Field>
        <Field label="Fornecedor" className="sm:col-span-3">
          <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">—</option>{refs.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Field>
        <Field label={type === 'DESPESA' ? 'Favorecido' : 'Cliente / pagador'} className="sm:col-span-3"><input className={inputCls} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} maxLength={160} /></Field>
        <Field label="Observações" className="sm:col-span-6"><textarea rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
        <div className="sm:col-span-6"><ErrorLine>{err}</ErrorLine></div>
      </div>
    </Modal>
  )
}
