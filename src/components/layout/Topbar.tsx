'use client'

// =============================================================================
// Topbar — AutoDrive
// Header fixo da área de conteúdo com notificações e menu de usuário
// =============================================================================

import { Bell, BellRing, ChevronDown, Menu, Settings, User, LogOut } from 'lucide-react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { useNotificationStore } from '@/store/notification.store'
import { useSidebarStore } from '@/store/sidebarStore'
import { useIdentityStore } from '@/store/identityStore'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'
import { ROLE_LABELS } from '@/lib/permissions'
import { clearSidebarMenuState } from '@/lib/sidebar-menu-state'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/permissions'

export function Topbar() {
  const { data: session } = useSession()
  const router = useRouter()
  const { unreadCount } = useNotificationStore()
  const { toggleMobile, closeMobile } = useSidebarStore()
  const { appName, appTagline } = useIdentityStore()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fecha menu ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSignOut = async () => {
    clearSidebarMenuState()
    closeMobile()
    await signOut({ redirect: false })
    router.replace('/login')
  }

  const name     = session?.user?.name ?? ''
  const role     = session?.user?.role as UserRole | undefined
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'AD'

  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : ''

  return (
    <>
      <header className="flex h-14 shrink-0 items-center border-b border-gray-100 bg-white px-4 shadow-sm">
        {/* Hamburguer — mobile apenas */}
        <button
          type="button"
          onClick={toggleMobile}
          className="mr-3 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors lg:hidden"
          title="Abrir menu"
        >
          <Menu size={20} />
        </button>

        {/* Nome do sistema — dinâmico via identityStore */}
        <p className="hidden sm:block text-sm font-semibold text-gray-700 select-none truncate">
          {appName}
          {appTagline && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">
              — {appTagline}
            </span>
          )}
        </p>

        {/* Ações direita */}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Sino */}
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 transition-colors"
            title="Notificações"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Menu de usuário */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className={cn(
                'flex items-center gap-2 rounded-lg pl-2 pr-2.5 py-1.5 transition-colors',
                'text-gray-600 hover:bg-gray-100',
                userMenuOpen && 'bg-gray-100',
              )}
            >
              {/* Avatar */}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-800 text-xs font-bold text-white">
                {initials}
              </div>
              {/* Info — só desktop */}
              <div className="hidden md:block text-left leading-tight min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate max-w-[120px]">
                  {name || 'Usuário'}
                </p>
                <p className="text-[10px] text-gray-400">{roleLabel}</p>
              </div>
              <ChevronDown
                size={13}
                className={cn(
                  'text-gray-400 transition-transform',
                  userMenuOpen && 'rotate-180',
                )}
              />
            </button>

            {/* Dropdown */}
            {userMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-gray-100 bg-white shadow-modal py-1 animate-fade-in">
                {/* Info do usuário */}
                <div className="border-b border-gray-50 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
                  <p className="text-xs text-gray-500">{roleLabel}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {session?.user?.email}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false)
                    router.push('/perfil')
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <User size={14} className="text-gray-400" />
                  Meu perfil
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false)
                    router.push('/notificacoes/ativar')
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <BellRing size={14} className="text-gray-400" />
                  Ativar notificações
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false)
                    router.push('/configuracoes/sistema')
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings size={14} className="text-gray-400" />
                  Configurações
                </button>

                <div className="my-1 border-t border-gray-50" />

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Painel de notificações */}
      {notifOpen && <NotificationCenter onClose={() => setNotifOpen(false)} />}
    </>
  )
}
