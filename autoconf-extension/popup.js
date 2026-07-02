// =============================================================================
// popup.js — dispara a varredura filtrada na aba do AutoConf e mostra o resumo.
// =============================================================================

const $ = (id) => document.getElementById(id)

const AUTODRIVE = 'https://auto-drive-mocha.vercel.app'
const FILTER_KEY = 'autoconfFilters'
const AUTO_KEY = 'autoconfAutoRefresh'
const TARGET_TAB_KEY = 'autoconfTargetTabId'
const DEFAULT_STATUSES = ['Finalizada', 'Pendente Contrato', 'Pendente NFe']

let lastResult = null
let scanning = false
let autoTimer = null
let autoTicker = null
let autoNextRunAt = null
let autoRunning = false

function pad2(n) {
  return String(n).padStart(2, '0')
}

function log(msg) {
  const el = $('log')
  el.textContent = msg + '\n' + el.textContent
}

function isAutoconfUrl(url) {
  return /^https:\/\/app\.autoconf\.com\.br\//.test(url || '')
}

function fmtMap(m) {
  const e = Object.entries(m || {})
  return e.length ? e.map(([k, v]) => `${k || '—'}: ${v}`).join(' · ') : '—'
}

function parseBrDate(s) {
  const m = String(s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

function validYear(value) {
  const year = Number(String(value || '').trim())
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null
}

function setModeVisibility() {
  const mode = $('mode').value
  $('monthFields').classList.toggle('hidden', mode !== 'month')
  $('yearFields').classList.toggle('hidden', mode !== 'year')
  $('rangeFields').classList.toggle('hidden', mode !== 'range')
}

function syncStatusControls() {
  const all = $('statusAll').checked
  document.querySelectorAll('.statusOpt').forEach((el) => { el.disabled = all })
}

function selectedStatuses() {
  if ($('statusAll').checked) return []
  return [...document.querySelectorAll('.statusOpt')]
    .filter((el) => el.checked)
    .map((el) => el.value)
}

function selectedTipos() {
  const tipo = $('tipoSelect').value.trim()
  const extra = $('tipoExtra').value.trim()
  return [tipo, extra].filter(Boolean)
}

function collectFilters({ validate = true } = {}) {
  const now = new Date()
  const mode = $('mode').value
  const statuses = selectedStatuses()
  const tipos = selectedTipos()

  if (validate && !$('statusAll').checked && statuses.length === 0) {
    return { ok: false, error: 'Escolha pelo menos um status ou marque Todos.' }
  }

  const filters = {
    mode,
    month: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`,
    year: now.getFullYear(),
    dateFrom: '',
    dateTo: '',
    statuses,
    tipos,
    loja: $('lojaFilter').value.trim(),
    vendedor: $('vendedorFilter').value.trim(),
    cliente: $('clienteFilter').value.trim(),
    placa: $('placaFilter').value.trim(),
    includeWithoutSeller: $('includeWithoutSeller').checked,
  }

  if (mode === 'month') {
    const year = validYear($('monthYear').value)
    const month = $('monthSelect').value
    if (validate && !year) return { ok: false, error: 'Ano inválido para busca por mês.' }
    filters.year = year || now.getFullYear()
    filters.month = `${filters.year}-${month}`
  }

  if (mode === 'year') {
    const year = validYear($('yearOnly').value)
    if (validate && !year) return { ok: false, error: 'Ano inválido.' }
    filters.year = year || now.getFullYear()
    filters.month = `${filters.year}-01`
  }

  if (mode === 'range') {
    const fromText = $('dateFrom').value.trim()
    const toText = $('dateTo').value.trim()
    const from = parseBrDate(fromText)
    const to = parseBrDate(toText)
    if (validate && !fromText) return { ok: false, error: 'Data inicial obrigatória.' }
    if (validate && !toText) return { ok: false, error: 'Data final obrigatória.' }
    if (validate && !from) return { ok: false, error: 'Data inicial inválida.' }
    if (validate && !to) return { ok: false, error: 'Data final inválida.' }
    if (validate && from > to) return { ok: false, error: 'Data inicial não pode ser maior que data final.' }
    filters.dateFrom = fromText
    filters.dateTo = toText
  }

  return { ok: true, filters }
}

function applyFiltersToForm(filters) {
  if (!filters || typeof filters !== 'object') return

  $('mode').value = filters.mode || 'current_month'
  const month = String(filters.month || '')
  const m = month.match(/^(\d{4})-(\d{2})$/)
  if (m) {
    $('monthYear').value = m[1]
    $('monthSelect').value = m[2]
  }
  $('yearOnly').value = filters.year || (m ? m[1] : new Date().getFullYear())
  $('dateFrom').value = filters.dateFrom || ''
  $('dateTo').value = filters.dateTo || ''

  const statuses = Array.isArray(filters.statuses) ? filters.statuses : DEFAULT_STATUSES
  $('statusAll').checked = statuses.length === 0
  document.querySelectorAll('.statusOpt').forEach((el) => {
    el.checked = statuses.length === 0 ? false : statuses.includes(el.value)
  })

  const tipos = Array.isArray(filters.tipos) ? filters.tipos : []
  const known = ['', 'Venda', 'Troca', 'Compra', 'Consignação']
  const firstKnown = tipos.find((t) => known.includes(t)) || ''
  const extra = tipos.find((t) => !known.includes(t)) || ''
  $('tipoSelect').value = firstKnown
  $('tipoExtra').value = extra

  $('lojaFilter').value = filters.loja || ''
  $('vendedorFilter').value = filters.vendedor || ''
  $('clienteFilter').value = filters.cliente || ''
  $('placaFilter').value = filters.placa || ''
  $('includeWithoutSeller').checked = filters.includeWithoutSeller !== false

  setModeVisibility()
  syncStatusControls()
}

function filtersSummary(filters) {
  const parts = []
  parts.push(filters.statuses?.length ? `status ${filters.statuses.join(', ')}` : 'todos os status')
  if (filters.tipos?.length) parts.push(`tipo ${filters.tipos.join(', ')}`)
  if (filters.loja) parts.push(`loja "${filters.loja}"`)
  if (filters.vendedor) parts.push(`vendedor "${filters.vendedor}"`)
  if (filters.cliente) parts.push(`cliente "${filters.cliente}"`)
  if (filters.placa) parts.push(`placa "${filters.placa}"`)
  if (filters.includeWithoutSeller === false) parts.push('sem vendedor excluídas')
  return parts.join(' · ')
}

function render(res) {
  $('stats').style.display = 'block'
  $('count').textContent = res.candidatas ?? 0
  $('periodLabel').textContent = res.period?.periodLabel || res.monthLabel || '—'
  $('pagesRead').textContent = res.pagesRead ?? 0
  $('totalScanned').textContent = res.totalScanned ?? 0
  $('byTipo').textContent = fmtMap(res.byTipo)
  $('byStatus').textContent = fmtMap(res.byStatus)
  $('byLoja').textContent = fmtMap(res.byLoja)
  $('filtersApplied').textContent = filtersSummary(res.filters || {})

  if ((res.semVendedor || 0) > 0) {
    $('semVendedorLine').style.display = 'flex'
    $('semVendedor').textContent = res.semVendedor
  } else {
    $('semVendedorLine').style.display = 'none'
    $('semVendedor').textContent = '0'
  }

  ;(res.warnings || []).forEach((w) => log('Aviso: ' + w))
  if ((res.candidatas || 0) === 0) log('Nenhuma negociação encontrada para o filtro.')
}

async function activeAutoconfTab() {
  const stored = await chrome.storage.local.get(TARGET_TAB_KEY)
  const targetTabId = Number(stored[TARGET_TAB_KEY])

  if (targetTabId) {
    try {
      const tab = await chrome.tabs.get(targetTabId)
      if (tab?.id && isAutoconfUrl(tab.url)) return tab
    } catch (e) {
      // A aba alvo pode ter sido fechada; procuramos outra abaixo.
    }
  }

  try {
    const tabs = await chrome.tabs.query({ url: 'https://app.autoconf.com.br/*' })
    const tab = tabs.find((t) => t.active) || tabs[0]
    if (tab?.id) {
      chrome.storage.local.set({ [TARGET_TAB_KEY]: tab.id })
      return tab
    }
  } catch (e) {
    // Fallback para o fluxo antigo, quando a tela ainda era popup do Chrome.
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !isAutoconfUrl(tab.url)) return null
  chrome.storage.local.set({ [TARGET_TAB_KEY]: tab.id })
  return tab
}

function resultFileName() {
  const label = lastResult?.period?.fileLabel || (lastResult?.monthLabel || 'resultado').replace('/', '-')
  return `autoconf-negociacoes-${label}.json`
}

function parseAutoMinutes(value) {
  const n = Math.floor(Number(String(value || '').replace(',', '.')))
  if (!Number.isFinite(n)) return null
  if (n < 1 || n > 1440) return null
  return n
}

function autoSettingsFromForm() {
  return {
    enabled: $('autoRefresh').checked,
    minutes: parseAutoMinutes($('autoMinutes').value) || 10,
  }
}

function applyAutoSettings(settings) {
  const cfg = settings && typeof settings === 'object' ? settings : {}
  $('autoRefresh').checked = cfg.enabled === true
  $('autoMinutes').value = parseAutoMinutes(cfg.minutes) || 10
  scheduleAutoRefresh()
}

function saveAutoSettings() {
  const settings = autoSettingsFromForm()
  chrome.storage.local.set({ [AUTO_KEY]: settings })
  return settings
}

function stopAutoTimers() {
  if (autoTimer) clearTimeout(autoTimer)
  if (autoTicker) clearInterval(autoTicker)
  autoTimer = null
  autoTicker = null
  autoNextRunAt = null
}

function updateAutoStatus() {
  const enabled = $('autoRefresh').checked
  const minutes = parseAutoMinutes($('autoMinutes').value)
  if (!enabled) {
    $('autoStatus').textContent = 'Desligada. A atualização automática apenas busca novamente; não importa para o AutoDrive.'
    return
  }
  if (!minutes) {
    $('autoStatus').textContent = 'Informe um intervalo entre 1 e 1440 minutos.'
    return
  }
  if (autoRunning) {
    $('autoStatus').textContent = 'Atualizando agora...'
    return
  }
  if (!autoNextRunAt) {
    $('autoStatus').textContent = `Ligada. Intervalo: ${minutes} min.`
    return
  }
  const remaining = Math.max(0, autoNextRunAt - Date.now())
  const totalSeconds = Math.ceil(remaining / 1000)
  const mm = Math.floor(totalSeconds / 60)
  const ss = totalSeconds % 60
  $('autoStatus').textContent = `Ligada. Próxima busca em ${mm}m ${String(ss).padStart(2, '0')}s.`
}

function scheduleAutoRefresh() {
  stopAutoTimers()
  const settings = saveAutoSettings()
  const minutes = parseAutoMinutes(settings.minutes)
  if (!settings.enabled || !minutes) {
    updateAutoStatus()
    return
  }

  autoNextRunAt = Date.now() + minutes * 60 * 1000
  autoTicker = setInterval(updateAutoStatus, 1000)
  autoTimer = setTimeout(async () => {
    autoRunning = true
    updateAutoStatus()
    try {
      await runScan({ source: 'auto' })
    } finally {
      autoRunning = false
      scheduleAutoRefresh()
    }
  }, minutes * 60 * 1000)
  updateAutoStatus()
}

// Progresso vindo do content script.
chrome.runtime.onMessage.addListener((req) => {
  if (req?.type === 'progress') log(req.msg)
})

chrome.storage.local.get(['autoconfToken', FILTER_KEY, AUTO_KEY], (r) => {
  if (r.autoconfToken) $('token').value = r.autoconfToken
  const now = new Date()
  applyFiltersToForm(r[FILTER_KEY] || {
    mode: 'current_month',
    month: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`,
    year: now.getFullYear(),
    statuses: DEFAULT_STATUSES,
    tipos: [],
    includeWithoutSeller: true,
  })
  applyAutoSettings(r[AUTO_KEY])
})

