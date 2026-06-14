'use client'

// =============================================================================
// Ranking da Unidade — AutoDrive
// Gestores escolhem a unidade; vendedor vê a própria (backend força o escopo).
// =============================================================================

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { RefreshCw, Filter } from 'lucide-react'
import { RankingTable } from '@/components/ranking/RankingTable'

const PERIODS = [
  { value: 'DAILY', label: 'Diário' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'YEARLY', label: 'Anual' },
]
const MANAGER_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

export default function RankingUnidadePage() {
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const isManager = role ? MANAGER_ROLES.includes(role) : false

  const [period, setPeriod] = useState('MONTHLY')
  const [unitId, setUnitId] = useState('')
  const [units, setUnits] = useState<{ value: string; label: string }[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!isManager) return
    fetch('/api/units', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        const list = (j?.data ?? []).map((u: { id: string; name: string }) => ({ value: u.id, label: u.name }))
        setUnits(list)
        if (list[0]) setUnitId((cur) => cur || list[0].value)
      })
      .catch(() => {})
  }, [isManager])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ranking da Unidade</h1>
          <p className="mt-1 text-sm text-gray-500">Classificação dos vendedores dentro da unidade.</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-gray-400" />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {isManager && (
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="">Selecione a unidade...</option>
              {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          )}
          <button onClick={() => setReloadKey((k) => k + 1)} className="btn-secondary text-xs">
            <RefreshCw size={13} />Atualizar
          </button>
        </div>
      </div>

      <RankingTable period={period} unitId={unitId} highlightUserId={session?.user?.id} reloadKey={reloadKey} />
    </div>
  )
}
