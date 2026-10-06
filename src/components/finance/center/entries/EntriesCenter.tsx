'use client'

// =============================================================================
// Contas a pagar / a receber (Centro Financeiro). Lista de DESPESAS ou RECEITAS
// (sem transferências) com abas, filtros, totais, ações por linha e em lote.
//   ?novo=1 abre o formulário; ?id=<lançamento> abre o painel do lançamento.
// Consome /api/finance/center/entries (+ /refs, /bulk, /[id]) e /api/finance/entries/[id].
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRightLeft, Ban, CheckCircle2, Copy, Eye, Loader2, Paperclip, Pencil, Plus, Repeat, RefreshCw, Trash2, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EntryDrawer } from '@/components/finance/EntryDrawer'
import { DealPeekLink } from '@/components/deals/DealPeek'
import { CategorySelect } from './CategorySelect'
import { EntryForm, type EntryFormValues } from './EntryForm'
import { SettleModal, type SettleTarget } from './SettleModal'
import { TransferModal } from './TransferModal'
import { ErrorLine, Field, Modal, brl, dt, inputCls, postJson } from './ui'
import { useFinanceRefs } from './useFinanceRefs'

type Kind = 'RECEITA' | 'DESPESA'
type Tab = 'aberto' | 'vencidos' | 'pagos' | 'cancelados' | 'todos'

interface Row {
  id: string; type: Kind; status: string; overdue: boolean; description: string; amount: number
  dueDate: string | null; paidDate: string | null; competenceDate: string | null
  account: { id: string; name: string } | null; category: { id: string; name: string; code: string | null } | null
  costCenter: { id: string; name: string } | null
  counterparty: string | null; supplierId: string | null; documentNumber: string | null; paymentMethod: string | null; notes: string | null
  source: string | null; deletable: boolean; linked: boolean
  installmentNumber: number | null; installmentTotal: number | null; recurrenceId: string | null
  vehicle: { id: string; plate: string | null; title: string } | null; attachments: number
  deal?: { id: string; dealNumber: string | null; customer: string | null } | null
}
type Summary = Record<Tab, { count: number; amount: number }>

const ymd = (s: string | null) => (s ? s.slice(0, 10) : '')

