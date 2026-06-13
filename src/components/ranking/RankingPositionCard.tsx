'use client'

// =============================================================================
// RankingPositionCard — Mostra a posição do usuário logado no ranking
// (/api/ranking). Esconde-se silenciosamente se o usuário não estiver no ranking.
// =============================================================================

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Trophy, Medal } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RankingEntry {
  userId:       string
  name:         string
  rank:         number
  totalPoints:  number
  qualityScore: number
}

interface RankingData {
  scope:   'GENERAL' | 'UNIT'
  entries: RankingEntry[]
}

export function RankingPositionCard() {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const [data, setData] = useState<RankingData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/ranking', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (active) { setData(j?.data ?? null); setLoaded(true) } })
      .catch(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [])

  if (!loaded || !data) return null

  const me = data.entries.find((e) => e.userId === userId)
  if (!me) return null

  const total = data.entries.length
  const podium = me.rank <= 3

  return (
    <div className="card">
      <div className="section-header">
        <Trophy size={16} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-gray-800">
          {data.scope === 'UNIT' ? 'Ranking da Unidade' : 'Ranking Geral'}
        </h2>
      </div>
      <div className="flex items-center gap-4 p-5">
        <div
          className={cn(
            'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl',
            podium ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500',
          )}
        >
          {podium ? <Medal size={20} /> : null}
          <span className="text-xl font-bold tabular-nums leading-none">{me.rank}º</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            Você está em {me.rank}º de {total}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-medium tabular-nums">{me.totalPoints}</span> pontos
            {' · '}
            qualidade <span className="font-medium tabular-nums">{me.qualityScore}%</span>
          </p>
        </div>
      </div>
    </div>
  )
}
