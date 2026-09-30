// =============================================================================
// background.js — abre a interface em uma aba no mesmo navegador do AutoConf.
// =============================================================================

// A gravação no Google Contatos mora aqui porque `chrome.identity` não existe
// em content script — o painel do WhatsApp Web precisa pedir por mensagem.
// Também precisamos de feirao-core para normalizar telefone e montar o nome.
try { importScripts('feirao-core.js', 'feirao-resgate.js', 'google-contatos.js') }
catch (e) { console.warn('[feirão] módulos do Google não carregaram:', e) }

// Checklist de entrega técnica (Jotform → aba Contratos do AutoConf).
try { importScripts('checklist-core.js', 'checklist-fluxo.js') }
catch (e) { console.warn('[checklist] módulos não carregaram:', e) }

// Tratamento das fotos dos veículos (site Autodrive → fundo de estúdio).
try { importScripts('fflate.js', 'fotos-core.js') }
catch (e) { console.warn('[fotos] módulo não carregou:', e) }

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
const AUTODRIVE = 'https://www.appautodrive.online'
const BATCH_SIZE = 5
const CHECKPOINT_KEY = 'autoconfSyncCheckpoint'
const BACKOFF_KEY = 'autoconfBackoff'

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
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['snapshot.js', 'scanner.js'] }); await sleep(400); return true } catch (e) { return false }
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
    v2Snapshot: row.v2Snapshot || null,
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
  const st = await getLocal(CHECKPOINT_KEY)
  const checkpoint = st[CHECKPOINT_KEY] || null
  let startBatch = 0
  if (checkpoint && checkpoint.period === (period?.periodLabel || '') && checkpoint.totalRows === rows.length) {
    startBatch = checkpoint.nextBatch || 0
    acc.created = checkpoint.acc?.created || 0
    acc.updated = checkpoint.acc?.updated || 0
    acc.skipped = checkpoint.acc?.skipped || 0
    acc.errors = checkpoint.acc?.errors || 0
    acc.unmatchedSeller = checkpoint.acc?.unmatchedSeller || 0
    acc.commissionGenerated = checkpoint.acc?.commissionGenerated || 0
  }
  for (let i = startBatch; i < batches.length; i++) {
    await sendBatch(batches[i], token, filters, period, acc, String(i + 1))
    await setLocal({ [CHECKPOINT_KEY]: { period: period?.periodLabel || '', totalRows: rows.length, nextBatch: i + 1, acc: { ...acc }, at: Date.now() } })
  }
  await chrome.storage.local.remove(CHECKPOINT_KEY)
  return acc
}

