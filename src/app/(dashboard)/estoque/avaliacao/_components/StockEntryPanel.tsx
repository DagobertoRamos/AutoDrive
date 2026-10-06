'use client'

// =============================================================================
// StockEntryPanel — depois da liberação: vendedor devolve ao gestor quando o
// cliente aceita; gestor confirma e libera o veículo para o estoque.
// Regras em src/lib/evaluation/stock-entry-core.ts.
// =============================================================================

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Loader2, PackageCheck, Undo2, Warehouse } from 'lucide-react'
import { RequiredMark } from '@/components/ui/field'
import { HelpHint } from '@/components/ui/help-hint'
import { opsHint } from '@/lib/glossary-ops'
import { buildEntryPendencies, EVAL_AWAITING_STOCK, EVAL_IN_STOCK } from '@/lib/evaluation/stock-entry-core'

export interface StockEntryEvaluation {
  id:                  string
  status?:             string | null
  customerDecision?:   string | null
  vehicleId?:          string | null
  stockType?:          string | null
  availableFor?:       string | null
  evaluatedValue?:     number | string | null
  suggestedSalePrice?: number | string | null
  pendencyNotes?:      string | null
  services?:           Array<{ description: string; serviceType?: string | null; estimatedCost?: number | string | null; status?: string | null }>
}

const RELEASED = new Set(['LIBERADA', 'APPROVED'])
const DEAD_DECISIONS = new Set(['RECUSADA', 'CANCELADA', 'EXPIRADA'])

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

function toMask(v: number | string | null | undefined): string {
  const n = v == null || v === '' ? NaN : Number(v)
  return Number.isFinite(n) && n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}