$('mode').addEventListener('change', () => {
  setModeVisibility()
  const collected = collectFilters({ validate: false })
  if (collected.ok) chrome.storage.local.set({ [FILTER_KEY]: collected.filters })
})

$('statusAll').addEventListener('change', () => {
  syncStatusControls()
  const collected = collectFilters({ validate: false })
  if (collected.ok) chrome.storage.local.set({ [FILTER_KEY]: collected.filters })
})

document.querySelectorAll('input, select').forEach((el) => {
  if (['token', 'statusAll', 'mode', 'autoRefresh', 'autoMinutes'].includes(el.id)) return
  el.addEventListener('change', () => {
    if (el.classList.contains('statusOpt') && el.checked) $('statusAll').checked = false
    syncStatusControls()
    const collected = collectFilters({ validate: false })
    if (collected.ok) chrome.storage.local.set({ [FILTER_KEY]: collected.filters })
  })
})

$('autoRefresh').addEventListener('change', () => {
  scheduleAutoRefresh()
})

$('autoMinutes').addEventListener('change', () => {
  const minutes = parseAutoMinutes($('autoMinutes').value)
  if (!minutes) {
    log('Informe um intervalo de atualização entre 1 e 1440 minutos.')
    $('autoMinutes').value = '10'
  }
  scheduleAutoRefresh()
})

