// =============================================================================
// google-contatos.js — grava os clientes direto na sua conta do Google.
//
// POR QUE ISSO EXISTE: o .vcf resolve, mas exige você importar o arquivo à mão
// no Google Contatos. Aqui a extensão escreve direto na conta, e o celular
// sincroniza sozinho — é a única forma de "salvar automático na agenda" que
// existe de verdade. Extensão de navegador não escreve na agenda do telefone.
//
// AUTENTICAÇÃO: launchWebAuthFlow com fluxo implícito. Escolhido de propósito
// em vez de chrome.identity.getAuthToken porque:
//   · getAuthToken exige o client_id fixo no manifest.json — você teria que
//     editar JSON à mão toda vez que trocasse de projeto no Google Cloud;
//   · getAuthToken só funciona se o Chrome estiver logado numa conta Google;
//   · o fluxo implícito não usa client_secret, que não teria como ficar secreto
//     dentro de uma extensão de qualquer jeito.
// O preço é que o token dura ~1h e não há refresh token. Para o nosso uso —
// gravar um punhado de contatos de vez em quando — isso é irrelevante: quando
// expira, tentamos renovar em silêncio e só pedimos sua confirmação se falhar.
//
// ESCOPO: apenas `contacts` (ler e escrever contatos). Nada de e-mail, agenda
// ou arquivos.
// =============================================================================

