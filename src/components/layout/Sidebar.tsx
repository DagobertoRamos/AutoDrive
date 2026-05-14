'use client'

// =============================================================================
// Sidebar — AutoDrive
// Menu lateral recolhível com hierarquia de roles em pirâmide.
// Cores 100% dinâmicas via CSS vars (--sb-*) geradas pelo ThemeInjector.
// Desktop: estático no fluxo flex | Mobile: overlay fixo
// =============================================================================

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/store/sidebarStore'
import { canAccessModule, type Module } from '@/lib/permissions'
import {
  LayoutDashboard,
  AlertCircle,
  DollarSign,
  Settings,
  Database,
  User,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  Send,
  Users,
  Building2,
  ShieldCheck,
  Car,
  BarChart3,
  Handshake,
  Crown,
  Warehouse,
  Flag,
  Construction,
  Mail,
  Plug,
  Palette,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SubMenuItem {
  label:   string
  href:    string
  module?: Module
}

interface MenuItem {
  id:        string
  label:     string
  icon:      React.ElementType
  href?:     string
  subItems?: SubMenuItem[]
  module?:   Module
}

// ── Estrutura do menu ─────────────────────────────────────────────────────────

const MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard',    icon: LayoutDashboard, href: '/dashboard',  module: 'dashboard' },
  {
    id: 'estoque', label: 'Estoque', icon: Warehouse, module: 'stock',
    subItems: [
      { label: 'Ver Estoque',     href: '/estoque',           module: 'stock.view'     },
      { label: 'Fazer Avaliação', href: '/estoque/avaliacao', module: 'stock.evaluate' },
    ],
  },
  {
    id: 'negociacoes', label: 'Negociações', icon: Handshake, module: 'negotiations',
    subItems: [
      { label: 'Todas',           href: '/negociacoes',             module: 'negotiations'         },
      { label: 'Nova Negociação', href: '/negociacoes/nova',        module: 'negotiations'         },
      { label: 'Aprovar',         href: '/negociacoes/aprovacoes',  module: 'negotiations.approve' },
    ],
  },
  {
    id: 'pendencias', label: 'Pendências', icon: AlertCircle, module: 'pendencies',
    subItems: [
      { label: 'Minhas Pendências', href: '/pendencias/minhas',  module: 'pendencies'         },
      { label: 'Gerência',          href: '/pendencias/gerencia', module: 'pendencies.manage' },
      { label: 'Central',           href: '/pendencias/central',  module: 'pendencies.central' },
    ],
  },
  {
    id: 'comunicacao', label: 'Comunicação', icon: Send, module: 'communication',
    subItems: [
      { label: 'Disparo Manual', href: '/comunicacao/disparo',  module: 'communication.dispatch'  },
      { label: 'Templates',      href: '/comunicacao/templates', module: 'communication.templates' },
    ],
  },
  {
    id: 'comissoes', label: 'Comissões', icon: DollarSign, module: 'commissions',
    subItems: [
      { label: 'Meu Extrato', href: '/comissoes/extrato',  module: 'commissions'       },
      { label: 'Cálculo',     href: '/comissoes/calculo',  module: 'commissions.calculate' },
      { label: 'Regras',      href: '/comissoes/regras',   module: 'commissions.rules' },
      { label: 'Retornos',    href: '/comissoes/retornos', module: 'commissions.rules' },
      { label: 'Garantias',   href: '/comissoes/garantias',module: 'commissions.rules' },
    ],
  },
  {
    id: 'documentos', label: 'Documentos', icon: FileText, module: 'documents',
    subItems: [
      { label: 'Leitura de PDF',    href: '/documentos/pdf',       module: 'documents.pdf'    },
      { label: 'Import. Sheets',    href: '/documentos/importacao',module: 'documents.import' },
      { label: 'Contratos',         href: '/documentos/contratos', module: 'documents.pdf'    },
    ],
  },
  {
    id: 'cadastros', label: 'Cadastros', icon: Database, module: 'registrations',
    subItems: [
      { label: 'Vendedores', href: '/cadastros/vendedores', module: 'registrations.sellers'   },
      { label: 'Gerentes',   href: '/cadastros/gerentes',   module: 'registrations.managers'  },
      { label: 'Unidades',   href: '/cadastros/unidades',   module: 'registrations.units'     },
      { label: 'Clientes',   href: '/cadastros/clientes',   module: 'registrations.customers' },
      { label: 'Serviços',   href: '/cadastros/servicos',   module: 'registrations.services'  },
      { label: 'Garantias',  href: '/cadastros/garantias',  module: 'registrations.warranties'},
    ],
  },
  {
    id: 'relatorios', label: 'Relatórios', icon: BarChart3, module: 'logs',
    subItems: [
      { label: 'Logs do Sistema', href: '/relatorios/logs',      module: 'logs' },
      { label: 'Auditoria',       href: '/relatorios/auditoria', module: 'logs' },
    ],
  },
  {
    id: 'configuracoes', label: 'Configurações', icon: Settings, module: 'settings',
    subItems: [
      { label: 'Identidade',     href: '/configuracoes/identidade', module: 'settings.identity'   },
      { label: 'Google Sheets',  href: '/configuracoes/sheets',     module: 'settings.sheets'     },
      { label: 'E-mail',         href: '/configuracoes/email',      module: 'settings.email'      },
      { label: 'WhatsApp',       href: '/configuracoes/whatsapp',   module: 'settings.whatsapp'   },
      { label: 'Comissões',      href: '/configuracoes/comissoes',  module: 'settings.commission' },
      { label: 'Sistema',        href: '/configuracoes/sistema',    module: 'settings.critical'   },
    ],
  },
  {
    id: 'master', label: 'Master', icon: Crown, module: 'master',
    subItems: [
      { label: 'Visão Geral',       href: '/master',                       module: 'master'         },
      { label: 'Tenants',           href: '/master/tenants',               module: 'master.tenants' },
      { label: 'Usuários',          href: '/master/users',                 module: 'master'         },
      { label: 'Planos',            href: '/master/plans',                 module: 'master.plans'   },
      { label: 'Módulos',           href: '/master/modules',               module: 'master.modules' },
      { label: 'Regras de Avisos',  href: '/master/notification-rules',    module: 'master'         },
      { label: 'Comunicação',       href: '/master/communication',         module: 'master'         },
      { label: 'Importador Sheets', href: '/master/sheets',                module: 'master'         },
      { label: 'Integrações',       href: '/master/integrations',          module: 'master'         },
      { label: 'Feature Flags',     href: '/master/feature-flags',         module: 'master'         },
      { label: 'Manutenção',        href: '/master/maintenance',           module: 'master'         },
      { label: 'Identidade',        href: '/master/identity',              module: 'master'         },
      { label: 'Segurança',         href: '/master/security',              module: 'master'         },
      { label: 'Auditoria',         href: '/master/audit',                 module: 'master.audit'   },
    ],
  },
  { id: 'perfil', label: 'Perfil', icon: User, href: '/perfil', module: 'profile' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function itemHasAccess(module: Module | undefined, role: string | undefined): boolean {
  if (!module) return true
  if (!role)   return false
  return canAccessModule(role, module)
}

function isPathActive(
  currentPath: string,
  href?: string | null,
  subItems?: SubMenuItem[],
): boolean {
  if (!currentPath) return false
  const target = href ?? ''
  if (target && currentPath === target) return true
  if (target && target !== '/dashboard' && currentPath.startsWith(target)) return true
  if (Array.isArray(subItems)) {
    return subItems.some((sub) => {
      const h = sub?.href ?? ''
      return h && (currentPath === h || currentPath.startsWith(h))
    })
  }
  return false
}

// ── Logo — cores via CSS vars ─────────────────────────────────────────────────

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

// ── Componente principal ──────────────────────────────────────────────────────

export function Sidebar() {
  const pathname  = usePathname() ?? ''
  const { data: session } = useSession()
  const userRole  = session?.user?.role as string | undefined

  const { isCollapsed, toggle, isMobileOpen, closeMobile } = useSidebarStore()
  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({})

  // Abre automaticamente o submenu do item ativo na navegação
  useEffect(() => {
    const initial: Record<string, boolean> = {}
    MENU_ITEMS.forEach((item) => {
      if (item.subItems && isPathActive(pathname, item.href, item.subItems)) {
        initial[item.id] = true
      }
    })
    setOpenSubMenus(initial)
  }, [pathname])

  const toggleSubMenu = (id: string) =>
    setOpenSubMenus((prev) => ({ ...prev, [id]: !prev[id] }))

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
          'flex flex-col shrink-0 select-none',
          'text-white transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-[60px]' : 'w-60',
          'fixed inset-y-0 left-0 z-50 shadow-2xl',
          'lg:static lg:h-screen lg:shadow-none lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{ backgroundColor: 'var(--sb-bg)' }}
      >

        {/* ── Logo / Header ────────────────────────────────────────────── */}
        <div
          className={cn(
            'flex items-center shrink-0 h-14',
            isCollapsed ? 'justify-center' : 'px-4 gap-3',
          )}
          style={{ borderBottom: '1px solid var(--sb-border)' }}
        >
          <div className="shrink-0">
            <BrandLogo size={isCollapsed ? 24 : 22} />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white leading-tight truncate tracking-tight">
                AutoDrive
              </p>
              <p className="text-[10px] leading-tight truncate" style={{ color: 'var(--sb-accent)', opacity: 0.7 }}>
                Sua loja no piloto automático
              </p>
            </div>
          )}
        </div>

        {/* ── Navegação ────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-hide">
          <ul className="space-y-px px-2">
            {MENU_ITEMS.map((item) => {
              if (!itemHasAccess(item.module, userRole)) return null

              const isActive    = isPathActive(pathname, item.href, item.subItems)
              const hasSubItems = Array.isArray(item.subItems) && item.subItems.length > 0
              const isSubOpen   = openSubMenus[item.id] ?? false
              const Icon        = item.icon

              const visibleSubItems = hasSubItems
                ? item.subItems!.filter((sub) => itemHasAccess(sub.module, userRole))
                : []

              if (hasSubItems && visibleSubItems.length === 0) return null

              // Estilos dinâmicos via inline para active / hover
              const activeItemStyle = isActive
                ? { backgroundColor: 'var(--sb-active)', color: 'var(--sb-accent)' }
                : {}

              return (
                <li key={item.id} className="relative">

                  {/* Indicador lateral (barra) para item ativo */}
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full pointer-events-none"
                      style={{ backgroundColor: 'var(--sb-accent)' }}
                    />
                  )}

                  {/* Item principal */}
                  {hasSubItems ? (
                    <button
                      type="button"
                      onClick={() => !isCollapsed && toggleSubMenu(item.id)}
                      title={isCollapsed ? item.label : undefined}
                      style={activeItemStyle}
                      className={cn(
                        'w-full flex items-center rounded-lg text-[13px] font-medium',
                        'transition-all duration-150',
                        isCollapsed ? 'justify-center h-9 w-9 mx-auto' : 'justify-between px-3 py-2',
                        !isActive && 'text-white/55 hover:text-white/90',
                      )}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--sb-hover)' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          size={16}
                          className="shrink-0"
                          style={{ color: isActive ? 'var(--sb-accent)' : undefined, opacity: isActive ? 1 : 0.45 }}
                        />
                        {!isCollapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </span>
                      {!isCollapsed && (
                        <ChevronDown
                          size={13}
                          className={cn(
                            'shrink-0 transition-transform duration-200',
                            isSubOpen && 'rotate-180',
                          )}
                          style={{ opacity: 0.35 }}
                        />
                      )}
                    </button>
                  ) : (
                    <Link
                      href={item.href!}
                      title={isCollapsed ? item.label : undefined}
                      onClick={closeMobile}
                      style={activeItemStyle}
                      className={cn(
                        'flex items-center rounded-lg text-[13px] font-medium',
                        'transition-all duration-150',
                        isCollapsed ? 'justify-center h-9 w-9 mx-auto' : 'px-3 py-2 gap-2.5',
                        !isActive && 'text-white/55 hover:text-white/90',
                      )}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--sb-hover)' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = '' }}
                    >
                      <Icon
                        size={16}
                        className="shrink-0"
                        style={{ color: isActive ? 'var(--sb-accent)' : undefined, opacity: isActive ? 1 : 0.45 }}
                      />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  )}

                  {/* Submenu */}
                  {hasSubItems && !isCollapsed && (
                    <div
                      className={cn(
                        'overflow-hidden transition-all duration-200 ease-in-out',
                        isSubOpen ? 'max-h-96 opacity-100 mt-0.5' : 'max-h-0 opacity-0',
                      )}
                    >
                      <ul
                        className="ml-4 pl-3 space-y-px pb-1 pt-0.5"
                        style={{ borderLeft: '1px solid var(--sb-border)' }}
                      >
                        {visibleSubItems.map((sub) => {
                          const isSubActive = pathname === sub.href || pathname.startsWith(sub.href)
                          return (
                            <li key={sub.href}>
                              <Link
                                href={sub.href}
                                onClick={closeMobile}
                                style={isSubActive
                                  ? { color: 'var(--sb-accent)', backgroundColor: 'var(--sb-active)' }
                                  : {}
                                }
                                className={cn(
                                  'block px-2.5 py-1.5 rounded-md text-[12px] font-medium',
                                  'transition-all duration-150',
                                  isSubActive
                                    ? ''
                                    : 'text-white/45 hover:text-white/80',
                                )}
                                onMouseEnter={e => {
                                  if (!isSubActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--sb-hover)'
                                }}
                                onMouseLeave={e => {
                                  if (!isSubActive) (e.currentTarget as HTMLElement).style.backgroundColor = ''
                                }}
                              >
                                {sub.label}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ── Rodapé ───────────────────────────────────────────────────── */}
        <div
          className="shrink-0 p-2 space-y-0.5"
          style={{ borderTop: '1px solid var(--sb-border)' }}
        >
          {/* Sair */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            title={isCollapsed ? 'Sair' : undefined}
            className={cn(
              'w-full flex items-center rounded-lg text-[13px] font-medium',
              'text-white/35 transition-colors duration-150',
              isCollapsed ? 'justify-center h-9 w-9 mx-auto' : 'px-3 py-2 gap-2.5',
            )}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = 'rgba(239, 68, 68, 0.12)'
              el.style.color = 'rgb(248, 113, 113)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = ''
              el.style.color = ''
            }}
          >
            <LogOut size={15} className="shrink-0" />
            {!isCollapsed && <span>Sair</span>}
          </button>

          {/* Toggle collapse — só desktop */}
          <button
            type="button"
            onClick={toggle}
            title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'w-full hidden lg:flex items-center rounded-lg text-[13px] font-medium',
              'text-white/20 transition-colors duration-150',
              isCollapsed ? 'justify-center h-9 w-9 mx-auto' : 'px-3 py-2 gap-2.5',
            )}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = 'var(--sb-hover)'
              el.style.color = 'rgba(255,255,255,0.5)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = ''
              el.style.color = ''
            }}
          >
            {isCollapsed
              ? <PanelLeftOpen  size={15} className="shrink-0" />
              : <><PanelLeftClose size={15} className="shrink-0" /><span>Recolher</span></>
            }
          </button>
        </div>
      </aside>
    </>
  )
}
