// =============================================================================
// scanner.js — content script (roda em app.autoconf.com.br, com a sessão logada).
// Varre negociações do AutoConf por período/filtros, lê o vendedor real no
// resumo de cada negociação e devolve linhas normalizadas para o popup.
// =============================================================================

const STATUS_ALVO = ['Finalizada', 'Pendente Contrato', 'Pendente NFe']
const MAX_PAGES = 500

function pad2(n) {
  return String(n).padStart(2, '0')
}

function dateFileLabel(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function addDays(d, days) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizePlate(s) {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function parseBrDateToDate(s) {
  const m = String(s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

// "26/06/26 às 11:49" ou "26/06/2026 às 11:49" -> Date (DD/MM/YY|YYYY)
function parseCriadoEm(s) {
  const m = typeof s === 'string' && s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/)
  if (!m) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const day = Number(m[1])
  const month = Number(m[2])
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

function progress(msg, extra) {
  try { chrome.runtime.sendMessage({ type: 'progress', msg, ...(extra || {}) }) } catch (e) { /* popup fechado */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function asArray(v) {
  return Array.isArray(v) ? v.filter(Boolean).map(String) : []
}

function normalizeFilters(filters = {}) {
  const hasStatuses = Object.prototype.hasOwnProperty.call(filters, 'statuses')
  return {
    mode: filters.mode || 'current_month',
    month: filters.month || null,
    year: filters.year || null,
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
    statuses: hasStatuses ? asArray(filters.statuses) : STATUS_ALVO,
    tipos: asArray(filters.tipos),
    loja: String(filters.loja || '').trim(),
    vendedor: String(filters.vendedor || '').trim(),
    cliente: String(filters.cliente || '').trim(),
    placa: String(filters.placa || '').trim(),
    includeWithoutSeller: filters.includeWithoutSeller !== false,
  }
}

function buildPeriodFromFilters(filters) {
  const now = new Date()
  const mode = filters.mode || 'current_month'

  if (mode === 'month') {
    const m = String(filters.month || '').match(/^(\d{4})-(\d{2})$/)
    if (!m) throw new Error('Mês/Ano inválido.')
    const year = Number(m[1])
    const month = Number(m[2])
    if (month < 1 || month > 12) throw new Error('Mês inválido.')
    const startDate = new Date(year, month - 1, 1)
    const endDateExclusive = new Date(year, month, 1)
    return {
      mode,
      startDate,
      endDateExclusive,
      periodLabel: `${pad2(month)}/${year}`,
      fileLabel: `${year}-${pad2(month)}`,
    }
  }

  if (mode === 'year') {
    const year = Number(filters.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Ano inválido.')
    return {
      mode,
      startDate: new Date(year, 0, 1),
      endDateExclusive: new Date(year + 1, 0, 1),
      periodLabel: String(year),
      fileLabel: String(year),
    }
  }

  if (mode === 'range') {
    const startDate = parseBrDateToDate(filters.dateFrom)
    const endDate = parseBrDateToDate(filters.dateTo)
    if (!startDate) throw new Error('Data inicial inválida.')
    if (!endDate) throw new Error('Data final inválida.')
    if (startDate > endDate) throw new Error('Data inicial não pode ser maior que data final.')
    return {
      mode,
      startDate,
      endDateExclusive: addDays(endDate, 1),
      periodLabel: `${filters.dateFrom} até ${filters.dateTo}`,
      fileLabel: `${dateFileLabel(startDate)}-a-${dateFileLabel(endDate)}`,
    }
  }

  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const endDateExclusive = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return {
    mode: 'current_month',
    startDate,
    endDateExclusive,
    periodLabel: `${pad2(now.getMonth() + 1)}/${now.getFullYear()}`,
    fileLabel: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`,
  }
}

function matchesList(value, list) {
  if (!list || list.length === 0) return true
  const v = normalizeText(value)
  return list.some((item) => {
    const i = normalizeText(item)
    return v === i || v.includes(i) || i.includes(v)
  })
}

function textMatches(value, query) {
  const q = normalizeText(query)
  if (!q) return true
  return normalizeText(value).includes(q)
}

function firstText(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

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

function buildRow(n, criadoEmDate) {
  const saida = mapVeiculos(n.veiculosSaida)
  const entrada = mapVeiculos(n.veiculosEntrada)
  const loja = firstText(
    n.revendaNome,
    n.revenda?.nome,
    n.loja,
    saida[0]?.lojaSaida,
    entrada[0]?.lojaSaida,
    saida[0]?.lojaEntrada,
    entrada[0]?.lojaEntrada,
  )

  return {
    externalId: n.id,
    tipo: n.tipo,
    status: n.status,
    etapa: n.etapa || null,
    criadoEm: n.criadoEm || null,
    criadoEmIso: criadoEmDate ? criadoEmDate.toISOString() : null,
    aprovadoEm: n.estagioAtual?.dataLabel || null,
    cliente: n.cliente || null,
    clienteEmail: n.clienteEmail || null,
    clienteContato: n.clienteContatoCanais?.telefone || n.clienteContato || null,
    responsavelLista: n.responsavel || null,
    vendedor: null,
    loja,
    veiculosSaida: saida,
    veiculosEntrada: entrada,
    saleAmount: saida.reduce((s, v) => s + (v.valor || 0), 0) || null,
    purchaseAmount: entrada.reduce((s, v) => s + (v.valor || 0), 0) || null,
    sourceUrl: `https://app.autoconf.com.br/negociacao/${n.id}/resumo`,
  }
}

function rowPlateValues(row) {
  return [...(row.veiculosSaida || []), ...(row.veiculosEntrada || [])]
    .map((v) => normalizePlate(v.placa))
    .filter(Boolean)
}

function rowMatchesStaticFilters(row, filters) {
  if (filters.loja && !textMatches(row.loja, filters.loja)) return false
  if (filters.cliente) {
    const clienteText = [row.cliente, row.clienteEmail, row.clienteContato].filter(Boolean).join(' ')
    if (!textMatches(clienteText, filters.cliente)) return false
  }
  if (filters.placa) {
    const p = normalizePlate(filters.placa)
    if (!rowPlateValues(row).some((plate) => plate.includes(p))) return false
  }
  return true
}

function rowMatchesExtraFilters(row, filters) {
  if (!rowMatchesStaticFilters(row, filters)) return false
  if (filters.vendedor && !textMatches(row.vendedor, filters.vendedor)) return false
  if (filters.includeWithoutSeller === false && !normalizeText(row.vendedor)) return false
  return true
}

function countBy(rows, pick) {
  const out = {}
  for (const row of rows) {
    const key = typeof pick === 'function' ? pick(row) : row[pick]
    const label = key || '—'
    out[label] = (out[label] || 0) + 1
  }
  return out
}

function periodForResult(period) {
  return {
    mode: period.mode,
    startDate: dateFileLabel(period.startDate),
    endDateExclusive: dateFileLabel(period.endDateExclusive),
    periodLabel: period.periodLabel,
    fileLabel: period.fileLabel,
  }
}

async function scanDeals({ dryRun = true, filters = {} } = {}) {
  const normalizedFilters = normalizeFilters(filters)
  const period = buildPeriodFromFilters(normalizedFilters)
  const warnings = []
  const preliminaryRows = []
  let totalScanned = 0
  let pagesRead = 0
  let stop = false
  let hitPageLimit = false

  progress(`Iniciando varredura: ${period.periodLabel}.`)

  for (let page = 1; page <= MAX_PAGES && !stop; page++) {
    let j
    try {
      const r = await fetch(`/api/ui/v1/negociacoes?page=${page}`, { headers: { Accept: 'application/json' }, credentials: 'include' })
      if (!r.ok) {
        warnings.push(`Falha ao ler página ${page}: HTTP ${r.status}.`)
        progress(`Página ${page}: erro HTTP ${r.status}. Parando.`)
        break
      }
      j = await r.json()
    } catch (e) {
      warnings.push(`Falha ao ler página ${page}.`)
      progress(`Página ${page}: falha de rede. Parando.`)
      break
    }

    pagesRead++
    const list = j?.negociacoes?.data ?? []
    if (list.length === 0) break

    for (const n of list) {
      totalScanned++
      const d = parseCriadoEm(n.criadoEm)

      if (d && d < period.startDate) {
        stop = true
        progress(`Página ${page}: saiu do período filtrado. Parando paginação.`)
        break
      }
      if (!d || d >= period.endDateExclusive) continue
      if (!matchesList(n.status, normalizedFilters.statuses)) continue
      if (!matchesList(n.tipo, normalizedFilters.tipos)) continue

      const row = buildRow(n, d)
      if (!rowMatchesStaticFilters(row, normalizedFilters)) continue
      preliminaryRows.push(row)
    }

    progress(`Página ${page} lida: ${totalScanned} varridas, ${preliminaryRows.length} candidatas antes do vendedor.`, { partial: preliminaryRows.length })
    await sleep(120)

    if (page === MAX_PAGES && !stop) hitPageLimit = true
  }

  if (hitPageLimit) warnings.push('A busca atingiu o limite de páginas. Refine o filtro ou aumente MAX_PAGES com cuidado.')

  progress(`Lendo vendedor de ${preliminaryRows.length} negociações candidatas...`)
  for (let i = 0; i < preliminaryRows.length; i++) {
    preliminaryRows[i].vendedor = await fetchVendedor(preliminaryRows[i].externalId)
    if (i % 5 === 0 || i === preliminaryRows.length - 1) progress(`Vendedor: ${i + 1}/${preliminaryRows.length}.`, { partial: i + 1 })
    await sleep(150)
  }

  const rows = preliminaryRows.filter((row) => rowMatchesExtraFilters(row, normalizedFilters))
  const semVendedor = rows.filter((row) => !normalizeText(row.vendedor)).length
  const byStatus = countBy(rows, 'status')
  const byTipo = countBy(rows, 'tipo')
  const byLoja = countBy(rows, (row) => row.loja || 'Sem loja')

  const result = {
    ok: true,
    filters: normalizedFilters,
    period: periodForResult(period),
    monthLabel: period.periodLabel,
    dryRun,
    pagesRead,
    totalScanned,
    candidatas: rows.length,
    candidatasAntesDetalhe: preliminaryRows.length,
    semVendedor,
    byStatus,
    byTipo,
    byLoja,
    warnings,
    geradoEm: new Date().toISOString(),
    rows,
  }

  progress(`Concluído: ${rows.length} negociações em ${period.periodLabel} (${semVendedor} sem vendedor detectado).`, { done: true })
  return result
}

// Compatibilidade com o fluxo antigo.
async function scanMonth({ dryRun = true, month } = {}) {
  return scanDeals({
    dryRun,
    filters: month
      ? { mode: 'month', month, statuses: STATUS_ALVO, includeWithoutSeller: true }
      : { mode: 'current_month', statuses: STATUS_ALVO, includeWithoutSeller: true },
  })
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req?.action === 'scan') {
    const run = req.filters
      ? scanDeals({ dryRun: req.dryRun !== false, filters: req.filters })
      : scanMonth({ dryRun: req.dryRun !== false, month: req.month })

    run
      .then((res) => sendResponse({ ok: true, res }))
      .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }))
    return true
  }
})