;(function (raiz) {
  'use strict'

  const ESCOPO = 'https://www.googleapis.com/auth/contacts'
  const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
  const PEOPLE = 'https://people.googleapis.com/v1'
  const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo'
  const REVOKE = 'https://oauth2.googleapis.com/revoke'

  const K_TOKEN = 'feiraoGoogleToken'   // { access_token, expira_em, escopo }
  const K_CFG = 'feiraoGoogleCfg'       // { clientId, grupoResourceName }

  // A People API aceita 200 por chamada — e cobra a MESMA cota diária (200
  // "Daily Contact Writes") tanto para um lote de 2 quanto para um de 200.
  // Mandar pouco por vez é o jeito mais rápido de estourar a cota do projeto.
  const LOTE_MAX = 200

  // --- armazenamento ---------------------------------------------------------
  const get = (k) => new Promise((r) => chrome.storage.local.get(k, (s) => r(s || {})))
  const set = (o) => new Promise((r) => chrome.storage.local.set(o, r))

  async function getCfg() {
    const s = await get(K_CFG)
    return s[K_CFG] || { clientId: '', grupoResourceName: '' }
  }
  async function saveCfg(patch) {
    const cur = await getCfg()
    const novo = { ...cur, ...patch }
    await set({ [K_CFG]: novo })
    return novo
  }
  async function getToken() {
    const s = await get(K_TOKEN)
    return s[K_TOKEN] || null
  }
  async function saveToken(t) { await set({ [K_TOKEN]: t }) }
  async function limparToken() { await set({ [K_TOKEN]: null }) }

  /** URL de retorno que o Chrome reserva para esta extensão. */
  function redirectUri() {
    return chrome.identity.getRedirectURL()
  }

  /** O ID desta extensão — é o que você registra no Google Cloud. */
  function extensaoId() {
    return chrome.runtime.id
  }

  // --- autorização -----------------------------------------------------------

  function montarUrlAuth(clientId, interativa) {
    const p = new URLSearchParams({
      client_id: clientId,
      response_type: 'token',
      redirect_uri: redirectUri(),
      scope: ESCOPO,
      include_granted_scopes: 'true',
    })
    // prompt=none tenta renovar sem incomodar você; se não der, pedimos de novo.
    if (!interativa) p.set('prompt', 'none')
    return `${AUTH}?${p.toString()}`
  }

  function extrairToken(urlRetorno) {
    // o fluxo implícito devolve os dados no fragmento (#), não na query
    const frag = String(urlRetorno || '').split('#')[1] || ''
    const p = new URLSearchParams(frag)
    const erro = p.get('error')
    if (erro) return { erro }
    const token = p.get('access_token')
    if (!token) return { erro: 'resposta sem access_token' }
    const seg = Number(p.get('expires_in') || 3600)
    return {
      access_token: token,
      // 60s de margem: melhor renovar cedo do que falhar no meio de um lote
      expira_em: Date.now() + Math.max(60, seg - 60) * 1000,
      escopo: p.get('scope') || ESCOPO,
    }
  }

  function fluxo(url, interativa) {
    return new Promise((resolve) => {
      try {
        chrome.identity.launchWebAuthFlow({ url, interactive: !!interativa }, (retorno) => {
          const err = chrome.runtime.lastError
          if (err || !retorno) return resolve({ erro: (err && err.message) || 'sem retorno' })
          resolve(extrairToken(retorno))
        })
      } catch (e) { resolve({ erro: String((e && e.message) || e) }) }
    })
  }

  /**
   * Devolve um token válido. Tenta, nesta ordem: o que está guardado → renovação
   * silenciosa → tela de consentimento (só se `interativa`).
   */
  async function autorizar({ interativa = false } = {}) {
    const cfg = await getCfg()
    if (!cfg.clientId) return { ok: false, motivo: 'sem_client_id' }

    const guardado = await getToken()
    if (guardado && guardado.access_token && guardado.expira_em > Date.now()) {
      return { ok: true, token: guardado.access_token }
    }

    let r = await fluxo(montarUrlAuth(cfg.clientId, false), false)
    if (r.erro && interativa) r = await fluxo(montarUrlAuth(cfg.clientId, true), true)

    if (r.erro) {
      await limparToken()
      return { ok: false, motivo: r.erro }
    }
    await saveToken(r)
    return { ok: true, token: r.access_token }
  }

  async function desconectar() {
    const t = await getToken()
    await limparToken()
    await saveCfg({ grupoResourceName: '' })
    if (t && t.access_token) {
      try { await fetch(`${REVOKE}?token=${encodeURIComponent(t.access_token)}`, { method: 'POST' }) }
      catch (e) { /* revogar é melhor-esforço; o token expira sozinho em 1h */ }
    }
    return { ok: true }
  }

  async function status() {
    const cfg = await getCfg()
    if (!cfg.clientId) {
      return { conectado: false, motivo: 'sem_client_id', extensaoId: extensaoId(), redirectUri: redirectUri() }
    }
    const a = await autorizar({ interativa: false })
    if (!a.ok) {
      return { conectado: false, motivo: a.motivo, extensaoId: extensaoId(), redirectUri: redirectUri() }
    }
    let conta = ''
    try {
      const r = await fetch(`${TOKENINFO}?access_token=${encodeURIComponent(a.token)}`)
      if (r.ok) { const j = await r.json(); conta = j.email || '' }
    } catch (e) { /* saber o e-mail é conveniência, não requisito */ }
    return { conectado: true, conta, extensaoId: extensaoId(), redirectUri: redirectUri() }
  }

  // --- chamadas à People API -------------------------------------------------

  async function api(token, caminho, opcoes = {}) {
    const r = await fetch(`${PEOPLE}${caminho}`, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(opcoes.headers || {}),
      },
    })
    const texto = await r.text()
    let corpo = null
    try { corpo = texto ? JSON.parse(texto) : null } catch (e) { corpo = { bruto: texto } }
    if (!r.ok) {
      const msg = (corpo && corpo.error && corpo.error.message) || `HTTP ${r.status}`
      const e = new Error(msg)
      e.status = r.status
      e.corpo = corpo
      throw e
    }
    return corpo
  }

  /**
   * Rótulo da campanha no Google Contatos. É por ele que você apaga o lote
   * inteiro depois, sem catar contato a contato.
   */
  async function garantirGrupo(token, nome) {
    const cfg = await getCfg()
    if (cfg.grupoResourceName) {
      try {
        await api(token, `/${cfg.grupoResourceName}`)
        return cfg.grupoResourceName
      } catch (e) {
        if (e.status !== 404) throw e
        // o grupo foi apagado no Google; recriamos abaixo
      }
    }
    // reaproveita um rótulo de mesmo nome, se você já tiver criado à mão
    const lista = await api(token, '/contactGroups?pageSize=200')
    const achado = (lista.contactGroups || []).find((g) => g.name === nome && g.groupType === 'USER_CONTACT_GROUP')
    if (achado) {
      await saveCfg({ grupoResourceName: achado.resourceName })
      return achado.resourceName
    }
    const criado = await api(token, '/contactGroups', {
      method: 'POST',
      body: JSON.stringify({ contactGroup: { name: nome } }),
    })
    await saveCfg({ grupoResourceName: criado.resourceName })
    return criado.resourceName
  }

  /** Traduz um contato da fila para o formato da People API. */
  function paraPessoa(c, config, grupo, nomeExibicao) {
    const notas = [
      c.veiculo ? `Veículo: ${c.veiculo}${c.ano ? ' ' + c.ano : ''}` : '',
      c.placa ? `Placa: ${c.placa}` : '',
      c.dataCompra ? `Compra: ${c.dataCompra}` : '',
      c.vendedor ? `Vendedor: ${c.vendedor}` : '',
      `Origem: ${(config && config.feiraoNome) || 'campanha'} — cliente de carteira`,
    ].filter(Boolean).join('\n')

    const pessoa = {
      names: [{ unstructuredName: nomeExibicao, givenName: nomeExibicao }],
      phoneNumbers: [{ value: '+' + c.__e164, type: 'mobile' }],
      biographies: [{ value: notas, contentType: 'TEXT_PLAIN' }],
    }
    if (config && config.loja) pessoa.organizations = [{ name: config.loja }]
    if (grupo) pessoa.memberships = [{ contactGroupMembership: { contactGroupResourceName: grupo } }]
    return pessoa
  }

  const fatiar = (arr, n) => {
    const out = []
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
    return out
  }

  /**
   * Grava a lista na conta do Google.
   * @param entradas [{ id, nome, e164, contato }] — já validados por quem chama
   * @returns { ok, criados:[{id, resourceName}], erros:[{id, motivo}] }
   */
  async function salvarContatos(entradas, config, nomeDe) {
    const a = await autorizar({ interativa: false })
    if (!a.ok) return { ok: false, motivo: a.motivo, criados: [], erros: [] }

    const nomeGrupo = (config && config.feiraoNome) || 'Campanha'
    let grupo = ''
    try { grupo = await garantirGrupo(a.token, nomeGrupo) }
    catch (e) { grupo = '' }   // sem rótulo ainda dá para gravar; só perde o agrupamento

    const criados = []
    const erros = []

    for (const fatia of fatiar(entradas, LOTE_MAX)) {
      const corpo = {
        readMask: 'names,phoneNumbers',
        contacts: fatia.map((it) => ({
          contactPerson: paraPessoa(
            { ...it.contato, __e164: it.e164 }, config, grupo,
            nomeDe ? nomeDe(it.contato) : (it.nome || it.contato.nome),
          ),
        })),
      }
      try {
        const r = await api(a.token, '/people:batchCreateContacts', {
          method: 'POST', body: JSON.stringify(corpo),
        })
        const resp = r.createdPeople || []
        fatia.forEach((it, i) => {
          const p = resp[i] && resp[i].person
          if (p && p.resourceName) criados.push({ id: it.id, resourceName: p.resourceName })
          else erros.push({ id: it.id, motivo: 'a API não devolveu o contato criado' })
        })
      } catch (e) {
        const motivo = e.status === 401 ? 'sessão expirou — reconecte'
          : e.status === 403 ? 'permissão negada ou People API desativada no projeto'
          : e.status === 429 ? 'limite de chamadas do Google — tente daqui a pouco'
          : String(e.message || e)
        fatia.forEach((it) => erros.push({ id: it.id, motivo }))
        if (e.status === 401) { await limparToken(); break }
      }
    }

    return { ok: erros.length === 0, criados, erros, grupo }
  }

  const API = {
    ESCOPO, K_TOKEN, K_CFG, LOTE_MAX,
    getCfg, saveCfg, autorizar, desconectar, status, salvarContatos,
    extensaoId, redirectUri, extrairToken, montarUrlAuth, paraPessoa, fatiar,
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = API
  else raiz.GOOGLE_CONTATOS = API
})(typeof self !== 'undefined' ? self : this)
