'use client'

// =============================================================================
// Ranking Geral — AutoDrive
// Ranking do tenant (escopo decidido no backend: gestores veem geral; vendedor
// é restrito à própria unidade). Reusa o componente RankingTable.
// =============================================================================

import { useState } from 'react'
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

export default function RankingGeralPage() {
  const { data: session } = useSession()
  const [period, setPeriod] = useState('MONTHLY')
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ranking Geral</h1>
          <p className="mt-1 text-sm text-gray-500">Classificação dos vendedores por desempenho e qualidade de venda.</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-gray-400" />
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button onClick={() => setReloadKey((k) => k + 1)} className="btn-secondary text-xs">
            <RefreshCw size={13} />Atualizar
          </button>
        </div>
      </div>

      <RankingTable period={period} highlightUserId={session?.user?.id} reloadKey={reloadKey} />
    </div>
  )
}