$('saveToken').addEventListener('click', () => {
  chrome.storage.local.set({ autoconfToken: $('token').value.trim() }, () => log('Token salvo.'))
})

async function runScan({ source = 'manual' } = {}) {
  if (scanning) {
    log('Já existe uma busca em andamento.')
    return false
  }

  const collected = collectFilters()
  if (!collected.ok) {
    log(collected.error)
    return false
  }

  const tab = await activeAutoconfTab()
  if (!tab) {
    log('Abra ou mantenha uma aba do AutoConf (app.autoconf.com.br) logada e tente de novo.')
    return false
  }

  chrome.storage.local.set({ [FILTER_KEY]: collected.filters })
  scanning = true
  $('scan').disabled = true
  $('scan').textContent = 'Buscando...'
  if (source === 'manual') $('log').textContent = ''
  log(source === 'auto' ? 'Atualização automática: iniciando busca...' : 'Iniciando busca filtrada...')

  try {
    const resp = await chrome.tabs.sendMessage(tab.id, {
      action: 'scan',
      dryRun: true,
      filters: collected.filters,
    })
    if (!resp?.ok) throw new Error(resp?.error || 'Falha na varredura.')
    lastResult = resp.res
    render(resp.res)
    if (source === 'auto') log('Atualização automática concluída.')
    return true
  } catch (e) {
    log('Erro: ' + (e?.message || e) + '\nSe a aba acabou de abrir, recarregue-a. O script é injetado no carregamento.')
    return false
  } finally {
    scanning = false
    $('scan').disabled = false
    $('scan').textContent = '1) Buscar negociações filtradas'
  }
}

