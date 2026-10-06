'use client'

// =============================================================================
// Extrato — layout dedicado de impressão/PDF (A4, margens de 10 mm, fonte 9 px,
// linhas densas). Renderizado num portal em <body> e, na impressão, só ele
// aparece (sem menu/topo/barra do app). Cabeçalho com logo e dados da loja;
// cabeçalho da tabela repete em cada página; rodapé fixo em todas as páginas.
// =============================================================================

import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { brl, dateBR } from '@/components/finance/center/dashboard/shared'
import PrintHeader from './PrintHeader'
import PrintFooter, { PRINT_FOOTER_SPACE } from './PrintFooter'

export interface StatementPrintLine {
  key: string; date: string; description: string; category: string | null; costCenter: string | null; counterparty: string | null
  account: string | null; documentNumber: string | null; type: string; amount: number; balance: number; transferGroupId: string | null
}
export interface StatementPrintData {
  account: { id: string; name: string }
  from: string; to: string
  openingBalance: number; closingBalance: number; totalIn: number; totalOut: number
  lines: StatementPrintLine[]
}

const CSS = `
#fin-print-root { display: none; }
@media print {
  body > *:not(#fin-print-root) { display: none !important; }
  #fin-print-root { display: block !important; color: #111827; font-size: 9px; line-height: 1.25; }
  #fin-print-root table.st { width: 100%; table-layout: fixed; border-collapse: collapse; }
  #fin-print-root table.st thead { display: table-header-group; }
  #fin-print-root table.st tfoot.sp { display: table-footer-group; }
  #fin-print-root table.st tr { break-inside: avoid; page-break-inside: avoid; }
  #fin-print-root table.st th { font-size: 7.5px; text-transform: uppercase; letter-spacing: .02em; color: #4b5563; font-weight: 600; background: #f3f4f6; border-bottom: 1px solid #9ca3af; padding: 2px 3px; text-align: left; }
  #fin-print-root table.st td { padding: 1.5px 3px; border-bottom: 0.5px solid #e5e7eb; vertical-align: top; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #fin-print-root table.st .r { text-align: right; font-variant-numeric: tabular-nums; }
  #fin-print-root table.st tr.hl td { background: #f9fafb; font-weight: 600; }
}
`

const noopSubscribe = () => () => {}
const money = (v: number) => brl(v).replace(/ /g, ' ')

export default function StatementPrint({ data, consolidated }: { data: StatementPrintData | null; consolidated: boolean }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  if (!mounted || !data) return null

  const kind = consolidated ? 'Consolidado' : data.account.name
  const cols: { h: string; w: string; r?: boolean }[] = [
    { h: 'Data', w: '8.5%' },
    { h: 'Descrição', w: consolidated ? '21.5%' : '26.5%' },
    { h: 'Categoria', w: '13%' },
    { h: 'Contraparte', w: consolidated ? '13%' : '15%' },
    ...(consolidated ? [{ h: 'Conta', w: '9%' }] : []),
    { h: 'Documento', w: '7%' },
    { h: 'Entrada', w: '10%', r: true },
    { h: 'Saída', w: '10%', r: true },
    { h: 'Saldo', w: '10%', r: true },
  ]
  const span = cols.length

  return createPortal(
    <div id="fin-print-root">
      <style>{CSS}</style>
      <PrintHeader title={`Extrato — ${kind}`} subtitle={`Período: ${dateBR(data.from)} a ${dateBR(data.to)}`} />

      <div className="mb-1.5 mt-1.5 flex gap-4 text-[9px]">
        <span>Saldo inicial: <b>{money(data.openingBalance)}</b></span>
        <span>Entradas: <b className="text-teal-800">{money(data.totalIn)}</b></span>
        <span>Saídas: <b className="text-orange-800">{money(data.totalOut)}</b></span>
        <span>Saldo final: <b className={data.closingBalance < 0 ? 'text-red-700' : ''}>{money(data.closingBalance)}</b></span>
        <span className="ml-auto text-gray-500">{data.lines.length} lançamento(s)</span>
      </div>

      <table className="st">
        <colgroup>{cols.map((c) => <col key={c.h} style={{ width: c.w }} />)}</colgroup>
        <thead>
          <tr>{cols.map((c) => <th key={c.h} className={c.r ? 'r' : undefined}>{c.h}</th>)}</tr>
        </thead>
        <tfoot className="sp" aria-hidden="true"><tr><td colSpan={span} style={{ border: 0, padding: 0 }}><div style={{ height: PRINT_FOOTER_SPACE }} /></td></tr></tfoot>
        <tbody>
          <tr className="hl">
            <td>{dateBR(data.from)}</td>
            <td colSpan={span - 2}>Saldo anterior</td>
            <td className="r">{money(data.openingBalance)}</td>
          </tr>
          {data.lines.length === 0 && (
            <tr><td colSpan={span} style={{ textAlign: 'center', color: '#6b7280', padding: '6px' }}>Sem movimentação no período.</td></tr>
          )}
          {data.lines.map((l) => {
            const desc = l.transferGroupId ? `${l.description} (transferência)` : l.description
            return (
              <tr key={l.key}>
                <td>{dateBR(l.date)}</td>
                <td title={desc}>{desc}</td>
                <td title={l.category ?? undefined}>{l.category ?? '—'}</td>
                <td title={l.counterparty ?? undefined}>{l.counterparty ?? '—'}</td>
                {consolidated && <td title={l.account ?? undefined}>{l.account ?? '—'}</td>}
                <td>{l.documentNumber ?? ''}</td>
                <td className="r" style={{ color: '#0f766e' }}>{l.amount >= 0 ? money(l.amount) : ''}</td>
                <td className="r" style={{ color: '#c2410c' }}>{l.amount < 0 ? money(-l.amount) : ''}</td>
                <td className="r" style={l.balance < 0 ? { color: '#b91c1c' } : undefined}>{money(l.balance)}</td>
              </tr>
            )
          })}
          <tr className="hl">
            <td>{dateBR(data.to)}</td>
            <td colSpan={span - 4}>Saldo final</td>
            <td className="r" style={{ color: '#0f766e' }}>{money(data.totalIn)}</td>
            <td className="r" style={{ color: '#c2410c' }}>{money(data.totalOut)}</td>
            <td className="r">{money(data.closingBalance)}</td>
          </tr>
        </tbody>
      </table>

      <PrintFooter label={`Extrato ${kind}`} />
    </div>,
    document.body,
  )
}
