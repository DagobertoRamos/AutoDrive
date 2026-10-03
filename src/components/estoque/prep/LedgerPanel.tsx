'use client'

// =============================================================================
// Extrato financeiro do veículo + conciliação (ficha do veículo e Financeiro ›
// Custos de veículos): resultado (compra, venda, custos, comissões, lucro,
// margem), lançamentos com baixa/estorno/cancelamento, comprovantes e novo
// lançamento (documentação, multas, débitos, peças, combustível, laudos,
// terceiros, prestadores, impostos…). Comissões baixam sozinhas pelo sistema
// de comissões; serviços vêm da aba Serviços.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FileText, Loader2, Plus, Receipt, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoneyInput, moneyToText, textToMoney } from '@/components/ui/money-input'
import { EXPENSE_CATEGORIES, parseMoneyInput, REVENUE_CATEGORIES } from '@/lib/stock/prep-core'
import { VehicleFilesField, type VFile } from './VehicleFilesField'
import { EntryDrawer } from '@/components/finance/EntryDrawer'
import { RequiredMark } from '@/components/ui/field'

interface Line {
  id: string; origin: 'ENTRY' | 'SALE' | 'COMMISSION' | 'TRADE'; entryId: string | null; type: 'RECEITA' | 'DESPESA'; category: string; categoryLabel: string
  description: string; amount: number; status: string; dueDate: string | null; paidDate: string | null; counterparty: string | null
  paymentMethod: string | null; dealNumber: string | null; locked: string | null; receipts: VFile[]
  items?: Array<{ kind: string; label: string; description: string; amount: number }>; chargedAmount?: number | null
}
interface DocSummary { charged: number; cost: number; gross: number; commissions: number; net: number; margin: number | null; costIsEstimate: boolean; items: Array<{ kind: string; label: string; amount: number }> }
interface Data {
  vehicle: { id: string; plate: string | null; title: string; stockType: string | null; stockStatus: string | null; purchasePrice: number | null; salePrice: number | null; dealNumbers: string[] }
  lines: Line[]
  result: { revenue: number; cost: number; profit: number; margin: number | null; toPay: number; toReceive: number; byCategory: Record<string, number> }
  accounts: Array<{ id: string; name: string }>
  documentation: DocSummary | null
}

const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
const input = 'w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm'
const METHODS = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão', 'Débito em conta', 'Outro']
const EXPENSES_MANUAL = EXPENSE_CATEGORIES.filter(([k]) => k !== 'COMISSAO')
const REVENUES_MANUAL = REVENUE_CATEGORIES.filter(([k]) => k !== 'VENDA_VEICULO' && k !== 'COBRADO_CLIENTE')

