'use client'

// =============================================================================
// Dashboard Shell (client) — montado pelo layout server-side de (dashboard).
// Mantemos um wrapper server-component para poder exportar `dynamic = 'force-dynamic'`
// (necessário para evitar prerender de páginas autenticadas e erros de SSG do
// tipo `TypeError: Invalid URL` vindos de bundles client em build estático).
// =============================================================================

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { ThemeInjector } from '@/components/layout/ThemeInjector'
import SystemBannerBar from '@/components/layout/SystemBannerBar'
import { NotificationToastContainer } from '@/components/notifications/NotificationToastContainer'
import { useNotifications } from '@/hooks/useNotifications'
import HelpChatLauncher from '@/components/ai/HelpChatLauncher'
import QueueAlertWatcher from '@/components/seller-queue/QueueAlertWatcher'
import PendencyAckWatcher from '@/components/pendencies/PendencyAckWatcher'
import PendencySlaWatcher from '@/components/pendencies/PendencySlaWatcher'

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: session, status } = useSession()
  const router = useRouter()
  useNotifications()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }
    const user = session?.user as { mustChangePassword?: boolean } | undefined
    if (status === 'authenticated' && user?.mustChangePassword) {
      router.replace('/auth/change-password')
    }
  }, [status, session, router])

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!session) return null

  return (
    <>
      <ThemeInjector />
      <div className="flex h-screen w-full overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ImpersonationBanner />
          <SystemBannerBar />
          <Topbar />
          <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6">{children}</main>
        </div>
        <NotificationToastContainer />
      </div>
      <QueueAlertWatcher />
      <PendencyAckWatcher />
      <PendencySlaWatcher />
      <HelpChatLauncher />
    </>
  )
}
