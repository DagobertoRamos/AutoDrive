// =============================================================================
// scanner.js — content script (roda em app.autoconf.com.br, com a sessão logada).
// Varre as negociações do mês atual, filtra por status, lê o VENDEDOR real na
// página de resumo de cada uma e devolve linhas normalizadas para o popup.
// Modo dry-run: só coleta e resume; NÃO grava no AutoDrive (fase 2).
// =============================================================================

const STATUS_ALVO = ['Finalizada', 'Pendente Contrato', 'Pendente NFe']

// "26/06/26 às 11:49" → Date (DD/MM/YY)
function parseCriadoEm(s) {
  const m = typeof s === 'string' && s.match(/(\d{2})\/(\d{2})\/(\d{2})/)
  if (!m) return null
  return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

function progress(msg, extra) {
  try { chrome.runtime.sendMessage({ type: 'progress', msg, ...(extra || {}) }) } catch (e) { /* popup fechado */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Lê o vendedor "que realizou a negociação" no HTML do resumo (server-side).
async function fetchVendedor(id) {
  try {
    const r = await fetch(`/negociacao/${id}/resumo`, { headers: { Accept: 'text/html' }, credentials: 'include' })
    if (!r.ok) return null
    const html = await r.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const selects = [...doc.querySelectorAll('select')]
    // 1) select cuja vizinhança menciona "vendedor"
    for (const sel of selects) {
      const ctx = `${sel.getAttribute('name') || ''} ${sel.id || ''} ${(sel.closest('div')?.parentElement?.textContent || '').slice(0, 160)}`
      if (/vendedor/i.test(ctx)) {
        const opt = sel.querySelector('option[selected]') || (sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null)
        const t = opt && opt.textContent.trim()
        if (t) return t
      }
    }
    // 2) fallback: se só existe 1 select na página de resumo, é o do vendedor
    if (selects.length === 1) {
      const sel = selects[0]
      const opt = sel.querySelector('option[selected]') || (sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null)
      const t = opt && opt.textContent.trim()
      if (t) return t
    }
    return null
  } catch (e) { return null }
}

function mapVeiculos(arr) {
  return (arr || []).map((v) => ({
    modelo: [v.titulo, v.subtitulo].filter(Boolean).join(' ').trim(),
    placa: v.placa || null,
    valor: typeof v.valor === 'number' ? v.valor : null,
    desconto: typeof v.desconto === 'number' ? v.desconto : null,
    lojaEntrada: v.revendaEntradaNome || null,
    lojaSaida: v.revendaSaidaNome || null,
  }))
}

async function scanMonth({ dryRun = true, month } = {}) {
  const now = new Date()
  const targetYear = month ? Number(month.split('-')[0]) : now.getFullYear()
  const targetMonth = month ? Number(month.split('-')[1]) - 1 : now.getMonth()
  const monthStart = new Date(targetYear, targetMonth, 1)
  const monthEnd = new Date(targetYear, targetMonth + 1, 1)
  const monthLabel = `${String(targetMonth + 1).padStart(2, '0')}/${targetYear}`

  const rows = []
  const byStatus = {}, byTipo = {}
  let totalScanned = 0, pagesRead = 0, semVendedor = 0
  let stop = false

  progress(`Iniciando varredura de ${monthLabel}…`)

  for (let page = 1; page <= 300 && !stop; page++) {
    let j
    try {
      const r = await fetch(`/api/ui/v1/negociacoes?page=${page}`, { headers: { Accept: 'application/json' }, credentials: 'include' })
      if (!r.ok) { progress(`Página ${page}: erro HTTP ${r.status} — parando.`); break }
      j = await r.json()
    } catch (e) { progress(`Página ${page}: falha de rede — parando.`); break }

    pagesRead++
    const list = j?.negociacoes?.data ?? []
    if (list.length === 0) break

    for (const n of list) {
      totalScanned++
      const d = parseCriadoEm(n.criadoEm)
      if (d && d < monthStart) { stop = true; break } // lista é desc por criação → acabou o mês
      if (!d || d >= monthEnd) continue               // futuro/sem data → ignora
      if (!STATUS_ALVO.includes(n.status)) continue    // fora dos status-alvo

      byStatus[n.status] = (byStatus[n.status] || 0) + 1
      byTipo[n.tipo] = (byTipo[n.tipo] || 0) + 1

      const saida = mapVeiculos(n.veiculosSaida)
      const entrada = mapVeiculos(n.veiculosEntrada)
      rows.push({
        externalId: n.id,
        tipo: n.tipo,
        status: n.status,
        etapa: n.etapa || null,
        criadoEm: n.criadoEm || null,
        aprovadoEm: n.estagioAtual?.dataLabel || null,
        cliente: n.cliente || null,
        clienteEmail: n.clienteEmail || null,
        clienteContato: n.clienteContatoCanais?.telefone || n.clienteContato || null,
        responsavelLista: n.responsavel || null,
        vendedor: null, // preenchido a seguir pelo detalhe
        loja: saida[0]?.lojaSaida || entrada[0]?.lojaSaida || saida[0]?.lojaEntrada || entrada[0]?.lojaEntrada || null,
        veiculosSaida: saida,
        veiculosEntrada: entrada,
        saleAmount: saida.reduce((s, v) => s + (v.valor || 0), 0) || null,
        purchaseAmount: entrada.reduce((s, v) => s + (v.valor || 0), 0) || null,
        sourceUrl: `https://app.autoconf.com.br/negociacao/${n.id}/resumo`,
      })
    }
    progress(`Página ${page}: ${rows.length} candidatas no mês até agora…`, { partial: rows.length })
    await sleep(120) // gentileza com o servidor
  }

  // Detalhe: pega o vendedor real de cada candidata.
  progress(`Lendo o vendedor de ${rows.length} negociações (detalhe)…`)
  for (let i = 0; i < rows.length; i++) {
    rows[i].vendedor = await fetchVendedor(rows[i].externalId)
    if (!rows[i].vendedor) semVendedor++
    if (i % 5 === 0) progress(`Vendedor: ${i + 1}/${rows.length}…`, { partial: i + 1 })
    await sleep(150)
  }

  const resumo = {
    monthLabel, dryRun,
    pagesRead, totalScanned,
    candidatas: rows.length,
    semVendedor,
    byStatus, byTipo,
    geradoEm: new Date().toISOString(),
    rows,
  }
  progress(`Concluído: ${rows.length} negociações de ${monthLabel} (${semVendedor} sem vendedor detectado).`, { done: true })
  return resumo
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req?.action === 'scan') {
    scanMonth({ dryRun: req.dryRun !== false, month: req.month })
      .then((res) => sendResponse({ ok: true, res }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }))
    return true // resposta assíncrona
  }
})
