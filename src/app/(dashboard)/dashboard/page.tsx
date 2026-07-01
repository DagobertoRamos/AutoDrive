'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DashboardRouter } from '@/components/dashboard/DashboardRouter'
import type { DashboardSummary } from '@/lib/dashboard/types'

function greetingFromHour(hour: number): string {
  if (hour >= 6 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const firstName = session?.user?.name?.split(' ')[0] ?? 'usuário'
  const [greeting, setGreeting] = useState('Olá')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let active = true
    const apply = (hour: number) => { if (active) setGreeting(greetingFromHour(hour)) }
    apply(new Date().getHours())
    fetch('/api/me/modules', { method: 'GET', cache: 'no-store', credentials: 'include' })
      .then((res) => {
        const serverDate = res.headers.get('date')
        if (serverDate) apply(new Date(serverDate).getHours())
      })
      .catch(() => {})
    const interval = setInterval(() => apply(new Date().getHours()), 60000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const loadSummary = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/dashboard/summary', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error ?? 'Erro ao carregar dashboard')
      setSummary(json.data)
      setState('ready')
    } catch {
      setState('error')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  if (state === 'loading') {
    return (
      <div className="max-w-screen-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
            <div className="mt-3 h-7 w-64 animate-pulse rounded bg-gray-100" />
            <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded bg-gray-100" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-lg bg-gray-100" />)}
        </div>
      </div>
    )
  }

  if (state === 'error' || !summary) {
    return (
      <div className="max-w-screen-md">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-red-800">Não foi possível carregar o dashboard.</h1>
              <p className="mt-1 text-xs text-red-600">
                A tela permaneceu protegida e nenhum dado bruto foi exibido. Tente atualizar novamente.
              </p>
              <button type="button" onClick={loadSummary} disabled={refreshing} className="btn-secondary mt-4 text-xs">
                <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <DashboardRouter
      summary={summary}
      firstName={firstName}
      greeting={greeting}
      refreshing={refreshing}
      onRefresh={loadSummary}
    />
  )
}
