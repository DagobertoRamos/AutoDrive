'use client'

// =============================================================================
// RankingTable — Tabela de ranking reutilizável (geral/unidade/desempenho).
// Busca /api/ranking por período + unidade e renderiza a tabela com métricas,
// qualidade e pontos. O escopo (geral vs unidade) é decidido no backend.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RankingMetrics {
  sales: number; purchases: number; returns: number; documentations: number
  warranties: number; services: number; overduePendencies: number
  canceledSales: number; lateDocuments: number
}
export interface RankingEntry {
  userId: string; name: string; unitId: string | null; rank: number
  metrics: RankingMetrics; totalPoints: number; qualityScore: number
  /** Pontos da fila de atendimento (qualidade), já somados em totalPoints. */
  queuePoints?: number
}
interface RankingData {
  scope: 'GENERAL' | 'UNIT'
  entries: RankingEntry[]
  notes: string[]
}

const COLS: { key: keyof RankingMetrics; label: string }[] = [
  { key: 'sales', label: 'Vendas' },
  { key: 'purchases', label: 'Compras' },
  { key: 'returns', label: 'Retornos' },
  { key: 'documentations', label: 'Doc.' },
  { key: 'warranties', label: 'Garantias' },
  { key: 'services', label: 'Serviços' },
  { key: 'overduePendencies', label: 'Venc.' },
]

interface Props {
  period: string
  unitId?: string
  highlightUserId?: string
  /** Sinal externo para recarregar (ex.: botão Atualizar da página). */
  reloadKey?: number
}

export function RankingTable({ period, unitId = '', highlightUserId, reloadKey = 0 }: Props) {
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ period })
      if (unitId) qs.set('unitId', unitId)
      const res = await fetch(`/api/ranking?${qs.toString()}`, { credentials: 'include' })
      setData(res.ok ? (await res.json())?.data ?? null : null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period, unitId])

  useEffect(() => { load() }, [load, reloadKey])

  return (
    <>
      <div className="card">
        <div className="section-header">
          <Trophy size={16} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-800">
            {data?.scope === 'UNIT' ? 'Ranking da Unidade' : 'Ranking Geral'}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Vendedor</th>
                {COLS.map((c) => <th key={c.key} className="px-3 py-3 text-right">{c.label}</th>)}
                <th className="px-3 py-3 text-right">Qualidade</th>
                <th className="px-3 py-3 text-right" title="Pontuação de qualidade da fila de atendimento (somada nos pontos)">Fila</th>
                <th className="px-4 py-3 text-right">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 12 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : !data || data.entries.length === 0 ? (
                <tr><td colSpan={12} className="py-12 text-center text-sm text-gray-400">Sem dados de ranking no período.</td></tr>
              ) : (
                data.entries.map((e) => (
                  <tr key={e.userId} className={cn('border-b border-gray-100 hover:bg-gray-50', e.userId === highlightUserId && 'bg-brand-50/40')}>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                        e.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500')}>
                        {e.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {e.name}{e.userId === highlightUserId && <span className="ml-1 text-xs text-brand-600">(você)</span>}
                    </td>
                    {COLS.map((c) => (
                      <td key={c.key} className={cn('px-3 py-3 text-right tabular-nums',
                        c.key === 'overduePendencies' && e.metrics[c.key] > 0 ? 'text-red-600' : 'text-gray-600')}>
                        {e.metrics[c.key]}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right tabular-nums text-gray-600">{e.qualityScore}%</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-600">{e.queuePoints ?? 0}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-brand-700">{e.totalPoints}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data?.notes && data.notes.length > 0 && (
        <p className="text-xs text-gray-400">Observações: {data.notes.join(' · ')}</p>
      )}
    </>
  )
}
