'use client'

// =============================================================================
// Desempenho — Dashboard de gestão (gerente/admin)
// Metas agregadas (loja/unidade) + ranking da equipe (componente RankingTable).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { RefreshCw, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GoalCard, type GoalCardData } from '@/components/goals/GoalCard'
import { RankingTable } from '@/components/ranking/RankingTable'

const PERIODS = [
  { value: 'DAILY', label: 'Diário' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'YEARLY', label: 'Anual' },
]
const MANAGER_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

export default function DesempenhoPage() {
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const myId = session?.user?.id
  const isManager = role ? MANAGER_ROLES.includes(role) : false

  const [period, setPeriod] = useState('MONTHLY')
  const [unitId, setUnitId] = useState('')
  const [units, setUnits] = useState<{ value: string; label: string }[]>([])
  const [goals, setGoals] = useState<GoalCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!isManager) return
    fetch('/api/units', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setUnits((j?.data ?? []).map((u: { id: string; name: string }) => ({ value: u.id, label: u.name }))))
      .catch(() => {})
  }, [isManager])

  const loadGoals = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/goals/me', { credentials: 'include' })
      const gl = res.ok ? (await res.json())?.data ?? [] : []
      // Painel de gestão: metas agregadas (loja/unidade), não as individuais.
      setGoals(gl.filter((it: GoalCardData) => it.goal.scope === 'TENANT' || it.goal.scope === 'UNIT'))
    } catch {
      setGoals([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGoals() }, [loadGoals])

  const refresh = () => { setReloadKey((k) => k + 1); loadGoals() }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Desempenho</h1>
          <p className="mt-1 text-sm text-gray-500">Ranking da equipe e metas agregadas por período.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={15} className="text-gray-400" />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {isManager && (
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Todas as unidades</option>
              {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          )}
          <button onClick={refresh} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar
          </button>
        </div>
      </div>

      {goals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((item) => <GoalCard key={item.goal.id} data={item} />)}
        </div>
      )}

      <RankingTable period={period} unitId={unitId} highlightUserId={myId} reloadKey={reloadKey} />
    </div>
  )
}
