'use client'

// =============================================================================
// NotificationToastContainer — balões tipo WhatsApp Web no canto inferior direito
// =============================================================================

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, MessageSquare, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react'
import { useNotificationStore } from '@/store/notification.store'
import { cn } from '@/lib/utils'
import type { NotificationType } from '@/types'

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

const COLORS: Partial<Record<NotificationType, string>> = {
  RESPOSTA: 'bg-blue-500',
  PENDENCIA_RESOLVIDA: 'bg-green-500',
  PENDENCIA_NAO_RESOLVIDA: 'bg-orange-500',
  NOVA_PENDENCIA: 'bg-yellow-500',
  ERRO_ENVIO: 'bg-red-500',
  PENDENCIA_CRITICA: 'bg-red-600',
  ESCALONAMENTO: 'bg-purple-500',
  INFO: 'bg-gray-500',
}

const DURATION = 8000

interface ToastItemProps {
  id: string
  title: string
  message: string
  type: NotificationType
  actionUrl?: string
  onClose: (id: string) => void
}

function ToastItem({ id, title, message, type, actionUrl, onClose }: ToastItemProps) {
  const router = useRouter()
  const progressRef = useRef<HTMLDivElement>(null)
  const Icon = ICONS[type] ?? Info
  const color = COLORS[type] ?? 'bg-gray-500'

  useEffect(() => {
    const el = progressRef.current
    if (!el) return
    el.style.transition = `width ${DURATION}ms linear`
    el.style.width = '0%'
    const timer = setTimeout(() => onClose(id), DURATION)
    return () => clearTimeout(timer)
  }, [id, onClose])

  return (
    <div className="relative w-80 overflow-hidden rounded-lg bg-white shadow-xl border border-gray-200 animate-slide-in-right">
      {/* Progress bar */}
      <div
        ref={progressRef}
        className={cn('absolute bottom-0 left-0 h-0.5', color)}
        style={{ width: '100%' }}
      />

      <div className="flex items-start gap-3 p-3">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white', color)}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{title}</p>
          <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{message}</p>
          {actionUrl && (
            <button
              onClick={() => { onClose(id); router.push(actionUrl) }}
              className="mt-1.5 text-xs font-medium text-brand-600 hover:text-brand-800 underline"
            >
              Ver detalhes →
            </button>
          )}
        </div>
        <button
          onClick={() => onClose(id)}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export function NotificationToastContainer() {
  const { toasts, removeToast } = useNotificationStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end">
      {toasts.slice(0, 3).map(toast => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          title={toast.title}
          message={toast.message}
          type={toast.type as NotificationType}
          actionUrl={toast.actionUrl ?? undefined}
          onClose={removeToast}
        />
      ))}
    </div>
  )
}
