// =============================================================================
// popup.js — dispara a varredura filtrada na aba do AutoConf e mostra o resumo.
// =============================================================================

const $ = (id) => document.getElementById(id)

const AUTODRIVE = 'https://www.appautodrive.online'
const FILTER_KEY = 'autoconfFilters'
const AUTO_KEY = 'autoconfAutoRefresh'
const CREDS_KEY = 'autoconfCreds'
const LASTRUN_KEY = 'autoconfLastRun'
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
    autoImport: $('autoImport').checked,
  }
}

function updateToggleButton() {
  const on = $('autoRefresh').checked
  const b = $('autoToggle')
  if (!b) return
  b.textContent = on ? 'Desligar atualização' : 'Ligar atualização'
  b.className = on ? 'ghost' : 'primary'
}

function applyAutoSettings(settings) {
  const cfg = settings && typeof settings === 'object' ? settings : {}
  $('autoRefresh').checked = cfg.enabled === true
  $('autoMinutes').value = parseAutoMinutes(cfg.minutes) || 10
  $('autoImport').checked = cfg.autoImport !== false // padrão: importa
  updateToggleButton()
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
  const st = $('autoStatus')
  if (!enabled) { st.textContent = 'Desligada. Clique em "Ligar atualização".'; if ($('autoLastRun')) $('autoLastRun').textContent = ''; return }
  if (!minutes) { st.textContent = 'Informe um intervalo entre 1 e 1440 minutos.'; return }
  st.textContent = `Ligada — atualiza a cada ${minutes} min (roda em segundo plano, mesmo com esta janela fechada).`
  // Último resultado do background (importações feitas sozinho).
  chrome.storage.local.get(LASTRUN_KEY, (r) => {
    const lr = r[LASTRUN_KEY]; const el = $('autoLastRun'); if (!el) return
    if (!lr) { el.textContent = ''; return }
    const when = new Date(lr.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    el.textContent = `${lr.ok ? '✅' : '⚠️'} última: ${when} — ${lr.message || ''}`
    el.style.color = lr.ok ? '' : '#b91c1c'
  })
}

function scheduleAutoRefresh() {
  saveAutoSettings()
  // O agendamento REAL roda no background (chrome.alarms) — funciona com o popup
  // fechado. Aqui só salvamos e avisamos o background para (re)armar o alarme.
  try { chrome.runtime.sendMessage({ type: 'autoConfigChanged' }, () => void chrome.runtime.lastError) } catch (e) { /* noop */ }
  if (autoTicker) clearInterval(autoTicker)
  autoTicker = setInterval(updateAutoStatus, 2000)
  updateAutoStatus()
}

// Progresso vindo do content script.
chrome.runtime.onMessage.addListener((req) => {
  if (req?.type === 'progress') log(req.msg)
})

// Flag do pipeline V2 (Fase 1): consumo dos endpoints Blade reais em vez de scraping do resumo.
// Fica em chrome.storage.local para o content script (scanner.js) ler em cada varredura.
const V2_FLAG_KEY = 'autoconfImportPipelineV2'
$('pipelineV2').addEventListener('change', () => {
  chrome.storage.local.set({ [V2_FLAG_KEY]: $('pipelineV2').checked }, () => log(`Pipeline V2: ${$('pipelineV2').checked ? 'ligado' : 'desligado'}.`))
})

chrome.storage.local.get(['autoconfToken', FILTER_KEY, AUTO_KEY, CREDS_KEY, V2_FLAG_KEY], (r) => {
  if (r.autoconfToken) $('token').value = r.autoconfToken
  $('pipelineV2').checked = r[V2_FLAG_KEY] === true
  const creds = r[CREDS_KEY] || {}
  if (creds.email) $('acEmail').value = creds.email
  if (creds.password) $('acPassword').value = creds.password
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
  if (['token', 'statusAll', 'mode', 'autoRefresh', 'autoMinutes', 'autoImport', 'acEmail', 'acPassword'].includes(el.id)) return
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

// ---------------------------------------------------------------------------
// Token: ver, copiar e testar.
//
// O campo é type="password", então um token JÁ SALVO aparece como bolinhas e
// dá a impressão de estar perdido. Na prática ele está aqui, no armazenamento
// da extensão — só faltava um jeito de olhar.
// ---------------------------------------------------------------------------
const tokenMsg = (txt, cor) => {
  const el = $('tokenStatus')
  if (!el) return
  el.textContent = txt
  el.style.color = cor || ''
}

$('verToken') && $('verToken').addEventListener('click', () => {
  const campo = $('token')
  const escondido = campo.type === 'password'
  campo.type = escondido ? 'text' : 'password'
  $('verToken').textContent = escondido ? 'Ocultar' : 'Ver'
  if (escondido && !campo.value) {
    tokenMsg('Não há token guardado neste navegador. Gere um novo pelo AutoDrive '
      + '(scripts/autoconf-token.ts) e cole aqui.', '#b45309')
  }
})

$('copiarToken') && $('copiarToken').addEventListener('click', async () => {
  const v = $('token').value.trim()
  if (!v) { tokenMsg('Nada para copiar — o campo está vazio.', '#b45309'); return }
  try { await navigator.clipboard.writeText(v); tokenMsg('Token copiado.', '#047857') }
  catch (e) { tokenMsg('O navegador não deixou copiar. Clique em Ver e copie à mão.', '#b45309') }
})

// Teste sem efeito colateral: manda uma requisição SEM linhas.
// A rota confere o token primeiro (401 se for inválido) e só depois reclama de
// não ter recebido linhas (400). Ou seja: 400 = token bom. Nada é gravado.
$('testarToken') && $('testarToken').addEventListener('click', async () => {
  const v = $('token').value.trim()
  if (!v) { tokenMsg('Cole o token antes de testar.', '#b45309'); return }
  tokenMsg('Testando...')
  try {
    const res = await fetch(`${AUTODRIVE}/api/integrations/autoconf/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-autoconf-token': v },
      body: JSON.stringify({ rows: [], dryRun: true }),
    })
    if (res.status === 401) {
      tokenMsg('Token recusado pelo AutoDrive (401). Ele não confere com nenhuma loja cadastrada.', '#b91c1c')
    } else if (res.status === 400) {
      tokenMsg('Token válido ✓ — o AutoDrive reconheceu a loja. A importação automática volta a funcionar.', '#047857')
    } else {
      tokenMsg(`Resposta inesperada do AutoDrive (HTTP ${res.status}). O servidor pode estar fora do ar.`, '#b45309')
    }
  } catch (e) {
    tokenMsg('Não deu para falar com o AutoDrive. Confira sua internet e se o site está no ar.', '#b91c1c')
  }
})

// Botão LIGAR/DESLIGAR a atualização automática (dirige o checkbox oculto).
$('autoToggle').addEventListener('click', () => {
  $('autoRefresh').checked = !$('autoRefresh').checked
  updateToggleButton()
  scheduleAutoRefresh()
  if ($('autoRefresh').checked) {
    log('Atualização automática LIGADA — rodando a primeira agora (login + busca + importação)...')
    chrome.runtime.sendMessage({ type: 'runAutoNow' }, () => { void chrome.runtime.lastError; setTimeout(updateAutoStatus, 2000) })
  } else {
    log('Atualização automática desligada.')
  }
})

// Rodar UMA vez agora (testar login + importação sem esperar o intervalo).
$('autoRunNow').addEventListener('click', () => {
  log('Atualizando agora... (abre a aba do AutoConf, loga se preciso, busca e importa) — aguarde ~10s.')
  chrome.runtime.sendMessage({ type: 'runAutoNow' }, () => { void chrome.runtime.lastError; setTimeout(updateAutoStatus, 2500) })
})

$('autoImport').addEventListener('change', () => { scheduleAutoRefresh() })

$('saveCreds').addEventListener('click', () => {
  const email = $('acEmail').value.trim()
  const password = $('acPassword').value
  chrome.storage.local.set({ [CREDS_KEY]: { email, password } }, () => log('Login do AutoConf salvo (só neste navegador).'))
})

// Garante que o leitor (scanner.js) está ativo na aba. Depois de atualizar/recarregar
// a extensão, as abas do AutoConf JÁ ABERTAS ficam com o content script órfão — aí
// chrome.tabs.sendMessage falha com "Receiving end does not exist". Damos um "ping";
// se não responder, injetamos o script sob demanda (mesma tática do background).
async function ensureScannerInTab(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { action: 'loginStatus' })
    if (ping?.ok) return true
  } catch (e) { /* ausente/órfão — injeta abaixo */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['scanner.js'] })
    await new Promise((r) => setTimeout(r, 400))
    return true
  } catch (e) {
    return false
  }
}

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

  // Reinjeta o leitor se a aba ficou sem ele (típico após atualizar a extensão).
  const ready = await ensureScannerInTab(tab.id)
  if (!ready) {
    log('Não consegui carregar o leitor na aba do AutoConf. Recarregue a aba (F5) e tente de novo — o script é injetado ao carregar a página.')
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
    // Campanha Feirão: guarda uma versão enxuta do resultado para a tela de
    // campanha montar a fila sem precisar refazer a busca no AutoConf.
    try {
      chrome.storage.local.set({
        autoconfLastResult: {
          at: Date.now(),
          period: resp.res.period || null,
          rows: (resp.res.rows || []).map((r) => ({
            externalId: r.externalId,
            cliente: r.cliente,
            clienteContato: r.clienteContato,
            clienteDetalhes: r.clienteDetalhes || null,
            vendedor: r.vendedor,
            loja: r.loja,
            tipo: r.tipo,
            criadoEm: r.criadoEm,
            dataNegociacao: r.dataNegociacao,
            finalizadoEm: r.finalizadoEm,
            veiculosSaida: (r.veiculosSaida || []).map((v) => ({
              descricao: v.descricao, modelo: v.modelo, marca: v.marca, ano: v.ano, placa: v.placa,
            })),
          })),
        },
      })
    } catch (_) { /* fila é opcional — nunca derruba a busca */ }
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

// Tamanho do lote enviado por requisição. Dois limites da Vercel importam:
// (1) tamanho do corpo → resolvido enxugando o payload (slimRowForApi); (2)
// TEMPO da função (60s) → cada negociação, no servidor, faz upsert de cliente +
// Deal + veículos + pagamentos + débitos + auditoria + RECÁLCULO DE COMISSÃO
// (dezenas de queries no Neon). Com 20/lote isso estourava 60s → HTTP 504.
// Lote pequeno mantém cada requisição bem abaixo do limite. A importação é
// idempotente (dedup por AC-<id>), então lotes que falham podem ser reenviados
// sem duplicar. Trade-off: mais requisições, importação mais lenta, porém confiável.
const BATCH_SIZE = 5

// Remove do payload os campos de diagnóstico (pesados e não usados pela API):
// tabelas/formulários/campos/apiDetalhes/embeddedJson/resumoTexto (dump bruto
// da página) e autoconfListaRaw/autoconfDetalhes (duplicam tudo isso de novo).
// Mantém tudo que o endpoint /api/integrations/autoconf/deals realmente lê.
function slimRowForApi(row) {
  const stripRaw = (list) => (list || []).map(({ raw, ...rest }) => rest)
  return {
    externalId: row.externalId,
    tipo: row.tipo,
    status: row.status,
    etapa: row.etapa,
    criadoEm: row.criadoEm,
    criadoEmIso: row.criadoEmIso,
    aprovadoEm: row.aprovadoEm,
    aprovadoEmIso: row.aprovadoEmIso,
    finalizadoEm: row.finalizadoEm,
    finalizadoEmIso: row.finalizadoEmIso,
    dataNegociacao: row.dataNegociacao,
    dataNegociacaoIso: row.dataNegociacaoIso,
    vendedor: row.vendedor,
    responsavelLista: row.responsavelLista,
    loja: row.loja,
    cliente: row.cliente,
    clienteEmail: row.clienteEmail,
    clienteContato: row.clienteContato,
    clienteDetalhes: row.clienteDetalhes,
    veiculosSaida: row.veiculosSaida,
    veiculosEntrada: row.veiculosEntrada,
    saleAmount: row.saleAmount,
    purchaseAmount: row.purchaseAmount,
    pagamentos: stripRaw(row.pagamentos),
    debitos: stripRaw(row.debitos),
    financeiro: row.financeiro,
    totalPagamentosDetalhe: row.totalPagamentosDetalhe,
    totalDebitosDetalhe: row.totalDebitosDetalhe,
    sourceUrl: row.sourceUrl,
  }
}

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const acc = { created: 0, updated: 0, skipped: 0, unmatchedSeller: 0, commissionGenerated: 0, commissionErrors: 0, results: [], errors: [] }

function resetAcc() {
  acc.created = acc.updated = acc.skipped = acc.unmatchedSeller = acc.commissionGenerated = acc.commissionErrors = 0
  acc.results = []; acc.errors = []
}

// Envia UM lote. Em timeout/erro do servidor (504/502/500) com mais de 1
// negociação, quebra o lote na metade e reenvia cada parte (dedup por AC-<id>
// torna isso seguro). Assim uma negociação pesada não derruba o lote inteiro.
async function sendBatch(rows, token, dryRun, tag) {
  try {
    const res = await fetch(`${AUTODRIVE}/api/integrations/autoconf/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-autoconf-token': token },
      body: JSON.stringify({ rows, dryRun, filters: lastResult.filters, period: lastResult.period }),
    })
    if (!res.ok) {
      // 5xx = servidor demorou/estourou; se dá pra dividir, divide e tenta de novo.
      if (res.status >= 500 && rows.length > 1) {
        const mid = Math.ceil(rows.length / 2)
        log(`Lote ${tag}: HTTP ${res.status}, dividindo em ${mid} + ${rows.length - mid}…`)
        await sendBatch(rows.slice(0, mid), token, dryRun, tag + 'a')
        await sendBatch(rows.slice(mid), token, dryRun, tag + 'b')
        return
      }
      const j = await res.json().catch(() => ({}))
      acc.errors.push(`Lote ${tag}: ${j?.error || ('HTTP ' + res.status)}`)
      log(`Erro no lote ${tag}: ${j?.error || ('HTTP ' + res.status)}`)
      return
    }
    const j = await res.json().catch(() => ({}))
    acc.created += j.created ?? 0
    acc.updated += j.updated ?? 0
    acc.skipped += j.skipped ?? 0
    acc.unmatchedSeller += j.unmatchedSeller ?? 0
    acc.commissionGenerated += j.commissionGenerated ?? 0
    acc.commissionErrors += j.commissionErrors ?? 0
    acc.results.push(...(j.results || []))
  } catch (e) {
    // Rede caiu no meio (comum em timeout). Divide e tenta cada metade.
    if (rows.length > 1) {
      const mid = Math.ceil(rows.length / 2)
      log(`Lote ${tag}: erro de rede, dividindo em ${mid} + ${rows.length - mid}…`)
      await sendBatch(rows.slice(0, mid), token, dryRun, tag + 'a')
      await sendBatch(rows.slice(mid), token, dryRun, tag + 'b')
      return
    }
    acc.errors.push(`Lote ${tag}: erro de rede — ${e?.message || e}`)
    log(`Erro de rede no lote ${tag}: ` + (e?.message || e))
  }
}

async function sendToAutodrive(dryRun) {
  if (!lastResult?.rows?.length) { log('Rode a busca primeiro.'); return }
  const token = $('token').value.trim()
  if (!token) { log('Informe o token do AutoDrive e clique em Salvar.'); return }

  const label = dryRun ? 'Prévia' : 'Importação'
  const slimRows = lastResult.rows.map(slimRowForApi)
  const batches = chunkArray(slimRows, BATCH_SIZE)
  resetAcc()
  log(`${label}: enviando ${slimRows.length} negociações de ${lastResult.period?.periodLabel || 'período filtrado'} em ${batches.length} lote(s) de até ${BATCH_SIZE}...`)

  for (let i = 0; i < batches.length; i++) {
    if (batches.length > 1) log(`Lote ${i + 1}/${batches.length} (${batches[i].length} negociações)...`)
    await sendBatch(batches[i], token, dryRun, String(i + 1))
  }

  log(`${label} concluída — criadas ${acc.created}, atualizadas ${acc.updated}, puladas ${acc.skipped}, vendedor não achado ${acc.unmatchedSeller}, comissões geradas ${acc.commissionGenerated}${acc.commissionErrors ? `, erros de comissão ${acc.commissionErrors}` : ''}.`)
  acc.results.filter((r) => r.action === 'skipped').slice(0, 10).forEach((r) => log(`  - pulada ${r.externalId}: ${r.reason}`))
  acc.results.filter((r) => typeof r.seller === 'string' && r.seller.startsWith('(NÃO')).slice(0, 10).forEach((r) => log(`  - ${r.externalId} ${r.unit}: ${r.seller}`))
  if (acc.errors.length) log(`Atenção: ${acc.errors.length} lote(s) ainda com erro após dividir. Idempotente (dedup por AC-<id>) — pode rodar de novo.`)
}

$('preview').addEventListener('click', () => sendToAutodrive(true))
$('import').addEventListener('click', () => {
  if (!lastResult?.rows?.length) { log('Rode a busca primeiro.'); return }
  const period = lastResult.period?.periodLabel || 'período filtrado'
  const msg = `Importar ${lastResult.rows.length} negociações filtradas para o AutoDrive?\n\nPeríodo: ${period}\n\nIsso cria/atualiza as negociações e pode gerar comissões conforme regras do AutoDrive.`
  if (confirm(msg)) sendToAutodrive(false)
})

// =============================================================================
// CAMPANHA FEIRÃO — atalho para a tela de campanha (convite de troca por WhatsApp)
// =============================================================================
const btnCampanha = document.getElementById('abrirCampanha')
if (btnCampanha) {
  btnCampanha.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'abrirCampanha' })
  })
}

