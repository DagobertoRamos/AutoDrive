'use client'

// =============================================================================
// Painel do lançamento — abre ao clicar num lançamento (Financeiro › Lançamentos
// e extrato do veículo). Mostra a origem (negociação, débito, pagamento,
// veículo), permite detalhar o CUSTO REAL em itens (licenciamento, placa, laudo
// ECV, honorário…) e dar a baixa com data, conta, forma e fornecedor.
// Para débito cobrado do cliente: cobrado × custo real × comissões de documento
// = lucro líquido. Consome /api/finance/entries/[id]/settle.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Ban, Car, CheckCircle2, FileText, Handshake, Loader2, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoneyInput } from '@/components/ui/money-input'
import { RequiredMark } from '@/components/ui/field'
import { COST_ITEM_KINDS, COST_ITEM_LABEL, chargeResult, itemsTotal } from '@/lib/finance/entry-settlement-core'

interface Detail {
  entry: {
    id: string; type: 'RECEITA' | 'DESPESA'; status: string; description: string; amount: number; chargedAmount: number | null
    dueDate: string | null; paidDate: string | null; accountId: string | null; account: string | null; category: string | null
    counterparty: string | null; supplierId: string | null; supplier: string | null; documentNumber: string | null
    paymentMethod: string | null; notes: string | null; sourceLabel: string; commissionLinked: boolean; serviceLinked: boolean
  }
  items: Array<{ id: string; kind: string; description: string; amount: number }>
  deal: { id: string; dealNumber: string | null; status: string; customer: string | null; seller: string | null; vehicles: Array<{ role: string; plate: string | null; model: string | null; vehicleId: string | null }> } | null
  debt: { typeLabel: string; responsavelLabel: string | null; vehicleRole: string | null; chargedToCustomer: boolean; isDocumentation: boolean; value: number } | null
  payment: { type: string; method: string | null; bank: string | null; installments: number | null; status: string | null; authorizationCode: string | null } | null
  vehicle: { id: string; plate: string | null; title: string } | null
  commissions: Array<{ id: string; description: string; amount: number; status: string }>
  result: { charged: number; cost: number; gross: number; commissions: number; net: number; margin: number | null; costIsEstimate: boolean } | null
  suggestedKinds: string[]
  canManage: boolean
}
interface ItemRow { key: string; kind: string; description: string; amount: number | null }
interface Ref { id: string; name: string; kind?: string | null }

const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const today = () => new Date().toLocaleDateString('sv-SE')
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50'
const METHODS = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Débito em conta', 'Outro']
const STATUS: Record<string, [string, string]> = {
  PREVISTO: ['Previsto', 'bg-amber-100 text-amber-800'], PAGO: ['Pago', 'bg-emerald-100 text-emerald-800'],
  RECEBIDO: ['Recebido', 'bg-emerald-100 text-emerald-800'], CANCELADO: ['Cancelado', 'bg-gray-100 text-gray-500'],
}
const COMMISSION_STATUS: Record<string, string> = { PREVISTO: 'prevista', APROVADO: 'aprovada', PAGO: 'paga', AJUSTADO: 'ajustada', CANCELADO: 'cancelada' }
let seq = 0
const newKey = () => `i${++seq}`

