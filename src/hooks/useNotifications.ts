// =============================================================================
// useNotifications — AutoDrive
// Hook de polling de notificações via React Query.
//
// Comportamento profissional (SaaS): a PRIMEIRA carga (login/reload) apenas
// popula a central/sino EM SILÊNCIO — sem balões. Toast (balão) só aparece para
// notificações genuinamente NOVAS que chegam durante a sessão (polls seguintes).
// Antes, como o estado começa vazio a cada login, toda não-lida virava balão →
// "tempestade de balões" a cada login. Corrigido com seed silencioso + set de
// ids já vistos por sessão.
// =============================================================================

import { useEffect, useRef } from 'react'
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
  const { setNotifications, addToast } = useNotificationStore()

  // Estado por sessão (não toasta o que já existia / já foi visto).
  const seededRef = useRef(false)
  const seenIdsRef = useRef<Set<string>>(new Set())

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

    if (!seededRef.current) {
      // 1ª carga da sessão: popula em silêncio (sem balões).
      seededRef.current = true
      seenIdsRef.current = new Set(data.map((n) => n.id))
      setNotifications(data)
      return
    }

    // Polls seguintes: balão só para o que é NOVO e não-lido.
    const fresh = data.filter((n) => !seenIdsRef.current.has(n.id) && !n.read)
    fresh.forEach((n) => {
      addToast({
        type:     n.type,
        title:    n.title,
        message:  n.message,
        href:     n.actionUrl,
        duration: 8000,
      })
    })
    data.forEach((n) => seenIdsRef.current.add(n.id))

    setNotifications(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  return { isLoading, isError, refetch }
}
