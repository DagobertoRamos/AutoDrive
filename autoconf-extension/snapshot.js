// =============================================================================
// snapshot.js — Pipeline V2 do importador AutoConf.
// Consome os endpoints REAIS descobertos (Fase 0): cada tela do wizard é uma
// URL Blade server-rendered com valores populados nos inputs; a única API JSON
// é /historico. Fase 0 mapeou:
//   /cliente/{cid}/edit?negociacao_id={id}                        → 34 inputs
//   /negociacao/{id}/veiculo                                      → IDs + papel real (pela URL de ação)
//   /veiculo/{vid}/show                                           → fotos completas
//   /negociacao/{id}/veiculo/{vid}/debito/{did}/edit              → 9 inputs (+ catálogos)
//   /negociacao/{id}/pagamento/{pid}/edit                         → tipo no PATH da action
//   /negociacao/{id}/agendamento                                  → texto por-veículo
//   /api/ui/v1/negociacoes/{id}/historico                         → JSON estruturado
// Retorna um AutoconfNegotiationSnapshot com metadados de origem/prioridade.
// Puro/isolado: nenhum efeito colateral, nenhum POST — só GETs same-origin
// com a sessão logada do próprio usuário.
// =============================================================================

const SNAPSHOT_SCHEMA_VERSION = 2

// ── Helpers puros ────────────────────────────────────────────────────────────
function _clean(s) { return String(s ?? '').replace(/\s+/g, ' ').trim() }
function _norm(s) { return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() }
function _money(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const raw = String(v ?? '').trim()
  if (!raw) return null
  const m = raw.match(/R\$\s*-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|R\$\s*-?\d+(?:,\d{2})?|-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|-?\d+,\d{2}/)
    ?? (raw.match(/^-?\d+(?:\.\d+)?$/) ? [raw] : null)
  if (!m) return null
  const n = Number(m[0].replace(/R\$/i, '').trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
function _parseBrDate(s) {
  const m = String(s || '').trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(?:às?\s+)?(\d{1,2}):(\d{2}))?/)
  if (!m) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0))
  return Number.isNaN(d.getTime()) ? null : d
}
function _iso(s) { const d = _parseBrDate(s); return d ? d.toISOString() : null }

