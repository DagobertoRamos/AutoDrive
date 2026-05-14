'use client'

// =============================================================================
// NotificationCenter — painel de notificações
// =============================================================================

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Bell, CheckCheck, MessageSquare, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react'
import { useNotificationStore } from '@/store/notification.store'
import { cn } from '@/lib/utils'
import type { NotificationType } from '@/types'
import { formatRelativeTime } from '@/lib/utils'

const ICONS: Partial<Record<NotificationType, React.ElementType>> = {
  RESPOSTA: MessageSquare,
  PENDENCIA_RESOLVIDA: CheckCircle2,
  PENDENCIA_NAO_RESOLVIDA: XCircle,
  NOVA_PENDENCIA: AlertTriangle,
  ERRO_ENVIO: XCircle,
  PENDENCIA_CRITICA: AlertTriangle,
  ESCALONAMENTO: AlertTriangle,
  INFO: Info,
}

const BG: Partial<Record<NotificationType, string>> = {
  RESPOSTA: 'bg-blue-100 text-blue-600',
  PENDENCIA_RESOLVIDA: 'bg-green-100 text-green-600',
  PENDENCIA_NAO_RESOLVIDA: 'bg-orange-100 text-orange-600',
  NOVA_PENDENCIA: 'bg-yellow-100 text-yellow-600',
  ERRO_ENVIO: 'bg-red-100 text-red-600',
  PENDENCIA_CRITICA: 'bg-red-100 text-red-700',
  ESCALONAMENTO: 'bg-purple-100 text-purple-600',
  INFO: 'bg-gray-100 text-gray-600',
}

interface NotificationCenterProps {
  onClose: () => void
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const router = useRouter()
  const { notifications, unreadCount, markAsRead, markAllAsRead, fetchNotifications } = useNotificationStore()

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleClick = (id: string, actionUrl?: string | null) => {
    markAsRead(id)
    if (actionUrl) {
      router.push(actionUrl)
      onClose()
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-14 z-50 flex h-[calc(100vh-3.5rem)] w-96 flex-col border-l border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-brand-700" />
            <span className="font-semibold text-gray-800">Notificações</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                title="Marcar todas como lidas"
                className="rounded p-1.5 text-xs text-gray-500 hover:bg-gray-100 flex items-center gap-1"
              >
                <CheckCheck size={15} />
              </button>
            )}
            <button onClick={onClose} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
              <Bell size={40} strokeWidth={1} />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            notifications.map(n => {
              const Icon = ICONS[n.type as NotificationType] ?? Info
              const bgClass = BG[n.type as NotificationType] ?? 'bg-gray-100 text-gray-600'
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n.id, n.actionUrl)}
                  className={cn(
                    'flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 transition-colors',
                    !n.read && 'bg-blue-50/50'
                  )}
                >
                  <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', bgClass)}>
                    <Icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-sm leading-snug', !n.read ? 'font-semibold text-gray-800' : 'text-gray-700')}>
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {formatRelativeTime(new Date(n.createdAt))}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
