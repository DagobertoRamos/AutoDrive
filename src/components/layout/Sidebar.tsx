'use client'

// =============================================================================
// Sidebar — AutoDrive
// Menu lateral recolhível, com filtragem por permissão, sub-itens aninhados,
// redes sociais externas (somente se URL configurada) e logoff seguro.
//
// Persistência:
//   - localStorage: 'autodrive:sidebar:collapsed' (boolean) — via zustand store
//   - sessionStorage: 'autodrive:sidebar:openGroups' (Record<string, boolean>)
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/store/sidebarStore'
import { canAccessModule } from '@/lib/permissions'
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react'
import { NAV_GROUPS, type NavItem, SOCIAL_KEY_TO_FIELD } from './navigation'

// ── Logo / Brand ──────────────────────────────────────────────────────────────

function BrandLogo({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" width={size} height={size} aria-label="Logo">
      <path
        d="M16 2L30 10V22L16 30L2 22V10L16 2Z"
        fill="var(--sb-accent)"
        fillOpacity={0.18}
        stroke="var(--sb-accent)"
        strokeWidth="1.5"
      />
      <path
        d="M11 16L14.5 19.5L21 13"
        stroke="var(--sb-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasAccess(item: NavItem, role: string | undefined): boolean {
  if (item.separator) return true
  if (!item.module) return true
  return canAccessModule(role, item.module)
}

function isActive(pathname: string, href?: string): boolean {
  if (!href) return false
  if (pathname === href) return true
  if (href !== '/' && href !== '/dashboard' && pathname.startsWith(href + '/')) return true
  return false
}

function anyChildActive(pathname: string, item: NavItem): boolean {
  if (item.href && isActive(pathname, item.href)) return true
  if (!item.children) return false
  return item.children.some((c) => anyChildActive(pathname, c))
}

/**
 * Filtra recursivamente o menu de acordo com (a) permissões do role e
 * (b) presença de URL para itens externos (redes sociais).
 */
function filterTree(items: NavItem[], role: string | undefined, socials: Record<string, string>): NavItem[] {
  const out: NavItem[] = []
  for (const it of items) {
    if (!hasAccess(it, role)) continue
    if (it.separator) { out.push(it); continue }

    // Item externo (rede social) — só renderiza se houver URL configurada
    if (it.external) {
      const key = it.socialKey
      const url = key ? socials[key] : undefined
      if (!url || !url.trim()) continue
      out.push({ ...it, href: url })
      continue
    }

    if (it.children && it.children.length) {
      const filtered = filterTree(it.children, role, socials)
      if (filtered.length === 0) continue
      out.push({ ...it, children: filtered })
    } else {
      // Items que devem ter href (não-externos) — descarta se sem href
      if (!it.href) continue
      out.push(it)
    }
  }
  return out
}

// ── Open-groups (sessionStorage) ──────────────────────────────────────────────

const OPEN_GROUPS_KEY = 'autodrive:sidebar:openGroups'

function readOpenGroups(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(OPEN_GROUPS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch { return {} }
}

function writeOpenGroups(state: Record<string, boolean>) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

interface RenderItemProps {
  item:          NavItem
  depth:         number
  collapsed:     boolean
  pathname:      string
  openMap:       Record<string, boolean>
  setOpen:       (key: string, val: boolean) => void
  onNavigate:    () => void
}

function NavLeaf({ item, depth, collapsed, pathname, onNavigate }: Omit<RenderItemProps, 'openMap' | 'setOpen'>) {
  const active = isActive(pathname, item.href)
  const Icon   = item.icon
  const target = item.external ? '_blank' : undefined
  const rel    = item.external ? 'noopener noreferrer' : undefined

  // Salvaguarda: nunca renderiza link sem href
  if (!item.href) return null

  const baseClasses = cn(
    'group flex items-center rounded-lg text-[13px] font-medium transition-all duration-150',
    collapsed && depth === 0 ? 'justify-center h-9 w-9 mx-auto' : 'px-3 py-1.5 gap-2.5',
    active ? '' : 'text-white/55 hover:text-white/90',
  )

  return (
    <Link
      href={item.href}
      target={target}
      rel={rel}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      style={active ? { backgroundColor: 'var(--sb-active)', color: 'var(--sb-accent)' } : {}}
      className={baseClasses}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--sb-hover)' }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
    >
      {Icon && (
        <Icon
          size={collapsed ? 16 : 15}
          className="shrink-0"
          style={{ color: active ? 'var(--sb-accent)' : undefined, opacity: active ? 1 : 0.5 }}
        />
      )}
      {(!collapsed || depth > 0) && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

function NavGroup(props: RenderItemProps) {
  const { item, depth, collapsed, pathname, openMap, setOpen, onNavigate } = props
  const key      = `${depth}:${item.label}`
  const childAct = anyChildActive(pathname, item)
  // Auto-abre se algum filho ativo
  const open     = openMap[key] ?? childAct
  const Icon     = item.icon

  const labelClass = cn(
    'w-full flex items-center rounded-lg text-[13px] font-medium transition-all duration-150',
    collapsed && depth === 0 ? 'justify-center h-9 w-9 mx-auto' : 'px-3 py-1.5 gap-2.5 justify-between',
    childAct ? '' : 'text-white/55 hover:text-white/90',
  )

  // Quando recolhido no nível 0: clique apenas expande a sidebar (UX simples e robusta)
  const expand = useSidebarStore((s) => s.expand)

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => {
          if (collapsed && depth === 0) { expand(); return }
          setOpen(key, !open)
        }}
        title={collapsed ? item.label : undefined}
        style={childAct ? { backgroundColor: 'var(--sb-active)', color: 'var(--sb-accent)' } : {}}
        className={labelClass}
        onMouseEnter={(e) => { if (!childAct) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--sb-hover)' }}
        onMouseLeave={(e) => { if (!childAct) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <Icon
              size={collapsed ? 16 : 15}
              className="shrink-0"
              style={{ color: childAct ? 'var(--sb-accent)' : undefined, opacity: childAct ? 1 : 0.5 }}
            />
          )}
          {(!collapsed || depth > 0) && <span className="truncate">{item.label}</span>}
        </span>
        {(!collapsed || depth > 0) && (
          open
            ? <ChevronDown  size={13} className="shrink-0 opacity-40" />
            : <ChevronRight size={13} className="shrink-0 opacity-40" />
        )}
      </button>

      {!collapsed && open && item.children && (
        <ul
          className={cn('mt-0.5 space-y-px', depth === 0 ? 'ml-3 pl-2 border-l' : 'ml-2 pl-2 border-l')}
          style={{ borderColor: 'var(--sb-border)' }}
        >
          {item.children.map((child, idx) => (
            <RenderItem
              key={`${child.label}-${idx}`}
              item={child}
              depth={depth + 1}
              collapsed={collapsed}
              pathname={pathname}
              openMap={openMap}
              setOpen={setOpen}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function RenderItem(props: RenderItemProps) {
  const { item, depth, collapsed } = props

  if (item.separator) {
    return (
      <li className="my-2">
        <div style={{ borderTop: '1px solid var(--sb-border)' }} />
        {item.label && !collapsed && (
          <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-white/30">{item.label}</p>
        )}
      </li>
    )
  }

  if (item.children && item.children.length > 0) {
    return <NavGroup {...props} />
  }

  return (
    <li>
      <NavLeaf
        item={item}
        depth={depth}
        collapsed={collapsed}
        pathname={props.pathname}
        onNavigate={props.onNavigate}
      />
    </li>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function Sidebar() {
  const pathname  = usePathname() ?? ''
  const { data: session } = useSession()
  const userRole  = session?.user?.role as string | undefined

  const { isCollapsed, toggle, isMobileOpen, closeMobile } = useSidebarStore()
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
  const [socials, setSocials] = useState<Record<string, string>>({})
  const [mounted, setMounted] = useState(false)

  // Hidrata open-groups e marca como montado (evita SSR mismatch)
  useEffect(() => {
    setOpenMap(readOpenGroups())
    setMounted(true)
  }, [])

  // Busca URLs sociais dinamicamente
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/settings/socials', { credentials: 'include' })
        const data = await res.json()
        if (cancelled || !data?.success || !data?.data) return
        const out: Record<string, string> = {}
        for (const [socialKey, field] of Object.entries(SOCIAL_KEY_TO_FIELD)) {
          const val = data.data[field]
          if (typeof val === 'string' && val.trim()) out[socialKey] = val.trim()
        }
        setSocials(out)
      } catch { /* silent */ }
    }
    if (userRole) load()
    return () => { cancelled = true }
  }, [userRole])

  const setOpen = (key: string, val: boolean) => {
    setOpenMap((prev) => {
      const next = { ...prev, [key]: val }
      writeOpenGroups(next)
      return next
    })
  }

  const filteredTree = useMemo(
    () => filterTree(NAV_GROUPS, userRole, socials),
    [userRole, socials],
  )

  const handleSignOut = () => {
    if (typeof window !== 'undefined' && !window.confirm('Deseja realmente sair do sistema?')) return
    signOut({ callbackUrl: '/login' })
  }

  // Antes da hidratação, força expanded (estado inicial do store) para evitar
  // mismatch entre server e client.
  const collapsed = mounted ? isCollapsed : false

  return (
    <>
      {/* Overlay mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
        />
      )}

      <aside
        className={cn(
          'flex flex-col shrink-0 select-none text-white',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-16' : 'w-64',
          'fixed inset-y-0 left-0 z-50 shadow-2xl',
          'lg:static lg:h-screen lg:shadow-none lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{ backgroundColor: 'var(--sb-bg)' }}
      >
        {/* ── Header / Logo + toggle topo ──────────────────────────────── */}
        <div
          className={cn(
            'flex items-center shrink-0 h-14',
            collapsed ? 'justify-center px-2' : 'px-3 gap-2',
          )}
          style={{ borderBottom: '1px solid var(--sb-border)' }}
        >
          <div className="shrink-0">
            <BrandLogo size={collapsed ? 24 : 22} />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white leading-tight truncate tracking-tight">
                AutoDrive
              </p>
              <p
                className="text-[10px] leading-tight truncate"
                style={{ color: 'var(--sb-accent)', opacity: 0.7 }}
              >
                Sua loja no piloto automático
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={toggle}
              title="Recolher menu"
              aria-label="Recolher menu"
              className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-white/40 hover:text-white/80 hover:bg-white/5 shrink-0"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>

        {/* ── Navegação ────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-hide">
          <ul className="space-y-px px-2">
            {filteredTree.map((item, idx) => (
              <RenderItem
                key={`${item.label}-${idx}`}
                item={item}
                depth={0}
                collapsed={collapsed}
                pathname={pathname}
                openMap={openMap}
                setOpen={setOpen}
                onNavigate={closeMobile}
              />
            ))}
          </ul>
        </nav>

        {/* ── Rodapé ───────────────────────────────────────────────────── */}
        <div
          className="shrink-0 p-2 space-y-0.5"
          style={{ borderTop: '1px solid var(--sb-border)' }}
        >
          {/* Logoff */}
          <button
            type="button"
            onClick={handleSignOut}
            title={collapsed ? 'Sair' : undefined}
            className={cn(
              'w-full flex items-center rounded-lg text-[13px] font-medium',
              'text-white/55 transition-colors duration-150',
              collapsed ? 'justify-center h-9 w-9 mx-auto' : 'px-3 py-2 gap-2.5',
            )}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = 'rgba(239, 68, 68, 0.12)'
              el.style.color = 'rgb(248, 113, 113)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = ''
              el.style.color = ''
            }}
          >
            <LogOut size={15} className="shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>

          {/* Toggle inferior — só desktop */}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'w-full hidden lg:flex items-center rounded-lg text-[12px] font-medium',
              'text-white/30 transition-colors duration-150',
              collapsed ? 'justify-center h-9 w-9 mx-auto' : 'px-3 py-2 gap-2.5',
            )}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = 'var(--sb-hover)'
              el.style.color = 'rgba(255,255,255,0.6)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = ''
              el.style.color = ''
            }}
          >
            {collapsed
              ? <PanelLeftOpen  size={14} className="shrink-0" />
              : <><PanelLeftClose size={14} className="shrink-0" /><span>Recolher menu</span></>}
          </button>
        </div>
      </aside>
    </>
  )
}
