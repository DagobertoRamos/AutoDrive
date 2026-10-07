'use client'

// Desempenho por banco (histórico da loja): aprovação, resposta, pagamento e
// retorno. A sugestão é só recomendação — a decisão de crédito é do banco.

import { useEffect, useState } from 'react'
import { HelpHint } from '@/components/ui/help-hint'
import { api, pct } from './ui'

interface Row { bankId: string; bankName: string; sent: number; decided: number; approvalRate: number | null; avgResponseMinutes: number | null; avgPaymentDays: number | null; avgReturnPercent?: number | null }

export function BankPerformance({ from, to }: { from?: string; to?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const q = [from ? `from=${from}` : '', to ? `to=${to}` : ''].filter(Boolean).join('&')
    api<Row[]>(`/api/financing/performance${q ? `?${q}` : ''}`).then((r) => {
      if (!r.ok) { setError(r.error); return }
      setRows(r.data ?? []); setSuggestion((r.json?.suggestion as string | null) ?? null)
    })
  }, [from, to])
  const showReturn = !!rows?.some((r) => r.avgReturnPercent !== undefined)
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <h2 className="flex items-center gap-1 border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Desempenho por banco<HelpHint term="HISTORICO_APROVACAO" size={12} /></h2>
      <div className="p-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {suggestion && <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{suggestion}</p>}
        {rows && rows.length === 0 && <p className="text-sm text-gray-500">Sem propostas no período.</p>}
        {rows && rows.length > 0 && (
          <div className="-mx-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-gray-500"><tr><th className="px-4 py-2 font-medium">Banco</th><th className="px-4 py-2 text-right font-medium">Propostas</th><th className="px-4 py-2 text-right font-medium">Aprovação</th><th className="px-4 py-2 text-right font-medium">Resposta média</th><th className="px-4 py-2 text-right font-medium">Pagamento médio</th>{showReturn && <th className="px-4 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Retorno médio<HelpHint term="RETORNO_PREVISTO" size={11} /></span></th>}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.bankId}>
                    <td className="px-4 py-2 font-medium text-gray-900">{r.bankName}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.sent}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.approvalRate == null ? '—' : pct(r.approvalRate, 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.avgResponseMinutes == null ? '—' : r.avgResponseMinutes < 120 ? `${r.avgResponseMinutes} min` : `${Math.round(r.avgResponseMinutes / 60)} h`}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.avgPaymentDays == null ? '—' : `${r.avgPaymentDays.toLocaleString('pt-BR')} dia${r.avgPaymentDays === 1 ? '' : 's'}`}</td>
                    {showReturn && <td className="px-4 py-2 text-right tabular-nums">{pct(r.avgReturnPercent ?? null)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