export function LedgerPanel({ vehicleId }: { vehicleId: string }) {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'TODOS' | 'PENDENTES' | 'PAGOS'>('TODOS')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<Line | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const j = await fetch(`/api/vehicles/${vehicleId}/ledger`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) setD(j.data); else setErr(j?.error ?? 'Falha ao carregar o extrato.')
  }, [vehicleId])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  async function act(line: Line, body: Record<string, unknown>) {
    if (!line.entryId) return
    const r = await fetch(`/api/vehicles/${vehicleId}/ledger/${line.entryId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert(j.error ?? 'Não foi possível concluir.'); return false }
    await load(); return true
  }

  if (!d) return err ? <p className="text-sm text-red-600">{err}</p> : <Loader2 className="animate-spin text-gray-400" />
  const r = d.result
  // "+ 0" evita o zero negativo ("-R$ 0,00").
  const commissions = -(r.byCategory.COMISSAO ?? 0) + 0
  const acquisition = -((r.byCategory.COMPRA_VEICULO ?? 0) + (r.byCategory.REPASSE ?? 0)) + 0
  const prep = r.cost - commissions - acquisition
  const sale = (r.byCategory.VENDA_VEICULO ?? 0) + 0
  const charged = (r.byCategory.COBRADO_CLIENTE ?? 0) + 0
  const lines = d.lines.filter((l) => filter === 'TODOS' ? true : filter === 'PENDENTES' ? l.status === 'PREVISTO' : l.status === 'PAGO' || l.status === 'RECEBIDO')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {([
          [d.vehicle.stockType === 'CONSIGNADO' ? 'Repasse' : 'Compra', brl(acquisition), ''],
          ['Venda', brl(sale), ''],
          ['Preparação e custos', brl(prep), ''],
          ...(charged ? [['Cobrado do cliente', brl(charged), 'text-emerald-700'] as [string, string, string]] : []),
          ['Comissões', brl(commissions), ''],
          ['Lucro', brl(r.profit), r.profit >= 0 ? 'text-emerald-700' : 'text-red-700'],
          ['Margem', r.margin == null ? '—' : `${r.margin.toLocaleString('pt-BR')}%`, r.profit >= 0 ? 'text-emerald-700' : 'text-red-700'],
          ['A pagar', brl(r.toPay), r.toPay > 0 ? 'text-amber-700' : ''],
        ] as Array<[string, string, string]>).map(([l, v, c]) => (
          <div key={l} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{l}</p>
            <p className={cn('text-sm font-bold tabular-nums text-gray-900', c)}>{v}</p>
          </div>
        ))}
      </div>
      {d.documentation && <DocCard doc={d.documentation} />}
      {sale === 0 && <p className="text-[11px] text-gray-500">Sem venda registrada · anúncio {brl(d.vehicle.salePrice)}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 text-xs">
          {(['TODOS', 'PENDENTES', 'PAGOS'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn('rounded-full border px-2.5 py-0.5', filter === f ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 text-gray-600')}>
              {f === 'TODOS' ? 'Todos' : f === 'PENDENTES' ? 'A pagar/receber' : 'Baixados'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAdding(true)} className="btn-primary px-3 py-1.5 text-xs"><Plus size={13} />Novo lançamento</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr><th className="px-3 py-2">Lançamento</th><th className="px-3 py-2">Categoria</th><th className="px-3 py-2">Vencimento</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lines.map((l) => (
              <tr key={l.id} onClick={() => l.entryId && l.origin !== 'COMMISSION' && setDetailId(l.entryId)} className={cn(l.status === 'CANCELADO' && 'opacity-50', l.entryId && l.origin !== 'COMMISSION' && 'cursor-pointer hover:bg-gray-50')}>
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-900">{l.description}</p>
                  {!!l.items?.length && (
                    <ul className="mt-0.5 space-y-0.5 text-[11px] text-gray-600">
                      {l.items.map((i, k) => <li key={k} className="flex justify-between gap-3"><span>• {i.description}</span><span className="tabular-nums">{brl(i.amount)}</span></li>)}
                    </ul>
                  )}
                  {l.chargedAmount != null && l.chargedAmount !== l.amount && <p className="text-[10px] text-gray-500">previsto/cobrado {brl(l.chargedAmount)}</p>}
                  <p className="text-[11px] text-gray-500">{[l.counterparty, l.dealNumber ? `Negociação ${l.dealNumber}` : null, l.paymentMethod].filter(Boolean).join(' · ')}</p>
                  {l.locked && <p className="text-[10px] text-gray-400">{l.locked}</p>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{l.categoryLabel}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{date(l.dueDate)}</td>
                <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', l.type === 'RECEITA' ? 'text-emerald-700' : 'text-gray-900')}>{l.type === 'RECEITA' ? '+' : '−'} {brl(l.amount)}</td>
                <td className="px-3 py-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', l.status === 'PAGO' || l.status === 'RECEBIDO' ? 'bg-emerald-100 text-emerald-800' : l.status === 'CANCELADO' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-800')}>
                    {l.status === 'PAGO' ? 'Pago' : l.status === 'RECEBIDO' ? 'Recebido' : l.status === 'CANCELADO' ? 'Cancelado' : l.type === 'RECEITA' ? 'A receber' : 'A pagar'}
                  </span>
                  {l.paidDate && (l.status === 'PAGO' || l.status === 'RECEBIDO') && <p className="text-[10px] text-gray-400">em {date(l.paidDate)}</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                  {l.entryId && l.origin !== 'COMMISSION' && (
                    <div className="flex justify-end gap-1">
                      {l.status === 'PREVISTO' && <button type="button" onClick={() => setDetailId(l.entryId)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"><CheckCircle2 size={11} />Dar baixa</button>}
                      {(l.status === 'PAGO' || l.status === 'RECEBIDO') && <button type="button" onClick={() => { if (confirm('Estornar a baixa?')) void act(l, { action: 'unpay' }) }} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-600"><RotateCcw size={11} />Estornar</button>}
                      <button type="button" onClick={() => setReceipts(l)} className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-600" title="Comprovantes"><Receipt size={11} />{l.receipts.length || ''}</button>
                      {l.status === 'PREVISTO' && !l.locked && <button type="button" onClick={() => { if (confirm('Cancelar este lançamento?')) void act(l, { action: 'cancel' }) }} className="rounded-md border border-gray-300 p-1 text-gray-500 hover:text-red-600" aria-label="Cancelar"><X size={11} /></button>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">Nenhum lançamento.</td></tr>}
          </tbody>
        </table>
      </div>

      {detailId && <EntryDrawer entryId={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()} />}
      {receipts && (
        <Modal title={`Comprovantes — ${receipts.description}`} onClose={() => setReceipts(null)}>
          <VehicleFilesField vehicleId={vehicleId} kind="COMPROVANTE" refKey={receipts.entryId} files={receipts.receipts} canEdit onChange={async () => { await load(); setReceipts(null) }} />
        </Modal>
      )}
      {adding && <NewEntryModal vehicleId={vehicleId} accounts={d.accounts} onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); await load() }} />}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">{title}</h3><button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Fechar"><X size={16} /></button></div>
        {children}
      </div>
    </div>
  )
}

function NewEntryModal({ vehicleId, accounts, onClose, onSaved }: { vehicleId: string; accounts: Data['accounts']; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ type: 'DESPESA', category: 'DOCUMENTACAO', description: '', amount: '', dueDate: new Date().toISOString().slice(0, 10), counterparty: '', paid: false, paymentMethod: 'PIX', accountId: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const cats = f.type === 'DESPESA' ? EXPENSES_MANUAL : REVENUES_MANUAL
  async function save() {
    if (!f.description.trim()) { setErr('Informe a descrição.'); return }
    if (!parseMoneyInput(f.amount)) { setErr('Informe o valor.'); return }
    if (!f.dueDate) { setErr('Informe o vencimento.'); return }
    setBusy(true); setErr('')
    const r = await fetch(`/api/vehicles/${vehicleId}/ledger`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, amount: parseMoneyInput(f.amount), dueDate: `${f.dueDate}T12:00:00`, paidDate: f.paid ? `${f.dueDate}T12:00:00` : undefined, accountId: f.accountId || undefined }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error ?? 'Falha ao salvar.'); return }
    await onSaved()
  }
  return (
    <Modal title="Novo lançamento do veículo" onClose={onClose}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-600">Tipo <RequiredMark /><select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, category: e.target.value === 'DESPESA' ? 'DOCUMENTACAO' : 'OUTRA_RECEITA' })}><option value="DESPESA">Despesa / custo</option><option value="RECEITA">Receita</option></select></label>
        <label className="text-xs text-gray-600">Categoria <RequiredMark /><select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="text-xs text-gray-600 sm:col-span-2">Descrição <RequiredMark /><input className={input} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: transferência DETRAN" maxLength={200} /></label>
        <label className="text-xs text-gray-600">Valor <RequiredMark /><MoneyInput className={input} value={textToMoney(f.amount)} onChange={(n) => setF({ ...f, amount: moneyToText(n) })} /></label>
        <label className="text-xs text-gray-600">Vencimento <RequiredMark /><input type="date" className={input} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
        <label className="text-xs text-gray-600 sm:col-span-2">Fornecedor / favorecido<input className={input} value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} maxLength={120} /></label>
        <label className="flex items-center gap-2 text-xs text-gray-700 sm:col-span-2"><input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} className="rounded border-gray-300" />Já está pago</label>
        {f.paid && (
          <>
            <label className="text-xs text-gray-600">Forma<select className={input} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="text-xs text-gray-600">Conta<select className={input} value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          </>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">Cancelar</button>
        <button disabled={busy || !f.description.trim() || !f.amount || !f.dueDate} onClick={() => void save()} className="btn-primary px-3 py-1.5 text-xs">{busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}Lançar</button>
      </div>
    </Modal>
  )
}

/** Documentação (despachante) do carro: cobrado − custo real detalhado − comissões de documento. */
function DocCard({ doc }: { doc: DocSummary }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><FileText size={13} />Documentação / despachante</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([
          ['Cobrado do cliente', brl(doc.charged), ''],
          [doc.costIsEstimate ? 'Custo (previsto)' : 'Custo real', brl(doc.cost), 'text-red-700'],
          ['Lucro sobre despachante', brl(doc.gross), doc.gross >= 0 ? 'text-emerald-700' : 'text-red-700'],
          ['Comissões de documento', brl(doc.commissions), ''],
          ['Lucro líquido', brl(doc.net), doc.net >= 0 ? 'text-emerald-700' : 'text-red-700'],
        ] as Array<[string, string, string]>).map(([l, v, c]) => (
          <div key={l} className="rounded-lg bg-gray-50 px-2.5 py-1.5"><p className="text-[10px] uppercase tracking-wide text-gray-500">{l}</p><p className={cn('text-sm font-bold tabular-nums text-gray-900', c)}>{v}</p></div>
        ))}
      </div>
      {doc.items.length > 0 && (
        <p className="mt-2 text-[11px] text-gray-600">Custo detalhado: {doc.items.map((i) => `${i.label} ${brl(i.amount)}`).join(' · ')}</p>
      )}
      {doc.costIsEstimate && <p className="mt-1 text-[11px] text-amber-700">Custo ainda previsto.</p>}
    </div>
  )
}