export function EntryDrawer({ entryId, onClose, onChanged }: { entryId: string; onClose: () => void; onChanged?: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Ref[]>([])
  const [suppliers, setSuppliers] = useState<Ref[]>([])
  // formulário
  const [items, setItems] = useState<ItemRow[]>([])
  const [amount, setAmount] = useState<number | null>(null)
  const [paidDate, setPaidDate] = useState(today())
  const [accountId, setAccountId] = useState('')
  const [method, setMethod] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [docNumber, setDocNumber] = useState('')
  const [notes, setNotes] = useState('')

  const fill = useCallback((x: Detail) => {
    setD(x)
    setItems(x.items.map((i) => ({ key: newKey(), kind: i.kind, description: i.description, amount: i.amount })))
    setAmount(x.entry.amount)
    setPaidDate(x.entry.paidDate ? x.entry.paidDate.slice(0, 10) : today())
    setAccountId(x.entry.accountId ?? '')
    setMethod(x.entry.paymentMethod ?? '')
    setSupplierId(x.entry.supplierId ?? '')
    setDocNumber(x.entry.documentNumber ?? '')
    setNotes(x.entry.notes ?? '')
  }, [])

  const load = useCallback(async () => {
    setErr('')
    const j = await fetch(`/api/finance/entries/${entryId}/settle`, { cache: 'no-store', credentials: 'include' }).then((r) => r.json()).catch(() => null)
    if (j?.success) fill(j.data); else setErr(j?.error ?? 'Não foi possível abrir o lançamento.')
  }, [entryId, fill])

  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])
  useEffect(() => {
    void Promise.all([
      fetch('/api/finance/accounts?active=true', { credentials: 'include' }).then((r) => r.json()).catch(() => null),
      fetch('/api/suppliers?ativos=1', { credentials: 'include' }).then((r) => r.json()).catch(() => null),
    ]).then(([a, s]) => { setAccounts(a?.data ?? []); setSuppliers(s?.data ?? []) })
  }, [])

  const e = d?.entry
  const editableCost = !!e && e.type === 'DESPESA' && !e.commissionLinked && !e.serviceLinked
  const readOnly = !d?.canManage || e?.status === 'CANCELADO'
  const validItems = items.filter((i) => (i.amount ?? 0) > 0)
  const realCost = validItems.length ? itemsTotal(validItems.map((i) => ({ amount: i.amount ?? 0 }))) : (amount ?? 0)
  const live = useMemo(() => (d?.result ? chargeResult({ charged: d.result.charged, cost: realCost, commissions: d.commissions }) : null), [d, realCost])
  const settled = e?.status === 'PAGO' || e?.status === 'RECEBIDO'
  const sortedSuppliers = useMemo(() => [...suppliers].sort((a, b) => Number(b.kind === 'DESPACHANTE') - Number(a.kind === 'DESPACHANTE') || a.name.localeCompare(b.name)), [suppliers])

  const addItem = (kind = 'OUTRO') => setItems((xs) => [...xs, { key: newKey(), kind, description: '', amount: null }])
  const setItem = (key: string, patch: Partial<ItemRow>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  async function submit(settle: boolean) {
    if (!e) return
    if (settle && !(realCost > 0)) { setErr('Informe o valor antes de dar a baixa.'); return }
    if (settle && !paidDate) { setErr('Informe a data da baixa.'); return }
    setBusy(settle ? 'settle' : 'save'); setErr('')
    const body: Record<string, unknown> = {
      settle, paidDate: settle ? paidDate : undefined,
      accountId: accountId || null, paymentMethod: method || null, supplierId: supplierId || null,
      documentNumber: docNumber || null, notes: notes || null,
    }
    if (editableCost) {
      body.items = validItems.map((i) => ({ kind: i.kind, description: i.description || null, amount: i.amount }))
      if (!validItems.length && amount && amount !== e.amount) body.amount = amount
    } else if (e.type === 'RECEITA' && amount && amount !== e.amount) {
      body.amount = amount
    }
    const r = await fetch(`/api/finance/entries/${e.id}/settle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setErr(j?.error ?? 'Não foi possível salvar.'); return }
    fill(j.data ? { ...j.data, canManage: d!.canManage } : d!)
    onChanged?.()
  }

  async function setStatus(status: 'PREVISTO' | 'CANCELADO', ask: string) {
    if (!e || !confirm(ask)) return
    setBusy(status); setErr('')
    const r = status === 'CANCELADO'
      ? await fetch(`/api/finance/entries/${e.id}`, { method: 'DELETE', credentials: 'include' })
      : await fetch(`/api/finance/entries/${e.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status, paidDate: null }) })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setErr(j?.error ?? 'Não foi possível concluir.'); return }
    await load(); onChanged?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-2xl flex-col bg-gray-50 shadow-2xl" onClick={(ev) => ev.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="border-b border-gray-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {e && (
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold', e.type === 'RECEITA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>{e.type === 'RECEITA' ? 'Receita' : 'Despesa'}</span>
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS[e.status]?.[1])}>{STATUS[e.status]?.[0] ?? e.status}</span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{e.sourceLabel}</span>
                  {e.category && <span className="text-gray-500">{e.category}</span>}
                </div>
              )}
              <h2 className="truncate text-lg font-bold text-gray-900">{e?.description ?? 'Lançamento'}</h2>
              {e && (
                <p className="mt-0.5 text-sm text-gray-600">
                  <span className="text-xl font-bold tabular-nums text-gray-900">{brl(e.amount)}</span>
                  {e.chargedAmount != null && e.chargedAmount !== e.amount && <span className="ml-2 text-xs text-gray-500">previsto/cobrado {brl(e.chargedAmount)}</span>}
                  <span className="ml-3 text-xs text-gray-500">venc. {dt(e.dueDate)}{settled && e.paidDate ? ` · baixado em ${dt(e.paidDate)}` : ''}</span>
                </p>
              )}
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Fechar"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!d && !err && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-400" /></div>}
          {err && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={15} className="mt-0.5 shrink-0" />{err}</div>}

          {d && e && (
            <>
              {/* Origem */}
              {(d.deal || d.vehicle) && (
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Origem</h3>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    {d.deal && (
                      <div className="flex items-start gap-2">
                        <Handshake size={15} className="mt-0.5 text-gray-400" />
                        <div>
                          <Link href={`/negociacoes/${d.deal.id}`} className="font-medium text-brand-700 hover:underline">Negociação {d.deal.dealNumber ?? ''}</Link>
                          <p className="text-xs text-gray-500">{[d.deal.customer, d.deal.seller ? `vend. ${d.deal.seller}` : null].filter(Boolean).join(' · ') || '—'}</p>
                        </div>
                      </div>
                    )}
                    {d.vehicle && (
                      <div className="flex items-start gap-2">
                        <Car size={15} className="mt-0.5 text-gray-400" />
                        <div>
                          <Link href={`/financeiro/veiculos/${d.vehicle.id}`} className="font-medium text-brand-700 hover:underline">{d.vehicle.plate ?? ''} {d.vehicle.title}</Link>
                        </div>
                      </div>
                    )}
                    {d.debt && (
                      <div className="flex items-start gap-2 sm:col-span-2">
                        <FileText size={15} className="mt-0.5 text-gray-400" />
                        <p className="text-xs text-gray-600">
                          Débito <b>{d.debt.typeLabel}</b> do {d.debt.vehicleRole === 'TROCA' ? 'veículo da troca' : 'veículo vendido'} — responsável: <b>{d.debt.responsavelLabel ?? '—'}</b>
                          {d.debt.chargedToCustomer ? ` · cobrado do cliente ${brl(d.result?.charged)}` : ' · custo da loja'}
                        </p>
                      </div>
                    )}
                    {d.payment && (
                      <p className="text-xs text-gray-600 sm:col-span-2">
                        Pagamento {d.payment.type}{d.payment.method ? ` (${d.payment.method})` : ''}{d.payment.bank ? ` · ${d.payment.bank}` : ''}{d.payment.installments ? ` · ${d.payment.installments}x` : ''}
                        {d.payment.authorizationCode ? ` · autorização ${d.payment.authorizationCode}` : ''} — a baixa aqui confirma o pagamento na negociação.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* Resultado: cobrado × custo real × comissões */}
              {live && d.result && (
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{d.debt?.isDocumentation ? 'Resultado do documento (despachante)' : 'Cobrado × custo real'}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Kpi label="Cobrado do cliente" value={brl(live.charged)} />
                    <Kpi label={validItems.length || settled ? 'Custo real' : 'Custo (previsto)'} value={brl(live.cost)} tone="text-red-700" />
                    <Kpi label="Lucro bruto" value={brl(live.gross)} tone={live.gross >= 0 ? 'text-emerald-700' : 'text-red-700'} />
                    <Kpi label="Lucro líquido" value={brl(live.net)} sub={live.margin == null ? undefined : `${live.margin.toLocaleString('pt-BR')}% do cobrado`} tone={live.net >= 0 ? 'text-emerald-700' : 'text-red-700'} />
                  </div>
                  {d.debt?.isDocumentation && (
                    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <p className="mb-1.5 text-xs font-semibold text-gray-700">Comissões de documento</p>
                      {d.commissions.length ? (
                        <ul className="space-y-1 text-xs">
                          {d.commissions.map((c) => (
                            <li key={c.id} className={cn('flex justify-between gap-2', c.status === 'CANCELADO' && 'line-through opacity-50')}>
                              <span className="text-gray-700">{c.description.replace(/^DOCUMENTO — /, '')} <span className="text-gray-400">· {COMMISSION_STATUS[c.status] ?? c.status}</span></span>
                              <span className="tabular-nums text-gray-900">− {brl(c.amount)}</span>
                            </li>
                          ))}
                          <li className="flex justify-between border-t border-gray-200 pt-1 font-semibold"><span>Total</span><span className="tabular-nums">− {brl(live.commissions)}</span></li>
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-500">Nenhuma comissão de documento gerada.</p>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Custo real detalhado */}
              {editableCost && (
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Custo real detalhado</h3>
                    <span className="text-sm font-bold tabular-nums text-gray-900">{brl(realCost)}</span>
                  </div>
                  {!readOnly && d.suggestedKinds.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {d.suggestedKinds.map((k) => (
                        <button key={k} type="button" onClick={() => addItem(k)} className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:border-brand-400 hover:text-brand-700">+ {(COST_ITEM_LABEL as Record<string, string>)[k] ?? k}</button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    {items.map((i) => (
                      <div key={i.key} className="grid grid-cols-12 items-center gap-2">
                        <select disabled={readOnly} className={cn(inputCls, 'col-span-4')} value={i.kind} onChange={(ev) => setItem(i.key, { kind: ev.target.value })}>
                          {COST_ITEM_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                        <input disabled={readOnly} className={cn(inputCls, 'col-span-4')} value={i.description} onChange={(ev) => setItem(i.key, { description: ev.target.value })} placeholder="Detalhe" />
                        <div className="col-span-3"><MoneyInput disabled={readOnly} className={inputCls} value={i.amount} onChange={(v) => setItem(i.key, { amount: v })} /></div>
                        {!readOnly && <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.key !== i.key))} className="col-span-1 justify-self-center rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remover item"><Trash2 size={14} /></button>}
                      </div>
                    ))}
                    {!items.length && (
                      <div className="grid grid-cols-12 items-center gap-2">
                        <p className="col-span-8 text-xs text-gray-500">Valor total<RequiredMark className="ml-0.5" /></p>
                        <div className="col-span-4"><MoneyInput disabled={readOnly} className={inputCls} value={amount} onChange={setAmount} /></div>
                      </div>
                    )}
                    {!readOnly && <button type="button" onClick={() => addItem()} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 hover:border-brand-400 hover:text-brand-600"><Plus size={13} />Adicionar item de custo</button>}
                  </div>
                </section>
              )}

              {/* Baixa */}
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{settled ? 'Dados da baixa' : 'Baixa'}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {e.type === 'RECEITA' && (
                    <Field label="Valor recebido" required><MoneyInput disabled={readOnly} className={inputCls} value={amount} onChange={setAmount} /></Field>
                  )}
                  <Field label={e.type === 'RECEITA' ? 'Data do recebimento' : 'Data do pagamento'} required={!settled}><input type="date" disabled={readOnly} className={inputCls} value={paidDate} onChange={(ev) => setPaidDate(ev.target.value)} /></Field>
                  <Field label="Conta"><select disabled={readOnly} className={inputCls} value={accountId} onChange={(ev) => setAccountId(ev.target.value)}><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
                  <Field label="Forma"><select disabled={readOnly} className={inputCls} value={method} onChange={(ev) => setMethod(ev.target.value)}><option value="">—</option>{[...new Set([...(method ? [method] : []), ...METHODS])].map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
                  {e.type === 'DESPESA' && (
                    <Field label="Fornecedor / despachante">
                      <select disabled={readOnly} className={inputCls} value={supplierId} onChange={(ev) => setSupplierId(ev.target.value)}>
                        <option value="">{e.counterparty && !e.supplierId ? e.counterparty : '—'}</option>
                        {sortedSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind === 'DESPACHANTE' ? ' (despachante)' : ''}</option>)}
                      </select>
                      {!suppliers.length && <p className="mt-1 text-[11px] text-gray-400">Cadastre em Cadastros › Fornecedores.</p>}
                    </Field>
                  )}
                  <Field label="Nº do documento / NF"><input disabled={readOnly} className={inputCls} value={docNumber} onChange={(ev) => setDocNumber(ev.target.value)} /></Field>
                  <div className="sm:col-span-2"><Field label="Observações"><textarea disabled={readOnly} rows={2} className={inputCls} value={notes} onChange={(ev) => setNotes(ev.target.value)} /></Field></div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Ações */}
        {d && e && d.canManage && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white px-5 py-3">
            <div className="flex gap-2">
              {e.status === 'PREVISTO' && <button type="button" disabled={!!busy} onClick={() => setStatus('CANCELADO', 'Cancelar este lançamento?')} className="btn-secondary text-sm text-red-600"><Ban size={14} />Cancelar</button>}
              {settled && <button type="button" disabled={!!busy} onClick={() => setStatus('PREVISTO', 'Estornar a baixa? O lançamento volta para previsto.')} className="btn-secondary text-sm"><RotateCcw size={14} />Estornar baixa</button>}
              {e.status === 'CANCELADO' && <button type="button" disabled={!!busy} onClick={() => setStatus('PREVISTO', 'Reabrir o lançamento como previsto?')} className="btn-secondary text-sm"><RotateCcw size={14} />Reabrir</button>}
            </div>
            {e.status !== 'CANCELADO' && (
              <div className="flex gap-2">
                <button type="button" disabled={!!busy} onClick={() => submit(false)} className="btn-secondary text-sm">{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar</button>
                {!settled && <button type="button" disabled={!!busy} onClick={() => submit(true)} className="btn-primary text-sm">{busy === 'settle' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}{e.type === 'RECEITA' ? 'Confirmar recebimento' : 'Dar baixa'}</button>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums text-gray-900', tone)}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500">{sub}</p>}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-700">{label}{required && <RequiredMark className="ml-0.5" />}</span>{children}</label>
}
