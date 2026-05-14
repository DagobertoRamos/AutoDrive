// =============================================================================
// useNotifications — AutoDrive
// Hook de polling de notificações via React Query
// =============================================================================

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useNotificationStore } from '@/store/notification.store'
import type { Notification, ApiResponse } from '@/types'

const POLLING_INTERVAL = 30_000 // 30 segundos

async function fetchNotifications(): Promise<Notification[]> {
  const res = await fetch('/api/notifications?perPage=50', { credentials: 'include' })
  if (!res.ok) throw new Error('Falha ao carregar notificações')
  const json: ApiResponse<Notification[]> = await res.json()
  return json.data ?? []
}

export function useNotifications() {
  const { status } = useSession()
  const { setNotifications, addToast, notifications: stored } = useNotificationStore()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey:               ['notifications'],
    queryFn:                fetchNotifications,
    enabled:                status === 'authenticated',
    refetchInterval:        POLLING_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime:              10_000,
  })

  useEffect(() => {
    if (!data) return

    // Detecta novas notificações não lidas e cria toasts
    const storedIds         = new Set(stored.map((n) => n.id))
    const newNotifications  = data.filter((n) => !storedIds.has(n.id) && !n.read)

    newNotifications.forEach((notification) => {
      addToast({
        type:     notification.type,
        title:    notification.title,
        message:  notification.message,
        href:     notification.actionUrl,
        duration: 8000,
      })
    })

    setNotifications(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return { isLoading, isError, refetch }
}