$('scan').addEventListener('click', () => runScan({ source: 'manual' }))

$('download').addEventListener('click', () => {
  if (!lastResult) return
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  chrome.downloads.download({ url, filename: resultFileName() })
})

$('sample').addEventListener('click', () => {
  if (!lastResult?.rows?.length) { log('Sem exemplos.'); return }
  const r = lastResult.rows[0]
  log('Exemplo:\n' + JSON.stringify({
    externalId: r.externalId,
    tipo: r.tipo,
    status: r.status,
    criadoEm: r.criadoEm,
    dataNegociacao: r.dataNegociacao,
    vendedor: r.vendedor,
    loja: r.loja,
    cliente: r.cliente,
    clienteDetalhes: r.clienteDetalhes,
    saleAmount: r.saleAmount,
    purchaseAmount: r.purchaseAmount,
    pagamentos: r.pagamentos,
    debitos: r.debitos,
    veiculosSaida: r.veiculosSaida,
    veiculosEntrada: r.veiculosEntrada,
  }, null, 1))
})

async function sendToAutodrive(dryRun) {
  if (!lastResult?.rows?.length) { log('Rode a busca primeiro.'); return }
  const token = $('token').value.trim()
  if (!token) { log('Informe o token do AutoDrive e clique em Salvar.'); return }

  const label = dryRun ? 'Prévia' : 'Importação'
  log(`${label}: enviando ${lastResult.rows.length} negociações de ${lastResult.period?.periodLabel || 'período filtrado'}...`)

  try {
    const res = await fetch(`${AUTODRIVE}/api/integrations/autoconf/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-autoconf-token': token },
      body: JSON.stringify({
        rows: lastResult.rows,
        dryRun,
        filters: lastResult.filters,
        period: lastResult.period,
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { log(`Erro ao importar no AutoDrive: ${j?.error || ('HTTP ' + res.status)}`); return }
    log(`${label} OK — criadas ${j.created ?? 0}, atualizadas ${j.updated ?? 0}, puladas ${j.skipped ?? 0}, vendedor não achado ${j.unmatchedSeller || 0}.`)
    ;(j.results || []).filter((r) => r.action === 'skipped').slice(0, 6).forEach((r) => log(`  - pulada ${r.externalId}: ${r.reason}`))
    ;(j.results || []).filter((r) => typeof r.seller === 'string' && r.seller.startsWith('(NÃO')).slice(0, 6).forEach((r) => log(`  - ${r.externalId} ${r.unit}: ${r.seller}`))
  } catch (e) {
    log('Erro de rede ao importar no AutoDrive: ' + (e?.message || e))
  }
}

$('preview').addEventListener('click', () => sendToAutodrive(true))
$('import').addEventListener('click', () => {
  if (!lastResult?.rows?.length) { log('Rode a busca primeiro.'); return }
  const period = lastResult.period?.periodLabel || 'período filtrado'
  const msg = `Importar ${lastResult.rows.length} negociações filtradas para o AutoDrive?\n\nPeríodo: ${period}\n\nIsso cria/atualiza as negociações e pode gerar comissões conforme regras do AutoDrive.`
  if (confirm(msg)) sendToAutodrive(false)
})