export function EntriesCenter({ kind }: { kind: Kind }) {
  const isExpense = kind === 'DESPESA'
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams()
  const { refs } = useFinanceRefs()

  const [tab, setTab] = useState<Tab>('aberto')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [accountId, setAccountId] = useState(''); const [categoryId, setCategoryId] = useState(''); const [costCenterId, setCostCenterId] = useState('')
  const [party, setParty] = useState(''); const [plate, setPlate] = useState(''); const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState({ party: '', plate: '', q: '' })
  useEffect(() => { const t = setTimeout(() => setDebounced({ party, plate, q }), 350); return () => clearTimeout(t) }, [party, plate, q])

  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')

  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [form, setForm] = useState<{ initial?: Partial<EntryFormValues>; editId?: string } | null>(null)
  const [settle, setSettle] = useState<SettleTarget[] | null>(null)
  const [transfer, setTransfer] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Row[] | null>(null)

  // ?novo=1 e ?id= (links do painel)
  useEffect(() => {
    const novo = sp.get('novo'); const id = sp.get('id')
    if (!novo && !id) return
    const t = setTimeout(() => {
      if (novo) setForm({})
      if (id) setDrawerId(id)
      router.replace(pathname, { scroll: false })
    }, 0)
    return () => clearTimeout(t)
  }, [sp, router, pathname])

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ type: kind, tab })
    if (from) qs.set('from', from); if (to) qs.set('to', to)
    if (accountId) qs.set('accountId', accountId); if (categoryId) qs.set('categoryId', categoryId); if (costCenterId) qs.set('costCenterId', costCenterId)
    if (debounced.party) qs.set('party', debounced.party); if (debounced.plate) qs.set('plate', debounced.plate); if (debounced.q) qs.set('q', debounced.q)
    const j = await fetch(`/api/finance/center/entries?${qs}`, { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) { setRows(j.data); setSummary(j.summary); setCanManage(!!j.canManage) } else { setRows([]); setMsg(j?.error ?? 'Não foi possível carregar.') }
    setSelected(new Set())
    setLoading(false)
  }, [kind, tab, from, to, accountId, categoryId, costCenterId, debounced])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const listed = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows])
  const selRows = rows.filter((r) => selected.has(r.id))
  const selTotal = selRows.reduce((s, r) => s + r.amount, 0)
  const openSel = selRows.filter((r) => r.status === 'PREVISTO')
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const toTarget = (r: Row): SettleTarget => ({ id: r.id, description: r.description, amount: r.amount, accountId: r.account?.id ?? null, paymentMethod: r.paymentMethod, linked: r.linked })
  const valuesOf = (r: Row): Partial<EntryFormValues> => ({
    type: r.type, description: r.description.replace(/\s\(\d+\/\d+\)$/, ''), amount: r.amount, dueDate: ymd(r.dueDate), competenceDate: ymd(r.competenceDate),
    accountId: r.account?.id ?? '', categoryId: r.category?.id ?? '', costCenterId: r.costCenter?.id ?? '', supplierId: r.supplierId ?? '',
    counterparty: r.counterparty ?? '', documentNumber: r.documentNumber ?? '', paymentMethod: r.paymentMethod ?? '', notes: r.notes ?? '',
    dealId: r.deal?.id ?? '',
  })

  async function remove(list: Row[]) {
    const del = list.filter((r) => r.deletable)
    if (!del.length) { setMsg('Lançamentos integrados não podem ser excluídos: cancele.'); return }
    if (!confirm(del.length === 1 ? `Excluir "${del[0].description}"?` : `Excluir ${del.length} lançamentos?`)) return
    const r = await postJson<{ done?: number; failed?: unknown[] }>('/api/finance/center/entries/bulk', { action: 'delete', ids: del.map((x) => x.id) })
    setMsg(r.ok ? '' : r.data.error ?? 'Não foi possível excluir.')
    await load()
  }

  const tabs: Array<[Tab, string]> = [['aberto', 'Em aberto'], ['vencidos', 'Vencidos'], ['pagos', isExpense ? 'Pagos' : 'Recebidos'], ['cancelados', 'Cancelados'], ['todos', 'Todos']]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">{isExpense ? 'Contas a pagar' : 'Contas a receber'}</h1>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTransfer(true)} className="btn-secondary text-sm"><ArrowRightLeft size={15} />Transferir</button>
            <button type="button" onClick={() => setForm({})} className="btn-primary text-sm"><Plus size={15} />Novo</button>
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {l}
            {summary && k !== 'todos' && k !== 'cancelados' && <span className={cn('ml-1.5 rounded-full px-1.5 text-[11px]', k === 'vencidos' && summary.vencidos.count ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600')}>{summary[k].count}</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
        <input type="date" className={cn(inputCls, 'min-w-[10rem]')} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Vencimento de" title="Vencimento de" />
        <input type="date" className={cn(inputCls, 'min-w-[10rem]')} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Vencimento até" title="Vencimento até" />
        <select className={cn(inputCls, 'truncate')} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Conta">
          <option value="">Todas as contas</option>
          {refs.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <CategorySelect className={inputCls} categories={refs.categories} kind={kind} value={categoryId} onChange={setCategoryId} emptyLabel="Todas as categorias" />
        <select className={cn(inputCls, 'truncate')} value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} aria-label="Centro de custo">
          <option value="">Todos os centros</option>
          {refs.costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={inputCls} value={party} onChange={(e) => setParty(e.target.value)} placeholder={isExpense ? 'Fornecedor' : 'Cliente'} />
        <input className={inputCls} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="Placa" maxLength={8} />
        <div className="flex gap-2">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" />
          <button type="button" onClick={() => void load()} className="rounded-lg border border-gray-300 px-2 text-gray-500 hover:bg-gray-50" aria-label="Atualizar"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
        </div>
      </div>

      {msg && <ErrorLine>{msg}</ErrorLine>}

      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium text-brand-800">{selected.size} selecionado(s) · {brl(selTotal)}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {openSel.length > 0 && <button type="button" onClick={() => setSettle(openSel.map(toTarget))} className="btn-primary text-xs"><CheckCircle2 size={14} />{isExpense ? 'Pagar' : 'Receber'} ({openSel.length})</button>}
            {openSel.length > 0 && <button type="button" onClick={() => setCancelTarget(openSel)} className="btn-secondary text-xs"><Ban size={14} />Cancelar</button>}
            <button type="button" onClick={() => void remove(selRows)} className="btn-secondary text-xs text-red-600"><Trash2 size={14} />Excluir</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {canManage && <th className="w-8 px-3 py-3"><input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Selecionar todos" className="rounded border-gray-300" /></th>}
                {['Vencimento', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Status', ''].map((h, i) => (
                  <th key={i} className={cn('whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Valor' && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={8} className="px-3 py-3"><div className="h-4 animate-pulse rounded bg-gray-100" /></td></tr>)
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center"><Wallet size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum lançamento.</p></td></tr>
              ) : rows.map((r) => {
                const settled = r.status === 'PAGO' || r.status === 'RECEBIDO'
                return (
                  <tr key={r.id} className={cn('hover:bg-gray-50', selected.has(r.id) && 'bg-brand-50/40')}>
                    {canManage && <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Selecionar" className="rounded border-gray-300" /></td>}
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-600">
                      <span className={cn(r.overdue && 'font-semibold text-red-600')}>{dt(r.dueDate)}</span>
                      {settled && r.paidDate && <span className="block text-[11px] text-gray-400">{isExpense ? 'pago' : 'receb.'} {dt(r.paidDate)}</span>}
                    </td>
                    <td className="max-w-[320px] cursor-pointer px-3 py-2.5" onClick={() => setDrawerId(r.id)}>
                      <p className="truncate font-medium text-gray-900">{r.description}</p>
                      <p className="flex flex-wrap items-center gap-x-2 truncate text-[11px] text-gray-500">
                        {(r.counterparty || r.deal?.customer) && <span>{r.counterparty || r.deal?.customer}</span>}
                        {r.deal && <DealPeekLink dealId={r.deal.id} className="font-medium text-brand-700 hover:underline">{r.deal.dealNumber ?? 'Negociação'}</DealPeekLink>}
                        {r.vehicle?.plate && <span className="font-mono">{r.vehicle.plate}</span>}
                        {r.documentNumber && <span>doc. {r.documentNumber}</span>}
                        {r.recurrenceId && <Repeat size={11} className="text-gray-400" aria-label="Fixa" />}
                        {r.attachments > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip size={11} />{r.attachments}</span>}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{r.category ? `${r.category.code ? `${r.category.code} ` : ''}${r.category.name}` : '—'}{r.costCenter && <span className="block text-[11px] text-gray-400">{r.costCenter.name}</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{r.account?.name ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-gray-900">{brl(r.amount)}</td>
                    <td className="px-3 py-2.5"><StatusBadge row={r} /></td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right">
                      <IconBtn title="Ver" onClick={() => setDrawerId(r.id)}><Eye size={15} /></IconBtn>
                      {canManage && r.status === 'PREVISTO' && <IconBtn title={isExpense ? 'Pagar' : 'Receber'} tone="green" onClick={() => setSettle([toTarget(r)])}><CheckCircle2 size={15} /></IconBtn>}
                      {canManage && !r.linked && r.status !== 'CANCELADO' && <IconBtn title="Editar" onClick={() => setForm({ initial: valuesOf(r), editId: r.id })}><Pencil size={15} /></IconBtn>}
                      {canManage && <IconBtn title="Duplicar" onClick={() => setForm({ initial: valuesOf(r) })}><Copy size={15} /></IconBtn>}
                      {canManage && r.status === 'PREVISTO' && <IconBtn title="Cancelar" onClick={() => setCancelTarget([r])}><Ban size={15} /></IconBtn>}
                      {canManage && r.deletable && <IconBtn title="Excluir" tone="red" onClick={() => void remove([r])}><Trash2 size={15} /></IconBtn>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="bg-gray-50 text-sm">
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Total ({rows.length})</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-gray-900">{brl(listed)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Kpi label="Em aberto" value={brl(summary.aberto.amount)} />
          <Kpi label="Vencidos" value={brl(summary.vencidos.amount)} tone={summary.vencidos.amount > 0 ? 'text-red-600' : undefined} />
          <Kpi label={isExpense ? 'Pagos' : 'Recebidos'} value={brl(summary.pagos.amount)} tone="text-emerald-700" />
        </div>
      )}

      {drawerId && <EntryDrawer entryId={drawerId} onClose={() => setDrawerId(null)} onChanged={() => void load()} />}
      {form && (
        <EntryForm type={kind} refs={refs} initial={form.initial} editId={form.editId}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); void load() }} />
      )}
      {settle && <SettleModal type={kind} targets={settle} accounts={refs.accounts} onClose={() => setSettle(null)} onDone={(m) => { setSettle(null); setMsg(m ?? ''); void load() }} />}
      {transfer && <TransferModal accounts={refs.accounts} onClose={() => setTransfer(false)} onDone={() => { setTransfer(false); void load() }} />}
      {cancelTarget && <CancelModal rows={cancelTarget} onClose={() => setCancelTarget(null)} onDone={(m) => { setCancelTarget(null); setMsg(m ?? ''); void load() }} />}
    </div>
  )
}

function StatusBadge({ row }: { row: Row }) {
  const [label, cls] = row.overdue ? ['Vencido', 'bg-red-100 text-red-700']
    : row.status === 'PREVISTO' ? ['Em aberto', 'bg-amber-100 text-amber-800']
    : row.status === 'CANCELADO' ? ['Cancelado', 'bg-gray-100 text-gray-500']
    : [row.status === 'PAGO' ? 'Pago' : 'Recebido', 'bg-emerald-100 text-emerald-800']
  return <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{label}</span>
}

function IconBtn({ title, onClick, tone, children }: { title: string; onClick: () => void; tone?: 'green' | 'red'; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className={cn('inline-flex rounded-lg p-1.5 text-gray-400', tone === 'green' ? 'hover:bg-green-50 hover:text-green-600' : tone === 'red' ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-gray-100 hover:text-gray-700')}>
      {children}
    </button>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('text-base font-bold tabular-nums text-gray-900', tone)}>{value}</p>
    </div>
  )
}

function CancelModal({ rows, onClose, onDone }: { rows: Row[]; onClose: () => void; onDone: (msg?: string) => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function submit() {
    if (reason.trim().length < 3) { setErr('Informe o motivo.'); return }
    setBusy(true); setErr('')
    const r = await postJson<{ done?: number; failed?: Array<{ description: string; error: string }> }>('/api/finance/center/entries/bulk', { action: 'cancel', ids: rows.map((x) => x.id), reason: reason.trim() }).catch(() => null)
    setBusy(false)
    if (!r) { setErr('Erro de rede.'); return }
    if (!r.ok) { setErr(r.data.error ?? 'Não foi possível cancelar.'); return }
    const failed = r.data.failed ?? []
    onDone(failed.length ? `${failed.length} não cancelado(s): ${failed.slice(0, 3).map((f) => `${f.description} (${f.error})`).join('; ')}` : undefined)
  }
  return (
    <Modal title={rows.length === 1 ? 'Cancelar lançamento' : `Cancelar ${rows.length} lançamentos`} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Voltar</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}Cancelar lançamento</button>
      </>
    }>
      <div className="space-y-3">
        {rows.length === 1 && <p className="truncate text-sm text-gray-700">{rows[0].description} · {brl(rows[0].amount)}</p>}
        <Field label="Motivo" required><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus /></Field>
        <ErrorLine>{err}</ErrorLine>
      </div>
    </Modal>
  )
}
