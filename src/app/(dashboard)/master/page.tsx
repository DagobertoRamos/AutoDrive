'use client'

// =============================================================================
// /master — Painel de Controle Master SaaS (MASTER only)
// Dashboard completo com métricas globais da plataforma e saúde do sistema
// =============================================================================

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { MasterDashboard } from '@/components/dashboard/MasterDashboard'

export default function MasterPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  if (session?.user?.role !== 'MASTER') {
    return null
  }

  const firstName = session?.user?.name?.split(' ')[0] ?? 'Master'

  return <MasterDashboard firstName={firstName} greeting="Painel Master" />
}
