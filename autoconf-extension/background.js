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

// =============================================================================
// ATUALIZAÇÃO AUTOMÁTICA (chrome.alarms) — roda mesmo com o popup fechado.
// A cada N minutos: acha/abre a aba do AutoConf → garante login (auto-login com
// as credenciais salvas) → busca as negociações do filtro → importa no AutoDrive.
// Liga/desliga vem do popup (AUTO_KEY.enabled). Status fica em LASTRUN_KEY.
// =============================================================================
const AUTO_KEY = 'autoconfAutoRefresh'
const FILTER_KEY = 'autoconfFilters'
const CREDS_KEY = 'autoconfCreds'
const TOKEN_KEY = 'autoconfToken'
const LASTRUN_KEY = 'autoconfLastRun'
const ALARM = 'autoconfAutoUpdate'
const AUTODRIVE = 'https://auto-drive-mocha.vercel.app'
const BATCH_SIZE = 5

const getLocal = (keys) => new Promise((r) => chrome.storage.local.get(keys, r))
const setLocal = (obj) => new Promise((r) => chrome.storage.local.set(obj, r))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseAutoMinutes(v) { const n = Math.floor(Number(String(v || '').replace(',', '.'))); return Number.isFinite(n) && n >= 1 && n <= 1440 ? n : null }

async function setLastRun(ok, message) { await setLocal({ [LASTRUN_KEY]: { at: Date.now(), ok, message } }) }

async function setupAutoAlarm() {
  const st = await getLocal(AUTO_KEY)
  const cfg = st[AUTO_KEY] || {}
  const minutes = parseAutoMinutes(cfg.minutes) || 10
  await chrome.alarms.clear(ALARM)
  if (cfg.enabled === true) chrome.alarms.create(ALARM, { periodInMinutes: minutes, delayInMinutes: minutes })
}

async function findOrCreateAutoconfTab() {
  const tabs = await chrome.tabs.query({ url: 'https://app.autoconf.com.br/*' })
  if (tabs[0]?.id) return tabs[0]
  return await chrome.tabs.create({ url: 'https://app.autoconf.com.br/', active: false })
}

function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : (resp || { ok: false, error: 'sem resposta' }))
    })
  })
}

async function ensureContentScript(tabId) {
  const ping = await sendToTab(tabId, { action: 'loginStatus' })
  if (ping.ok) return true
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['scanner.js'] }); await sleep(400); return true } catch (e) { return false }
}

// Enxuga o payload igual ao popup (mantém só o que a API lê).
function slimRowForApi(row) {
  const stripRaw = (list) => (list || []).map(({ raw, ...rest }) => rest)
  return {
    externalId: row.externalId, tipo: row.tipo, status: row.status, etapa: row.etapa,
    criadoEm: row.criadoEm, criadoEmIso: row.criadoEmIso, aprovadoEm: row.aprovadoEm, aprovadoEmIso: row.aprovadoEmIso,
    finalizadoEm: row.finalizadoEm, finalizadoEmIso: row.finalizadoEmIso, dataNegociacao: row.dataNegociacao, dataNegociacaoIso: row.dataNegociacaoIso,
    vendedor: row.vendedor, responsavelLista: row.responsavelLista, loja: row.loja,
    cliente: row.cliente, clienteEmail: row.clienteEmail, clienteContato: row.clienteContato, clienteDetalhes: row.clienteDetalhes,
    veiculosSaida: row.veiculosSaida, veiculosEntrada: row.veiculosEntrada, saleAmount: row.saleAmount, purchaseAmount: row.purchaseAmount,
    pagamentos: stripRaw(row.pagamentos), debitos: stripRaw(row.debitos), financeiro: row.financeiro,
    totalPagamentosDetalhe: row.totalPagamentosDetalhe, totalDebitosDetalhe: row.totalDebitosDetalhe, sourceUrl: row.sourceUrl,
  }
}
function chunkArray(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out }

