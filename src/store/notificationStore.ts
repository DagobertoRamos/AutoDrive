// =============================================================================
// Notification Store — AutoDrive  (canonical — única fonte de verdade)
// Zustand + devtools
// =============================================================================

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Notification, NotificationToast } from '@/types'

// ── Interface ─────────────────────────────────────────────────────────────────

interface NotificationState {
  // Notificações da central
  notifications: Notification[]
  unreadCount:   number
  isFetching:    boolean
  fetchError:    string | null

  // Painel lateral
  isCenterOpen: boolean

  // Toasts flutuantes
  toasts: NotificationToast[]

  // ── Toast actions ──────────────────────────────────────────────────────────
  addToast:    (toast: Omit<NotificationToast, 'id' | 'createdAt'>) => void
  dismissToast:(id: string) => void
  removeToast: (id: string) => void   // alias retrocompatível
  clearToasts: () => void

  // ── Notification actions ───────────────────────────────────────────────────
  addNotification:    (notification: Notification) => void
  setNotifications:   (notifications: Notification[]) => void
  markAsRead:         (id: string) => void
  markAllAsRead:      () => void
  removeNotification: (id: string) => void

  // ── Panel actions ──────────────────────────────────────────────────────────
  openCenter:   () => void
  closeCenter:  () => void
  toggleCenter: () => void

  // ── Async ──────────────────────────────────────────────────────────────────
  fetchNotifications: () => Promise<void>
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useNotificationStore = create<NotificationState>()(
  devtools(
    (set, get) => ({
      notifications: [],
      unreadCount:   0,
      isFetching:    false,
      fetchError:    null,
      isCenterOpen:  false,
      toasts:        [],

      // ── Toast ──────────────────────────────────────────────────────────────

      addToast: (toastData) => {
        const toast: NotificationToast = {
          ...toastData,
          id:        crypto.randomUUID(),
          createdAt: new Date(),
          duration:  toastData.duration ?? 6000,
        }
        set(
          (state) => ({ toasts: [...state.toasts, toast].slice(-5) }),
          false,
          'notifications/addToast',
        )
      },

      dismissToast: (id) =>
        set(
          (state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }),
          false,
          'notifications/dismissToast',
        ),

      // Alias for backward compatibility with existing consumers
      removeToast: (id) =>
        set(
          (state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }),
          false,
          'notifications/removeToast',
        ),

      clearToasts: () => set({ toasts: [] }, false, 'notifications/clearToasts'),

      // ── Notifications ──────────────────────────────────────────────────────

      addNotification: (notification) =>
        set(
          (state) => {
            if (state.notifications.some((n) => n.id === notification.id)) return state
            const notifications = [notification, ...state.notifications].slice(0, 100)
            return { notifications, unreadCount: notifications.filter((n) => !n.read).length }
          },
          false,
          'notifications/addNotification',
        ),

      setNotifications: (notifications) =>
        set(
          { notifications, unreadCount: notifications.filter((n) => !n.read).length },
          false,
          'notifications/setNotifications',
        ),

      markAsRead: (id) =>
        set(
          (state) => {
            const notifications = state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n,
            )
            return { notifications, unreadCount: notifications.filter((n) => !n.read).length }
          },
          false,
          'notifications/markAsRead',
        ),

      markAllAsRead: () =>
        set(
          (state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
            unreadCount:   0,
          }),
          false,
          'notifications/markAllAsRead',
        ),

      removeNotification: (id) =>
        set(
          (state) => {
            const notifications = state.notifications.filter((n) => n.id !== id)
            return { notifications, unreadCount: notifications.filter((n) => !n.read).length }
          },
          false,
          'notifications/removeNotification',
        ),

      // ── Panel ──────────────────────────────────────────────────────────────

      openCenter:   () => set({ isCenterOpen: true },  false, 'notifications/openCenter'),
      closeCenter:  () => set({ isCenterOpen: false }, false, 'notifications/closeCenter'),
      toggleCenter: () =>
        set(
          (state) => ({ isCenterOpen: !state.isCenterOpen }),
          false,
          'notifications/toggleCenter',
        ),

      // ── Fetch ──────────────────────────────────────────────────────────────

      fetchNotifications: async () => {
        if (get().isFetching) return
        set({ isFetching: true, fetchError: null }, false, 'notifications/fetchStart')

        try {
          const response = await fetch('/api/notifications?perPage=50', { credentials: 'include' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)

          const json = await response.json()
          const incoming: Notification[] = json?.data ?? []

          // Detecta novas não lidas e exibe como toast
          const { notifications: current, addToast } = get()
          const currentIds = new Set(current.map((n) => n.id))

          incoming
            .filter((n) => !currentIds.has(n.id) && !n.read)
            .slice(0, 3)
            .forEach((n) => {
              addToast({
                type:     n.type,
                title:    n.title,
                message:  n.message,
                href:     n.actionUrl ?? null,
                duration: 6000,
              })
            })

          set(
            {
              notifications: incoming,
              unreadCount:   incoming.filter((n) => !n.read).length,
              isFetching:    false,
            },
            false,
            'notifications/fetchSuccess',
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro ao buscar notificações.'
          set({ isFetching: false, fetchError: message }, false, 'notifications/fetchError')
        }
      },
    }),
    { name: 'NotificationStore' },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectNotifications  = (s: NotificationState) => s.notifications
export const selectToasts         = (s: NotificationState) => s.toasts
export const selectUnreadCount    = (s: NotificationState) => s.unreadCount
export const selectIsFetching     = (s: NotificationState) => s.isFetching
export const selectIsCenterOpen   = (s: NotificationState) => s.isCenterOpen
