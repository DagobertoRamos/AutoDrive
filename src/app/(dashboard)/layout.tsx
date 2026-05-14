'use client'

// =============================================================================
// Dashboard Layout — AutoDrive
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

export default function DashboardLayout({
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
    // Redundância client-side: o middleware já redireciona, mas garantimos
    // que o layout nunca renderiza o dashboard para quem precisa trocar a senha.
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
      {/* Sidebar é static no desktop (participa do flex-flow) e fixed no mobile (overlay) */}
      <Sidebar />
      {/* min-w-0 evita que flex-1 ultrapasse o viewport quando o conteúdo for largo */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ImpersonationBanner />
        <SystemBannerBar />
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <NotificationToastContainer />
    </div>
    </>
  )
}
