import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_OPEN_GROUPS_KEY,
  clearSidebarMenuStateFromStorage,
  isSidebarMenuKeyOpen,
  nextSidebarMenuPath,
} from '@/lib/sidebar-menu-state'

describe('sidebar menu accordion state', () => {
  it('opens one root group and closes the previous root group', () => {
    const first = nextSidebarMenuPath([], '0:Central de Pendências', 0)
    const second = nextSidebarMenuPath(first, '0:Financeiro', 0)

    expect(first).toEqual(['0:Central de Pendências'])
    expect(second).toEqual(['0:Financeiro'])
    expect(isSidebarMenuKeyOpen(second, '0:Central de Pendências', 0)).toBe(false)
    expect(isSidebarMenuKeyOpen(second, '0:Financeiro', 0)).toBe(true)
  })

  it('closes the current group when toggled again', () => {
    const open = nextSidebarMenuPath([], '0:Marketing', 0)
    const closed = nextSidebarMenuPath(open, '0:Marketing', 0)

    expect(closed).toEqual([])
  })

  it('keeps a single nested open path without opening siblings', () => {
    const reports = nextSidebarMenuPath([], '0:Relatórios', 0)
    const finance = nextSidebarMenuPath(reports, '1:Financeiro', 1)
    const stock = nextSidebarMenuPath(finance, '1:Estoque', 1)

    expect(finance).toEqual(['0:Relatórios', '1:Financeiro'])
    expect(stock).toEqual(['0:Relatórios', '1:Estoque'])
  })

  it('removes legacy persisted submenu keys from provided storages', () => {
    const removed: string[] = []
    const storage = { removeItem: (key: string) => removed.push(key) }

    clearSidebarMenuStateFromStorage([storage])

    expect(removed).toContain(SIDEBAR_OPEN_GROUPS_KEY)
    expect(removed).toContain('openMenus')
  })
})
