'use client'

// =============================================================================
// /estoque/conformidade — estoque × RENAVE × fiscal. Lista só o que precisa de
// atenção, com filtro por tipo e atalho para a ficha do veículo.
// =============================================================================

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ISSUE_TEXT, type ReconcileIssue } from '@/lib/automotive/reconcile-core'
import { StockComplianceStrip } from '@/components/operations/StockComplianceStrip'
import { EmptyState, Hint } from '@/components/operations/ui'

interface Row { vehicleId: string; plate: string | null; brand: string | null; model: string | null; stockStatus: string | null; issues: ReconcileIssue[] }

const FILTERS: { key: 'ALL' | ReconcileIssue; label: string }[] = [
  { key: 'ALL', label: 'Tudo' },
  { key: 'RENAVE_EXIT_WITHOUT_SALE', label: 'Divergência' },
  { key: 'RENAVE_STILL_IN_STOCK', label: 'Vendido no RENAVE' },
  { key: 'RENAVE_MISSING_ENTRY', label: 'RENAVE pendente' },
  { key: 'NFE_PENDING', label: 'NF-e pendente' },
]
const SEVERE = new Set<ReconcileIssue>(['RENAVE_EXIT_WITHOUT_SALE', 'RENAVE_STILL_IN_STOCK'])

export default function ConformidadePage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | ReconcileIssue>('ALL')

  useEffect(() => {
    fetch('/api/operations/stock-summary?detail=1', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (!j?.success) return setError(j?.error ?? 'Não foi possível carregar.')
      setRows(j.data?.issues ?? [])
    }).catch(() => setError('Não foi possível carregar.'))
  }, [])

  const list = useMemo(() => {
    const r = (rows ?? []).filter((x) => filter === 'ALL' || x.issues.includes(filter))
    return r.sort((a, b) => Number(b.issues.some((i) => SEVERE.has(i))) - Number(a.issues.some((i) => SEVERE.has(i))))
  }, [rows, filter])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link href="/estoque" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="h-4 w-4" />Estoque</Link>
      </div>
      <h1 className="inline-flex items-center gap-2 text-xl font-bold text-gray-900">Conformidade do estoque<Hint term="DIVERGENCIA_RENAVE" size={14} /></h1>
      <StockComplianceStrip />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full px-3 py-1 text-sm font-medium ${filter === f.key ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'}`}>{f.label}</button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {error ? <p className="p-4 text-sm text-red-700">{error}</p> : rows === null ? (
          <div className="h-32 animate-pulse" />
        ) : list.length === 0 ? (
          <EmptyState text={rows.length === 0 ? 'Estoque em dia com o RENAVE e o fiscal.' : 'Nada neste filtro.'} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr><th className="px-4 py-2.5">Veículo</th><th className="px-4 py-2.5">Pendência</th><th className="px-4 py-2.5 text-right" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((r) => (
                <tr key={r.vehicleId}>
                  <td className="px-4 py-3"><span className="font-medium text-gray-900">{[r.brand, r.model].filter(Boolean).join(' ')}</span> <span className="font-mono text-xs text-gray-500">{r.plate ?? ''}</span></td>
                  <td className="px-4 py-3">
                    {r.issues.map((i) => <span key={i} className={`mr-2 inline-block text-xs font-medium ${SEVERE.has(i) ? 'text-red-700' : 'text-amber-700'}`}>{ISSUE_TEXT[i]}</span>)}
                  </td>
                  <td className="px-4 py-3 text-right"><Link href={`/estoque/${r.vehicleId}`} className="text-sm font-medium text-brand-700 hover:underline">Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