// =============================================================================
// CHECKLIST DE ENTREGA TÉCNICA — atalho para o painel (Jotform → Contratos)
// =============================================================================
const btnChecklist = document.getElementById('abrirChecklist')
if (btnChecklist) {
  btnChecklist.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'abrirChecklist' })
  })
}

// =============================================================================
// TRATAMENTO DE FOTOS DOS VEÍCULOS
//
// Baixa as fotos da origem, separa em <parceiro>/<veículo>/nao tratadas, manda
// para o chat configurado, guarda o resultado em .../tratadas e publica no
// site apagando as antigas e travando o veículo.
//
// A trava é o que evita o ciclo infinito: sem ela, a sincronização devolveria
// as fotos do parceiro a cada 15 minutos.
//
// O trabalho roda no service worker, não aqui: fechar o popup não interrompe
// nada. Esta tela só manda começar e acompanha o registro em storage.
// =============================================================================
  const fotoEls = {
    site: $('fotoSiteUrl'),
    token: $('fotoToken'),
    chat: $('fotoChatUrl'),
    pasta: $('fotoPastaRaiz'),
    limite: $('fotoLimite'),
    espera: $('fotoEspera'),
    comando: $('fotoComando'),
    abrirChat: $('fotoAbrirChat'),
    automatico: $('fotoAutomatico'),
    loteZip: $('fotoLoteZip'),
    status: $('fotoStatus'),
    fila: $('fotoFila'),
    log: $('fotoLog'),
  }

  function fotoAviso(texto, erro) {
    if (!fotoEls.status) return
    fotoEls.status.textContent = texto
    fotoEls.status.style.color = erro ? '#b42318' : ''
  }

  function fotoPedir(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, erro: 'sem resposta' })))
  }

  async function fotoCarregarConfig() {
    const r = await fotoPedir({ type: 'fotoConfig' })
    if (!r.ok) { fotoAviso(r.erro || 'não foi possível ler a configuração', true); return }
    const c = r.config
    if (fotoEls.site) fotoEls.site.value = c.siteUrl || ''
    if (fotoEls.token) fotoEls.token.value = c.token || ''
    if (fotoEls.chat) fotoEls.chat.value = c.chatUrl || ''
    if (fotoEls.pasta) fotoEls.pasta.value = c.pastaRaiz || ''
    if (fotoEls.limite) fotoEls.limite.value = c.limitePorRodada || 5
    if (fotoEls.espera) fotoEls.espera.value = c.esperaMinutos || 5
    if (fotoEls.comando) fotoEls.comando.value = c.comando || ''
    if (fotoEls.abrirChat) fotoEls.abrirChat.checked = c.abrirChat !== false
    if (fotoEls.automatico) fotoEls.automatico.checked = c.automatico !== false
    if (fotoEls.loteZip) fotoEls.loteZip.checked = c.loteZip === true
  }

  /** Escapa texto que vem do banco antes de virar HTML na lista. */
  function fotoTexto(valor) {
    return String(valor ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  }

  function fotoMostrarFila(veiculos) {
    if (!fotoEls.fila) return
    if (!veiculos || !veiculos.length) { fotoEls.fila.innerHTML = '<div class="sub">Nenhum veículo pendente.</div>'; return }
    fotoEls.fila.innerHTML = veiculos
      .map((v) => {
        const pasta = [v.pastaParceiro, v.pastaVeiculo].filter(Boolean).join(' / ')
        const arte = v.artesDaLoja?.length ? ` · ${v.artesDaLoja.length} arte(s) da loja ignorada(s)` : ''
        return `<div class="sub" style="padding:4px 0;border-top:1px solid #e2e8f0">
          <strong>${fotoTexto(v.titulo)}</strong>${v.placa ? ` · ${fotoTexto(v.placa)}` : ''}
          ${v.parceiro ? ` · ${fotoTexto(v.parceiro)}` : ' · particular'}
          <br>${v.fotos.length} foto(s)${arte}${pasta ? `<br><code>${fotoTexto(pasta)}</code>` : ''}
        </div>`
      })
      .join('')
  }

  if (fotoEls.site) {
    async function fotoSalvarConfig() {
      return fotoPedir({
        type: 'fotoSalvarConfig',
        config: {
          siteUrl: fotoEls.site.value,
          token: fotoEls.token ? fotoEls.token.value : '',
          chatUrl: fotoEls.chat.value,
          pastaRaiz: fotoEls.pasta.value,
          limitePorRodada: fotoEls.limite.value,
          esperaMinutos: fotoEls.espera.value,
          comando: fotoEls.comando.value,
          abrirChat: fotoEls.abrirChat.checked,
          automatico: fotoEls.automatico.checked,
          loteZip: fotoEls.loteZip.checked,
        },
      })
    }

  $('fotoSalvar').addEventListener('click', async () => {
    const r = await fotoSalvarConfig()
    fotoAviso(r.ok ? 'Configuração salva.' : (r.erro || 'falhou'), !r.ok)
  })

  $('fotoVerFila').addEventListener('click', async () => {
    fotoAviso('Lendo a fila…')
    const r = await fotoPedir({ type: 'fotoFila', limite: Number(fotoEls.limite.value) || 5 })
    if (!r.ok) { fotoAviso(r.erro || 'falhou', true); return }
    const sobra = r.fila.semFotoPropria
      ? ` ${r.fila.semFotoPropria} ficaram de fora por só terem arte da loja.`
      : ''
    const presos = r.fila.emTratamento
      ? ` ${r.fila.emTratamento} ficaram no meio do tratamento e serão retomados primeiro.`
      : ''
    fotoAviso(`${r.fila.total} veículo(s) aguardando tratamento.${presos}${sobra}`)
    fotoMostrarFila(r.fila.veiculos)
  })

  $('fotoTratar').addEventListener('click', async () => {
    if (!fotoEls.chat.value.trim() && fotoEls.automatico.checked) {
      fotoAviso('Preencha o endereço do chat, ou desligue "tratar e publicar sozinho".', true)
      return
    }
    // Salvar antes de rodar evita o clássico "mudei o comando e ele usou o
    // antigo": o service worker lê a configuração do storage, não da tela.
    await fotoSalvarConfig()
    fotoAviso('Rodada iniciada. Pode fechar esta janela.')
    const r = await fotoPedir({ type: 'fotoTratar', limite: Number(fotoEls.limite.value) || 5 })
    if (!r.ok) { fotoAviso(r.erro || 'falhou', true); return }
    fotoAcompanhar()
  })

  $('fotoAuditar').addEventListener('click', async () => {
    await fotoSalvarConfig()
    fotoAviso('Iniciando auditoria da frota publicada...')
    const r = await fotoPedir({ type: 'fotoAuditar' })
    if (!r.ok) { fotoAviso(r.erro || 'A auditoria falhou.', true); return }
    fotoAcompanhar()
  })

  // Publica no AutoDrive as fotos de uma pasta "tratadas" do disco — para
  // quando o chat tratou tudo mas a rodada caiu antes de publicar. A pasta do
  // carro (PLACA - Marca Modelo…) é a mesma que a fila usa, e é por ela que
  // cada pasta encontra o veículo certo.
  $('fotoCorrigirPasta').addEventListener('change', async (e) => {
    const input = e.target
    const files = [...(input.files || [])]
    if (!files.length) return
    await fotoSalvarConfig()
    fotoAviso('Lendo as pastas "tratadas"…')

    const porPasta = {}
    for (const f of files) {
      const partes = f.webkitRelativePath.split('/')
      const t = partes.indexOf('tratadas')
      if (t < 1 || !/\.(png|jpe?g|webp)$/i.test(f.name)) continue
      ;(porPasta[partes[t - 1]] ||= []).push(f)
    }
    const pastas = Object.keys(porPasta)
    if (!pastas.length) { fotoAviso('Nenhuma pasta "tratadas" com fotos foi encontrada.', true); input.value = ''; return }

    const mapa = await fotoPedir({ type: 'fotoMapaPastas' })
    if (!mapa.ok) { fotoAviso(mapa.erro || 'Não consegui ler o estoque do AutoDrive.', true); input.value = ''; return }

    let publicados = 0
    let ignorados = 0
    let erros = 0
    const anotar = (texto) => {
      if (!fotoEls.log) return
      fotoEls.log.textContent += `\n${texto}`
      fotoEls.log.scrollTop = fotoEls.log.scrollHeight
    }
    for (const pasta of pastas) {
      const alvo = mapa.mapa[pasta]
      if (!alvo) { ignorados++; anotar(`Ignorada: "${pasta}" não corresponde a nenhum carro do AutoDrive.`); continue }
      if (alvo.situacao === 'TRATADA') { ignorados++; anotar(`Já tratado no AutoDrive: ${pasta}.`); continue }
      const arquivos = porPasta[pasta].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
      fotoAviso(`Publicando ${arquivos.length} foto(s) de ${pasta}…`)
      try {
        const lidos = await Promise.all(arquivos.map((f) => new Promise((ok, erro) => {
          const leitor = new FileReader()
          leitor.onload = () => ok({ nome: f.name, dataUrl: leitor.result })
          leitor.onerror = () => erro(leitor.error)
          leitor.readAsDataURL(f)
        })))
        const r = await fotoPedir({ type: 'fotoPublicarArquivos', veiculoId: alvo.id, arquivos: lidos })
        if (!r.ok) throw new Error(r.erro || 'falhou')
        publicados++
        anotar(`Publicado: ${pasta} (${lidos.length} fotos).`)
      } catch (err) {
        erros++
        anotar(`Erro em ${pasta}: ${err.message}`)
      }
    }
    fotoAviso(`Pastas locais: ${publicados} publicada(s), ${ignorados} ignorada(s), ${erros} com erro.`, erros > 0)
    input.value = ''
  })

  $('fotoPreparar').addEventListener('click', async () => {
    await fotoSalvarConfig()
    fotoAviso('Abrindo o grupo de abas e baixando as fotos…')
    const r = await fotoPedir({ type: 'fotoPreparar', limite: Number(fotoEls.limite.value) || 5 })
    if (!r.ok) { fotoAviso(r.erro || 'falhou', true); return }
    fotoAcompanhar()
  })

  $('fotoParar').addEventListener('click', async () => {
    const r = await fotoPedir({ type: 'fotoParar' })
    fotoAviso(r.ok ? 'Vai parar ao terminar a foto atual.' : (r.erro || 'falhou'), !r.ok)
  })

  // Destrava quando a rodada morreu com "rodando" gravado. Preserva o que já
  // foi tratado de cada carro — é isso que faz o próximo "Tratar agora"
  // continuar de onde parou em vez de refazer tudo.
  $('fotoZerar').addEventListener('click', async () => {
    const apagar = window.confirm(
      'Reiniciar a função de tratamento.\n\n' +
        'OK = recomeça a fila, MAS mantém o que já foi tratado de cada carro\n' +
        '     (o carro que parou na foto 18 retoma na 18).\n\n' +
        'Cancelar = também apaga o progresso e refaz tudo do zero.',
    )
    const r = await fotoPedir({ type: 'fotoZerar', apagarProgresso: !apagar })
    if (!r.ok) { fotoAviso(r.erro || 'falhou', true); return }
    const apagados = r.resultado?.progressoApagado || 0
    fotoAviso(
      apagados
        ? `Reiniciado do zero. Progresso de ${apagados} veículo(s) apagado.`
        : 'Reiniciado. O progresso de cada carro foi mantido — retoma de onde parou.',
    )
    if (fotoEls.fila) fotoEls.fila.innerHTML = ''
    if (fotoEls.log) fotoEls.log.textContent = ''
  })

  $('fotoCopiarComando').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(fotoEls.comando.value || '')
      fotoAviso('Comando copiado. Cole no chat junto com as fotos.')
    } catch {
      fotoAviso('Não foi possível copiar; selecione o texto e copie na mão.', true)
    }
  })

  // Acompanha a rodada pelo estado em storage, igual ao checklist faz.
  let fotoTimer = null
  function fotoAcompanhar() {
    if (fotoTimer) clearInterval(fotoTimer)
    fotoTimer = setInterval(async () => {
      const r = await fotoPedir({ type: 'fotoEstado' })
      if (!r.ok) return
      const e = r.estado
      const ultima = (e.log || []).slice(-1)[0]
      if (ultima) fotoAviso(ultima)
      if (fotoEls.log) {
        fotoEls.log.textContent = (e.log || []).join('\n')
        fotoEls.log.scrollTop = fotoEls.log.scrollHeight
      }
      if (e.fila && e.fila.length) fotoMostrarFila(e.fila)
      if (!e.rodando) { clearInterval(fotoTimer); fotoTimer = null }
    }, 1200)
  }

  // ── Imagem de exemplo do estúdio ──────────────────────────────────────
  async function fotoMostrarExemplo() {
    const r = await fotoPedir({ type: 'fotoExemplo' })
    const alvo = $('fotoExemploInfo')
    if (!alvo) return
    if (!r.ok || !r.exemplo) {
      alvo.innerHTML = '<span style="color:#b42318">Nenhuma imagem de exemplo anexada.</span>'
      return
    }
    const mb = (r.exemplo.bytes / 1024 / 1024).toFixed(1)
    alvo.innerHTML =
      `Anexada: <code>${fotoTexto(r.exemplo.nome)}</code> · ${mb} MB` +
      `<br><img src="${r.exemplo.dataUrl}" alt="exemplo do estúdio" style="max-width:150px;border-radius:6px;margin-top:4px">`
  }

  $('fotoExemplo').addEventListener('change', async (evento) => {
    const input = evento.currentTarget
    const arquivo = input.files?.[0]
    if (!arquivo) return
    fotoAviso('Lendo a imagem de exemplo…')
    const dataUrl = await new Promise((resolve, reject) => {
      const leitor = new FileReader()
      leitor.onload = () => resolve(leitor.result)
      leitor.onerror = () => reject(new Error('não consegui ler o arquivo'))
      leitor.readAsDataURL(arquivo)
    }).catch((e) => { fotoAviso(e.message, true); return null })
    if (!dataUrl) return

    const r = await fotoPedir({ type: 'fotoSalvarExemplo', dataUrl, nome: arquivo.name })
    fotoAviso(r.ok ? 'Exemplo do estúdio salvo.' : (r.erro || 'falhou'), !r.ok)
    input.value = ''
    await fotoMostrarExemplo()
  })

  $('fotoExemploRemover').addEventListener('click', async () => {
    const r = await fotoPedir({ type: 'fotoSalvarExemplo', dataUrl: null })
    fotoAviso(r.ok ? 'Exemplo removido.' : (r.erro || 'falhou'), !r.ok)
    await fotoMostrarExemplo()
  })

  fotoCarregarConfig()
  fotoMostrarExemplo()
  // Rodada iniciada antes e ainda viva: reabrir o popup volta a acompanhar.
  fotoPedir({ type: 'fotoEstado' }).then((r) => { if (r.ok && r.estado?.rodando) fotoAcompanhar() })
}