function maskBRL(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits ? (parseInt(digits, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}
function parseBRL(value: string): number | null {
  const digits = value.replace(/\D/g, '')
  return digits ? parseInt(digits, 10) / 100 : null
}

export function StockEntryPanel({ evaluation, isManagerPlus, onChanged, showToast }: {
  evaluation:    StockEntryEvaluation
  isManagerPlus: boolean
  onChanged:     () => void
  showToast:     (msg: string, ok?: boolean) => void
}) {
  const status   = (evaluation.status ?? '').toUpperCase()
  const decision = (evaluation.customerDecision ?? 'PENDENTE').toUpperCase()
  const awaiting = status === EVAL_AWAITING_STOCK
  const inStock  = !!evaluation.vehicleId || status === EVAL_IN_STOCK

  const [busy, setBusy]   = useState<string | null>(null)
  const [note, setNote]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [stockType, setStockType] = useState(() => {
    if (evaluation.stockType) return evaluation.stockType
    const ops = (evaluation.availableFor ?? '').toUpperCase().split(',').filter(Boolean)
    return ops.length === 1 && ops[0] === 'CONSIGNACAO' ? 'CONSIGNADO' : 'PROPRIO'
  })
  const [purchase, setPurchase] = useState(toMask(evaluation.evaluatedValue))
  const [sale, setSale]         = useState(toMask(evaluation.suggestedSalePrice))
  const [receiveNotes, setReceiveNotes] = useState('')

  const pendencies = useMemo(() => buildEntryPendencies({
    services: evaluation.services ?? [], pendencyNotes: evaluation.pendencyNotes, receiveNotes,
  }), [evaluation.services, evaluation.pendencyNotes, receiveNotes])

  async function post(key: string, url: string, body: unknown): Promise<Record<string, unknown> | null> {
    setBusy(key)
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { showToast(d?.error ?? 'Não foi possível concluir.', false); return null }
      return d
    } catch {
      showToast('Erro de conexão.', false)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function requestEntry() {
    // "Cliente aceitou" + devolver ao gestor num clique só.
    if (decision !== 'ACEITA') {
      const ok = await post('request', `/api/evaluations/${evaluation.id}/customer-decision`, { decision: 'ACEITA', note: note.trim() || undefined })
      if (!ok) return
    }
    const d = await post('request', `/api/evaluations/${evaluation.id}/stock-entry/request`, { note: note.trim() || undefined })
    if (d) { showToast('Enviado ao gestor para entrada no estoque.'); onChanged() }
  }

  async function confirmEntry() {
    if (!((parseBRL(purchase) ?? 0) > 0)) { showToast(stockType === 'CONSIGNADO' ? 'Informe o valor de repasse.' : 'Informe o valor de compra.', false); return }
    if (!((parseBRL(sale) ?? 0) > 0)) { showToast('Informe o preço de venda.', false); return }
    if (!confirm('Confirmar a entrada deste veículo no estoque?')) return
    const d = await post('confirm', `/api/evaluations/${evaluation.id}/stock-entry`, {
      stockType, purchasePrice: parseBRL(purchase), salePrice: parseBRL(sale), notes: note.trim() || undefined, receiveNotes: receiveNotes.trim() || undefined,
    })
    if (d) { showToast('Veículo liberado para o estoque.'); onChanged() }
  }

  async function returnToSeller() {
    const reason = prompt('Motivo da devolução ao vendedor (opcional):')
    if (reason === null) return
    const d = await post('return', `/api/evaluations/${evaluation.id}/stock-entry/return`, { reason: reason.trim() || undefined })
    if (d) { showToast('Devolvido ao vendedor.'); onChanged() }
  }

  // ── Já no estoque ─────────────────────────────────────────────────────────
  if (inStock) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-teal-300 bg-teal-50 px-4 py-3">
        <Warehouse size={18} className="text-teal-700" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-teal-900">Veículo no estoque</p>
          <p className="text-xs text-teal-800">Pendências na ficha do veículo.</p>
        </div>
        {evaluation.vehicleId && (
          <Link href={`/estoque/${evaluation.vehicleId}`} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
            Abrir no estoque <ArrowRight size={12} />
          </Link>
        )}
      </div>
    )
  }

  const releasedAlive = RELEASED.has(status) && !DEAD_DECISIONS.has(decision)
  if (!awaiting && !releasedAlive) return null

  const canManagerConfirm = isManagerPlus && (awaiting || decision === 'ACEITA')
  const formOpen = canManagerConfirm && (awaiting || showForm)

  return (
    <div className={`rounded-xl border-2 p-4 shadow-sm ${awaiting ? 'border-indigo-300 bg-indigo-50/60' : 'border-emerald-300 bg-emerald-50/60'}`}>
      <div className="mb-2 flex items-center gap-2">
        <PackageCheck size={16} className={awaiting ? 'text-indigo-700' : 'text-emerald-700'} />
        <p className={`text-sm font-bold ${awaiting ? 'text-indigo-900' : 'text-emerald-900'}`}>
          {awaiting ? 'Aguardando o gestor dar entrada no estoque' : 'Entrada no estoque'}
        </p>
        <HelpHint {...opsHint('ESTEIRA')} />
      </div>

      {!awaiting && (
        <p className="mb-3 text-xs text-emerald-900">
          {decision === 'ACEITA'
            ? 'Cliente aceitou a proposta.'
            : 'Aguardando aceite do cliente.'}
        </p>
      )}
      {awaiting && !isManagerPlus && (
        <p className="text-xs text-indigo-900">Gestor avisado.</p>
      )}

      {!formOpen && (
        <div className="space-y-2">
          <textarea className={inputCls + ' min-h-[56px] bg-white'} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observação para o gestor" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={requestEntry} disabled={busy != null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {busy === 'request' ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
              {decision === 'ACEITA' ? 'Devolver ao gestor para entrada no estoque' : 'Cliente aceitou — devolver ao gestor'}
            </button>
            {canManagerConfirm && (
              <button type="button" onClick={() => setShowForm(true)} disabled={busy != null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60">
                <Warehouse size={14} /> Dar entrada agora (gestor)
              </button>
            )}
          </div>
        </div>
      )}

      {formOpen && (
        <div className="mt-2 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700">Tipo de estoque <RequiredMark /> <HelpHint {...opsHint('CONSIGNADO')} /></span>
              <select className={inputCls + ' bg-white'} value={stockType} onChange={(e) => setStockType(e.target.value)}>
                <option value="PROPRIO">Próprio (compra)</option>
                <option value="CONSIGNADO">Consignado</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-700">{stockType === 'CONSIGNADO' ? 'Valor repasse ao cliente (R$)' : 'Valor de compra (R$)'} <RequiredMark /></span>
              <input className={inputCls + ' bg-white'} inputMode="numeric" placeholder="0,00" value={purchase} onChange={(e) => setPurchase(maskBRL(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-700">Preço de venda (R$) <RequiredMark /></span>
              <input className={inputCls + ' bg-white'} inputMode="numeric" placeholder="0,00" value={sale} onChange={(e) => setSale(maskBRL(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-3">
              <span className="text-xs font-medium text-gray-700">Observação do recebimento</span>
              <input className={inputCls + ' bg-white'} placeholder="Ex.: entrega na sexta" value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} />
            </label>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold text-gray-700">Entra como “Pend. Preparação” com as pendências: <HelpHint {...opsHint('PORTAO')} /></p>
            <ul className="space-y-1.5">
              {pendencies.map((p) => (
                <li key={p.label} className="text-xs">
                  <span className="font-semibold text-amber-800">• {p.label}</span>
                  {p.notes && <span className="mt-0.5 block whitespace-pre-line pl-3 text-gray-600">{p.notes}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {awaiting ? (
              <button type="button" onClick={returnToSeller} disabled={busy != null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                {busy === 'return' ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />} Devolver ao vendedor
              </button>
            ) : (
              <button type="button" onClick={() => setShowForm(false)} disabled={busy != null}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
            )}
            <button type="button" onClick={confirmEntry} disabled={busy != null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy === 'confirm' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Confirmar e liberar para o estoque
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