async function _fetchHtml(path) {
  const r = await fetch(path, { headers: { Accept: 'text/html' }, credentials: 'include' })
  if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}`)
  // AutoConf REDIRECIONA silenciosamente etapas do wizard para /resumo quando o
  // status da negociação não permite mais editar (Aguardando Aprovação, Finalizada,
  // Cancelada). Fetch segue redirects → HTTP 200 na página errada, se não olhar
  // r.url o parser tenta ler /resumo como se fosse /debito. Detectar aqui.
  try {
    const requested = new URL(path, location.origin).pathname
    const final = new URL(r.url).pathname
    if (requested && final && requested !== final) {
      throw new Error(`REDIRECTED ${path} → ${final} (status atual não permite editar esta etapa)`)
    }
  } catch (e) {
    if (e?.message?.startsWith('REDIRECTED')) throw e
    // URL constructor error: continua (raro)
  }
  const html = await r.text()
  return new DOMParser().parseFromString(html, 'text/html')
}
async function _fetchJson(path) {
  const r = await fetch(path, { headers: { Accept: 'application/json' }, credentials: 'include' })
  if (!r.ok) return null
  return await r.json().catch(() => null)
}

// Blade renderiza <input value="..."> / <select><option selected>. Coleta
// (name, value, tipo, options-quando-select) de todos os campos do form.
function _extractFormFields(doc) {
  const out = {}
  const selects = {}
  for (const el of doc.querySelectorAll('form input, form select, form textarea')) {
    const name = el.getAttribute('name')
    if (!name || name === '_token' || name === '_method') continue
    if (el.tagName === 'SELECT') {
      const opt = el.querySelector('option[selected]') || el.options[el.selectedIndex]
      out[name] = opt && opt.value ? { value: opt.value, label: _clean(opt.textContent) } : null
      selects[name] = [...el.options].map((o) => ({ value: o.value, label: _clean(o.textContent) }))
    } else if (el.type === 'radio') {
      if (el.checked) out[name] = el.value
    } else if (el.type === 'checkbox') {
      if (el.checked) out[name] = el.value || true
    } else if (el.type === 'file') {
      // Nunca vem valor; só registra existência.
      if (!(name in out)) out[name] = null
    } else {
      out[name] = _clean(el.value || el.getAttribute('value') || '')
    }
  }
  return { fields: out, selects }
}

// URL da action do form (é o endpoint POST — o path revela o tipo do pagamento).
function _formAction(doc) {
  const f = doc.querySelector('form')
  return f ? f.getAttribute('action') : null
}

// ── Cliente ──────────────────────────────────────────────────────────────────
async function fetchCustomerSnapshot(negociacaoId, customerId) {
  try {
    const doc = await _fetchHtml(`/cliente/${customerId}/edit?negociacao_id=${negociacaoId}`)
    const { fields } = _extractFormFields(doc)
    const tipoPessoa = fields.tipo_pessoa_id === '2' ? 'JURIDICA' : 'FISICA'
    const cpfCnpjRaw = fields.cpf_cnpj || ''
    return {
      source: 'autoconf.cliente.edit',
      externalId: String(customerId),
      tipoPessoa,
      nome: fields.nome_razao_social || null,
      cpfCnpj: cpfCnpjRaw ? cpfCnpjRaw.replace(/\D/g, '') : null,
      rg: fields.rg || null,
      dataNascimento: fields.data_nascimento || null,
      dataNascimentoIso: _iso(fields.data_nascimento),
      sexo: fields.sexo || null,
      email: fields.email || null,
      telefone: fields.telefone ? fields.telefone.replace(/\D/g, '') : null,
      estrangeiro: fields.estrangeiro === '1' || fields.estrangeiro === true,
      numDocEstrangeiro: fields.num_doc_estrangeiro || null,
      endereco: {
        cep: fields.cep ? fields.cep.replace(/\D/g, '') : null,
        logradouro: fields.endereco || null,
        numero: fields.numero || null,
        complemento: fields.complemento || null,
        bairro: fields.bairro_desc || null,
        codigoMunicipio: fields.cod_municipio || null,
        externalMunicipioId: fields.municipio?.value || null,
        municipio: fields.municipio?.label || null,
        externalUfId: fields.uf?.value || null,
        uf: fields.uf?.label || null,
      },
      inscricoes: {
        indicador: fields.indicador_inscricao_estadual?.value || null,
        estadual: fields.inscricao_estadual || null,
        suframa: fields.inscricao_suframa || null,
        municipal: fields.inscricao_municipal_tomador_servico || null,
      },
      responsavel: (fields.nome_responsavel || fields.cpf_responsavel) ? {
        nome: fields.nome_responsavel || null,
        sexo: fields.sexo_responsavel || null,
        cpf: fields.cpf_responsavel ? fields.cpf_responsavel.replace(/\D/g, '') : null,
        email: fields.email_responsavel || null,
        telefone: fields.telefone_responsavel ? fields.telefone_responsavel.replace(/\D/g, '') : null,
        dataNascimento: fields.data_nascimento_responsavel || null,
      } : null,
      observacao: fields.observacao || null,
    }
  } catch (e) {
    return { source: 'autoconf.cliente.edit', partial: true, error: String(e?.message || e) }
  }
}

// ── Veículos (papel real pelo path das ações + fallback pelas fotos) ────────
function _vehiclePapelFromActionsUrls(actionsUrls) {
  const s = actionsUrls.join(' ')
  if (/atualizar-preco-venda/i.test(s)) return 'SAIDA'
  if (/atualizar-preco-compra/i.test(s)) return 'ENTRADA'
  return null
}
// Fallback: papel pela origem da foto.
//   /veiculos/fotos/{vid}/…  → estoque próprio → veículo VENDIDO pela loja  → SAIDA
//   /avaliacao/fotos/…       → avaliação      → veículo COMPRADO pela loja → ENTRADA
// Não é 100% (loja pode vender veículo que veio de troca), mas é bem melhor
// que "posição no array" quando o wizard está bloqueado por status.
function _vehiclePapelFromFotos(fotos) {
  if (!fotos || !fotos.length) return null
  if (fotos.some((u) => /\/avaliacao\/fotos\//.test(u))) return 'ENTRADA'
  if (fotos.every((u) => /\/veiculos\/fotos\//.test(u))) return 'SAIDA'
  return null
}

async function fetchVehiclesSnapshot(negociacaoId) {
  // Estratégia: tenta a tela `/veiculo` (rica, tem URLs de ação); se redirecionar
  // (status não permite editar), cai para `/resumo` — sempre acessível — e infere
  // papel do veículo pela origem das fotos (`/veiculos/fotos/{vid}` = ESTOQUE = SAIDA;
  // `/avaliacao/fotos` = AVALIACAO = ENTRADA).
  let doc = null
  let fallback = false
  try { doc = await _fetchHtml(`/negociacao/${negociacaoId}/veiculo`) }
  catch (e) {
    try { doc = await _fetchHtml(`/negociacao/${negociacaoId}/resumo`); fallback = true }
    catch (e2) { return [{ source: 'autoconf.negociacao.veiculo', partial: true, error: String(e2?.message || e2) }] }
  }
  try {
    if (!doc) throw new Error('doc null')
    // Cada bloco de veículo tem links de ação únicos por ID — usa /veiculo/{id}/show
    // como âncora para achar o bloco e capturar seus vizinhos.
    const showLinks = [...doc.querySelectorAll('a[href*="/veiculo/"][href*="/show"]')]
    const vehicles = []
    const seen = new Set()
    for (const showLink of showLinks) {
      const href = showLink.getAttribute('href') || ''
      const m = href.match(/\/veiculo\/(\d+)\/show/)
      if (!m) continue
      const vid = m[1]
      if (seen.has(vid)) continue
      seen.add(vid)

      // Bloco pai que contém as ações desse veículo (procura o card ancestral).
      let card = showLink
      for (let k = 0; k < 8 && card; k++) {
        if (card.querySelector(`a[href*="/veiculo/${vid}/discount"], a[href*="/veiculo/${vid}/remove"], a[href*="/veiculo/${vid}/atualizar-preco"]`)) break
        card = card.parentElement
      }
      card = card || showLink.closest('div')

      const actionUrls = card
        ? [...card.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && h.includes(`/veiculo/${vid}/`))
        : []
      // Fotos (usadas p/ papel-fallback quando não há URLs de ação).
      const fotos = card
        ? [...card.querySelectorAll('img')]
            .map((i) => i.src || i.getAttribute('data-src'))
            .filter((u) => u && (/\/veiculos\/fotos\//.test(u) || /\/avaliacao\/fotos\//.test(u)))
        : []
      const papel = _vehiclePapelFromActionsUrls(actionUrls)
        || _vehiclePapelFromFotos(fotos)
        || 'DESCONHECIDO'

      // Placa: o próprio texto do showLink costuma ser a placa.
      const placa = _clean(showLink.textContent)

      // Texto do card para pescar marca/modelo/versão/ano/valor.
      const cardText = card ? _clean(card.innerText || card.textContent || '') : ''
      // "Chevrolet TRACKER Premier 1.2 Turbo 12V Flex Aut. Flex 2021 R$ 93.900,00 RMJ-6D12  SAÍDA"
      // Ano: primeiro grupo de 4 dígitos entre 1900-2099 do card.
      const anoMatch = cardText.match(/\b(19|20)\d{2}\b/)
      const ano = anoMatch ? Number(anoMatch[0]) : null
      const valor = _money(cardText)

      const origem = fotos.some((u) => /\/avaliacao\/fotos\//.test(u)) ? 'AVALIACAO' : (fotos.length ? 'ESTOQUE' : null)

      vehicles.push({
        source: fallback ? 'autoconf.resumo.veiculo' : 'autoconf.negociacao.veiculo',
        externalId: vid,
        papel,
        papelSource: actionUrls.length && _vehiclePapelFromActionsUrls(actionUrls) ? 'action-url' : (fotos.length ? 'foto-origem' : 'unknown'),
        origem,
        placa: placa || null,
        ano,
        valor,
        actionUrls, // preserva URLs de ação p/ diagnóstico e Fase 2
        fotosThumb: fotos.slice(0, 20),
        showUrl: `/veiculo/${vid}/show`,
        partial: fallback, // marca partial quando papel veio do fallback (sem URLs de ação)
        _cardTextPreview: cardText.slice(0, 240),
      })
    }
    return vehicles
  } catch (e) {
    return [{ source: 'autoconf.negociacao.veiculo', partial: true, error: String(e?.message || e) }]
  }
}

// Detalhe do veículo (fotos 640×480 completas) — só se caller solicitar.
async function fetchVehicleDetail(vehicleId) {
  try {
    const doc = await _fetchHtml(`/veiculo/${vehicleId}/show`)
    const fotos = [...doc.querySelectorAll('img')]
      .map((i) => i.src || i.getAttribute('data-src'))
      .filter((u) => u && (/\/veiculos\/fotos\//.test(u) || /\/avaliacao\/fotos\//.test(u)))
    // uuid do arquivo = último segmento sem extensão (permite dedup entre size variants)
    const fotoObjs = fotos.map((url) => {
      const uu = (url.match(/([a-f0-9-]{8,})\.(jpe?g|png|webp)$/i) || [])[1] || null
      const sz = (url.match(/\/(\d+x\d+)\//) || [])[1] || null
      return { url, uuid: uu, size: sz }
    })
    // dedup por UUID (mesma foto em vários tamanhos = 1 registro).
    const byUuid = new Map()
    for (const f of fotoObjs) {
      if (!f.uuid) continue
      const cur = byUuid.get(f.uuid)
      if (!cur) byUuid.set(f.uuid, { uuid: f.uuid, urls: { [f.size || 'default']: f.url } })
      else cur.urls[f.size || 'default'] = f.url
    }
    return { source: 'autoconf.veiculo.show', externalId: String(vehicleId), fotos: [...byUuid.values()] }
  } catch (e) {
    return { source: 'autoconf.veiculo.show', partial: true, error: String(e?.message || e) }
  }
}

// ── Débitos (por-veículo) ────────────────────────────────────────────────────
async function fetchDebitsSnapshot(negociacaoId) {
  // A lista de débitos vem da tela /debito — coleta as URLs /debito/{did}/edit.
  try {
    const listDoc = await _fetchHtml(`/negociacao/${negociacaoId}/debito`)
    const editLinks = [...listDoc.querySelectorAll('a[href*="/debito/"][href*="/edit"]')]
      .map((a) => a.getAttribute('href'))
      .filter(Boolean)
    // Ex.: /negociacao/732255/veiculo/1028221/debito/451510/edit
    const parsed = editLinks.map((h) => h.match(/\/veiculo\/(\d+)\/debito\/(\d+)\/edit/)).filter(Boolean)
    const debits = []
    const catalogos = { tiposDebito: null, fornecedores: null, produtosGestauto: null }
    for (const [full, vid, did] of parsed) {
      try {
        const doc = await _fetchHtml(full)
        const { fields, selects } = _extractFormFields(doc)
        // Popula catálogos uma única vez (na primeira ocorrência).
        if (!catalogos.tiposDebito && selects.negociacao_tipo_debito_id) catalogos.tiposDebito = selects.negociacao_tipo_debito_id
        if (!catalogos.fornecedores && selects.fornecedor_id) catalogos.fornecedores = selects.fornecedor_id
        if (!catalogos.produtosGestauto && selects.produto_id) catalogos.produtosGestauto = selects.produto_id
        debits.push({
          source: 'autoconf.debito.edit',
          externalId: did,
          vehicleExternalId: vid,
          externalTipoDebitoId: fields.negociacao_tipo_debito_id?.value || null,
          tipoLabel: fields.negociacao_tipo_debito_id?.label || null,
          externalFornecedorId: fields.fornecedor_id?.value || null,
          fornecedorLabel: fields.fornecedor_id?.label || null,
          externalProdutoId: fields.produto_id?.value || null,
          produtoLabel: fields.produto_id?.label || null,
          valor: _money(fields.valor),
          desconto: _money(fields.desconto),
          quemPaga: fields.tipo_debito === '1' ? 'LOJA' : (fields.tipo_debito === '2' ? 'CLIENTE' : null),
          observacao: fields.observacao || null,
        })
      } catch (e) {
        debits.push({ source: 'autoconf.debito.edit', partial: true, externalId: did, vehicleExternalId: vid, error: String(e?.message || e) })
      }
    }
    return { debits, catalogos }
  } catch (e) {
    return { debits: [{ source: 'autoconf.debito.list', partial: true, error: String(e?.message || e) }], catalogos: {} }
  }
}

// ── Pagamentos (tipo real no path da action) ────────────────────────────────
const _PAYMENT_TYPE_FROM_PATH = {
  pix: 'PIX', dinheiro: 'DINHEIRO', financiamento: 'FINANCIAMENTO', boleto: 'BOLETO',
  'cartao-credito': 'CARTAO_CREDITO', 'cartao-debito': 'CARTAO_DEBITO', cheque: 'CHEQUE',
  'ted-doc': 'TRANSFERENCIA', consorcio: 'CONSORCIO', duplicata: 'DUPLICATA', 'nota-promissoria': 'NOTA_PROMISSORIA',
}
function _paymentTypeFromAction(action) {
  if (!action) return 'OUTROS'
  const m = action.match(/\/pagamento\/\d+\/([a-z-]+)\/update/i)
  if (!m) return 'OUTROS'
  return _PAYMENT_TYPE_FROM_PATH[m[1]] || 'OUTROS'
}

async function fetchPaymentsSnapshot(negociacaoId) {
  try {
    const listDoc = await _fetchHtml(`/negociacao/${negociacaoId}/pagamento`)
    const editLinks = [...listDoc.querySelectorAll('a[href*="/pagamento/"][href*="/edit"]')]
      .map((a) => a.getAttribute('href'))
      .filter(Boolean)
    // Ex.: /negociacao/732255/pagamento/1195697/edit
    const ids = [...new Set(editLinks.map((h) => (h.match(/\/pagamento\/(\d+)\/edit/) || [])[1]).filter(Boolean))]
    const payments = []
    for (const pid of ids) {
      try {
        const doc = await _fetchHtml(`/negociacao/${negociacaoId}/pagamento/${pid}/edit`)
        const { fields } = _extractFormFields(doc)
        const action = _formAction(doc)
        const tipo = _paymentTypeFromAction(action)
        payments.push({
          source: 'autoconf.pagamento.edit',
          externalId: pid,
          tipo,
          actionPath: action,
          // Campos comuns
          valor: _money(fields.valor),
          valorTotal: _money(fields.valor_total),
          dataBase: fields.data_base || null,
          dataBaseIso: _iso(fields.data_base),
          dataEmissao: fields.data_emissao || null,
          dataEmissaoIso: _iso(fields.data_emissao),
          observacao: fields.observacao || null,
          // Financiamento
          bancoExternalId: fields.banco_id?.value || null,
          bancoLabel: fields.banco_id?.label || null,
          valorParcela: _money(fields.valor_parcela),
          qtdeParcelas: fields.qtde_parcelas ? Number(fields.qtde_parcelas) : null,
          prazoEntreParcelas: fields.prazo_entre_parcelas ? Number(fields.prazo_entre_parcelas) : null,
          ila: fields.ila ? Number(String(fields.ila).replace(',', '.')) : null,
          irrf: fields.irrf ? Number(String(fields.irrf).replace(',', '.')) : null,
          valorRetorno: _money(fields.valor_retorno),
          retornoExternalId: fields.negociacao_retorno_financiamento_id?.value || null,
          ajusteTaxaRetorno: fields.ajuste_taxa_retorno || null,
          // PIX
          chavePix: fields.chave_pix || null,
          sinal: fields.sinal === '1' || fields.sinal === true,
          dataLimiteReserva: fields.data_limite_reserva || null,
          dataLimiteReservaIso: _iso(fields.data_limite_reserva),
          // Veículo relacionado
          vehicleExternalId: fields.veiculo_id?.value || null,
        })
      } catch (e) {
        payments.push({ source: 'autoconf.pagamento.edit', partial: true, externalId: pid, error: String(e?.message || e) })
      }
    }
    return payments
  } catch (e) {
    return [{ source: 'autoconf.pagamento.list', partial: true, error: String(e?.message || e) }]
  }
}

// ── Agendamento (texto por-veículo) ─────────────────────────────────────────
async function fetchAppointmentsSnapshot(negociacaoId) {
  try {
    const doc = await _fetchHtml(`/negociacao/${negociacaoId}/agendamento`)
    const text = _clean(doc.body?.innerText || '')
    // Datas próximas dos rótulos ENTREGA EM / RECEBIMENTO EM.
    const appts = []
    const entregaMatch = text.match(/entrega em\s*([\d/]+\s*(?:às?\s+)?\d{1,2}:\d{2})/i)
    const receberMatch = text.match(/recebimento em\s*([\d/]+\s*(?:às?\s+)?\d{1,2}:\d{2})/i)
    if (entregaMatch) appts.push({ tipo: 'ENTREGA', data: entregaMatch[1], dataIso: _iso(entregaMatch[1]) })
    if (receberMatch) appts.push({ tipo: 'RECEBIMENTO', data: receberMatch[1], dataIso: _iso(receberMatch[1]) })
    return { source: 'autoconf.agendamento', appointments: appts }
  } catch (e) {
    return { source: 'autoconf.agendamento', partial: true, error: String(e?.message || e) }
  }
}

// ── Histórico (API JSON) ─────────────────────────────────────────────────────
async function fetchHistorySnapshot(negociacaoId) {
  try {
    const j = await _fetchJson(`/api/ui/v1/negociacoes/${negociacaoId}/historico`)
    if (!j) return { source: 'autoconf.historico', partial: true, error: 'sem resposta' }
    const entries = (j.entries || []).map((e) => {
      const div = document.createElement('div')
      div.innerHTML = e.changeHtml || ''
      return {
        externalId: String(e.id),
        usuarioNome: e.usuarioNome || null,
        dataLabel: e.dataLabel || null,
        resumo: _clean(div.textContent).slice(0, 500),
      }
    })
    return { source: 'autoconf.historico', totalEntries: entries.length, entries }
  } catch (e) {
    return { source: 'autoconf.historico', partial: true, error: String(e?.message || e) }
  }
}

// ── Orquestrador ─────────────────────────────────────────────────────────────
// listaRaw: item devolvido por /api/ui/v1/negociacoes?page=N (top-level).
async function buildNegotiationSnapshot(listaRaw, opts) {
  const negociacaoId = String(listaRaw.id)
  const fetchedAt = new Date().toISOString()
  const includePhotos = !!(opts && opts.includePhotos)
  // O ID do cliente NÃO vem na listagem — só aparece no link "[editar]" da tela
  // /negociacao/{id}/cliente. Descobre agora.
  let customerId = null
  try {
    const cdoc = await _fetchHtml(`/negociacao/${negociacaoId}/cliente`)
    const editLink = [...cdoc.querySelectorAll('a[href*="/cliente/"][href*="/edit"]')][0]?.getAttribute('href')
    const m = editLink && editLink.match(/\/cliente\/(\d+)\/edit/)
    customerId = m ? m[1] : null
  } catch { /* ignora — snapshot marca como partial abaixo */ }

  const [customer, vehicles, debitsPack, payments, appointments, history] = await Promise.all([
    customerId ? fetchCustomerSnapshot(negociacaoId, customerId) : Promise.resolve({ source: 'autoconf.cliente.edit', partial: true, error: 'customerId não encontrado' }),
    fetchVehiclesSnapshot(negociacaoId),
    fetchDebitsSnapshot(negociacaoId),
    fetchPaymentsSnapshot(negociacaoId),
    fetchAppointmentsSnapshot(negociacaoId),
    fetchHistorySnapshot(negociacaoId),
  ])

  // Opcional: fotos completas por veículo (mais 1 fetch por VID).
  let vehicleDetails = null
  if (includePhotos && Array.isArray(vehicles) && vehicles.length) {
    vehicleDetails = []
    for (const v of vehicles) {
      if (!v || !v.externalId) continue
      vehicleDetails.push(await fetchVehicleDetail(v.externalId))
    }
  }

  // Mescla fotos completas em cada veículo (dedup por UUID já feita em fetchVehicleDetail).
  if (vehicleDetails && Array.isArray(vehicles)) {
    const detailMap = new Map(vehicleDetails.filter((d) => d && d.externalId).map((d) => [String(d.externalId), d]))
    for (const v of vehicles) {
      if (!v || !v.externalId) continue
      const det = detailMap.get(String(v.externalId))
      if (det && Array.isArray(det.fotos)) v.photos = det.fotos
    }
  }

  const anySectionPartial = [customer, ...(Array.isArray(vehicles) ? vehicles : [vehicles]), ...(debitsPack.debits || []), ...(Array.isArray(payments) ? payments : [payments]), appointments, history]
    .some((s) => s && s.partial)

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sourceSystem: 'AUTOCONF',
    externalNegotiationId: negociacaoId,
    sourceUrl: `https://app.autoconf.com.br/negociacao/${negociacaoId}/resumo`,
    fetchedAt,
    partial: anySectionPartial,
    // top-level da listagem — tipo/status/etapa/criadoEm/loja/vendedor/etc.
    lista: {
      tipo: listaRaw.tipo || null,
      status: listaRaw.status || null,
      etapa: listaRaw.etapa || null,
      criadoEm: listaRaw.criadoEm || null,
      revendaNome: listaRaw.revendaNome || listaRaw.revenda?.nome || null,
      responsavel: listaRaw.responsavel || null,
    },
    customer,
    vehicles,
    debits: debitsPack.debits || [],
    catalogos: debitsPack.catalogos || {},
    payments,
    appointments: appointments.appointments || [],
    history: history.entries || [],
    historyTotal: history.totalEntries ?? null,
  }
}