async function sendBatch(rows, token, filters, period, acc, tag) {
  try {
    const res = await fetch(`${AUTODRIVE}/api/integrations/autoconf/deals`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-autoconf-token': token },
      body: JSON.stringify({ rows, dryRun: false, filters, period }),
    })
    if (!res.ok) {
      if (res.status >= 500 && rows.length > 1) { const m = Math.ceil(rows.length / 2); await sendBatch(rows.slice(0, m), token, filters, period, acc, tag + 'a'); await sendBatch(rows.slice(m), token, filters, period, acc, tag + 'b'); return }
      acc.errors++; return
    }
    const j = await res.json().catch(() => ({}))
    acc.created += j.created ?? 0; acc.updated += j.updated ?? 0; acc.skipped += j.skipped ?? 0
    acc.unmatchedSeller += j.unmatchedSeller ?? 0; acc.commissionGenerated += j.commissionGenerated ?? 0
  } catch (e) {
    if (rows.length > 1) { const m = Math.ceil(rows.length / 2); await sendBatch(rows.slice(0, m), token, filters, period, acc, tag + 'a'); await sendBatch(rows.slice(m), token, filters, period, acc, tag + 'b'); return }
    acc.errors++
  }
}

async function importRows(rows, token, filters, period) {
  const acc = { created: 0, updated: 0, skipped: 0, unmatchedSeller: 0, commissionGenerated: 0, errors: 0 }
  const batches = chunkArray(rows.map(slimRowForApi), BATCH_SIZE)
  for (let i = 0; i < batches.length; i++) await sendBatch(batches[i], token, filters, period, acc, String(i + 1))
  return acc
}

let autoRunning = false
async function runAutoUpdate() {
  if (autoRunning) return
  autoRunning = true
  try {
    const st = await getLocal([AUTO_KEY, FILTER_KEY, CREDS_KEY, TOKEN_KEY])
    const cfg = st[AUTO_KEY] || {}
    if (cfg.enabled !== true) return
    const token = st[TOKEN_KEY]
    if (!token) { await setLastRun(false, 'Sem token do AutoDrive salvo.'); return }

    let filters = st[FILTER_KEY] || {}
    // "Mês atual" rola sozinho para o mês corrente a cada execução.
    if (filters.mode === 'current_month') { const d = new Date(); filters = { ...filters, month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` } }

    const tab = await findOrCreateAutoconfTab()
    await sleep(1600) // dá tempo se a aba acabou de abrir
    await ensureContentScript(tab.id)

    // Auto-login se estiver deslogado.
    const creds = st[CREDS_KEY] || {}
    const login = await sendToTab(tab.id, { action: 'ensureLogin', email: creds.email, password: creds.password })
    if (login && login.submitted) { await sleep(4500); await ensureContentScript(tab.id) }

    const scan = await sendToTab(tab.id, { action: 'scan', dryRun: true, filters })
    if (!scan.ok) { await setLastRun(false, 'Busca falhou: ' + (scan.error || 'verifique o login')); return }
    const rows = scan.res?.rows || []
    if (cfg.autoImport === false) { await setLastRun(true, `Buscou ${rows.length} negociação(ões) — sem importar (importação automática desligada).`); return }
    if (!rows.length) { await setLastRun(true, 'Nada novo para importar no período.'); return }

    const acc = await importRows(rows, token, scan.res.filters, scan.res.period)
    await setLastRun(!acc.errors, `Importado: +${acc.created} criadas, ${acc.updated} atualizadas, ${acc.skipped} puladas, ${acc.commissionGenerated} comissões${acc.errors ? `, ${acc.errors} erro(s)` : ''}.`)
  } catch (e) {
    await setLastRun(false, 'Erro: ' + (e?.message || e))
  } finally {
    autoRunning = false
  }
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) runAutoUpdate() })
chrome.runtime.onStartup.addListener(() => { setupAutoAlarm().catch(() => {}) })
chrome.runtime.onInstalled.addListener(() => { setupAutoAlarm().catch(() => {}) })
setupAutoAlarm().catch(() => {})

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req?.type === 'autoConfigChanged') { setupAutoAlarm().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true }
  if (req?.type === 'runAutoNow') { runAutoUpdate().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true }
})
