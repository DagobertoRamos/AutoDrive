'use client'

// =============================================================================
// Lotes de baixa (contas a pagar ou a receber): consulta por período, abre o
// comprovante e estorna o lote inteiro (com motivo).
// GET  /api/finance/center/settlements/batch?from&to
// POST /api/finance/center/settlements/batch/[id] { action: 'reverse', reason }
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { FileText, Layers, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WithHint } from '@/components/ui/help-hint'
import { BatchReceipt } from './BatchReceipt'
import { ErrorLine, Field, Modal, brl, dt, inputCls, postJson, todayYmd } from './ui'

interface Batch {
  id: string; type: 'RECEITA' | 'DESPESA'; paidDate: string; accountId: string | null; paymentMethod: string | null
  description: string | null; total: number; count: number; reversedAt: string | null; createdAt: string
}

const monthsAgo = (n: number) => {
  const [y, m] = todayYmd().split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - n, 1))
  return d.toISOString().slice(0, 10)
}

export function BatchesModal({ type, accounts, canManage, onClose, onChanged }: {
  type: 'RECEITA' | 'DESPESA'; accounts: { id: string; name: string }[]; canManage: boolean
  onClose: () => void; onChanged: () => void
}) {
  const [from, setFrom] = useState(() => monthsAgo(2))
  const [to, setTo] = useState(() => todayYmd())
  const [rows, setRows] = useState<Batch[] | null>(null)
  const [err, setErr] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const [reverse, setReverse] = useState<Batch | null>(null)
  const accName = new Map(accounts.map((a) => [a.id, a.name]))

  const load = useCallback(async () => {
    setErr('')
    const qs = new URLSearchParams()
    if (from) qs.set('from', from); if (to) qs.set('to', to)
    const j = await fetch(`/api/finance/center/settlements/batch?${qs}`, { credentials: 'include', cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) setRows((j.data as Batch[]).filter((b) => b.type === type))
    else { setRows([]); setErr(j?.error ?? 'Não foi possível carregar.') }
  }, [from, to, type])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  return (
    <>
      <Modal wide title={<WithHint term="BAIXA_LOTE">Lotes de baixa</WithHint>} onClose={onClose}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:max-w-md">
            <Field label="De"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Até"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <ErrorLine>{err}</ErrorLine>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Data', 'Lote', 'Conta', 'Qtd', 'Total', 'Situação', ''].map((h, i) => (
                    <th key={i} className={cn('whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500', (h === 'Total' || h === 'Qtd') && 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows === null ? (
                  <tr><td colSpan={7} className="py-8 text-center"><Loader2 className="mx-auto animate-spin text-gray-400" /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center"><Layers size={26} className="mx-auto mb-1.5 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum lote no período.</p></td></tr>
                ) : rows.map((b) => (
                  <tr key={b.id} className={cn('hover:bg-gray-50', b.reversedAt && 'text-gray-400')}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{dt(b.paidDate)}</td>
                    <td className="max-w-[220px] px-3 py-2">
                      <p className="truncate text-xs font-medium text-gray-900">{b.description || `Lote ${b.id.slice(-8).toUpperCase()}`}</p>
                      {b.paymentMethod && <p className="text-[11px] text-gray-500">{b.paymentMethod}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{b.accountId ? accName.get(b.accountId) ?? '—' : '—'}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{b.count}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-gray-900">{brl(b.total)}</td>
                    <td className="px-3 py-2">
                      {b.reversedAt
                        ? <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Estornado</span>
                        : <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Baixado</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <button type="button" title="Comprovante" aria-label="Comprovante" onClick={() => setReceipt(b.id)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><FileText size={15} /></button>
                      {canManage && !b.reversedAt && (
                        <button type="button" title="Estornar lote" aria-label="Estornar lote" onClick={() => setReverse(b)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><RotateCcw size={15} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
      {receipt && <BatchReceipt batchId={receipt} onClose={() => setReceipt(null)} />}
      {reverse && (
        <ReverseBatchModal batch={reverse} onClose={() => setReverse(null)}
          onDone={() => { setReverse(null); void load(); onChanged() }} />
      )}
    </>
  )
}

function ReverseBatchModal({ batch, onClose, onDone }: { batch: Batch; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function submit() {
    if (reason.trim().length < 3) { setErr('Informe o motivo.'); return }
    if (!confirm(`Estornar o lote de ${dt(batch.paidDate)} (${batch.count} baixa(s), ${brl(batch.total)})?`)) return
    setBusy(true); setErr('')
    const r = await postJson(`/api/finance/center/settlements/batch/${batch.id}`, { action: 'reverse', reason: reason.trim() }).catch(() => null)
    setBusy(false)
    if (!r) { setErr('Erro de rede.'); return }
    if (!r.ok) { setErr(r.data.error ?? 'Não foi possível estornar.'); return }
    onDone()
  }
  return (
    <Modal title={<WithHint term="ESTORNO">Estornar lote</WithHint>} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Voltar</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}Estornar lote</button>
      </>
    }>
      <div className="space-y-3">
        <p className="text-sm text-gray-700">{batch.description || `Lote ${batch.id.slice(-8).toUpperCase()}`} · {dt(batch.paidDate)} · {batch.count} baixa(s) · <b className="tabular-nums">{brl(batch.total)}</b></p>
        <Field label="Motivo" required><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus /></Field>
        <ErrorLine>{err}</ErrorLine>
      </div>
    </Modal>
  )
}
