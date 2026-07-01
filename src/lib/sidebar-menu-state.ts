export const SIDEBAR_OPEN_GROUPS_KEY = 'autodrive:sidebar:openGroups'

export const SIDEBAR_MENU_STATE_KEYS = [
  SIDEBAR_OPEN_GROUPS_KEY,
  'autodrive:sidebar:openMenu',
  'autodrive:sidebar:expandedMenus',
  'autodrive-sidebar-openGroups',
  'autodrive-sidebar-open-menu',
  'sidebarOpen',
  'sidebarState',
  'openMenus',
  'expandedMenus',
  'activeMenu',
  'openMenu',
  'menuState',
  'sidebar-expanded',
  'autoDriveMenuState',
  'collapsedGroups',
]

type RemovableStorage = Pick<Storage, 'removeItem'>

export function nextSidebarMenuPath(current: string[], key: string, depth: number): string[] {
  if (depth < 0) return current
  if (current[depth] === key) return current.slice(0, depth)
  return [...current.slice(0, depth), key]
}

export function isSidebarMenuKeyOpen(openPath: string[], key: string, depth: number): boolean {
  return openPath[depth] === key
}

export function clearSidebarMenuStateFromStorage(storages: Array<RemovableStorage | null | undefined>): void {
  for (const storage of storages) {
    if (!storage) continue
    for (const key of SIDEBAR_MENU_STATE_KEYS) {
      try { storage.removeItem(key) } catch { /* ignore */ }
    }
  }
}

export function clearSidebarMenuState(): void {
  if (typeof window === 'undefined') return
  try { clearSidebarMenuStateFromStorage([window.sessionStorage]) } catch { /* ignore */ }
  try { clearSidebarMenuStateFromStorage([window.localStorage]) } catch { /* ignore */ }
}
