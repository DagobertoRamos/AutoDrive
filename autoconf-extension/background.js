// =============================================================================
// background.js — abre a interface em uma aba no mesmo navegador do AutoConf.
// =============================================================================

const PANEL_PATH = 'popup.html'
const TARGET_TAB_KEY = 'autoconfTargetTabId'
const TARGET_WINDOW_KEY = 'autoconfTargetWindowId'
const PANEL_TAB_KEY = 'autoconfPanelTabId'

let panelTabId = null

function isAutoconfUrl(url) {
  return /^https:\/\/app\.autoconf\.com\.br\//.test(url || '')
}

function isPanelUrl(url) {
  return url === chrome.runtime.getURL(PANEL_PATH)
}

async function rememberTargetTab(tab) {
  if (!tab?.id || !isAutoconfUrl(tab.url)) return
  await chrome.storage.local.set({
    [TARGET_TAB_KEY]: tab.id,
    [TARGET_WINDOW_KEY]: tab.windowId ?? null,
    autoconfTargetUpdatedAt: Date.now(),
  })
}

async function focusPanelTab(tabId) {
  if (!tabId) return false
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab?.id || !isPanelUrl(tab.url)) return false
    await chrome.tabs.update(tab.id, { active: true })
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true })
    panelTabId = tab.id
    await chrome.storage.local.set({ [PANEL_TAB_KEY]: tab.id })
    return true
  } catch (e) {
    return false
  }
}

async function findOpenPanelTab() {
  const stored = await chrome.storage.local.get(PANEL_TAB_KEY)
  if (await focusPanelTab(stored[PANEL_TAB_KEY])) return true
  if (await focusPanelTab(panelTabId)) return true

  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL(PANEL_PATH) })
  if (tabs[0]?.id) return focusPanelTab(tabs[0].id)
  return false
}

async function openPanel(tab) {
  await rememberTargetTab(tab)

  if (await findOpenPanelTab()) return

  const targetWindowId = tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT
  const targetIndex = typeof tab?.index === 'number' ? tab.index + 1 : undefined
  const created = await chrome.tabs.create({
    windowId: targetWindowId,
    index: targetIndex,
    url: chrome.runtime.getURL(PANEL_PATH),
    active: true,
  })
  panelTabId = created.id ?? null
  if (panelTabId) await chrome.storage.local.set({ [PANEL_TAB_KEY]: panelTabId })
}

chrome.action.onClicked.addListener((tab) => {
  openPanel(tab).catch(() => {})
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === panelTabId) {
    panelTabId = null
    chrome.storage.local.remove(PANEL_TAB_KEY)
  }
})
