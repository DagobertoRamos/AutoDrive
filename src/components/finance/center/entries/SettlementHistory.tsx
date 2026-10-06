'use client'

// =============================================================================
// Baixas do título (painel do lançamento): resumo original / pago / saldo e a
// lista de baixas (parciais + final) com conta, forma, juros, desconto e lote.
// Estorno só na última baixa (LIFO), com motivo:
//   POST /api/finance/center/entries/[id] { action: 'reverse', reason }
// =============================================================================

import { useState } from 'react'
import { ExternalLink, FileText, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint, WithHint } from '@/components/ui/help-hint'
import { RequiredMark } from '@/components/ui/field'
import { BatchReceipt } from './BatchReceipt'
import { ErrorLine, brl, dt, inputCls, postJson } from './ui'

export interface SettlementBaixa {
  id: string; kind: 'PARCIAL' | 'FINAL'; n: number; paidDate: string | null; account: string | null; paymentMethod: string | null
  principal: number; interest: number; discount: number; paid: number; batchId: string | null; notes: string | null; canReverse: boolean
}
export interface SettlementInfo {
  titleId: string; title: { id: string; description: string; status: string }; isChild: boolean; transfer: boolean
  summary: { original: number; settled: number; remaining: number; paidTotal: number; count: number; partial: boolean }
  partialCount: number; partialBlocked: string | null; baixas: SettlementBaixa[]
}

export function SettlementHistory({ info, type, currentId, canManage, onOpenEntry, onChanged }: {
  info: SettlementInfo; type: 'RECEITA' | 'DESPESA'; currentId: string; canManage: boolean
  onOpenEntry: (id: string) => void
  /** Após estorno; `switchTo` = abrir este lançamento (a baixa atual deixou de existir). */
  onChanged: (switchTo?: string) => void
}) {
  const [receipt, setReceipt] = useState<string | null>(null)
  const [reverseId, setReverseId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const isExpense = type === 'DESPESA'
  const s = info.summary

  async function doReverse(b: SettlementBaixa) {
    if (reason.trim().length < 3) { setErr('Informe o motivo.'); return }
    if (!confirm(`Estornar a baixa de ${brl(b.paid)} (${dt(b.paidDate)})?`)) return
    setBusy(true); setErr('')
    const r = await postJson(`/api/finance/center/entries/${b.id}`, { action: 'reverse', reason: reason.trim() }).catch(() => null)
    setBusy(false)
    if (!r) { setErr('Erro de rede.'); return }
    if (!r.ok) { setErr(r.data.error ?? 'Não foi possível estornar.'); return }
    setReverseId(null); setReason('')
    // A baixa parcial estornada deixa de existir: o painel passa para o título.
    onChanged(b.id === currentId && b.kind === 'PARCIAL' ? info.titleId : undefined)
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Baixas</h3>
        {info.isChild && (
          <button type="button" onClick={() => onOpenEntry(info.titleId)} className="inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-brand-700 hover:underline">
            <ExternalLink size={12} />Título: {info.title.description}
          </button>
        )}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Kpi label="Valor original" value={brl(s.original)} />
        <Kpi label={isExpense ? 'Pago' : 'Recebido'} value={brl(s.paidTotal)} tone="text-emerald-700" />
        <Kpi label="Saldo" value={brl(s.remaining)} tone={s.remaining > 0 ? 'text-amber-700' : 'text-gray-500'} />
      </div>

      {info.baixas.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhuma baixa.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                {['Data', 'Conta / forma', 'Principal', 'Juros', 'Desc.', 'Pago', ''].map((h, i) => (
                  <th key={i} className={cn('whitespace-nowrap px-1 py-1 font-semibold', i >= 2 && i <= 5 && 'text-right')}>
                    {i === 3 ? <WithHint term="JUROS_MULTA">{h}</WithHint> : i === 4 ? <WithHint term="DESCONTO">{h}</WithHint> : i === 6 && canManage ? <HelpHint term="ESTORNO" size={11} /> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {info.baixas.map((b) => (
                <tr key={b.id} className={cn(b.id === currentId && 'bg-brand-50/50')}>
                  <td className="whitespace-nowrap px-1 py-1.5">
                    <p className="font-medium text-gray-900">{dt(b.paidDate)}</p>
                    <p className="text-[10px] text-gray-500">{b.kind === 'FINAL' ? (info.baixas.length > 1 ? 'Final' : 'Total') : `Parcial ${b.n}`}</p>
                  </td>
                  <td className="max-w-[150px] px-1 py-1.5">
                    <p className="truncate text-gray-700">{b.account ?? '—'}</p>
                    <p className="truncate text-[10px] text-gray-500">
                      {b.paymentMethod ?? ''}
                      {b.batchId && (
                        <button type="button" onClick={() => setReceipt(b.batchId)} className="ml-1 inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline"><FileText size={10} />lote</button>
                      )}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-right tabular-nums text-gray-700">{brl(b.principal)}</td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-right tabular-nums text-gray-500">{b.interest ? brl(b.interest) : '—'}</td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-right tabular-nums text-gray-500">{b.discount ? brl(b.discount) : '—'}</td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-right font-semibold tabular-nums text-gray-900">{brl(b.paid)}</td>
                  <td className="whitespace-nowrap px-1 py-1.5 text-right">
                    {canManage && b.canReverse && (
                      <button type="button" onClick={() => { setReverseId(reverseId === b.id ? null : b.id); setErr(''); setReason('') }}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:border-red-300 hover:text-red-600">
                        <RotateCcw size={11} />Estornar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reverseId && (() => {
        const b = info.baixas.find((x) => x.id === reverseId)
        if (!b) return null
        return (
          <div className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">Motivo do estorno<RequiredMark className="ml-0.5" /></span>
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
            </label>
            <ErrorLine>{err}</ErrorLine>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReverseId(null)} className="btn-secondary text-xs">Voltar</button>
              <button type="button" disabled={busy} onClick={() => void doReverse(b)} className="btn-primary text-xs">{busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}Estornar {brl(b.paid)}</button>
            </div>
          </div>
        )
      })()}

      {receipt && <BatchReceipt batchId={receipt} onClose={() => setReceipt(null)} />}
    </section>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums text-gray-900', tone)}>{value}</p>
    </div>
  )
}
