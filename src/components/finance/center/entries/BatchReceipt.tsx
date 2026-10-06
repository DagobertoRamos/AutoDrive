'use client'

// =============================================================================
// Comprovante do lote de baixas — prévia na tela + layout de impressão/PDF
// (portal em <body>; na impressão só ele aparece). Cabeçalho/rodapé da loja
// reaproveitados das impressões do financeiro.
// GET /api/finance/center/settlements/batch/[id]
// =============================================================================

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { principalOf } from '@/lib/finance/settlement-core'
import PrintHeader from '@/components/finance/center/print/PrintHeader'
import PrintFooter, { PrintFrame } from '@/components/finance/center/print/PrintFooter'
import { ErrorLine, Modal, brl, dt } from './ui'

interface BatchEntry {
  id: string; description: string; amount: number; interestAmount: number | null; discountAmount: number | null
  counterparty: string | null; documentNumber: string | null; dueDate: string | null; partial: boolean
}
interface BatchData {
  id: string; type: 'RECEITA' | 'DESPESA'; paidDate: string; account: string | null; paymentMethod: string | null
  description: string | null; total: number; count: number; reversedAt: string | null; createdAt: string
  entries: BatchEntry[]
}

const CSS = `
#fin-batch-print-root { display: none; }
@media print {
  body > *:not(#fin-batch-print-root) { display: none !important; }
  #fin-batch-print-root { display: block !important; color: #111827; font-size: 9px; line-height: 1.3; }
  #fin-batch-print-root table.bt { width: 100%; border-collapse: collapse; }
  #fin-batch-print-root table.bt thead { display: table-header-group; }
  #fin-batch-print-root table.bt tr { break-inside: avoid; page-break-inside: avoid; }
  #fin-batch-print-root table.bt th { font-size: 7.5px; text-transform: uppercase; color: #4b5563; font-weight: 600; background: #f3f4f6; border-bottom: 1px solid #9ca3af; padding: 2px 3px; text-align: left; }
  #fin-batch-print-root table.bt td { padding: 2px 3px; border-bottom: 0.5px solid #e5e7eb; vertical-align: top; }
  #fin-batch-print-root table.bt tfoot td { font-weight: 700; border-top: 1px solid #9ca3af; border-bottom: 0; }
  #fin-batch-print-root .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
}
`

const noopSubscribe = () => () => {}
const shortId = (id: string) => id.slice(-8).toUpperCase()

function totals(entries: BatchEntry[]) {
  return entries.reduce((s, e) => {
    s.principal += principalOf(e); s.interest += e.interestAmount ?? 0; s.discount += e.discountAmount ?? 0; s.paid += e.amount
    return s
  }, { principal: 0, interest: 0, discount: 0, paid: 0 })
}