// ── Adaptador para o formato legado AutoconfRow ─────────────────────────────
// Preserva compatibilidade com /api/integrations/autoconf/deals (Fase 1 não muda
// o servidor). Preenche cada campo com o MELHOR dado disponível do snapshot;
// adiciona `v2Snapshot` (JSON) que o servidor atual ignora silenciosamente e
// que Fase 2 vai consumir para upsert por-filho + AutoconfProductMap.
function _pickVehicleRow(v) {
  return {
    externalId: v?.externalId || null,
    placa: v?.placa || null,
    modelo: null, // preenche em rowFromSnapshot com dados do card
    valor: v?.valor ?? null,
    ano: v?.ano ?? null,
    origem: v?.origem || null,
    fotos: v?.fotosThumb || [],
    photos: v?.photos || null,
  }
}

function rowFromSnapshot(snapshot, legacyRow) {
  // legacyRow = linha do pipeline antigo (buildRow do scanner.js) já com
  // marca/modelo/versão parseados dos veículos da listagem — preserva isso
  // como base e sobrescreve com dados do snapshot (mais confiáveis).
  const veiculosSaida = []
  const veiculosEntrada = []
  const vehicles = Array.isArray(snapshot.vehicles) ? snapshot.vehicles : []
  // Mapa por placa ↔ dados da listagem (marca/modelo/versão) — preserva o texto rico.
  const listVeiculos = [...(legacyRow.veiculosSaida || []), ...(legacyRow.veiculosEntrada || [])]
  const byPlate = new Map(listVeiculos.filter((x) => x?.placa).map((x) => [String(x.placa).toUpperCase(), x]))
  for (const v of vehicles) {
    if (!v || !v.externalId) continue
    const merged = _pickVehicleRow(v)
    const fromList = v.placa ? byPlate.get(v.placa.toUpperCase()) : null
    if (fromList) {
      merged.modelo = fromList.modelo || null
      if (merged.valor == null) merged.valor = fromList.valor ?? null
      merged.lojaEntrada = fromList.lojaEntrada || null
      merged.lojaSaida = fromList.lojaSaida || null
    }
    if (v.papel === 'SAIDA') veiculosSaida.push(merged)
    else if (v.papel === 'ENTRADA') veiculosEntrada.push(merged)
    else if (v.papel === 'DESCONHECIDO') {
      // Fallback: preserva ordem da lista
      if (fromList && legacyRow.veiculosSaida?.includes(fromList)) veiculosSaida.push(merged)
      else veiculosEntrada.push(merged)
    }
  }

  // Cliente rico
  const c = snapshot.customer || {}
  const clienteDetalhes = c.partial ? (legacyRow.clienteDetalhes || null) : {
    nome: c.nome,
    cpfCnpj: c.cpfCnpj,
    email: c.email,
    telefone: c.telefone,
    // Endereço: junta logradouro + número + complemento + bairro; guarda CEP e cidade separados
    endereco: [c.endereco?.logradouro, c.endereco?.numero, c.endereco?.complemento, c.endereco?.bairro].filter(Boolean).join(', ') || null,
    cidade: c.endereco?.municipio || null,
    estado: c.endereco?.uf || null,
    // Campos extras (não usados pelo /deals atual mas trafegam em v2Snapshot):
    rg: c.rg,
    dataNascimento: c.dataNascimento,
  }

  // Pagamentos → formato legado
  const pagamentos = (snapshot.payments || []).filter((p) => p && !p.partial).map((p) => ({
    type: p.tipo,
    status: (p.tipo === 'PIX' && p.dataBase) ? 'CONFIRMADO' : 'PENDENTE',
    value: p.valor,
    bank: p.bancoLabel,
    pixKey: p.chavePix,
    installments: p.qtdeParcelas,
    installmentValue: p.valorParcela,
    returnPct: null,
    firstDueDate: p.dataBaseIso || null,
    paidAt: p.dataBaseIso || null,
    dueDate: null,
    notes: [
      p.tipo === 'PIX' && p.sinal ? 'Sinal de negócio' : null,
      p.dataLimiteReserva ? `Limite reserva: ${p.dataLimiteReserva}` : null,
      p.tipo === 'FINANCIAMENTO' && p.ila ? `ILA=${p.ila}` : null,
      p.tipo === 'FINANCIAMENTO' && p.irrf ? `IRRF=${p.irrf}` : null,
      p.tipo === 'FINANCIAMENTO' && p.valorRetorno ? `Retorno bruto=${p.valorRetorno}` : null,
    ].filter(Boolean).join(' | ') || null,
    raw: p, // preserva o rico p/ eventual leitura
  }))

  // Débitos → formato legado
  const debitos = (snapshot.debits || []).filter((d) => d && !d.partial).map((d) => ({
    vehicleRole: null, // rota atual não usa; snapshot v2 tem vehicleExternalId
    type: d.tipoLabel, // servidor faz normalizeDebtType do rótulo
    description: d.tipoLabel,
    value: d.valor,
    dueDate: null,
    responsavel: d.quemPaga === 'CLIENTE' ? 'COMPRADOR' : 'LOJA',
    notes: [
      d.fornecedorLabel ? `Fornecedor: ${d.fornecedorLabel}` : null,
      d.produtoLabel ? `Produto: ${d.produtoLabel}` : null,
      d.observacao,
    ].filter(Boolean).join(' | ') || null,
    raw: d,
  }))

  // Financeiro (formato usado pelo /deals para retorno + garantias/documentação/despachante)
  const financeiro = (() => {
    const f = { financiamentoValue: 0, financiamentoBank: null, retornoValue: 0, retornoBank: null, despachanteValue: 0, garantias: [] }
    for (const p of snapshot.payments || []) {
      if (p?.tipo === 'FINANCIAMENTO') {
        f.financiamentoValue += p.valor || 0
        if (!f.financiamentoBank) f.financiamentoBank = p.bancoLabel
        if (p.valorRetorno) { f.retornoValue += p.valorRetorno; if (!f.retornoBank) f.retornoBank = p.bancoLabel }
      }
    }
    // Débitos Gestauto → garantias
    for (const d of snapshot.debits || []) {
      if (d?.tipoLabel && /gestauto/i.test(d.tipoLabel)) {
        f.garantias.push({
          produto: d.tipoLabel.replace(/^gestauto\s*-\s*/i, '').trim(),
          externalTipoDebitoId: d.externalTipoDebitoId,
          externalProdutoId: d.externalProdutoId,
          value: d.valor,
          custo: d.valor,
          paidBy: d.quemPaga || null,
          fornecedor: d.fornecedorLabel,
        })
      }
      // Despachante = tipo "Documentação" com fornecedor específico? Fica p/ Fase 2 mapear.
    }
    return f
  })()

  const saleAmount = veiculosSaida.reduce((s, v) => s + (v.valor || 0), 0) || null
  const purchaseAmount = veiculosEntrada.reduce((s, v) => s + (v.valor || 0), 0) || null

  return {
    ...legacyRow,
    clienteDetalhes,
    veiculosSaida: veiculosSaida.length ? veiculosSaida : legacyRow.veiculosSaida,
    veiculosEntrada: veiculosEntrada.length ? veiculosEntrada : legacyRow.veiculosEntrada,
    saleAmount: saleAmount ?? legacyRow.saleAmount,
    purchaseAmount: purchaseAmount ?? legacyRow.purchaseAmount,
    pagamentos: pagamentos.length ? pagamentos : legacyRow.pagamentos,
    debitos: debitos.length ? debitos : legacyRow.debitos,
    financeiro: pagamentos.length || debitos.length ? financeiro : legacyRow.financeiro,
    totalPagamentosDetalhe: pagamentos.reduce((s, p) => s + (p.value || 0), 0) || legacyRow.totalPagamentosDetalhe,
    totalDebitosDetalhe: debitos.reduce((s, d) => s + (d.value || 0), 0) || legacyRow.totalDebitosDetalhe,
    historico: snapshot.history || legacyRow.historico,
    // Aditivo — servidor Fase 1 ignora; Fase 2 consome.
    v2Snapshot: snapshot,
  }
}

// Exposto para o content script (window global, sem module bundler).
window.AutoconfSnapshot = {
  SCHEMA_VERSION: SNAPSHOT_SCHEMA_VERSION,
  buildNegotiationSnapshot,
  rowFromSnapshot,
  // exports p/ teste
  _internals: {
    fetchCustomerSnapshot, fetchVehiclesSnapshot, fetchVehicleDetail,
    fetchDebitsSnapshot, fetchPaymentsSnapshot, fetchAppointmentsSnapshot, fetchHistorySnapshot,
    _paymentTypeFromAction, _extractFormFields, _money, _parseBrDate, _iso,
  },
  setV2Flag: (enabled) => chrome.storage.local.set({ autoconfImportPipelineV2: !!enabled }),
  getV2Flag: () => new Promise((r) => chrome.storage.local.get('autoconfImportPipelineV2', (d) => r(!!d.autoconfImportPipelineV2))),
}
