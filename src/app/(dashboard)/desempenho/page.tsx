'use client'

// =============================================================================
// Desempenho — Dashboard de gestão (gerente/admin)
// Ranking por vendedor com métricas e qualidade + metas agregadas da loja/unidade.
// Consome /api/ranking e /api/goals/me. RBAC e escopo são aplicados no backend.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Trophy, RefreshCw, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GoalCard, type GoalCardData } from '@/components/goals/GoalCard'

interface RankingMetrics {
  sales: number; purchases: number; returns: number; documentations: number
  warranties: number; services: number; overduePendencies: number
  canceledSales: number; lateDocuments: number
}
interface RankingEntry {
  userId: string; name: string; unitId: string | null; rank: number
  metrics: RankingMetrics; totalPoints: number; qualityScore: number
}
interface RankingData {
  scope: 'GENERAL' | 'UNIT'
  window: { start: string; end: string }
  entries: RankingEntry[]
  notes: string[]
}

const PERIODS = [
  { value: 'DAILY', label: 'Diário' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'YEARLY', label: 'Anual' },
]

const MANAGER_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE']

const COLS: { key: keyof RankingMetrics; label: string }[] = [
  { key: 'sales', label: 'Vendas' },
  { key: 'purchases', label: 'Compras' },
  { key: 'returns', label: 'Retornos' },
  { key: 'documentations', label: 'Doc.' },
  { key: 'warranties', label: 'Garantias' },
  { key: 'services', label: 'Serviços' },
  { key: 'overduePendencies', label: 'Venc.' },
]

export default function DesempenhoPage() {
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const myId = session?.user?.id
  const isManager = role ? MANAGER_ROLES.includes(role) : false

  const [period, setPeriod] = useState('MONTHLY')
  const [unitId, setUnitId] = useState('')
  const [units, setUnits] = useState<{ value: string; label: string }[]>([])
  const [ranking, setRanking] = useState<RankingData | null>(null)
  const [goals, setGoals] = useState<GoalCardData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isManager) return
    fetch('/api/units', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setUnits((j?.data ?? []).map((u: { id: string; name: string }) => ({ value: u.id, label: u.name }))))
      .catch(() => {})
  }, [isManager])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ period })
      if (unitId) qs.set('unitId', unitId)
      const [rkRes, glRes] = await Promise.all([
        fetch(`/api/ranking?${qs.toString()}`, { credentials: 'include' }),
        fetch('/api/goals/me', { credentials: 'include' }),
      ])
      setRanking(rkRes.ok ? (await rkRes.json())?.data ?? null : null)
      const gl = glRes.ok ? (await glRes.json())?.data ?? [] : []
      // Painel de gestão: metas agregadas (loja/unidade), não as individuais.
      setGoals(gl.filter((it: GoalCardData) => it.goal.scope === 'TENANT' || it.goal.scope === 'UNIT'))
    } catch {
      setRanking(null); setGoals([])
    } finally {
      setLoading(false)
    }
  }, [period, unitId])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Desempenho</h1>
          <p className="mt-1 text-sm text-gray-500">Ranking da equipe e metas agregadas por período.</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-gray-400" />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {isManager && (
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todas as unidades</option>
              {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          )}
          <button onClick={load} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Metas agregadas (loja/unidade) */}
      {goals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((item) => <GoalCard key={item.goal.id} data={item} />)}
        </div>
      )}

      {/* Ranking */}
      <div className="card">
        <div className="section-header">
          <Trophy size={16} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-800">
            {ranking?.scope === 'UNIT' ? 'Ranking da Unidade' : 'Ranking Geral'}
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
                <th className="px-4 py-3 text-right">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : !ranking || ranking.entries.length === 0 ? (
                <tr><td colSpan={11} className="py-12 text-center text-sm text-gray-400">Sem dados de ranking no período.</td></tr>
              ) : (
                ranking.entries.map((e) => (
                  <tr key={e.userId} className={cn('border-b border-gray-100 hover:bg-gray-50', e.userId === myId && 'bg-brand-50/40')}>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                        e.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500')}>
                        {e.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {e.name}{e.userId === myId && <span className="ml-1 text-xs text-brand-600">(você)</span>}
                    </td>
                    {COLS.map((c) => (
                      <td key={c.key} className={cn('px-3 py-3 text-right tabular-nums',
                        c.key === 'overduePendencies' && e.metrics[c.key] > 0 ? 'text-red-600' : 'text-gray-600')}>
                        {e.metrics[c.key]}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right tabular-nums text-gray-600">{e.qualityScore}%</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-brand-700">{e.totalPoints}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ranking?.notes && ranking.notes.length > 0 && (
        <p className="text-xs text-gray-400">
          Observações: {ranking.notes.join(' · ')}
        </p>
      )}
    </div>
  )
}
