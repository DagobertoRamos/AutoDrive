'use client'

// Faixa discreta no topo do estoque: só os indicadores críticos e "Ver relatório".
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Hint } from './ui'

interface Indicators { total: number; renaveOk: number; pending: number; divergent: number; nfePending: number }

export function StockComplianceStrip() {
  const [d, setD] = useState<{ indicators: Indicators; tracking: { renaveTracked: boolean; fiscalTracked: boolean } } | null>(null)
  useEffect(() => {
    fetch('/api/operations/stock-summary', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j?.success && j.data) setD(j.data) }).catch(() => {})
  }, [])
  if (!d || (!d.tracking.renaveTracked && !d.tracking.fiscalTracked)) return null
  const i = d.indicators
  const item = (label: string, value: number, tone: string, hint?: Parameters<typeof Hint>[0]['term']) => (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-base font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">{label}{hint && <Hint term={hint} size={11} />}</span>
    </div>
  )
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {item('veículos', i.total, 'text-gray-900')}
        {d.tracking.renaveTracked && item('RENAVE ok', i.renaveOk, 'text-emerald-700', 'RENAVE')}
        {d.tracking.renaveTracked && i.pending > 0 && item('pendentes', i.pending, 'text-amber-700')}
        {d.tracking.renaveTracked && i.divergent > 0 && item('divergência', i.divergent, 'text-red-700', 'DIVERGENCIA_RENAVE')}
        {d.tracking.fiscalTracked && i.nfePending > 0 && item('NF-e pendente', i.nfePending, 'text-amber-700')}
      </div>
      <Link href="/estoque/conformidade" className="text-sm font-medium text-brand-700 hover:underline">Ver relatório</Link>
    </div>
  )
}
