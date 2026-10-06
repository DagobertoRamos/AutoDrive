'use client'

// =============================================================================
// F&I do contrato — painel do financeiro num pagamento FINANCIAMENTO
// (Financeiro › Recebimentos). Retorno bruto/ILA/IOF/IRRF/líquido, PLUS,
// nº do contrato e agregados embutidos no financiamento. Grava via
// PATCH /api/finance/receivables/[id] { action: 'FI' } e calcula pelo padrão
// da loja com { action: 'FI_CALC' }. Matemática em lib/finance/fi-receipt-core.
// =============================================================================

import { useState, type ReactNode } from 'react'
import { Calculator, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { MoneyInput } from '@/components/ui/money-input'
import { RequiredMark } from '@/components/ui/field'
import { computeFiNet, summarizeFiContract, FI_ADDON_KINDS, FI_ADDON_KIND_LABEL, FI_MAX_ADDONS, normalizeAddOnKind, type FiAddOn, type FiAddOnKind } from '@/lib/finance/fi-receipt-core'

export interface FiDealReturn {
  financedAmount?: number | null; returnRatePercent: number | null; returnGrossValue?: number | null
  ilaPercent?: number | null; ilaValue?: number | null; iofPercent?: number | null; iofValue?: number | null; returnNetValue?: number | null
}
export interface FiData {
  contractNumber: string | null; installmentValue: number | null; returnPct: number | null
  returnGrossValue: number | null; ilaValue: number | null; iofValue: number | null; irrfValue: number | null
  returnNetValue: number | null; plusValue: number | null; addOns: FiAddOn[]
  dealReturn: FiDealReturn | null
}
export interface FiProduct { name: string; kind: string | null; defaultValue: number | null }

interface Props {
  paymentId: string
  financed: number
  bank: string | null
  installments: number | null
  fi: FiData
  products: FiProduct[]
  canEdit: boolean
  onSaved: (msg: { ok: boolean; text: string }) => void
}

interface AddOnRow { name: string; kind: FiAddOnKind; amount: number | null; beneficiary: 'LOJA' | 'TERCEIRO'; storeRevenue: number | null }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
const parsePct = (s: string): number | null => {
  const t = s.replace(/[^\d,.]/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.min(n, 20) : null
}
const inputCls = 'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-600'

export default function FiContractPanel({ paymentId, financed, bank, installments, fi, products, canEdit, onSaved }: Props) {
  // Sem conferência ainda → sugere o cálculo da negociação (quando é o único financiamento).
  const d = fi.dealReturn
  const fresh = fi.returnGrossValue == null && fi.ilaValue == null && fi.iofValue == null && fi.returnNetValue == null
  const [contract, setContract] = useState(fi.contractNumber ?? '')
  const [pctText, setPctText] = useState(fmtPct(fi.returnPct ?? d?.returnRatePercent ?? null))
  const [gross, setGross] = useState<number | null>(fi.returnGrossValue ?? (fresh ? d?.returnGrossValue ?? null : null))
  const [ila, setIla] = useState<number | null>(fi.ilaValue ?? (fresh ? d?.ilaValue ?? null : null))
  const [iof, setIof] = useState<number | null>(fi.iofValue ?? (fresh ? d?.iofValue ?? null : null))
  const [irrf, setIrrf] = useState<number | null>(fi.irrfValue)
  const [plus, setPlus] = useState<number | null>(fi.plusValue)
  const [addOns, setAddOns] = useState<AddOnRow[]>(fi.addOns.map((a) => ({ name: a.name, kind: a.kind, amount: a.amount, beneficiary: a.beneficiary, storeRevenue: a.storeRevenue ?? null })))
  const [busy, setBusy] = useState<'save' | 'calc' | null>(null)

  const net = computeFiNet(gross, ila, iof, irrf)
  const validAddOns: FiAddOn[] = addOns.filter((a) => a.name.trim() && a.amount != null).map((a) => ({ name: a.name.trim(), kind: a.kind, amount: a.amount ?? 0, beneficiary: a.beneficiary, storeRevenue: a.storeRevenue }))
  const summary = summarizeFiContract({ financedAmount: financed, returnNetValue: net, plusValue: plus, addOns: validAddOns })
  const incomplete = addOns.some((a) => !a.name.trim() || a.amount == null)

  const setRow = (i: number, patch: Partial<AddOnRow>) => setAddOns((rows) => rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const pickName = (i: number, name: string) => {
    const p = products.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
    setAddOns((rows) => rows.map((r, k) => (k !== i ? r : { ...r, name, ...(p ? { kind: normalizeAddOnKind(p.kind), amount: r.amount ?? p.defaultValue ?? null } : {}) })))
  }

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/finance/receivables/${paymentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error ?? `Erro ${res.status}`)
    return j
  }

  const calc = async () => {
    setBusy('calc')
    try {
      const j = await call({ action: 'FI_CALC', returnPct: parsePct(pctText) })
      setPctText(fmtPct(j.data.returnPct)); setGross(j.data.returnGrossValue); setIla(j.data.ilaValue); setIof(j.data.iofValue)
    } catch (e) { onSaved({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const save = async () => {
    setBusy('save')
    try {
      await call({
        action: 'FI', contractNumber: contract.trim() || null, returnPct: parsePct(pctText),
        returnGrossValue: gross, ilaValue: ila, iofValue: iof, irrfValue: irrf, plusValue: plus,
        addOns: validAddOns.map((a) => ({ ...a, storeRevenue: a.storeRevenue ?? null })),
      })
      onSaved({ ok: true, text: 'F&I do contrato salvo.' })
    } catch (e) { onSaved({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const listId = `fi-products-${paymentId}`
  const field = (label: string, node: ReactNode) => (
    <label className="block text-xs text-gray-600">{label}<div className="mt-0.5">{node}</div></label>
  )

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {field('Contrato', <input value={contract} disabled={!canEdit} onChange={(e) => setContract(e.target.value)} className={inputCls} maxLength={60} />)}
        {field('Banco', <input value={bank ?? '—'} disabled className={inputCls} />)}
        {field('Valor financiado', <input value={brl(financed)} disabled className={inputCls} />)}
        {field('Parcelas', <input value={installments ? `${installments} × ${fi.installmentValue != null ? brl(fi.installmentValue) : '—'}` : '—'} disabled className={inputCls} />)}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {field('Retorno %', <input value={pctText} disabled={!canEdit} inputMode="decimal" onChange={(e) => setPctText(e.target.value.replace(/[^\d,.]/g, ''))} className={inputCls} />)}
        {field('Retorno bruto', <MoneyInput value={gross} onChange={setGross} disabled={!canEdit} className={inputCls} />)}
        {field('ILA', <MoneyInput value={ila} onChange={setIla} disabled={!canEdit} className={inputCls} />)}
        {field('IOF', <MoneyInput value={iof} onChange={setIof} disabled={!canEdit} className={inputCls} />)}
        {field('IRRF', <MoneyInput value={irrf} onChange={setIrrf} disabled={!canEdit} className={inputCls} />)}
        {field('Retorno líquido', <input value={net == null ? '—' : brl(net)} disabled className={`${inputCls} font-semibold`} />)}
        {field('PLUS', <MoneyInput value={plus} onChange={setPlus} disabled={!canEdit} className={inputCls} />)}
        {canEdit && (
          <div className="flex items-end">
            <button type="button" onClick={() => void calc()} disabled={busy !== null} className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-brand-300 bg-white px-2 py-2 font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">
              {busy === 'calc' ? <Loader2 size={12} className="animate-spin" /> : <Calculator size={12} />}Calcular pelo padrão da loja
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 font-semibold text-gray-700">Agregados</p>
        {addOns.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-gray-500">
                <tr>
                  <th className="pb-1 pr-2 font-medium">Nome<RequiredMark className="ml-0.5" /></th>
                  <th className="pb-1 pr-2 font-medium">Tipo</th>
                  <th className="pb-1 pr-2 font-medium">Valor<RequiredMark className="ml-0.5" /></th>
                  <th className="pb-1 pr-2 font-medium">Beneficiário</th>
                  <th className="pb-1 pr-2 font-medium">Receita da loja</th>
                  {canEdit && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {addOns.map((a, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-0.5 pr-2"><input list={listId} value={a.name} disabled={!canEdit} onChange={(e) => pickName(i, e.target.value)} maxLength={80} className={inputCls} /></td>
                    <td className="py-0.5 pr-2">
                      <select value={a.kind} disabled={!canEdit} onChange={(e) => setRow(i, { kind: e.target.value as FiAddOnKind })} className={inputCls}>
                        {FI_ADDON_KINDS.map((k) => <option key={k} value={k}>{FI_ADDON_KIND_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td className="py-0.5 pr-2"><MoneyInput value={a.amount} onChange={(v) => setRow(i, { amount: v })} disabled={!canEdit} className={inputCls} /></td>
                    <td className="py-0.5 pr-2">
                      <select value={a.beneficiary} disabled={!canEdit} onChange={(e) => setRow(i, { beneficiary: e.target.value as 'LOJA' | 'TERCEIRO' })} className={inputCls}>
                        <option value="LOJA">Loja</option>
                        <option value="TERCEIRO">Terceiro</option>
                      </select>
                    </td>
                    <td className="py-0.5 pr-2"><MoneyInput value={a.storeRevenue} onChange={(v) => setRow(i, { storeRevenue: v })} disabled={!canEdit} className={inputCls} /></td>
                    {canEdit && (
                      <td className="py-0.5">
                        <button type="button" aria-label="Remover agregado" onClick={() => setAddOns((rows) => rows.filter((_, k) => k !== i))} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <datalist id={listId}>{products.map((p) => <option key={p.name} value={p.name} />)}</datalist>
        {canEdit && addOns.length < FI_MAX_ADDONS && (
          <button type="button" onClick={() => setAddOns((rows) => [...rows, { name: '', kind: 'OUTRO', amount: null, beneficiary: 'TERCEIRO', storeRevenue: null }])} className="mt-1 inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
            <Plus size={12} />Adicionar agregado
          </button>
        )}
        {!canEdit && !addOns.length && <p className="text-gray-400">—</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-2">
        <div className="flex flex-wrap gap-4">
          <p className="text-gray-600">Valor a receber do banco <span className="ml-1 text-sm font-semibold text-gray-900">{brl(summary.bankReceivable)}</span></p>
          <p className="text-gray-600">Receitas da loja neste contrato <span className="ml-1 text-sm font-semibold text-green-700">{brl(summary.storeIncome)}</span></p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => void save()} disabled={busy !== null || incomplete} className="inline-flex items-center gap-1 rounded-md bg-brand-700 px-3 py-2 font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
            {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Salvar F&I
          </button>
        )}
      </div>
    </div>
  )
}
