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

function cleanText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const m = raw.match(/R\$\s*-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|R\$\s*-?\d+(?:,\d{2})?|-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|-?\d+,\d{2}/)
    ?? (raw.match(/^-?\d{4,}$/) ? [raw] : null)
  if (!m) return null
  const n = Number(m[0].replace(/R\$/i, '').trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseAnyDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== 'string') return null
  const br = parseCriadoEm(value)
  if (br) return br
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function isoDate(value) {
  const d = parseAnyDate(value)
  return d ? d.toISOString() : null
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

function selectedText(sel) {
  const opt = sel.querySelector('option[selected]') || (sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null)
  return cleanText(opt?.textContent)
}

function extractEmbeddedJson(doc) {
  const out = []
  for (const script of [...doc.querySelectorAll('script')]) {
    const txt = script.textContent?.trim()
    if (!txt) continue
    if (script.type === 'application/json') {
      try {
        out.push({ source: script.id || 'application/json', data: JSON.parse(txt) })
      } catch (e) {
        out.push({ source: script.id || 'application/json', text: txt.slice(0, 2000) })
      }
      continue
    }
    const next = txt.match(/self\.__next_f\.push\(\[(?:\d+),\s*"(.*)"\]\)/)
    if (next?.[1]) out.push({ source: 'next-flight', text: next[1].slice(0, 2000) })
    const state = txt.match(/(?:__INITIAL_STATE__|__NUXT__|__APP_DATA__)\s*=\s*(\{[\s\S]*?\});?$/)
    if (state?.[1]) {
      try { out.push({ source: 'window-state', data: JSON.parse(state[1]) }) } catch (e) { /* best effort */ }
    }
  }
  return out.slice(0, 12)
}

function extractFormFields(doc) {
  return [...doc.querySelectorAll('input, select, textarea')].map((el) => {
    const label = cleanText(doc.querySelector(`label[for="${el.id}"]`)?.textContent)
      || cleanText(el.closest('label')?.textContent)
      || cleanText(el.closest('div')?.querySelector('label')?.textContent)
    return {
      name: el.getAttribute('name') || null,
      id: el.id || null,
      label: label || null,
      value: el.tagName === 'SELECT' ? selectedText(el) : cleanText(el.value || el.getAttribute('value') || ''),
    }
  }).filter((f) => f.name || f.id || f.label || f.value)
}

function extractTables(doc) {
  return [...doc.querySelectorAll('table')].map((table, tableIndex) => {
    const headers = [...table.querySelectorAll('thead th, thead td')].map((th) => cleanText(th.textContent))
    const rows = [...table.querySelectorAll('tbody tr, tr')].map((tr) => {
      const cells = [...tr.children].map((td) => cleanText(td.textContent))
      if (headers.length && cells.length) {
        return Object.fromEntries(cells.map((cell, i) => [headers[i] || `coluna_${i + 1}`, cell]))
      }
      return cells
    }).filter((r) => Array.isArray(r) ? r.some(Boolean) : Object.values(r).some(Boolean))
    return { tableIndex, headers, rows }
  }).filter((t) => t.rows.length)
}

function extractLabelValues(doc) {
  const pairs = {}

  for (const dt of [...doc.querySelectorAll('dt')]) {
    const key = cleanText(dt.textContent)
    const value = cleanText(dt.nextElementSibling?.textContent)
    if (key && value) pairs[key] = value
  }

  for (const row of [...doc.querySelectorAll('tr')]) {
    const cells = [...row.children].map((c) => cleanText(c.textContent)).filter(Boolean)
    if (cells.length === 2 && cells[0].length <= 80) pairs[cells[0]] = cells[1]
  }

  for (const el of [...doc.querySelectorAll('p, div, span, li')]) {
    const text = cleanText(el.textContent)
    if (!text || text.length > 180 || !text.includes(':')) continue
    const [key, ...rest] = text.split(':')
    const value = rest.join(':').trim()
    if (key && value && key.length <= 60 && value.length <= 140) pairs[key.trim()] = value
  }

  for (const field of extractFormFields(doc)) {
    const key = field.label || field.name || field.id
    if (key && field.value) pairs[key] = field.value
  }

  return pairs
}

function valueByKeys(pairs, keys) {
  const wanted = keys.map(normalizeText)
  for (const [key, value] of Object.entries(pairs || {})) {
    const nk = normalizeText(key)
    if (wanted.some((w) => nk.includes(w))) return cleanText(value)
  }
  return null
}

// A raspagem de <p>/<div>/<span>/<li> em busca de "chave: valor" é heurística e
// pode casar texto de UI não relacionado (ex.: "Limite reserva em: ...
// Imprimir recibo Ver comprovante" quando a chave só precisa CONTER "cliente").
// Filtra valores que claramente não são dado real antes de aceitar o scrape.
function isJunkValue(text) {
  const t = cleanText(text)
  if (!t) return true
  if (t.length > 120) return true
  if (/imprimir|comprovante|recibo|limite reserva|reserva em|clique aqui|ver detalhes/i.test(t)) return true
  return false
}

function rowsFromTables(tables) {
  const out = []
  for (const table of tables) {
    for (const row of table.rows) {
      if (Array.isArray(row)) {
        out.push({ texto: row.join(' | ') })
      } else {
        out.push(row)
      }
    }
  }
  return out
}

function paymentTypeFromText(text) {
  const n = normalizeText(text)
  if (/pix/.test(n)) return 'PIX'
  if (/dinheiro|especie/.test(n)) return 'DINHEIRO'
  if (/debito/.test(n)) return 'CARTAO_DEBITO'
  if (/credito|cartao/.test(n)) return 'CARTAO_CREDITO'
  if (/financi/.test(n)) return 'FINANCIAMENTO'
  if (/boleto/.test(n)) return 'BOLETO'
  if (/transfer|ted|doc/.test(n)) return 'TRANSFERENCIA'
  if (/sinal|entrada/.test(n)) return 'SINAL'
  return 'OUTROS'
}

function debtTypeFromText(text) {
  const n = normalizeText(text)
  if (/multa/.test(n)) return 'MULTA'
  if (/ipva/.test(n)) return 'IPVA'
  if (/licenc/.test(n)) return 'LICENCIAMENTO'
  if (/financi|quitac|alienac/.test(n)) return 'FINANCIAMENTO'
  if (/doc|document/.test(n)) return 'DOCUMENTACAO'
  return 'OUTROS'
}

function objectText(obj) {
  if (typeof obj === 'string') return obj
  if (!obj || typeof obj !== 'object') return ''
  return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(' | ')
}

function extractFinancialRows(tables, pairs, kind) {
  const rows = []
  const words = kind === 'payment'
    ? /pagamento|forma|entrada|sinal|financi|pix|dinheiro|cart[aã]o|boleto|transfer/i
    : /d[eé]bito|multa|ipva|licenciamento|quita[cç][aã]o|financiamento|despesa/i

  for (const row of rowsFromTables(tables)) {
    const text = objectText(row)
    if (!words.test(text)) continue
    const value = parseMoney(text)
    if (!value || value <= 0) continue
    if (kind === 'payment') {
      rows.push({
        type: paymentTypeFromText(text),
        status: /confirmad|pago|baixad/i.test(text) ? 'CONFIRMADO' : 'PENDENTE',
        value,
        paidAt: isoDate(text),
        notes: text.slice(0, 500),
        raw: row,
      })
    } else {
      rows.push({
        type: debtTypeFromText(text),
        description: text.slice(0, 180),
        value,
        responsavel: /cliente|comprador/i.test(text) ? 'COMPRADOR' : (/vendedor|propriet/i.test(text) ? 'VENDEDOR' : 'LOJA'),
        dueDate: isoDate(text),
        notes: text.slice(0, 500),
        raw: row,
      })
    }
  }

  for (const [key, value] of Object.entries(pairs || {})) {
    const text = `${key}: ${value}`
    if (!words.test(text)) continue
    const amount = parseMoney(value) ?? parseMoney(text)
    if (!amount || amount <= 0) continue
    if (kind === 'payment') rows.push({ type: paymentTypeFromText(text), status: 'PENDENTE', value: amount, notes: text.slice(0, 500) })
    else rows.push({ type: debtTypeFromText(text), description: key, value: amount, responsavel: 'LOJA', notes: text.slice(0, 500) })
  }

  const seen = new Set()
  return rows.filter((row) => {
    const key = `${row.type}:${row.value}:${row.notes}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractCustomerDetails(row, pairs) {
  // row.cliente/clienteEmail/clienteContato vêm da API oficial de LISTA do
  // AutoConf (/api/ui/v1/negociacoes) — são estruturados e confiáveis. O scrape
  // do resumo (heurístico, texto solto da página) só complementa o que a lista
  // não tem (CPF/CNPJ, endereço, cidade, estado) e só se não parecer lixo.
  // Chave genérica "cliente" foi removida daqui de propósito: ela casava
  // qualquer bloco de texto que mencionasse a palavra (ex.: aviso de reserva).
  const scrapedNome     = valueByKeys(pairs, ['nome do cliente', 'nome completo', 'comprador'])
  const scrapedCpf      = valueByKeys(pairs, ['cpf/cnpj', 'cpf', 'cnpj', 'documento'])
  const scrapedEmail    = valueByKeys(pairs, ['e-mail', 'email'])
  const scrapedTelefone = valueByKeys(pairs, ['telefone', 'celular', 'whatsapp'])
  const scrapedEndereco = valueByKeys(pairs, ['endereco', 'endereço', 'logradouro'])
  const scrapedCidade   = valueByKeys(pairs, ['cidade'])
  const scrapedEstado   = valueByKeys(pairs, ['estado', 'uf'])

  return {
    nome:     row.cliente || (!isJunkValue(scrapedNome) ? scrapedNome : null),
    cpfCnpj:  !isJunkValue(scrapedCpf) ? scrapedCpf : null,
    email:    row.clienteEmail || (!isJunkValue(scrapedEmail) ? scrapedEmail : null),
    telefone: row.clienteContato || (!isJunkValue(scrapedTelefone) ? scrapedTelefone : null),
    endereco: !isJunkValue(scrapedEndereco) ? scrapedEndereco : null,
    cidade:   !isJunkValue(scrapedCidade) ? scrapedCidade : null,
    estado:   (!isJunkValue(scrapedEstado) && scrapedEstado && scrapedEstado.length <= 2) ? scrapedEstado.toUpperCase() : null,
  }
}

async function fetchJsonCandidate(path) {
  try {
    const r = await fetch(path, { headers: { Accept: 'application/json' }, credentials: 'include' })
    if (!r.ok) return null
    return await r.json()
  } catch (e) {
    return null
  }
}

async function fetchDetalhesNegociacao(row) {
  try {
    const id = row.externalId
    const apiDetalhes = []
    const apiPaths = [
      `/api/ui/v1/negociacoes/${id}`,
      `/api/ui/v1/negociacoes/${id}/resumo`,
      `/api/ui/v1/negociacao/${id}`,
      `/api/ui/v1/negociacao/${id}/resumo`,
    ]
    for (const path of apiPaths) {
      const data = await fetchJsonCandidate(path)
      if (data) apiDetalhes.push({ path, data })
    }

    const r = await fetch(`/negociacao/${id}/resumo`, { headers: { Accept: 'text/html' }, credentials: 'include' })
    if (!r.ok) return { vendedor: null, apiDetalhes, detalheStatus: `HTTP ${r.status}` }
    const html = await r.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const selects = [...doc.querySelectorAll('select')]
    let vendedor = null
    // 1) select cuja vizinhança menciona "vendedor"
    for (const sel of selects) {
      const ctx = `${sel.getAttribute('name') || ''} ${sel.id || ''} ${(sel.closest('div')?.parentElement?.textContent || '').slice(0, 160)}`
      if (/vendedor/i.test(ctx)) {
        const t = selectedText(sel)
        if (t) { vendedor = t; break }
      }
    }
    // 2) fallback: se só existe 1 select na página de resumo, é o do vendedor
    if (!vendedor && selects.length === 1) {
      const t = selectedText(selects[0])
      if (t) vendedor = t
    }

    const tables = extractTables(doc)
    const formFields = extractFormFields(doc)
    const labelValues = extractLabelValues(doc)
    const embeddedJson = extractEmbeddedJson(doc)
    const dataNegociacao =
      valueByKeys(labelValues, ['data da negociacao', 'data da negociação', 'data venda', 'data da venda', 'finalizada em', 'aprovada em'])
      || row.aprovadoEm
      || row.criadoEm
      || null

    const detalhes = {
      vendedor,
      dataNegociacao,
      dataNegociacaoIso: isoDate(dataNegociacao),
      aprovadoEm: valueByKeys(labelValues, ['aprovada em', 'data aprovacao', 'data aprovação']) || row.aprovadoEm || null,
      aprovadoEmIso: isoDate(valueByKeys(labelValues, ['aprovada em', 'data aprovacao', 'data aprovação']) || row.aprovadoEm),
      finalizadoEm: valueByKeys(labelValues, ['finalizada em', 'finalizado em', 'data finalizacao', 'data finalização']),
      finalizadoEmIso: isoDate(valueByKeys(labelValues, ['finalizada em', 'finalizado em', 'data finalizacao', 'data finalização'])),
      clienteDetalhes: extractCustomerDetails(row, labelValues),
      pagamentos: extractFinancialRows(tables, labelValues, 'payment'),
      debitos: extractFinancialRows(tables, labelValues, 'debt'),
      campos: labelValues,
      formularios: formFields,
      tabelas: tables,
      apiDetalhes,
      embeddedJson,
      resumoTexto: cleanText(doc.body?.innerText || '').slice(0, 30000),
      sourceFetchedAt: new Date().toISOString(),
    }

    return detalhes
  } catch (e) {
    return { vendedor: null, detalheStatus: e?.message || String(e) }
  }
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
    autoconfListaRaw: n,
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

  progress(`Lendo detalhes reais de ${preliminaryRows.length} negociações candidatas...`)
  for (let i = 0; i < preliminaryRows.length; i++) {
    const detalhes = await fetchDetalhesNegociacao(preliminaryRows[i])
    preliminaryRows[i].vendedor = detalhes?.vendedor || preliminaryRows[i].vendedor
    preliminaryRows[i].dataNegociacao = detalhes?.dataNegociacao || preliminaryRows[i].aprovadoEm || preliminaryRows[i].criadoEm || null
    preliminaryRows[i].dataNegociacaoIso = detalhes?.dataNegociacaoIso || isoDate(preliminaryRows[i].dataNegociacao) || preliminaryRows[i].criadoEmIso || null
    preliminaryRows[i].aprovadoEm = detalhes?.aprovadoEm || preliminaryRows[i].aprovadoEm || null
    preliminaryRows[i].aprovadoEmIso = detalhes?.aprovadoEmIso || isoDate(preliminaryRows[i].aprovadoEm)
    preliminaryRows[i].finalizadoEm = detalhes?.finalizadoEm || null
    preliminaryRows[i].finalizadoEmIso = detalhes?.finalizadoEmIso || isoDate(preliminaryRows[i].finalizadoEm)
    preliminaryRows[i].clienteDetalhes = detalhes?.clienteDetalhes || null
    preliminaryRows[i].pagamentos = detalhes?.pagamentos || []
    preliminaryRows[i].debitos = detalhes?.debitos || []
    preliminaryRows[i].totalPagamentosDetalhe = preliminaryRows[i].pagamentos.reduce((s, p) => s + (Number(p.value) || 0), 0) || null
    preliminaryRows[i].totalDebitosDetalhe = preliminaryRows[i].debitos.reduce((s, d) => s + (Number(d.value) || 0), 0) || null
    preliminaryRows[i].autoconfDetalhes = detalhes || null

    if (i % 5 === 0 || i === preliminaryRows.length - 1) progress(`Detalhes: ${i + 1}/${preliminaryRows.length}.`, { partial: i + 1 })
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