function ReceiptTable({ data, print }: { data: BatchData; print?: boolean }) {
  const t = totals(data.entries)
  const th = print ? '' : 'whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500'
  const td = print ? '' : 'px-2 py-1.5 align-top'
  const r = print ? 'r' : 'text-right tabular-nums whitespace-nowrap'
  return (
    <table className={print ? 'bt' : 'min-w-full divide-y divide-gray-200 text-xs'}>
      <thead className={print ? undefined : 'bg-gray-50'}>
        <tr>
          <th className={th}>Descrição</th>
          <th className={th}>{data.type === 'DESPESA' ? 'Fornecedor' : 'Cliente'}</th>
          <th className={th}>Doc.</th>
          <th className={th}>Venc.</th>
          <th className={th}>Baixa</th>
          <th className={cn(th, r)}>Principal</th>
          <th className={cn(th, r)}>Juros</th>
          <th className={cn(th, r)}>Desconto</th>
          <th className={cn(th, r)}>Pago</th>
        </tr>
      </thead>
      <tbody className={print ? undefined : 'divide-y divide-gray-100'}>
        {data.entries.map((e) => (
          <tr key={e.id}>
            <td className={td}>{e.description}</td>
            <td className={td}>{e.counterparty ?? '—'}</td>
            <td className={td}>{e.documentNumber ?? '—'}</td>
            <td className={cn(td, 'whitespace-nowrap')}>{dt(e.dueDate)}</td>
            <td className={td}>{e.partial ? 'Parcial' : 'Total'}</td>
            <td className={cn(td, r)}>{brl(principalOf(e))}</td>
            <td className={cn(td, r)}>{e.interestAmount ? brl(e.interestAmount) : '—'}</td>
            <td className={cn(td, r)}>{e.discountAmount ? brl(e.discountAmount) : '—'}</td>
            <td className={cn(td, r, !print && 'font-semibold')}>{brl(e.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className={print ? undefined : 'bg-gray-50 font-semibold'}>
        <tr>
          <td className={td} colSpan={5}>Total ({data.entries.length})</td>
          <td className={cn(td, r)}>{brl(t.principal)}</td>
          <td className={cn(td, r)}>{brl(t.interest)}</td>
          <td className={cn(td, r)}>{brl(t.discount)}</td>
          <td className={cn(td, r)}>{brl(t.paid)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

function infoRows(d: BatchData): Array<[string, string]> {
  return [
    ['Lote', shortId(d.id)],
    ['Tipo', d.type === 'DESPESA' ? 'Pagamentos' : 'Recebimentos'],
    ['Data da baixa', dt(d.paidDate)],
    ['Conta', d.account ?? '—'],
    ['Forma', d.paymentMethod ?? '—'],
    ...(d.description ? [['Descrição', d.description] as [string, string]] : []),
    ...(d.reversedAt ? [['Situação', `Estornado em ${dt(d.reversedAt)}`] as [string, string]] : []),
  ]
}

function PrintView({ data }: { data: BatchData }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  if (!mounted) return null
  const title = `Comprovante de ${data.type === 'DESPESA' ? 'pagamento' : 'recebimento'} em lote`
  return createPortal(
    <div id="fin-batch-print-root">
      <style>{CSS}</style>
      <PrintFrame>
        <PrintHeader title={title} subtitle={`Lote ${shortId(data.id)} · ${dt(data.paidDate)}`} />
        {data.reversedAt && <p className="mt-1.5 text-[10px] font-bold uppercase text-red-700">Lote estornado em {dt(data.reversedAt)}</p>}
        <div className="my-2 grid grid-cols-3 gap-x-4 gap-y-0.5 text-[9px]">
          {infoRows(data).map(([k, v]) => <p key={k}><span className="text-gray-500">{k}:</span> <b>{v}</b></p>)}
        </div>
        <ReceiptTable data={data} print />
        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[8.5px] text-gray-600">
          <div className="border-t border-gray-500 pt-1">Responsável</div>
          <div className="border-t border-gray-500 pt-1">Conferido por</div>
        </div>
      </PrintFrame>
      <PrintFooter label={`${title} · lote ${shortId(data.id)}`} />
    </div>,
    document.body,
  )
}

export function BatchReceipt({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const [data, setData] = useState<BatchData | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    void fetch(`/api/finance/center/settlements/batch/${batchId}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json()).catch(() => null)
      .then((j) => { if (!alive) return; if (j?.success) setData(j.data); else setErr(j?.error ?? 'Não foi possível abrir o lote.') })
    return () => { alive = false }
  }, [batchId])

  return (
    <Modal wide title="Comprovante do lote" onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Fechar</button>
        <button type="button" onClick={() => window.print()} disabled={!data} className="btn-primary text-sm"><Printer size={15} />Imprimir / PDF</button>
      </>
    }>
      {!data && !err && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" /></div>}
      <ErrorLine>{err}</ErrorLine>
      {data && (
        <div className="space-y-3">
          {data.reversedAt && <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">Lote estornado em {dt(data.reversedAt)}</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
            {infoRows(data).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-[10px] uppercase tracking-wide text-gray-500">{k}</dt><dd className="truncate font-medium text-gray-900">{v}</dd></div>
            ))}
          </dl>
          <div className="overflow-x-auto rounded-lg border border-gray-200"><ReceiptTable data={data} /></div>
          <PrintView data={data} />
        </div>
      )}
    </Modal>
  )
}
