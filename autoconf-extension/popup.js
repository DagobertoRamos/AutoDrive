// =============================================================================
// popup.js — dispara a varredura na aba do AutoConf e mostra o resumo.
// =============================================================================

const $ = (id) => document.getElementById(id)
let lastResult = null

function log(msg) {
  const el = $('log')
  el.textContent = msg + '\n' + el.textContent
}

function fmtMap(m) {
  const e = Object.entries(m || {})
  return e.length ? e.map(([k, v]) => `${k}: ${v}`).join(' · ') : '—'
}

// Progresso vindo do content script.
chrome.runtime.onMessage.addListener((req) => {
  if (req?.type === 'progress') log(req.msg)
})

async function activeAutoconfTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !/^https:\/\/app\.autoconf\.com\.br\//.test(tab.url || '')) return null
  return tab
}

$('scan').addEventListener('click', async () => {
  const tab = await activeAutoconfTab()
  if (!tab) {
    log('⚠️ Abra o AutoConf (app.autoconf.com.br), logado, na aba ativa e tente de novo.')
    return
  }
  $('scan').disabled = true
  $('scan').textContent = 'Lendo…'
  $('log').textContent = ''
  log('Iniciando…')
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'scan', dryRun: true })
    if (!resp?.ok) throw new Error(resp?.error || 'Falha na varredura.')
    lastResult = resp.res
    render(resp.res)
  } catch (e) {
    log('❌ Erro: ' + (e?.message || e) + '\n(Se a aba acabou de abrir, recarregue-a — o script é injetado no carregamento.)')
  } finally {
    $('scan').disabled = false
    $('scan').textContent = 'Ler negociações do mês (teste)'
  }
})

function render(res) {
  $('stats').style.display = 'block'
  $('count').textContent = res.candidatas
  $('month').textContent = res.monthLabel
  $('byTipo').textContent = fmtMap(res.byTipo)
  $('byStatus').textContent = fmtMap(res.byStatus)
  if (res.semVendedor > 0) {
    $('semVendedorLine').style.display = 'flex'
    $('semVendedor').textContent = res.semVendedor
  }
}

$('download').addEventListener('click', () => {
  if (!lastResult) return
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  chrome.downloads.download({ url, filename: `autoconf-negociacoes-${lastResult.monthLabel.replace('/', '-')}.json` })
})

$('sample').addEventListener('click', () => {
  if (!lastResult?.rows?.length) { log('Sem exemplos.'); return }
  const r = lastResult.rows[0]
  log('Exemplo:\n' + JSON.stringify({
    externalId: r.externalId, tipo: r.tipo, status: r.status,
    vendedor: r.vendedor, loja: r.loja,
    saleAmount: r.saleAmount, purchaseAmount: r.purchaseAmount,
    veiculosSaida: r.veiculosSaida, veiculosEntrada: r.veiculosEntrada,
  }, null, 1))
})