let autoRunning = false
async function runAutoUpdate(opts) {
  const force = opts && opts.force === true
  if (autoRunning) return
  autoRunning = true
  try {
    const st = await getLocal([AUTO_KEY, FILTER_KEY, CREDS_KEY, TOKEN_KEY, BACKOFF_KEY])
    const cfg = st[AUTO_KEY] || {}
    const backoff = st[BACKOFF_KEY] || { consecutiveFailures: 0, nextAllowedAt: 0 }
    if (!force && backoff.nextAllowedAt > Date.now()) return
    if (!force && cfg.enabled !== true) return
    const token = st[TOKEN_KEY]
    if (!token) { await setLastRun(false, 'Sem token do AutoDrive salvo.'); return }

    let filters = st[FILTER_KEY] || {}
    // "Mês atual" rola sozinho para o mês corrente a cada execução.
    if (filters.mode === 'current_month') { const d = new Date(); filters = { ...filters, month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` } }

    const tab = await findOrCreateAutoconfTab()
    await sleep(1800) // dá tempo se a aba acabou de abrir
    await ensureContentScript(tab.id)

    // Auto-login se estiver deslogado.
    const creds = st[CREDS_KEY] || {}
    const login = await sendToTab(tab.id, { action: 'ensureLogin', email: creds.email, password: creds.password })
    if (login && login.submitted) {
      await sleep(5000) // espera o POST /login redirecionar
      await ensureContentScript(tab.id)
    }
    // Confirma o estado de login (o content script é re-injetado após o redirect).
    const status = await sendToTab(tab.id, { action: 'loginStatus' })
    if (status && status.ok && status.loggedOut) {
      await setLastRun(false, creds.email ? 'Não logou — confira o login/senha do AutoConf (ou apareceu captcha).' : 'Deslogado e sem login/senha salvos na extensão. Salve as credenciais.')
      return
    }

    const scan = await sendToTab(tab.id, { action: 'scan', dryRun: true, filters })
    if (!scan.ok) { await setLastRun(false, 'Busca falhou: ' + (scan.error || 'verifique o login')); return }
    const rows = scan.res?.rows || []
    if (cfg.autoImport === false) { await setLastRun(true, `Buscou ${rows.length} negociação(ões) — sem importar (importação automática desligada).`); return }
    if (!rows.length) { await setLastRun(true, 'Nada novo para importar no período.'); return }

    const acc = await importRows(rows, token, scan.res.filters, scan.res.period)
    const ok = !acc.errors
    await setLastRun(ok, `Importado: +${acc.created} criadas, ${acc.updated} atualizadas, ${acc.skipped} puladas, ${acc.commissionGenerated} comissões${acc.errors ? `, ${acc.errors} erro(s)` : ''}.`)
    if (ok) await setLocal({ [BACKOFF_KEY]: { consecutiveFailures: 0, nextAllowedAt: 0 } })
    else {
      const failures = (backoff.consecutiveFailures || 0) + 1
      const delayMs = Math.min(failures * failures * 60000, 3600000)
      await setLocal({ [BACKOFF_KEY]: { consecutiveFailures: failures, nextAllowedAt: Date.now() + delayMs } })
    }
  } catch (e) {
    await setLastRun(false, 'Erro: ' + (e?.message || e))
    const st2 = await getLocal(BACKOFF_KEY)
    const b = st2[BACKOFF_KEY] || { consecutiveFailures: 0 }
    const failures = (b.consecutiveFailures || 0) + 1
    const delayMs = Math.min(failures * failures * 60000, 3600000)
    await setLocal({ [BACKOFF_KEY]: { consecutiveFailures: failures, nextAllowedAt: Date.now() + delayMs } })
  } finally {
    autoRunning = false
  }
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) runAutoUpdate()
  if (typeof CHECKLIST !== 'undefined' && a.name === CHECKLIST.ALARME) CHECKLIST.rodadaAutomatica().catch(() => {})
})
const prepararAlarmes = () => {
  setupAutoAlarm().catch(() => {})
  if (typeof CHECKLIST !== 'undefined') CHECKLIST.configurarAlarme().catch(() => {})
}
chrome.runtime.onStartup.addListener(prepararAlarmes)
chrome.runtime.onInstalled.addListener(prepararAlarmes)
prepararAlarmes()

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req?.type === 'autoConfigChanged') { setupAutoAlarm().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true }
  if (req?.type === 'runAutoNow') { runAutoUpdate({ force: true }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true }
  // Campanha Feirão: o painel do WhatsApp Web pede a tela de campanha.
  if (req?.type === 'abrirCampanha') {
    abrirCampanha(req.hash).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }))
    return true
  }
  // Campanha Feirão: o painel do WhatsApp Web pede para baixar um .vcf.
  // O service worker do MV3 não tem DOM (logo, não tem URL.createObjectURL),
  // por isso o arquivo vai como data: URL — que a API de downloads aceita.
  if (req?.type === 'googleStatus') {
    GOOGLE_CONTATOS.status().then(sendResponse).catch((e) => sendResponse({ conectado: false, motivo: String(e) }))
    return true
  }
  if (req?.type === 'googleConectar') {
    (async () => {
      if (req.clientId) await GOOGLE_CONTATOS.saveCfg({ clientId: String(req.clientId).trim() })
      const a = await GOOGLE_CONTATOS.autorizar({ interativa: true })
      sendResponse(a.ok ? await GOOGLE_CONTATOS.status() : { conectado: false, motivo: a.motivo })
    })().catch((e) => sendResponse({ conectado: false, motivo: String(e) }))
    return true
  }
  if (req?.type === 'googleDesconectar') {
    GOOGLE_CONTATOS.desconectar().then(sendResponse).catch((e) => sendResponse({ ok: false, motivo: String(e) }))
    return true
  }
  if (req?.type === 'googleGravar') {
    gravarNoGoogle({ limite: req.limite || 0, todos: !!req.todos, ids: req.ids || null })
      .then(sendResponse).catch((e) => sendResponse({ ok: false, motivo: String(e && e.message || e) }))
    return true
  }
  if (req?.type === 'pedirAuditoria') {
    pedirAuditoria().then(sendResponse).catch((e) => sendResponse({ ok: false, motivo: String(e) }))
    return true
  }
  // --- Tratamento de fotos dos veículos ---------------------------------------
  if (req?.type && req.type.startsWith('foto')) {
    if (typeof FOTOS === 'undefined') { sendResponse({ ok: false, erro: 'módulo de fotos não carregou' }); return true }
    ;(async () => {
      switch (req.type) {
        case 'fotoConfig': return { ok: true, config: await FOTOS.lerCfg() }
        case 'fotoSalvarConfig': return { ok: true, config: await FOTOS.salvarCfg(req.config || {}) }
        case 'fotoEstado': return { ok: true, estado: await FOTOS.lerEstado() }
        case 'fotoFila': return { ok: true, fila: await FOTOS.lerFila(req.limite) }
        case 'fotoAbrirGrupo': return { ok: true, grupoId: await FOTOS.abrirGrupo() }
        case 'fotoPreparar': {
          // Baixar as fotos de vários veículos leva tempo; o painel acompanha
          // pelo estado em storage, igual ao checklist.
          FOTOS.prepararRodada({ limite: req.limite }).catch(() => {})
          return { ok: true, iniciado: true }
        }
        case 'fotoTratar': {
          // Rodada completa: baixar, tratar no chat e publicar. Pode levar
          // muitos minutos, então também responde na hora e reporta pelo log.
          // A recusa precisa chegar ao painel: antes ela voltava "iniciado" e
          // nada abria, sem aviso nenhum.
          const estado = await FOTOS.lerEstado()
          if (estado.rodando && !FOTOS.rodadaMorta(estado)) {
            return {
              ok: false,
              erro: estado.parar
                ? 'A rodada anterior ainda está parando. Aguarde 1 minuto ou clique em Reiniciar.'
                : 'Já existe uma rodada em andamento. Use Parar, ou Reiniciar se ela travou.',
            }
          }
          FOTOS.rodarTratamento({ limite: req.limite }).catch(() => {})
          return { ok: true, iniciado: true }
        }
        case 'fotoAuditar': {
          FOTOS.rodarAuditoria().catch(() => {})
          return { ok: true, iniciado: true }
        }
        case 'fotoParar': return { ok: true, parado: await FOTOS.pedirParada() }
        case 'fotoExemplo': return { ok: true, exemplo: await FOTOS.lerExemplo() }
        case 'fotoSalvarExemplo':
          return { ok: true, resultado: await FOTOS.salvarExemplo(req.dataUrl, req.nome) }
        // Destrava a extensão quando a rodada morreu com `rodando` gravado.
        // Por padrão preserva o progresso de cada carro, para retomar de onde
        // parou; só apaga se o operador pedir explicitamente.
        case 'fotoZerar': return { ok: true, resultado: await FOTOS.zerar(req.apagarProgresso === true) }
        case 'fotoEnviarTratadas':
          return { ok: true, resultado: await FOTOS.enviarTratadas(req.veiculoId, req.urls, { travar: req.travar }) }
        case 'fotoTravar': return { ok: true, resultado: await FOTOS.travar(req.veiculoId, req.travar !== false) }
        case 'fotoRestaurar': return { ok: true, resultado: await FOTOS.restaurar(req.veiculoId) }
        case 'fotoMapaPastas': return { ok: true, mapa: await FOTOS.mapaDePastas() }
        case 'fotoPublicarArquivos': return { ok: true, resultado: await FOTOS.publicarArquivos(req.veiculoId, req.arquivos) }
        default: return { ok: false, erro: `tipo desconhecido: ${req.type}` }
      }
    })()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, erro: String((e && e.message) || e) }))
    return true
  }

  // --- Checklist de entrega técnica ------------------------------------------
  if (req?.type === 'abrirChecklist') { abrirChecklist().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false })); return true }
  if (req?.type && req.type.startsWith('chk')) {
    if (typeof CHECKLIST === 'undefined') { sendResponse({ ok: false, erro: 'módulo do checklist não carregou' }); return true }
    ;(async () => {
      switch (req.type) {
        case 'chkRodar': {
          // Não esperamos terminar: a rodada pode levar minutos e o painel
          // acompanha pelo estado gravado no storage.
          CHECKLIST.rodar({ form: req.form || 'entrega', dryRun: req.dryRun !== false, desde: req.desde || '', limite: req.limite || 0 }).catch(() => {})
          return { ok: true, iniciado: true }
        }
        case 'chkEstado': return { ok: true, estado: await CHECKLIST.lerEstado() }
        case 'chkRelatorio': return { ok: true, relatorio: await CHECKLIST.relatorio(req.form || 'entrega') }
        case 'chkParar': return await CHECKLIST.parar()
        case 'chkLimparHistorico': return await CHECKLIST.limparHistorico(req.form || null)
        case 'chkSalvarConfig': return await CHECKLIST.salvarConfig(req.config || {})
        case 'chkFormularios': return { ok: true, formularios: Object.values(CHK_CORE.FORMULARIOS).map((f) => ({ chave: f.chave, rotulo: f.rotulo })) }
        case 'chkConfig': {
          const st = await new Promise((r) => chrome.storage.local.get('checklistUltimaAuto', r))
          return { ok: true, config: await CHECKLIST.config(), ultimaAuto: st.checklistUltimaAuto || null }
        }
        default: return { ok: false, erro: 'ação desconhecida: ' + req.type }
      }
    })().then(sendResponse).catch((e) => sendResponse({ ok: false, erro: String(e && e.message || e) }))
    return true
  }
  if (req?.type === 'baixarVcf') {
    baixarTexto(req.conteudo, req.nome, 'text/vcard')
      .then((id) => sendResponse({ ok: true, id }))
      .catch((e) => sendResponse({ ok: false, erro: String(e && e.message || e) }))
    return true
  }
})

// A tela de campanha não enxerga o WhatsApp Web. O service worker faz a ponte:
// acha a aba, pede a varredura ao content script e devolve o resultado.
async function pedirAuditoria() {
  const abas = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' })
  if (!abas.length) return { ok: false, motivo: 'WhatsApp Web não está aberto' }
  try {
    return await chrome.tabs.sendMessage(abas[0].id, { type: 'auditarAgora' })
  } catch (e) {
    return { ok: false, motivo: 'a aba do WhatsApp Web precisa ser recarregada (F5)' }
  }
}

// =============================================================================
// GOOGLE CONTATOS — gravação de ponta a ponta
//
// Fluxo: pega quem já foi chamado e ainda não está na agenda → grava pela
// People API → guarda o resourceName em cada contato para nunca duplicar.
// O .vcf continua existindo como caminho alternativo; este é o automático.
// =============================================================================

async function gravarNoGoogle({ limite = 0, todos = false, ids = null } = {}) {
  if (typeof GOOGLE_CONTATOS === 'undefined' || typeof FEIRAO === 'undefined') {
    return { ok: false, motivo: 'módulos não carregados no service worker' }
  }
  const config = await FEIRAO.getConfig()
  // pendentesGoogle (e NÃO vcardPendentes): quem já baixou um .vcf tem
  // `contatoSalvo = true` sem estar na agenda, e ficava fora para sempre.
  let pendentes = await FEIRAO.pendentesGoogle({ todos })
  if (ids && ids.length) {
    const alvo = new Set(ids)
    pendentes = pendentes.filter((c) => alvo.has(c.id))
  }
  if (limite > 0) pendentes = pendentes.slice(0, limite)
  if (!pendentes.length) return { ok: true, criados: 0, erros: [], nada: true }

  const entradas = pendentes.map((c) => {
    const tel = FEIRAO.normalizarTelefone(c.telefone)
    return { id: c.id, e164: tel.e164, nome: FEIRAO.nomeContato(c, config), contato: c }
  }).filter((e) => e.e164 && e.nome)

  if (!entradas.length) return { ok: true, criados: 0, erros: [], nada: true }

  const r = await GOOGLE_CONTATOS.salvarContatos(entradas, config, (c) => FEIRAO.nomeContato(c, config))
  if (r.motivo === 'sem_client_id' || r.motivo) {
    if (!r.criados.length) return { ok: false, motivo: r.motivo, criados: 0, erros: r.erros || [] }
  }

  // marca no armazenamento o que realmente entrou no Google
  if (r.criados.length) {
    const q = await FEIRAO.getQueue()
    const porId = new Map(r.criados.map((x) => [x.id, x.resourceName]))
    q.forEach((c) => {
      if (porId.has(c.id)) {
        c.googleResourceName = porId.get(c.id)
        c.contatoSalvo = true
        c.vcardPendente = false
      }
    })
    await FEIRAO.saveQueue(q)
    await FEIRAO.registrarGravacaoAgenda([])   // só carimba a hora da última gravação
  }
  return { ok: !r.erros.length, criados: r.criados.length, erros: r.erros, restantes: pendentes.length - r.criados.length }
}

async function baixarTexto(conteudo, nome, mime) {
  const url = `data:${mime};charset=utf-8,` + encodeURIComponent(String(conteudo || ''))
  return chrome.downloads.download({ url, filename: nome, saveAs: false })
}

// =============================================================================
// CAMPANHA FEIRÃO — abertura da tela de campanha (reaproveita a aba se já existe)
// =============================================================================
const CAMPANHA_PATH = 'campanha.html'
const CHECKLIST_PATH = 'checklist.html'

// Painel do checklist de entrega: reaproveita a aba se já estiver aberta.
async function abrirChecklist() {
  const url = chrome.runtime.getURL(CHECKLIST_PATH)
  const abertas = await chrome.tabs.query({ url: url + '*' })
  if (abertas[0]?.id) {
    await chrome.tabs.update(abertas[0].id, { active: true })
    if (abertas[0].windowId) await chrome.windows.update(abertas[0].windowId, { focused: true })
    return
  }
  await chrome.tabs.create({ url, active: true })
}

async function abrirCampanha(hash) {
  const base = chrome.runtime.getURL(CAMPANHA_PATH)
  const url = hash ? `${base}#${hash}` : base
  // reaproveita a aba já aberta; com hash, navega para a visão pedida
  const abertas = await chrome.tabs.query({ url: base + '*' })
  if (abertas[0]?.id) {
    await chrome.tabs.update(abertas[0].id, { active: true, ...(hash ? { url } : {}) })
    if (abertas[0].windowId) await chrome.windows.update(abertas[0].windowId, { focused: true })
    return
  }
  await chrome.tabs.create({ url, active: true })
}
