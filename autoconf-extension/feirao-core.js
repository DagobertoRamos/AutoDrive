// =============================================================================
// feirao-core.js — núcleo compartilhado da Campanha Feirão (AutoConf → WhatsApp)
//
// Carregado tanto pela tela de campanha (campanha.html) quanto pelo painel
// injetado no WhatsApp Web (wa-panel.js). NÃO envia nada sozinho: só decide
// QUEM é o próximo, QUANDO ele pode ser chamado e QUAL texto usar.
// =============================================================================

const FEIRAO = (() => {
  'use strict'

  // ---------------------------------------------------------------------------
  // Chaves de armazenamento
  // ---------------------------------------------------------------------------
  const K = {
    queue: 'feiraoQueue',        // fila de contatos
    config: 'feiraoConfig',      // ritmo, horário, assinatura
    block: 'feiraoBlocklist',    // opt-out permanente (telefones normalizados)
    log: 'feiraoLog',            // trilha de auditoria (LGPD)
    state: 'feiraoState',        // cadência: último envio, contador do dia
    tpl: 'feiraoTemplates',      // textos personalizados pelo usuário
  }

  const DEFAULT_CONFIG = {
    // 'feirao'  → campanha com gancho e dado do cliente (o módulo original)
    // 'resgate' → lista antiga da agenda, sem gancho e sem dado do carro.
    // O modo troca os textos (feirao-resgate.js), aperta o ritmo em
    // sanitizarConfig e muda o que a política de mensagens exige da abertura.
    // 'prospeccao' → apresenta a AutoDrive, os serviços e o estoque (padrão)
    modo: 'prospeccao',
    loja: 'AutoDrive Veículos',
    // Estoque citado na prospecção. É o ÚNICO link que a política aceita num
    // primeiro contato: é o site da própria empresa, não encurtador nem
    // página de terceiro.
    estoqueUrl: 'www.appautodrive.com.br',
    vendedor: 'Dagoberto',
    // Como você se apresenta depois do nome: "Aqui é o Dagoberto EasyCar,
    // especialista em negócios da EasyCar Veículos". Entra em {cargo} e vale
    // para os dois modos — a identificação completa na primeira linha é o que
    // separa a sua mensagem da mensagem de golpe.
    cargo: 'especialista em negócios',
    cidade: 'Osasco',
    // Campanha em cartaz — entra na mensagem do resgate SÓ quando os dois
    // campos estão preenchidos. Campanha sem prazo vira enfeite, e prazo
    // inventado é promessa que a loja não cumpre.
    campanhaAtual: '',
    campanhaAte: '',
    feiraoNome: 'Feirão 10 Dias Easy',   // nome da campanha, entra nas mensagens
    feiraoPeriodo: '20 a 30 de agosto',  // como você fala o período em voz alta
    feiraoAte: '30/08',                  // data-limite citada no follow-up
    anoMinimo: 2018,                     // faixa de destaque da campanha
    // SÓ benefícios efetivamente autorizados. O que não estiver aqui não é citado.
    beneficios: 'condições especiais de financiamento, jantar e a primeira parcela do seguro, conforme as regras da campanha',
    // Abre a conversa sozinha quando o cronômetro zera. NÃO envia — o Enter
    // continua sendo seu. Automatizar o envio dentro do WhatsApp Web viola os
    // Termos Comerciais (§5g) e é detectado no servidor da Meta, não no cliente.
    // Abre a conversa dentro da página já carregada, em vez de recarregar o
    // WhatsApp Web a cada cliente. Se qualquer etapa falhar, o painel volta
    // sozinho para o link oficial — que recarrega, mas nunca erra de contato.
    abrirSemRecarregar: true,
    autoAbrir: false,
    autoAbrirSegundos: 4,                // carência para você cancelar

    // --- agenda ---------------------------------------------------------------
    // Nome com que o cliente é gravado. Campos: {nome} {nomeCurto} {primeiroNome}
    // {campanha} {campanhaLonga} {mesAnoCampanha} {mesAno} {mesAnoCurto} {ano}
    // {modelo} {veiculo}
    // Atenção: {mesAnoCampanha} é o mês em que VOCÊ chamou o cliente (é o que
    // faz sentido no nome do contato: "Feirão 08/2026"). {mesAno} é o mês da
    // COMPRA dele — serve para mensagem, não para agenda.
    // {placa} {vendedor}
    padraoContato: '{nomeCurto} · {campanha} {mesAnoCampanha} · {modelo}',
    campanhaCurta: 'AutoDrive',
    // 'nao' | 'auto' (baixa sozinho de tempos em tempos) | 'lote' (você exporta) | 'imediato'
    salvarContatoAuto: 'auto',
    // No modo 'auto', junta N antes de gravar. O número é alto de propósito:
    // pela People API, um lote de 5 custa a mesma cota diária que um de 200.
    salvarContatoLote: 40,
    salvarContatoMinutos: 30,       // ...ou baixa o que tiver acumulado a cada N minutos

    // --- follow-up e detecção -------------------------------------------------
    retomarDias: 3,                 // respondeu, esfriou e não agendou → puxar de volta
    detectarRespostas: true,        // ler a lista de conversas para marcar quem respondeu
    detectarIntervaloSeg: 20,
    maxPorDia: 30,                 // teto por número por dia
    minIntervaloSeg: 90,           // piso do intervalo aleatório (mínimo 60s)
    maxIntervaloSeg: 240,          // teto do intervalo aleatório
    pausaACada: 8,                 // a cada N envios, pausa longa
    // Conta restrita pela Meta: trava tudo até você liberar de propósito.
    contaRestrita: false,
    restritaEm: 0,
    pausaLongaMin: 8,              // minutos da pausa longa (mín)
    pausaLongaMax: 15,             // minutos da pausa longa (máx)
    horaInicio: 9,
    horaFim: 19,
    sabadoFim: 15,
    domingo: false,
    cooldownDias: 90,              // não repetir o mesmo número antes disso
    followUpDias: 4,               // 2º toque (único) depois de N dias
    maxToques: 2,                  // NUNCA mais que isso por cliente
    alertaRejeicaoPct: 15,         // % de "não quero"/bloqueio nos últimos 20 que dispara freio
  }

  // ---------------------------------------------------------------------------
  // Storage helpers
  //
  // Quando a extensão é recarregada em chrome://extensions, a aba do WhatsApp
  // Web que já estava aberta continua rodando o código ANTIGO — e esse código
  // perde o acesso ao chrome.storage. Cada leitura passava a estourar
  // "Extension context invalidated" no console, o painel parava sem explicar
  // nada, e o Chrome mostrava o arquivo NOVO ao lado do erro, com a linha
  // apontando para um lugar que não fazia sentido.
  //
  // Agora, com o contexto perdido, nada estoura: a leitura devolve vazio, a
  // escrita não faz nada (não tem onde gravar) e aparece um aviso na página
  // pedindo F5 — que é a única coisa que resolve.
  // ---------------------------------------------------------------------------
  const contextoVivo = () => {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id) } catch { return false }
  }

  let avisouContexto = false
  function avisarContextoPerdido() {
    if (avisouContexto || typeof document === 'undefined' || !document.body) return
    avisouContexto = true
    const aviso = document.createElement('div')
    aviso.setAttribute('role', 'alert')
    aviso.textContent = 'A extensão AutoDrive foi atualizada. Aperte F5 para recarregar esta página e continuar a campanha.'
    aviso.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
      'background:#b42318;color:#fff;padding:12px 18px;border-radius:10px;font:600 14px/1.4 system-ui,sans-serif;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center'
    document.body.appendChild(aviso)
  }

  const get = (keys) => new Promise((r) => {
    if (!contextoVivo()) { avisarContextoPerdido(); r({}); return }
    try { chrome.storage.local.get(keys, (v) => r(v || {})) } catch { avisarContextoPerdido(); r({}) }
  })
  const set = (obj) => new Promise((r) => {
    if (!contextoVivo()) { avisarContextoPerdido(); r(); return }
    try { chrome.storage.local.set(obj, r) } catch { avisarContextoPerdido(); r() }
  })

  // ===========================================================================
  // LIMITES DE SEGURANÇA DO NÚMERO
  //
  // Estes limites existem porque o número do Beto foi restringido pela Meta
  // depois de o intervalo entre mensagens ser reduzido na mão. A trava estava
  // só na tela de configuração — ou seja, era um pedido, não um limite. Aqui
  // ela vira limite de verdade: qualquer valor fora da faixa é corrigido na
  // LEITURA da configuração, então nem um valor já salvo, nem uma edição
  // futura, conseguem baixar o ritmo abaixo do seguro.
  //
  // Os números não são chute. O que a Meta observa é padrão de máquina:
  // intervalo curto e regular, volume alto num número que não conversa com
  // estranhos, e proporção alta de mensagens não respondidas. Intervalo curto
  // é o sinal mais fácil de detectar — e foi o que aconteceu.
  // ===========================================================================
  const LIMITES = {
    minIntervaloSeg: { min: 60, max: 1800, padrao: 90 },
    maxIntervaloSeg: { min: 120, max: 3600, padrao: 240 },
    maxPorDia: { min: 1, max: 60, padrao: 30 },
    pausaACada: { min: 3, max: 15, padrao: 8 },
    alertaRejeicaoPct: { min: 5, max: 40, padrao: 15 },
  }

  /** Encaixa a configuração dentro dos limites. Devolve o que foi corrigido. */
  function sanitizarConfig(cfg) {
    const out = { ...cfg }
    const ajustes = []
    Object.entries(LIMITES).forEach(([chave, lim]) => {
      const bruto = Number(out[chave])
      const valor = Number.isFinite(bruto) ? bruto : lim.padrao
      const preso = Math.min(lim.max, Math.max(lim.min, valor))
      if (preso !== valor || !Number.isFinite(bruto)) {
        ajustes.push({ chave, pedido: out[chave], usado: preso })
      }
      out[chave] = preso
    })
    // O teto precisa ficar acima do piso, senão o sorteio degenera num
    // intervalo fixo — e intervalo fixo é padrão de robô.
    if (out.maxIntervaloSeg < out.minIntervaloSeg + 30) {
      ajustes.push({ chave: 'maxIntervaloSeg', pedido: out.maxIntervaloSeg, usado: out.minIntervaloSeg + 30 })
      out.maxIntervaloSeg = out.minIntervaloSeg + 30
    }

    // O resgate é mais arriscado que o feirão: lista velha, sem gancho e sem
    // dado do cliente. Aqui os limites são MAIS apertados — e, como o resto
    // desta função, são limite de verdade, não sugestão de tela.
    // A prospecção também é contato frio — e ainda leva o link do estoque.
    // Recebe os mesmos limites do resgate.
    if (out.modo === 'resgate' || out.modo === 'prospeccao') {
      const apertar = (chave, teto) => {
        if (Number(out[chave]) > teto) { ajustes.push({ chave, pedido: out[chave], usado: teto }); out[chave] = teto }
      }
      const levantar = (chave, piso) => {
        if (Number(out[chave]) < piso) { ajustes.push({ chave, pedido: out[chave], usado: piso }); out[chave] = piso }
      }
      apertar('maxPorDia', 25)          // lista fria cansa o número mais rápido
      apertar('maxToques', 1)           // sem 2º toque frio: é ele que vira denúncia
      apertar('alertaRejeicaoPct', 10)  // freio antes, não depois
      apertar('horaFim', 18)
      apertar('sabadoFim', 13)
      levantar('horaInicio', 10)
      levantar('minIntervaloSeg', 90)
      out.domingo = false
    }

    out.__ajustes = ajustes
    return out
  }

  async function getConfig() {
    const st = await get(K.config)
    return sanitizarConfig({ ...DEFAULT_CONFIG, ...(st[K.config] || {}) })
  }
  async function saveConfig(patch) {
    const cur = await getConfig()
    const next = { ...cur, ...patch }
    await set({ [K.config]: next })
    return next
  }
  async function getQueue() {
    const st = await get(K.queue)
    return Array.isArray(st[K.queue]) ? st[K.queue] : []
  }
  async function saveQueue(q) { await set({ [K.queue]: q }) }
  async function getBlocklist() {
    const st = await get(K.block)
    return Array.isArray(st[K.block]) ? st[K.block] : []
  }
  async function addToBlocklist(tel) {
    const list = await getBlocklist()
    if (!list.includes(tel)) { list.push(tel); await set({ [K.block]: list }) }
    return list
  }
  // ---------------------------------------------------------------------------
  // Migração de configuração
  //
  // getConfig faz { ...DEFAULT_CONFIG, ...salvo } — ou seja, o que já está salvo
  // SEMPRE vence o padrão novo. Mudar um default no código não muda nada para
  // quem já usou a extensão. Por isso as mudanças de comportamento precisam
  // passar por aqui.
  // ---------------------------------------------------------------------------
  // Chave que google-contatos.js usa para o token. Aqui só se lê, para saber se
  // a gravação no Google está de fato disponível.
  const K_GOOGLE_TOKEN = 'feiraoGoogleToken'

  const MIGRACAO_ATUAL = 5

  async function migrarConfig() {
    const st = await get(K.config)
    const cfg = st[K.config] || {}
    const de = cfg.migracao || 0
    if (de >= MIGRACAO_ATUAL) return { migrou: false, de }

    const patch = { migracao: MIGRACAO_ATUAL }
    // v2 — a gravação da agenda passou a ser automática. Quem tinha 'lote'
    // herdado da versão anterior acumulava contatos e nunca via arquivo sair.
    if (de < 2 && (!cfg.salvarContatoAuto || cfg.salvarContatoAuto === 'lote')) {
      patch.salvarContatoAuto = 'auto'
    }
    // v2 — detecção de resposta ligada por padrão para quem ainda não escolheu.
    if (de < 2 && cfg.detectarRespostas === undefined) patch.detectarRespostas = true

    // v3 — o nome na agenda usava {mesAno}, que é o mês da COMPRA. Na agenda
    // isso vira "Feirão 08/2019" para um cliente chamado em 08/2026. O que
    // identifica o contato é o mês da CAMPANHA. Troca só o token, preservando
    // qualquer outra personalização que o usuário tenha feito no padrão.
    if (de < 3) {
      const atual = cfg.padraoContato
      if (!atual) patch.padraoContato = DEFAULT_CONFIG.padraoContato
      else if (/\{mesAno(Curto)?\}/.test(atual)) {
        patch.padraoContato = atual.replace(/\{mesAno(Curto)?\}/g, '{mesAnoCampanha}')
      }
    }

    // v4 — o módulo deixou de ser "feirão" e virou prospecção AutoDrive.
    // Troca o modo e os textos de identidade que ainda estavam no padrão
    // antigo; o que o usuário personalizou fica como está.
    if (de < 4) {
      if (!cfg.modo || cfg.modo === 'feirao') patch.modo = 'prospeccao'
      if (!cfg.loja || cfg.loja === 'EasyCar Veículos') patch.loja = DEFAULT_CONFIG.loja
      if (!cfg.campanhaCurta || cfg.campanhaCurta === 'Feirão') patch.campanhaCurta = DEFAULT_CONFIG.campanhaCurta
      if (!cfg.estoqueUrl) patch.estoqueUrl = DEFAULT_CONFIG.estoqueUrl
    }

    // v5 — a apresentação é "Dagoberto, da AutoDrive Veículos", pedido do
    // Beto. A loja entra com a grafia oficial da marca.
    if (de < 5) {
      patch.vendedor = DEFAULT_CONFIG.vendedor
      patch.loja = DEFAULT_CONFIG.loja
    }

    await saveConfig(patch)
    return { migrou: true, de, para: MIGRACAO_ATUAL, patch }
  }

  async function removeFromBlocklist(tel) {
    const list = await getBlocklist()
    const fora = list.filter((t) => t !== tel)
    if (fora.length !== list.length) await set({ [K.block]: fora })
    return fora
  }

  async function getLog() {
    const st = await get(K.log)
    return Array.isArray(st[K.log]) ? st[K.log] : []
  }
  async function appendLog(entry) {
    const log = await getLog()
    log.push({ at: Date.now(), ...entry })
    // mantém a trilha enxuta: 5.000 eventos é bem mais que uma temporada de feirão
    await set({ [K.log]: log.slice(-5000) })
  }
  async function getState() {
    const st = await get(K.state)
    return st[K.state] || { lastSentAt: 0, day: '', sentToday: 0, sinceLongPause: 0, pausedUntil: 0, freio: false }
  }
  async function saveState(patch) {
    const cur = await getState()
    const next = { ...cur, ...patch }
    await set({ [K.state]: next })
    return next
  }

  // ---------------------------------------------------------------------------
  // Telefone — normalização brasileira para E.164 sem "+"
  // ---------------------------------------------------------------------------
  const DDDS_VALIDOS = new Set([
    11,12,13,14,15,16,17,18,19, 21,22,24, 27,28, 31,32,33,34,35,37,38,
    41,42,43,44,45,46, 47,48,49, 51,53,54,55, 61, 62,64, 63, 65,66, 67,
    68, 69, 71,73,74,75,77, 79, 81,87, 82, 83, 84, 85,88, 86,89, 91,93,94,
    92,97, 95, 96, 98,99,
  ])

  /**
   * Devolve { ok, e164, tipo: 'movel'|'fixo', motivo }
   * Aceita "(11) 98765-4321", "11987654321", "+55 11 98765 4321", "5511987654321".
   */
  function normalizarTelefone(raw) {
    let d = String(raw || '').replace(/\D+/g, '')
    if (!d) return { ok: false, motivo: 'vazio' }

    // remove 0 de operadora / DDD com 0 na frente
    if (d.length > 11 && d.startsWith('0')) d = d.replace(/^0+/, '')
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1)

    if (d.length < 10 || d.length > 11) return { ok: false, motivo: `dígitos inválidos (${d.length})` }

    const ddd = Number(d.slice(0, 2))
    if (!DDDS_VALIDOS.has(ddd)) return { ok: false, motivo: `DDD ${ddd} inexistente` }

    let numero = d.slice(2)
    // celular antigo de 8 dígitos começando em 6-9 → o WhatsApp usa o 9 na frente
    if (numero.length === 8 && /^[6-9]/.test(numero)) numero = '9' + numero

    const tipo = numero.length === 9 && /^9/.test(numero) ? 'movel' : 'fixo'
    if (tipo === 'fixo') return { ok: false, e164: `55${ddd}${numero}`, tipo, motivo: 'telefone fixo — sem WhatsApp' }

    return { ok: true, e164: `55${d.slice(0, 2)}${numero}`, tipo }
  }

  function formatarTelefoneBR(e164) {
    const d = String(e164 || '').replace(/\D+/g, '').replace(/^55/, '')
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    return e164 || ''
  }

  // ---------------------------------------------------------------------------
  // Texto — spintax, primeiro nome, saudação, tempo de posse
  // ---------------------------------------------------------------------------

  /** Resolve {a|b|c} de forma aleatória, com aninhamento. */
  function spin(texto, rnd = Math.random) {
    let s = String(texto || '')
    let guard = 0
    while (/\{[^{}]*\|[^{}]*\}/.test(s) && guard++ < 50) {
      s = s.replace(/\{([^{}]*\|[^{}]*)\}/, (_, grupo) => {
        const ops = grupo.split('|')
        return ops[Math.floor(rnd() * ops.length)]
      })
    }
    return s
  }

  const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

  /** "MARIA DAS DORES SILVA" → "Maria". Trata nome todo em caixa alta. */
  // Palavras que aparecem em nome importado de planilha/agenda e NÃO são nome.
  const RUIDO_NOME = new Set(['autodrive', 'importado', 'importada', 'importar', 'cliente', 'contato',
    'whatsapp', 'zap', 'tel', 'telefone', 'celular', 'sem', 'nome', 'null', 'undefined'])

  /**
   * Nome vindo de CSV mal separado chega assim:
   *   "Fernando,souza,easycar,............importado"
   * Sem tratar, o primeiroNome() devolve a linha inteira e a mensagem sai
   * "Oi, Fernando,souza,easycar,............importado!" — que foi exatamente o
   * "nome errado" que apareceu na campanha.
   */
  /**
   * Conserta o nome que veio como LINHA INTEIRA da exportação do Google
   * Contatos. Caso real na fila:
   *
   *   "Edson Rodrigues Gol,,,,,,,,,,,,,,,,Importado em 22/08 1 ::: * myContacts,,,,,,,Main,"
   *   "Carol,Alves,Tucson,,,,,,,,,,,,Importado em 22/08 1 ::: * myContacts,,,,,,,Mobile"
   *
   * O CSV do Google começa com Nome, Nome do meio e Sobrenome — as três
   * primeiras colunas. O resto é organização, cargo, etiqueta ("Importado em
   * 22/08 1 ::: * myContacts") e tipo de telefone ("Main", "Mobile"). Então o
   * nome de verdade são as três primeiras colunas, sem as vazias:
   *
   *   → "Edson Rodrigues Gol AutoDrive"
   *   → "Carol Alves Tucson AutoDrive"
   *
   * O "AutoDrive" no fim é o padrão pedido para a agenda: marca de onde veio o
   * contato. Nome que já está limpo não é tocado.
   */
  const LINHA_DE_EXPORTACAO = /,{2,}|importado em|mycontacts|:::/i
  const MARCA_AGENDA = 'AutoDrive'

  function nomeLimpoContato(nome) {
    const bruto = String(nome == null ? '' : nome).trim()
    if (!bruto || !LINHA_DE_EXPORTACAO.test(bruto)) return bruto
    const nomeReal = bruto.split(',').slice(0, 3)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ')
      .trim()
    if (!nomeReal) return bruto
    return new RegExp(`\\b${MARCA_AGENDA}\\b`, 'i').test(nomeReal) ? nomeReal : `${nomeReal} ${MARCA_AGENDA}`
  }

  /**
   * Passa a limpeza em toda a fila e grava. Roda sozinha antes de sortear o
   * próximo contato, então a mensagem nunca sai com o nome bagunçado — e o
   * contato gravado na agenda também não. O nome antigo fica em nomeOriginal.
   */
  async function higienizarNomes() {
    const q = await getQueue()
    let corrigidos = 0
    q.forEach((c) => {
      const limpo = nomeLimpoContato(c.nome)
      if (limpo && limpo !== c.nome) {
        if (!c.nomeOriginal) c.nomeOriginal = c.nome
        c.nome = limpo
        corrigidos++
      }
    })
    if (corrigidos) {
      await saveQueue(q)
      await appendLog({ tipo: 'nomes_corrigidos', quantos: corrigidos })
    }
    return { corrigidos }
  }

  function limparNomeBruto(nome) {
    return String(nome == null ? '' : nome)
      .replace(/\S+@\S+/g, ' ')       // e-mail não é nome
      .replace(/[;,|/]+/g, ' ')      // separador de planilha colado no nome
      .replace(/\.{2,}/g, ' ')         // "............"
      .replace(/[_*<>"]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Devolve o motivo pelo qual este nome não deveria ir para uma mensagem, ou
   * '' quando está bom. É trava de envio, não enfeite: chamar o cliente pelo
   * lixo do import queima o contato de vez.
   */
  function nomeSuspeito(nome) {
    // "José Junior · Feirão 08/2026 · Kwid" é o NOSSO padrão de agenda e está
    // certo: só a primeira parte é o nome da pessoa.
    const bruto = String(nome == null ? '' : nome).split('·')[0].trim()
    if (!bruto) return 'está sem nome'
    if (/[;,|]/.test(bruto)) return 'parece uma linha de planilha colada no campo do nome'
    if (/\.{3,}/.test(bruto)) return 'tem uma sequência de pontos no meio'
    if (/@/.test(bruto)) return 'tem e-mail no lugar do nome'
    // Ano NÃO é problema: "bruno uno 2019" é justamente o formato bom da
    // agenda. O que não pode é telefone dentro do nome.
    if (/\d{8,}/.test(bruto.replace(/\D/g, '').length >= 10 ? bruto.replace(/\D/g, '') : '')) return 'tem um telefone dentro do nome'
    const palavras = limparNomeBruto(bruto).split(' ').filter(Boolean)
    if (!palavras.length) return 'não sobrou nada depois de limpar o nome'
    if (palavras.length > 6) return 'tem palavras demais para ser um nome de pessoa'
    if (!palavras.some((p) => /^[A-Za-zÀ-ÿ]{3,}$/.test(p) && !RUIDO_NOME.has(p.toLowerCase()))) {
      return 'não tem nenhuma palavra que pareça um nome'
    }
    return ''
  }

  function primeiroNome(nomeCompleto) {
    const bruto = limparNomeBruto(String(nomeCompleto == null ? '' : nomeCompleto).split('·')[0])
      // etiqueta entre parênteses é do dono da agenda, não parte do nome:
      // "(Webmotors) Mauro" tem de virar "Mauro", nunca "(webmotors)"
      .replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
    if (!bruto) return ''
    const partes = bruto.split(/\s+/)
      // token com número ou palavra de ruído não é nome de gente
      .filter((p) => p && !/\d/.test(p) && !RUIDO_NOME.has(p.toLowerCase()))
    let escolhido = partes[0] || ''
    // nomes que começam com partícula ou com 1-2 letras: pega a próxima palavra útil
    if (escolhido.length <= 2 || PARTICULAS.has(escolhido.toLowerCase())) {
      escolhido = partes.find((p) => p.length > 2 && !PARTICULAS.has(p.toLowerCase())) || escolhido
    }
    return escolhido.charAt(0).toUpperCase() + escolhido.slice(1).toLowerCase()
  }

  /** "FIAT ARGO DRIVE 1.3" → "Argo" (modelo curto, o que o cliente chama). */
  function modeloCurto(veiculo) {
    const s = String(veiculo || '').trim()
    if (!s) return 'seu carro'
    const MARCAS = /^(fiat|volkswagen|vw|chevrolet|gm|ford|hyundai|toyota|honda|renault|nissan|jeep|peugeot|citroen|citroën|mitsubishi|kia|caoa|chery|byd|ram|land|mercedes|bmw|audi|volvo|suzuki|subaru|jac|troller)\b[\s-]*/i
    let t = s.replace(MARCAS, '').trim()
    // "New Fiesta Hatch" → o modelo é Fiesta; "New" é qualificador de geração.
    t = t.replace(/^(new|novo|nova)\s+/i, '').trim()
    const palavra = (t.split(/\s+/)[0] || s.split(/\s+/)[0] || '').replace(/[^A-Za-zÀ-ÿ0-9-]/g, '')
    if (!palavra) return 'seu carro'
    return ajustaCaixaModelo(palavra)
  }

  /**
   * Caixa correta do nome do modelo. A carteira vem com grafia inconsistente
   * ("KA", "CROSSFOX", "Xc60", "HR-V"), e "seu KA" lido no WhatsApp soa gritado.
   */
  /**
   * "CHEVROLET CRUZE SPORT6" → "Chevrolet Cruze Sport6".
   * O cadastro vem em caixa alta; mensagem em caixa alta parece panfleto.
   */
  function veiculoTitulo(v) {
    const s = String(v || '').trim()
    if (!s) return 'seu carro'
    return s.split(/\s+/).map((w, i) => {
      // Da terceira palavra em diante é sigla de versão (EXL, LTZ, XEI, SE):
      // essas o mercado escreve em caixa alta mesmo. Marca e modelo, não.
      if (i >= 2 && w.length <= 3 && w === w.toUpperCase() && /^[A-ZÀ-Ú]+$/.test(w)) return w
      return ajustaCaixaModelo(w)
    }).join(' ')
  }

  function ajustaCaixaModelo(p) {
    const lower = p.toLowerCase()
    const IRREGULARES = { i30: 'i30', i20: 'i20', ix35: 'ix35', ix25: 'ix25', up: 'up!' }
    if (IRREGULARES[lower]) return IRREGULARES[lower]
    if (/^\d+$/.test(p)) return p                                  // 208, 408, 500, 207
    if (p.includes('-')) {                                          // HR-V, CR-V, T-Cross
      return p.split('-').map((s) => (s.length <= 2
        ? s.toUpperCase()
        : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())).join('-')
    }
    if (/\d/.test(p)) return p.toUpperCase()                        // HB20, XC60, S10, C4, X1
    if (/[a-zà-ÿ][A-ZÀ-Þ]/.test(p)) return p                        // SpaceCross, EcoSport
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()     // Ka, Fox, Uno, Crossfox
  }

  function saudacao(d = new Date()) {
    const h = d.getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

  function parseData(v) {
    if (!v) return null
    if (v instanceof Date) return isNaN(v) ? null : v
    const s = String(v).trim()
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    const d = new Date(s)
    return isNaN(d) ? null : d
  }

  /** "há 2 anos e 3 meses" / "há 8 meses" */
  function tempoDePosse(dataCompra, agora = new Date()) {
    const d = parseData(dataCompra)
    if (!d) return ''
    let meses = (agora.getFullYear() - d.getFullYear()) * 12 + (agora.getMonth() - d.getMonth())
    if (meses < 0) meses = 0
    const anos = Math.floor(meses / 12)
    const resto = meses % 12
    if (anos === 0) return meses <= 1 ? 'há pouco tempo' : `há ${meses} meses`
    if (resto === 0) return anos === 1 ? 'há 1 ano' : `há ${anos} anos`
    return `há ${anos} ${anos === 1 ? 'ano' : 'anos'} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`
  }

  function mesAno(dataCompra) {
    const d = parseData(dataCompra)
    if (!d) return ''
    return `${MESES[d.getMonth()]} de ${d.getFullYear()}`
  }

  // ---------------------------------------------------------------------------
  // Banco de mensagens
  //
  // Regras que sustentam esses textos (não mexa sem saber o porquê):
  //  • 1º contato NÃO leva link, imagem, preço nem lista — link em mensagem fria
  //    é o sinal nº 1 de spam e derruba a taxa de resposta.
  //  • Sempre identifica quem fala e de onde, na primeira linha: o cliente não
  //    tem o número salvo.
  //  • Sempre cita um dado concreto (carro, mês da compra, tempo de posse) —
  //    é o que separa "mensagem pra mim" de "disparo".
  //  • Termina com UMA pergunta fácil de responder com "sim" ou "quanto?".
  //  • O opt-out é humano ("me avisa que eu não te incomodo mais"), não um
  //    "responda SAIR" — que denuncia robô e convida ao bloqueio.
  //  • Até 2 toques por cliente. Nunca um terceiro.
  // ---------------------------------------------------------------------------

  // ===========================================================================
  // POLÍTICA COMERCIAL DE MENSAGENS (Commercial Messaging Policy)
  //
  // Camada ÚNICA de regras. Toda mensagem gerada pela extensão — abertura,
  // follow-up, playbook e qualquer texto editado à mão — passa por aqui antes
  // de poder ser enviada. Não duplique estas regras em outro arquivo.
  //
  // PRINCÍPIO: o SDR não promete o resultado da negociação. Ele vende a
  // oportunidade de negociar. A mensagem deve fazer o cliente pensar "pode
  // valer a pena conversar com eles", nunca "eles já garantiram quanto vão
  // pagar no meu carro".
  //
  // Gravidade:
  //   'bloqueia' — impede o envio. Promessa comercial não confirmada.
  //   'revisa'   — libera, mas avisa. Depende do que está autorizado na campanha.
  // ===========================================================================

  const POLITICA = {
    versao: '1.0',
    regras: [
      // --- valores -----------------------------------------------------------
      {
        id: 'valor_reais', gravidade: 'bloqueia', nome: 'Valor em reais',
        teste: /R\$\s?\d|\b\d{1,3}\s?mil\b|\b\d{2,3}\s?k\b/i,
        porque: 'Valor em mensagem vira promessa. Preço, entrada, parcela e avaliação só depois da análise.',
        alternativa: 'Fale em possibilidade: "podemos avaliar e verificar as possibilidades".',
      },
      {
        id: 'quanto_vale', gravidade: 'bloqueia', nome: 'Afirmar quanto o carro vale',
        teste: /\bseu\s+(carro|ve[íi]culo|usado|semi\s?novo|seminovo)\s+(vale|est[áa]\s+valendo|vai\s+valer)/i,
        porque: 'Só o avaliador define valor, e presencialmente.',
        alternativa: '"Vale a pena trazer para avaliarmos e verificar as possibilidades."',
      },
      {
        id: 'valor_cheio', gravidade: 'bloqueia', nome: 'Valor cheio / valor de tabela',
        teste: /valor\s+cheio|100\s?%\s+d[ao]\s+(tabela|fipe)|tabela\s+cheia/i,
        porque: 'Promessa de valor sem avaliação.',
        alternativa: '"Podemos avaliar seu usado dentro das condições do feirão."',
      },

      // --- FIPE --------------------------------------------------------------
      {
        id: 'fipe_pagamento', gravidade: 'bloqueia', nome: 'Prometer FIPE',
        teste: /(pag\w+|cobri\w+|garant\w+|damos|dou|consigo|fecha\w*)\s+(a\s+|sua\s+|pela\s+|o\s+valor\s+d[ae]\s+)?(tabela\s+)?fipe|(acima|abaixo|em\s+cima)\s+d[ae]\s+(tabela\s+)?fipe|fipe\s+(cheia|integral)|avali\w+\s+(pel[ao]|com\s+base\s+n[ao]|n[ao])\s+(tabela\s+)?fipe/i,
        porque: 'REGRA 2 — nunca prometer FIPE. É a promessa que mais gera conflito na entrega.',
        alternativa: '"Podemos avaliar seu usado e verificar as possibilidades da campanha."',
      },
      {
        id: 'fipe_mencao', gravidade: 'revisa', nome: 'Menção à FIPE',
        teste: /\bfipe\b/i,
        porque: 'Só cite FIPE se for condição oficial da campanha, aprovada, e sobre o preço do estoque — nunca sobre a avaliação do usado do cliente.',
        alternativa: 'Prefira "condições comerciais especiais durante o feirão".',
      },

      // --- avaliação ---------------------------------------------------------
      {
        id: 'avaliacao_superlativa', gravidade: 'bloqueia', nome: 'Avaliação garantida ou superlativa',
        teste: /(melhor|maior|top|topo|m[áa]xim[ao]|super|[óo]tima|excelente)\s+(avalia[çc][ãa]o)|avalia[çc][ãa]o\s+(no\s+topo|m[áa]xima|garantid[ao]|cheia|acima\s+d[oa])|melhor\s+avalia|avalia\w*\s+melhor\s+que/i,
        porque: 'REGRA 3 — nunca garantir o resultado da avaliação. "Melhor avaliação do mercado" só se for mensagem oficial e autorizada da campanha.',
        alternativa: '"Estamos com condições especiais para avaliação e troca durante o feirão."',
      },
      {
        id: 'pagando_acima', gravidade: 'bloqueia', nome: 'Pagando acima do normal',
        teste: /(pag\w+|avali\w+|compr\w+)\s+(bem\s+)?(acima|mais)\s+(do\s+|que\s+o\s+)?(normal|mercado|de\s+costume)|acima\s+do\s+normal/i,
        porque: 'Promessa de valor disfarçada.',
        alternativa: '"Durante o feirão estamos com condições especiais para troca."',
      },
      {
        id: 'melhor_valor', gravidade: 'bloqueia', nome: 'Melhor valor / pico da avaliação',
        teste: /melhor\s+(valor|pre[çc]o)|no\s+pico|valor\s+m[áa]ximo|margem\s+(cheia|m[áa]xima)|sai\s+no\s+melhor/i,
        porque: 'Afirma um resultado que depende de análise.',
        alternativa: '"As condições da campanha estão interessantes — vale a pena avaliarmos."',
      },

      // --- taxa e financiamento ---------------------------------------------
      {
        id: 'taxa_individual', gravidade: 'bloqueia', nome: 'Taxa garantida ao cliente',
        teste: /(menor|melhor)\s+taxa|taxa\s+(de\s+)?\d|sua\s+taxa\s+(ser[áa]|vai\s+ser|fica)|taxa\s+melhor\s+que|taxa\s+garantid/i,
        porque: 'REGRA 4 — taxa depende de banco, perfil e análise. Divulgue a campanha, não o resultado individual.',
        alternativa: '"Estamos com condições especiais de financiamento no feirão. Vale a pena simular."',
      },
      {
        id: 'aprovacao', gravidade: 'bloqueia', nome: 'Financiamento aprovado',
        teste: /(financiamento|cr[ée]dito|proposta)\s+(j[áa]\s+)?(est[áa]\s+)?(pr[ée].?)?aprovad|(j[áa]\s+)?(est[áa]|foi)\s+aprovad|j[áa]\s+liberaram|cr[ée]dito\s+liberado/i,
        porque: 'REGRA 5 — nunca afirmar aprovação sem confirmação no sistema.',
        alternativa: '"Posso verificar as condições disponíveis para o seu perfil."',
      },
      {
        id: 'entrada_parcela', gravidade: 'bloqueia', nome: 'Entrada ou parcela prometida',
        teste: /(entrada|parcela|presta[çc][ãa]o|troco)\b[^.!?\n]{0,24}?\b\d{3,}|(entrada|parcela|presta[çc][ãa]o|troco)\s+(de\s+)?R?\$\s?\d|sem\s+entrada|entrada\s+zero|parcela\s+a\s+partir/i,
        porque: 'Condição financeira individual sem simulação.',
        alternativa: '"Vale a pena simular — posso verificar as opções para o seu perfil."',
      },

      // --- promessas implícitas ---------------------------------------------
      {
        id: 'garantia_verbal', gravidade: 'bloqueia', nome: 'Verbo de garantia',
        teste: /\b(garanto|garantimos|garantir\w*|garantid[ao]|asseguro|prometo|pode\s+contar\s+com|tenho\s+certeza\s+(que|de\s+que)|com\s+certeza\s+(vamos|consigo|d[áa])|fique\s+tranquilo\s+que\s+(vamos|consigo))\b/i,
        porque: 'REGRA 14 — não basta tirar "FIPE"; promessa equivalente em outras palavras é a mesma promessa.',
        alternativa: '"Vamos avaliar e verificar as possibilidades."',
      },
      {
        id: 'futuro_comprometido', gravidade: 'bloqueia', nome: 'Compromisso no futuro do indicativo',
        teste: /\b(vamos|vou|irei|iremos)\s+(pagar|cobrir|chegar\s+em|fechar\s+em|dar)\b|\b(vou|vamos|irei|iremos)\s+conseguir\s+(a\s+|o\s+|um[a]?\s+)?(melhor|[óo]tim[ao]|excelente)|\bfica\s+por\s+R?\$?\s?\d|vamos\s+pegar\s+seu\s+carro\s+por/i,
        porque: 'REGRA 15 — não falar como se a negociação já estivesse fechada.',
        alternativa: '"Podemos analisar", "posso verificar", "vale a pena simularmos".',
      },
      {
        id: 'otimo_negocio', gravidade: 'bloqueia', nome: 'Prometer bom negócio',
        teste: /(a\s+)?(melhor|[óo]tim[ao]|excelente|grande)\s+(neg[óo]cio|condi[çc][ãa]o|proposta)\s*(pra|para)\s+(voc[êe]|ti)|vai\s+ser\s+(muito\s+)?bem\s+avaliad|te\s+(dou|consigo)\s+(a\s+)?melhor/i,
        porque: 'Promessa implícita de resultado.',
        alternativa: '"Posso verificar quais condições fazem sentido para o seu cenário."',
      },
      {
        id: 'bonus_individual', gravidade: 'revisa', nome: 'Benefício individual',
        teste: /\b(b[ôo]nus|desconto|brinde|cortesia)\b/i,
        porque: 'Só cite benefício que esteja realmente configurado e autorizado na campanha (REGRA 6).',
        alternativa: 'Descreva como condição da campanha, não como garantia para aquele cliente.',
      },

      // --- tom ---------------------------------------------------------------
      {
        // Vale para os dois modos, mas foi o resgate que trouxe a regra: link em
        // mensagem fria é o gatilho nº 1 de denúncia, e numa lista sem contexto
        // ele lê exatamente como golpe. Mande o link depois que a pessoa responder.
        id: 'link_frio', gravidade: 'bloqueia', nome: 'Link na mensagem',
        teste: /(https?:\/\/|www\.|wa\.me\/|bit\.ly|encurtador|linktr\.ee|\b[a-z0-9-]+\.(com|com\.br|net|br)\/\S)/i,
        porque: 'Link em mensagem fria é o gatilho nº 1 de denúncia — e denúncia, não volume, é o que derruba o número.',
        alternativa: 'Convide para a conversa primeiro. Depois que a pessoa responder, mande o link.',
      },
      {
        id: 'marketing', gravidade: 'bloqueia', nome: 'Marketing agressivo',
        teste: /imperd[ií]vel|[úu]ltim[ao]s?\s+(chance|vagas?|dias?)|n[ãa]o\s+pode\s+perder|corre\s+que|s[óo]\s+hoje|vai\s+acabar|oportunidade\s+[úu]nica|clique\s+aqui|!{2,}/i,
        porque: 'REGRA 13 — credibilidade, não desespero.',
        alternativa: 'Frase de conversa: "se fizer sentido pra você, posso te mostrar".',
      },
    ],

    /** Frases-modelo aprovadas, para consulta rápida da equipe. */
    aprovadas: [
      'Vale a pena trazer seu usado para avaliarmos.',
      'Estamos com condições especiais no feirão.',
      'Posso verificar as possibilidades para você.',
      'Estamos com condições interessantes de financiamento.',
      'Vale a pena simular.',
      'Temos benefícios especiais durante o feirão.',
      'Se estiver pensando em trocar, posso te ajudar a encontrar uma boa oportunidade.',
      'Dependendo do veículo e da avaliação, podemos encontrar uma condição interessante.',
      'Quero entender melhor seu carro para verificar as possibilidades.',
    ],
  }

  /**
   * Valida um texto contra a política comercial.
   * @returns {{ok:boolean, bloqueios:Array, avisos:Array, violacoes:Array}}
   */
  /**
   * Domínio da própria empresa. É o único link aceito num primeiro contato:
   * o que a regra link_frio barra é encurtador e página de terceiro, que é o
   * que lê como golpe. O site oficial, com o nome da loja, não é isso.
   */
  const DOMINIOS_OFICIAIS = [/(https?:\/\/)?(www\.)?appautodrive\.com\.br\S*/gi]

  function validarPolitica(txt) {
    let t = String(txt || '')
    DOMINIOS_OFICIAIS.forEach((re) => { t = t.replace(re, ' ') })
    const violacoes = []
    POLITICA.regras.forEach((r) => {
      const m = t.match(r.teste)
      if (m) violacoes.push({ id: r.id, nome: r.nome, gravidade: r.gravidade, trecho: m[0].trim(), porque: r.porque, alternativa: r.alternativa })
    })
    const bloqueios = violacoes.filter((v) => v.gravidade === 'bloqueia')
    return { ok: bloqueios.length === 0, bloqueios, avisos: violacoes.filter((v) => v.gravidade === 'revisa'), violacoes }
  }

  // ===========================================================================
  // GERADOR DE MENSAGENS — consultor de vendas, não robô de disparo
  //
  // Antes eram 6 textos fixos com um pouco de spintax. Pouca variedade: com 200
  // clientes, o mesmo texto sai dezenas de vezes, e texto repetido é o padrão
  // que a Meta usa para identificar disparo em massa.
  //
  // Agora a mensagem é MONTADA em quatro blocos independentes:
  //
  //   ABERTURA      quem é você, com o nome dele — gentileza e contexto
  //   PONTE         por que estou falando com VOCÊ (o carro dele, o tempo de posse)
  //   OPORTUNIDADE  o que existe na campanha e nos nossos carros — sem promessa
  //   PERGUNTA      convite + pergunta de autoridade, que pede uma decisão
  //
  // Cada bloco tem dezenas de variantes e spintax interno, o que passa de um
  // milhão de combinações. A escolha é SORTEADA A PARTIR DO CLIENTE (semente),
  // então o mesmo cliente vê sempre a mesma mensagem — o texto não muda entre
  // conferir e enviar — e clientes diferentes recebem textos diferentes.
  //
  // Toda variante passa pela política comercial: nenhuma promete valor, FIPE,
  // taxa, aprovação, entrada ou parcela. O SDR vende a oportunidade de
  // negociar, nunca o resultado da negociação.
  // ===========================================================================

  /** Semente estável a partir de um texto (djb2). */
  function hashSemente(txt) {
    let h = 5381
    const s = String(txt || '')
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
    return h >>> 0
  }

  /** Sorteio determinístico: mesma semente, mesma mensagem. */
  function rngDe(semente) {
    let a = (semente >>> 0) || 1
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const BLOCOS = {
    // --- ABERTURA: nome, saudação, quem fala. Sempre com {vendedor} e {loja}.
    abertura: [
      `{Oi|Olá}, {primeiroNome}! {saudacao}. Aqui é o {vendedor}, da {loja}.`,
      `{primeiroNome}, {saudacaoMin}! É o {vendedor}, da {loja}.`,
      `{Oi|Olá}, {primeiroNome}! {vendedor} aqui, da {loja}, tudo bem?`,
      `{primeiroNome}, {saudacaoMin}! Aqui é o {vendedor}, {cargo} da {loja}.`,
      `{Oi|Olá}, {primeiroNome}, {saudacaoMin}! Quem fala é o {vendedor}, da {loja}.`,
      `{primeiroNome}! {saudacao}. {vendedor} falando, da {loja}.`,
      `{Oi|Olá}, {primeiroNome}! {saudacao}. É o {vendedor}, da equipe da {loja}.`,
      `{primeiroNome}, tudo bem? Aqui é o {vendedor}, da {loja}.`,
      `{Oi|Olá}, {primeiroNome}! {saudacao}, aqui é o {vendedor} — sou {cargo} na {loja}.`,
      `{primeiroNome}, {saudacaoMin}! {vendedor} aqui, da {loja} — {espero que esteja tudo bem|espero que esteja tudo certo por aí}.`,
      `{Oi|Olá}, {primeiroNome}! Sou o {vendedor}, da {loja}. {saudacao}.`,
      `{primeiroNome}, {saudacaoMin}! É o {vendedor}, da {loja} — {passando rapidinho aqui|falo rapidinho}.`,
      `{Oi|Olá}, {primeiroNome}! {saudacao}. {vendedor}, da {loja}, no seu contato.`,
      `{primeiroNome}, {saudacaoMin}! Aqui quem fala é o {vendedor}, da {loja}.`,
    ],

    // --- PONTE: por que VOCÊ. É o que separa conversa de disparo.
    ponte: [
      `Foi com a gente que você {levou|comprou} o {veiculo}, lembra? {Fiquei|Fico} de olho nos clientes da casa quando aparece {algo que faça sentido|alguma oportunidade boa}.`,
      `Te atendi na compra do {veiculo} — e é justamente por isso que estou te chamando primeiro.`,
      `Seu {veiculo} já está {tempo} com você. {Costuma ser|É mais ou menos} a fase em que muita gente começa a pensar na troca, antes da parte pesada da depreciação.`,
      `Você comprou o {modelo} com a gente em {mesAno}. Puxei a lista dos clientes da casa e o seu nome apareceu.`,
      `Como você é cliente da casa — comprou o {modelo} aqui — comecei a lista por você.`,
      `Estou {separando|reservando} os horários de avaliação da campanha e comecei pelos clientes que já compraram com a gente. Você está nessa lista.`,
      `O {modelo} já tem {tempo} de estrada com você. {Nessa faixa|Por aí} é quando o carro ainda tem uma boa liquidez na troca.`,
      `Lembro do seu {veiculo}. {Carro bem procurado|Modelo que sai bem} aqui na loja, e é por isso que te chamei.`,
      `Você levou o {modelo} com a gente e desde então não conversamos. {Resolvi te dar um alô|Achei que valia te chamar}.`,
      `Fui olhar quem comprou com a gente em {mesAno} e o seu {modelo} estava lá.`,
      `Faz {tempoSem} que o {modelo} é seu. {Muita gente|Boa parte dos clientes} nessa fase começa a olhar o que tem de novo no mercado.`,
      `Cliente da casa tem prioridade aqui — e você comprou o {veiculo} com a gente.`,
      `Seu {modelo} é de {mesAno} na nossa ficha. {Achei que valia|Vale} te chamar antes de a campanha ficar cheia.`,
      `Te chamei porque você já {comprou|negociou} com a gente e sabe como a gente trabalha — sem enrolação.`,
      `O {modelo} está {tempo} com você, e esse é o tipo de carro que costuma ter procura na troca.`,
      `Estou revendo a carteira de quem comprou aqui na {loja}, e o seu {veiculo} chamou minha atenção.`,
    ],

    // --- OPORTUNIDADE: o que existe. Nunca o que o cliente vai receber.
    oportunidade: [
      `Estamos com o {feiraoNome} até {feiraoAte}, e as condições comerciais desta semana estão {bem interessantes|interessantes} para quem pensa em trocar.`,
      `Abrimos o {feiraoNome} e estamos avaliando usados para troca durante a campanha. Dependendo do veículo e da avaliação, pode aparecer uma oportunidade boa — vale tanto para trocar quanto para vender o seu.`,
      `Durante o {feiraoNome} a loja está com {beneficios}.`,
      `O pátio está {renovado|com novidades} — entrou {carro bom|coisa boa} de {anoMinimo} para cá, e várias opções que combinam com o perfil de quem tem um {modelo}.`,
      `Nesta campanha estamos com condições especiais de financiamento e trabalhamos com vários bancos, então vale a pena simular e ver o que aparece para o seu caso.`,
      `Estamos com o {feiraoNome} até {feiraoAte}. Além das opções de veículos, a campanha tem {beneficios}.`,
      `Recebemos {seminovos revisados|carros de procedência} nas últimas semanas e alguns saem rápido. {Posso te mostrar o que tem disponível|Consigo te mostrar o que está no pátio}.`,
      `A campanha vai até {feiraoAte} e é uma janela boa para quem quer trocar sem pressa, com o carro avaliado com calma.`,
      `Tenho aqui {opções interessantes|carros bacanas} de {anoMinimo} para cima, {bem cuidados|revisados}, e dá para estudar a troca usando o seu {modelo} na negociação.`,
      `No {feiraoNome} a gente consegue estudar a troca com mais folga do que no dia a dia — é o momento em que a loja abre condições de campanha.`,
      `Estamos com carros {de procedência|revisados}, com garantia e histórico, que é o tipo de coisa que faz diferença na hora de trocar.`,
      `A campanha está com condições comerciais especiais e o pátio está {bem sortido|com opções variadas}. Dá para estudar a troca do {modelo} com calma.`,
      `Entrou modelo {mais novo|de ano melhor} que o seu no pátio, e nesta campanha dá para estudar a diferença com condições de feirão.`,
      `Nesta semana do {feiraoNome} estamos priorizando avaliação de usados de clientes da casa — é o momento em que a agenda abre.`,
      `Além dos carros, a campanha tem condições especiais de financiamento — vale simular para ver o que faz sentido no seu cenário.`,
      `O {feiraoNome} vai até {feiraoAte}, e a agenda de avaliação está aberta. Depois disso a loja volta às condições normais.`,
    ],

    // --- PERGUNTA DE AUTORIDADE: convite + decisão pequena e concreta.
    pergunta: [
      `Faz sentido pra você olhar isso agora, ou prefere que eu te procure mais pra frente?`,
      `Você está considerando trocar o {modelo}, ou hoje ainda não é o momento?`,
      `Se eu separar um horário pra avaliarmos o {modelo} sem compromisso, você consegue passar aqui esta semana?`,
      `Quer que eu te mostre as opções que combinam com o seu perfil, ou prefere primeiro entender como ficaria a troca?`,
      `Me diz uma coisa: prefere resolver por aqui mesmo ou é melhor eu te ligar?`,
      `O que te ajuda mais agora — ver os carros disponíveis ou avaliar o {modelo} primeiro?`,
      `Se fizer sentido, eu reservo um horário pra você esta semana. Qual período te atende melhor, manhã ou tarde?`,
      `Levo dois minutos: posso te mandar duas ou três opções que têm a ver com o seu {modelo}?`,
      `Vale a pena a gente conversar sobre isso, ou prefere que eu te chame de novo mais pra frente?`,
      `Você prefere que eu te explique por aqui, ou marco uma ligação rápida num horário que te atenda?`,
      `Se eu te mostrar o que temos no pátio hoje, você consegue dar uma olhada?`,
      `Quer que eu veja como ficaria a troca do {modelo} no seu caso?`,
      `Consigo abrir um horário de avaliação pra você — {qual dia te atende melhor|que dia fica melhor pra você}?`,
      `Faz sentido eu reservar um horário pra você conhecer os carros, ou prefere primeiro que eu avalie o {modelo}?`,
      `Me responde só isso: trocar o {modelo} está no seu radar pra este ano?`,
      `Se eu conseguir um horário ainda esta semana, você aparece pra dar uma olhada?`,
      `Prefere que eu te mostre por aqui mesmo, ou marcamos uma conversa rápida por telefone?`,
      `O que faz mais sentido pra você agora: entender as condições da campanha ou avaliar o seu {modelo}?`,
    ],
  }

  // O follow-up também precisa variar: ele vai para dezenas de pessoas que já
  // receberam uma mensagem sua. Repetir aqui é ainda mais visível.
  const BLOCOS_FOLLOWUP = {
    abertura: [
      `{primeiroNome}, {não quero te incomodar|só pra não deixar no vácuo} — {minha mensagem chegou?|chegou minha mensagem?}`,
      `{Oi|Olá}, {primeiroNome}! {Voltando aqui rapidinho|Passando rapidinho} — você chegou a ver minha mensagem?`,
      `{primeiroNome}, {tudo bem?|tudo certo?} Só confirmando se a minha mensagem chegou até você.`,
      `{Oi|Olá}, {primeiroNome}! Não sei se você viu por aqui — {mandei uma mensagem dias atrás|te escrevi outro dia}.`,
      `{primeiroNome}, {desculpa insistir|sem querer insistir}, mas fiquei na dúvida se chegou minha mensagem.`,
      `{Oi|Olá}, {primeiroNome}! {Retomando o contato|Voltando ao assunto} sobre o {modelo}.`,
      `{primeiroNome}, {sei que o dia corre|imagino que a semana esteja corrida} — só queria saber se você viu minha mensagem.`,
      `{Oi|Olá}, {primeiroNome}! {Esta é a última vez que te chamo por aqui|Não insisto mais depois desta}: chegou o que te mandei?`,
    ],
    corpo: [
      `Se não for o momento, me avisa que eu paro por aqui, tranquilo. Se quiser, a gente pode avaliar o {modelo} sem compromisso e você vê as possibilidades.`,
      `Sem problema nenhum se não for a hora. Mas se quiser, dá pra avaliarmos o {modelo} sem compromisso e você decide depois.`,
      `Se preferir que eu não chame mais sobre isso, é só falar — sem cerimônia. Se quiser olhar, o {feiraoNome} ainda está de pé.`,
      `Pode ser que não seja o momento, e tudo bem — me avisa e eu paro por aqui. Caso queira, consigo te mostrar as opções que estão no pátio agora.`,
      `Se você já resolveu de outro jeito, me avisa que eu tiro da lista. Se ainda estiver pensando, posso te ajudar a olhar.`,
      `Não tem compromisso nenhum: a avaliação do {modelo} é só pra você ter a informação e decidir com calma. Se preferir que eu não chame mais, é só dizer.`,
      `Se quiser, eu te mostro o que temos disponível hoje — dá pra ver se algo te interessa antes de qualquer conversa de troca. Se não for a hora, me avisa que eu paro por aqui.`,
      `Se for melhor conversar depois do feirão, também tudo bem — é só me dizer quando faz sentido te procurar.`,
    ],
    fecho: [
      `O {feiraoNome} vai até {feiraoAte}. {Me avisa o que prefere?|O que você prefere?}`,
      `A campanha vai até {feiraoAte}. Quer que eu te mostre, ou deixo pra outra hora?`,
      `Prefere que eu te explique por aqui ou te ligo num horário que te atenda?`,
      `Me diz só isso: sigo com você agora ou te procuro mais pra frente?`,
      `Quer que eu reserve um horário de avaliação ou prefere olhar os carros primeiro?`,
      `O que fica melhor pra você — conversar por aqui ou por telefone?`,
      `Posso te mandar duas ou três opções antes de o feirão acabar em {feiraoAte}?`,
      `Se preferir, eu paro por aqui — é só me dizer. Ou quer dar uma olhada?`,
    ],
  }

  // ===========================================================================
  // PROSPECÇÃO AUTODRIVE
  //
  // Primeiro contato com quem ainda não conhece a loja a fundo. A mensagem tem
  // começo, meio e fim, cada um sorteado de um banco próprio:
  //
  //   ABERTURA      quem está falando e de onde — identificação completa na
  //                 primeira linha, que é o que separa loja de golpe
  //   APRESENTAÇÃO  a AutoDrive em uma frase: o que ela é e como atende
  //   SERVIÇOS      tudo o que a loja faz + o endereço do estoque
  //   CONVITE       pergunta curta que pede uma resposta, não um "ok"
  //
  // Os serviços são descritos como o que a loja FAZ, nunca como resultado
  // garantido: financiamos veículo de terceiros, mas não prometemos aprovação,
  // taxa, entrada ou parcela. A política comercial continua valendo aqui.
  //
  // O link do estoque é o único que a política aceita num primeiro contato —
  // é o site da própria empresa (ver DOMINIOS_OFICIAIS).
  // ===========================================================================
  const BLOCOS_PROSPECCAO = {
    // Apresentação: "Dagoberto, da AutoDrive Veículos". Sem cidade e sem
    // cargo — é assim que o Beto se apresenta. SEM negrito aqui de propósito:
    // o painel do WhatsApp confere os primeiros 24 caracteres do que foi
    // escrito, e asterisco logo no começo pode atrapalhar essa conferência.
    abertura: [
      `{Oi|Olá}, {primeiroNome}! {saudacao}. Aqui é o {vendedor}, da {loja}.`,
      `{primeiroNome}, {saudacaoMin}! {vendedor} falando, da {loja}.`,
      `{Oi|Olá}, {primeiroNome}, tudo bem? Aqui é o {vendedor}, da {loja}.`,
      `{primeiroNome}, {saudacaoMin}! Quem fala é o {vendedor}, da {loja}.`,
      `{Oi|Olá}, {primeiroNome}! {saudacao}. Sou o {vendedor}, da {loja}.`,
      `{primeiroNome}, tudo bem? {vendedor} aqui, da {loja}.`,
      `{Oi|Olá}, {primeiroNome}! {saudacao}, aqui é o {vendedor}, da {loja}.`,
      `{primeiroNome}, {saudacaoMin}! É o {vendedor}, da {loja} — {prazer falar com você|prazer em falar com você}.`,
    ],

    // Mini apresentação: uma frase, sem virar institucional e sem cidade.
    ponte: [
      `A {loja} resolve *tudo de carro num lugar só*, com atendimento {próximo|de perto} e sem enrolação.`,
      `Somos a {loja}: *seminovos com procedência* e uma equipe que cuida de cada etapa do seu negócio com o carro.`,
      `A {loja} nasceu para *simplificar a vida* de quem compra, vende ou troca de carro — com transparência e atendimento de verdade.`,
      `Trabalhamos com *seminovos selecionados* e com todos os serviços em volta do carro, para você resolver tudo com uma pessoa só.`,
      `Na {loja} a ideia é uma só: deixar a compra, a venda e a troca de carro *simples, segura e sem dor de cabeça*.`,
      `Nosso atendimento é consultivo — *primeiro a gente entende o que você precisa*, depois mostra o carro.`,
      `A {loja} {une|junta} *estoque de seminovos e todos os serviços do carro* no mesmo atendimento.`,
      `Aqui na {loja} você tem *um consultor só cuidando de tudo*, do primeiro contato até a documentação pronta.`,
    ],

    // Meio: TODOS os serviços, com os principais em negrito. O link do
    // estoque sai em linha própria (bloco `site`).
    oportunidade: [
      `Por aqui a gente *compra, vende e troca* veículos, *financia inclusive carro de terceiros*, *vende o seu carro para você* e ainda cuida de *seguro, consórcio e assessoria documental*.`,
      `Além do nosso estoque, a gente *compra o seu carro*, faz a *troca*, *vende o seu veículo por você*, *financia até carro de terceiros* e resolve *seguro, consórcio e documentação*.`,
      `Dá para *comprar, vender ou trocar* com a gente, *financiar veículo de terceiros* — até um carro que você achou em outro lugar —, *deixar o seu para a gente vender*, e ainda resolver *seguro, consórcio e documentação*.`,
      `E se o carro que você quer estiver em outra loja, a gente *financia veículo de terceiros* também — além de *seguro, consórcio, assessoria documental* e da *venda do seu usado*.`,
      `Um resumo do que fazemos: *compra, venda e troca*; *financiamento, inclusive de veículo de terceiros*; *vendemos o seu carro para você*; *seguros*; *consórcio*; e *assessoria documental*.`,
      `Quem quer trocar pode *usar o próprio carro na negociação*, e quem quer vender pode *deixar com a gente*. Também *financiamos veículos de terceiros* e fazemos *seguro, consórcio e documentação*.`,
      `*Compra, venda, troca, financiamento até de carro de terceiros, venda do seu veículo, seguro, consórcio e assessoria documental* — tudo com o mesmo atendimento.`,
      `Se você pensa em *trocar, vender ou comprar*, a gente cuida disso e também *financia carro de terceiros*, faz *seguro, consórcio* e toda a *parte documental*.`,
    ],

    // O site, em linha própria e com emoji. É o único link aceito num
    // primeiro contato (ver DOMINIOS_OFICIAIS).
    site: [
      `🚗 *Confira nosso estoque:* {estoque}`,
      `👉 *Veja os carros disponíveis:* {estoque}`,
      `🚘 *Nosso estoque completo:* {estoque}`,
      `🔎 *Dá uma olhada no estoque:* {estoque}`,
    ],

    // Gatilho de ajuda: a mensagem deixa claro que o objetivo é ajudar, não
    // empurrar carro. Nada aqui promete resultado — a política continua
    // valendo ("pode contar comigo", por exemplo, é verbo de garantia).
    ajuda: [
      `Meu papel aqui é *te ajudar*, não te empurrar carro.`,
      `Quero *te ajudar de verdade* — sem pressão e sem compromisso.`,
      `Estou aqui para *facilitar a sua vida* com carro, no que você precisar.`,
      `Minha ideia é *te ajudar a decidir com calma*, com a informação certa na mão.`,
      `Se eu puder *te ajudar* em qualquer coisa de carro, vai ser um prazer.`,
      `Quero ser o seu *contato de confiança* quando o assunto for carro.`,
    ],

    // Fim: convite com pergunta que pede uma escolha, não um "ok".
    pergunta: [
      `Hoje você está mais para comprar, vender ou trocar de carro?`,
      `Qual desses serviços faria mais sentido para você agora?`,
      `Posso te mostrar duas ou três opções que combinam com o que você procura?`,
      `Você pensa em trocar ou comprar carro nos próximos meses?`,
      `Topa passar na loja esta semana para um café e conhecer os carros, sem compromisso?`,
      `Me conta: tem algum carro, seguro ou financiamento que eu possa cotar para você?`,
      `Me diz o que você procura: se entrar um carro no seu perfil, posso te avisar por aqui?`,
      `Faz sentido a gente conversar uns minutinhos sobre o seu próximo carro?`,
      `O que você está buscando hoje — compra, venda, troca, seguro ou financiamento?`,
      `Qual período fica melhor para eu te mostrar o estoque, manhã ou tarde?`,
    ],
  }

  // Modelos completos, para quem prefere escolher um texto inteiro na tela da
  // campanha. Cada um tem começo, meio e fim. Sem texto fixado, o gerador
  // monta a partir dos blocos acima.
  const TEMPLATES_PROSPECCAO = [
    {
      id: 'pr1',
      nome: 'Apresentação completa',
      texto:
`{Oi|Olá}, {primeiroNome}! {saudacao}. Aqui é o {vendedor}, da {loja}.

A gente resolve *tudo de carro num lugar só*: *compra, venda e troca*, *financiamento inclusive de carro de terceiros*, *venda do seu veículo*, *seguro, consórcio e assessoria documental*.

🚗 *Confira nosso estoque:* {estoque}

Meu papel aqui é *te ajudar*, não te empurrar carro. Hoje você está mais para comprar, vender ou trocar?`,
    },
    {
      id: 'pr2',
      nome: 'Venda do seu carro',
      texto:
`{primeiroNome}, {saudacaoMin}! {vendedor} falando, da {loja}.

Se você pensa em vender o seu carro sem ter trabalho com anúncio, visita e papelada, *a gente vende para você*. E se quiser trocar, *o seu carro entra na negociação*.

Também *financiamos veículos de terceiros* e cuidamos de *seguro, consórcio e documentação*.

👉 *Veja os carros disponíveis:* {estoque}

Quero *te ajudar de verdade*, sem pressão. Faz sentido eu te explicar como funciona?`,
    },
    {
      id: 'pr3',
      nome: 'Financiamento de terceiros',
      texto:
`{Oi|Olá}, {primeiroNome}, tudo bem? Aqui é o {vendedor}, da {loja}.

Pouca gente sabe, mas a gente *financia até carro de terceiros* — achou o seu em outro lugar, a gente cuida do financiamento e da documentação. Além disso *compramos, vendemos e trocamos* veículos, e fazemos *seguro e consórcio*.

🚘 *Nosso estoque completo:* {estoque}

Estou aqui para *facilitar a sua vida* com carro. Tem algum carro em vista que eu possa cotar para você?`,
    },
    {
      id: 'pr4',
      nome: 'Consultor de confiança',
      texto:
`{primeiroNome}, {saudacaoMin}! É o {vendedor}, da {loja}.

Aqui você tem *um consultor só cuidando de tudo*, do primeiro contato até a documentação pronta: *compra, venda, troca, financiamento, venda do seu carro, seguro, consórcio e assessoria documental*.

🔎 *Dá uma olhada no estoque:* {estoque}

Quero ser o seu *contato de confiança* quando o assunto for carro. Posso te mostrar duas ou três opções no seu perfil?`,
    },
    {
      id: 'pr5',
      nome: 'Seguro e consórcio',
      texto:
`{Oi|Olá}, {primeiroNome}! {saudacao}. Sou o {vendedor}, da {loja}.

Além de *comprar, vender e trocar* veículos, a gente cuida do que vem junto: *seguro*, *consórcio*, *financiamento — inclusive de carro de terceiros —* e toda a *assessoria documental*.

🚗 *Confira nosso estoque:* {estoque}

Se eu puder *te ajudar*, vai ser um prazer. Quer que eu faça uma cotação de seguro ou consórcio para você?`,
    },
    {
      id: 'pr6',
      nome: 'Convite para visita',
      texto:
`{primeiroNome}, tudo bem? {vendedor} aqui, da {loja}.

A gente trabalha com *seminovos selecionados* e com todos os serviços do carro no mesmo atendimento: *compra, venda, troca, financiamento de terceiros, venda do seu veículo, seguro, consórcio e documentação*.

👉 *Veja os carros disponíveis:* {estoque}

Minha ideia é *te ajudar a decidir com calma*. Topa passar na loja esta semana para um café, sem compromisso?`,
    },
  ]

  const BLOCOS_FOLLOWUP_PROSPECCAO = {
    abertura: [
      `{primeiroNome}, {tudo bem?|tudo certo?} Só confirmando se minha mensagem chegou.`,
      `{Oi|Olá}, {primeiroNome}! {Passando rapidinho|Voltando rapidinho} — você chegou a ver minha mensagem?`,
      `{primeiroNome}, {sei que o dia corre|imagino que a semana esteja corrida} — só queria saber se você viu o que te mandei.`,
    ],
    corpo: [
      `Se não for o momento, me avisa que eu paro por aqui, tranquilo. Quando quiser, *estou aqui para te ajudar*.\n\n🚗 *Nosso estoque:* {estoque}`,
      `Sem problema se não for a hora. Se preferir que eu não chame mais, é só dizer — a ideia é *te ajudar*, não incomodar.`,
      `Se você já resolveu de outro jeito, me avisa que eu tiro da lista. Se ainda estiver pensando, *estou por aqui para te ajudar*.`,
    ],
    fecho: [
      `O que você procura hoje — compra, venda, troca, seguro ou financiamento?`,
      `Prefere que eu te explique por aqui ou te ligo num horário que te atenda?`,
      `Sigo com você agora ou te procuro mais para a frente?`,
    ],
  }

  function comporFollowup(semente, blocos) {
    const F = blocos || BLOCOS_FOLLOWUP
    const rnd = rngDe(semente)
    const pega = (lista) => lista[Math.floor(rnd() * lista.length) % lista.length]
    return spin([pega(F.abertura), pega(F.corpo), pega(F.fecho)].join('\n\n'), rnd)
  }

  /** Quantas combinações o gerador consegue produzir (sem contar o spintax). */
  function combinacoesPossiveis() {
    return BLOCOS.abertura.length * BLOCOS.ponte.length
      * BLOCOS.oportunidade.length * BLOCOS.pergunta.length
  }

  /**
   * Monta o corpo da mensagem sorteando um bloco de cada tipo.
   * A semente vem do cliente, então a mensagem dele é sempre a mesma.
   */
  function comporMensagem(semente, blocos, config) {
    const B = blocos || BLOCOS
    const rnd = rngDe(semente)
    const pega = (lista) => lista[Math.floor(rnd() * lista.length) % lista.length]
    // O feirão tem "oportunidade" (a campanha); o resgate tem "apresentacao"
    // (o que eu faço hoje). O terceiro bloco é o que muda entre os dois.
    const terceiro = B.oportunidade || B.apresentacao || []
    const partes = [pega(B.abertura), pega(B.ponte), pega(terceiro)]

    // Campanha em cartaz: só entra se nome E prazo estiverem configurados.
    const R = (typeof globalThis !== 'undefined' ? globalThis : self).FEIRAO_RESGATE
    if (config && config.modo === 'resgate' && config.campanhaAtual && config.campanhaAte && R) {
      partes.push(pega(R.BLOCOS_CAMPANHA))
    }

    // Prospecção: o site em linha própria, e a frase de ajuda colada na
    // pergunta — "quero te ajudar... hoje você está mais para comprar ou
    // trocar?" fecha a mensagem como uma coisa só.
    if (B.site) partes.push(pega(B.site))
    partes.push(B.ajuda ? `${pega(B.ajuda)} ${pega(B.pergunta)}` : pega(B.pergunta))
    return spin(partes.join('\n\n'), rnd)
  }

  const TEMPLATES_PRIMEIRO = [
    {
      id: 'p1',
      nome: 'Cliente da casa + condições da campanha',
      texto:
`{Oi|Olá}, {primeiroNome}! {saudacao}. Aqui é o {vendedor}, da {loja} — foi com a gente que você {levou|comprou} o {veiculo}.

Estamos com o {feiraoNome} até {feiraoAte} e as condições comerciais desta semana estão bem interessantes para quem pensa em trocar.

Você está considerando trocar o {modelo} ou hoje ainda não é o momento?`,
    },
    {
      id: 'p2',
      nome: 'Troca ou venda — abre a possibilidade',
      texto:
`{primeiroNome}, {saudacaoMin}! É o {vendedor}, da {loja}. Te atendi na compra do {veiculo}.

Chamei porque {abrimos|começou} o {feiraoNome} e estamos avaliando usados para troca durante a campanha. Dependendo do veículo e da avaliação, pode aparecer uma oportunidade boa — vale tanto para trocar quanto para vender o seu.

Faz sentido pra você olhar isso agora, ou prefere que eu te procure mais pra frente?`,
    },
    {
      id: 'p3',
      nome: 'Tempo de posse — desperta a curiosidade',
      texto:
`{Oi|Olá}, {primeiroNome}! Aqui é o {vendedor}, da {loja}.

Seu {veiculo} já está {tempo} com você — {costuma ser|é mais ou menos} a fase em que muita gente começa a pensar na troca, antes da parte pesada da depreciação.

Como estamos no {feiraoNome} até {feiraoAte}, vale a pena trazer o {modelo} para avaliarmos e ver as possibilidades. Você já pensou nisso?`,
    },
    {
      id: 'p4',
      nome: 'Curta e direta',
      texto:
`{Oi|Olá}, {primeiroNome}! {vendedor} aqui, da {loja}, tudo bem?

Estamos com o {feiraoNome} e as condições da campanha estão boas para quem quer trocar. Posso te mostrar o que temos disponível e verificar as possibilidades para o seu caso.

Você está pensando em trocar o {modelo}?`,
    },
    {
      id: 'p5',
      nome: 'Benefícios da campanha',
      texto:
`{primeiroNome}, {saudacaoMin}! Aqui é o {vendedor}, da {loja}.

Estamos com o {feiraoNome} até {feiraoAte}. Além das opções de veículos, a campanha tem {beneficios}.

Se a ideia de trocar estiver no seu radar, vale a pena conhecer. Quer que eu te mostre as oportunidades?`,
    },
    {
      id: 'p6',
      nome: 'Reserva de horário (pergunta o canal)',
      texto:
`{Oi|Olá}, {primeiroNome}! É o {vendedor}, da {loja}.

Estou {separando|reservando} os horários de avaliação do {feiraoNome} e comecei pelos clientes que já compraram com a gente.

Se você estiver pensando em trocar o {modelo}, posso segurar um horário pra você. Me diz só uma coisa: prefere combinar por aqui mesmo ou é melhor eu te ligar?`,
    },
  ]

  const TEMPLATE_FOLLOWUP = {
    id: 'f1',
    nome: 'Follow-up único (4 dias depois)',
    texto:
`{primeiroNome}, {não quero te incomodar|só pra não deixar no vácuo} — {minha mensagem chegou?|chegou minha mensagem?}

Se não for o momento, me avisa que eu paro por aqui, tranquilo. Se quiser, a gente pode avaliar o {modelo} sem compromisso e você vê as possibilidades — ou te ligo rapidinho, se for mais fácil.

O {feiraoNome} vai até {feiraoAte}. Abraço!`,
  }

  // ---------------------------------------------------------------------------
  // PLAYBOOK — o que responder quando o cliente responde.
  //
  // Todo item obedece à POLÍTICA COMERCIAL acima: vende a oportunidade de
  // negociar, nunca o resultado da negociação. Número, taxa e aprovação só
  // aparecem depois da análise — e não por mensagem.
  // ---------------------------------------------------------------------------
  const PLAYBOOK = [
    // ---- canal --------------------------------------------------------------
    { grupo: 'Canal', id: 'c_whats', nome: 'Ele prefere WhatsApp',
      texto:
`Perfeito, {primeiroNome}! Então te explico por aqui.

Durante o {feiraoNome} estamos com condições comerciais especiais na compra e avaliando usados para troca. Para eu entender seu caso e verificar as possibilidades, me manda três coisas rápidas:
· a quilometragem de hoje
· se tem algum detalhe de lataria, pintura ou mecânica
· se está tudo quitado (IPVA, multas, financiamento)

Com isso eu já consigo te direcionar melhor. A avaliação em si a gente faz aqui, leva uns 20 minutos.` },

    { grupo: 'Canal', id: 'c_fone', nome: 'Ele prefere ligação — pedir horário',
      texto:
`Combinado, {primeiroNome}! Fica mais rápido por telefone mesmo.

Qual horário é melhor pra você: de manhã (entre 9h e 12h) ou à tarde (entre 14h e 18h)? Me diz o dia e a faixa que eu te ligo certinho — não passa de 5 minutos.` },

    { grupo: 'Canal', id: 'c_confirma', nome: 'Confirmar o horário da ligação',
      texto:
`Anotado, {primeiroNome}: te ligo {DIA} às {HORA}. Vou aparecer por este mesmo número.

Se aparecer algum imprevisto, é só me avisar por aqui que eu remarco. Até lá!` },

    // ---- valor --------------------------------------------------------------
    { grupo: 'Valor', id: 'v_quanto', nome: '"Quanto vale meu carro?"',
      texto:
`Boa pergunta, {primeiroNome} — e eu prefiro não chutar número por mensagem.

Depende do estado do carro, da quilometragem, da documentação e do que o mercado está praticando no momento. Por isso a avaliação é presencial: leva uns 20 minutos e você sai daqui sabendo exatamente onde está.

Me manda a quilometragem e se tem algum detalhe, que eu já vou adiantando o que der. Quer que eu separe um horário para avaliarmos?` },

    { grupo: 'Valor', id: 'v_entrada', nome: '"Quanto fica a entrada / a parcela?"',
      texto:
`Depende de duas coisas, {primeiroNome}: como o seu carro atual entra na negociação e qual veículo você quer na saída.

O que dá pra adiantar: durante o {feiraoNome} estamos com condições especiais de financiamento e trabalhamos com vários bancos, então vale a pena simular.

Me diz o que você tem em mente — tipo de carro e a faixa de parcela que caberia no seu mês — que eu verifico as opções disponíveis para o seu perfil.` },

    { grupo: 'Valor', id: 'v_caro', nome: '"A parcela não cabe no meu orçamento"',
      texto:
`Entendo, {primeiroNome}. E é justamente por isso que vale rodar a simulação antes de descartar.

Três coisas mexem no resultado: como o seu carro entra na negociação, o tamanho da entrada e o prazo. Dá pra testar combinações diferentes e ver o que fecha.

Qual faixa de parcela caberia no seu mês? Com esse número eu verifico o que é possível e te falo com sinceridade se dá ou não.` },

    // ---- objeções -----------------------------------------------------------
    { grupo: 'Objeção', id: 'o_agora', nome: '"Não estou pensando em trocar agora"',
      texto:
`Compreendo perfeitamente, {primeiroNome}. A ideia não é te empurrar troca.

Só acho que vale você saber como está o seu {modelo} hoje — ajuda a decidir mesmo que a troca fique pra daqui um ano. A avaliação é rápida e sem compromisso nenhum.

Quer que eu separe um horário, ou prefere que eu te procure mais pra frente?` },

    { grupo: 'Objeção', id: 'o_estoque', nome: '"Me manda as opções que vocês têm"',
      texto:
`Mando sim, {primeiroNome}! Só não quero te jogar 40 carros e te fazer perder tempo.

Me diz duas coisas: que tipo de carro você quer (sedã, SUV, hatch) e até quanto quer ficar de parcela. Aí eu separo só o que faz sentido pra você — e já considerando o seu na negociação.` },

    { grupo: 'Objeção', id: 'o_antigo', nome: '"Meu carro é mais antigo"',
      texto:
`Sem problema, {primeiroNome}. A gente avalia e compra fora dessa faixa também.

Me manda a quilometragem e como ele está de modo geral, que eu te falo com sinceridade se vale a pena olhar isso agora ou se faz mais sentido esperar. Prefiro te dizer a verdade a te fazer vir aqui à toa.` },

    { grupo: 'Objeção', id: 'o_quem', nome: '"Quem é você?" / "De onde conseguiu meu número?"',
      texto:
`É o {vendedor}, da {loja}, aqui de {cidade}. Foi por aqui que você comprou o {veiculo} — seu cadastro é o da própria compra, da nossa base de clientes.

Estou entrando em contato só por causa do {feiraoNome}. Se preferir não receber esse tipo de mensagem, me avisa que eu tiro seu contato da lista agora mesmo, sem problema nenhum.` },

    { grupo: 'Objeção', id: 'o_precisa', nome: 'Qualificar: compra, troca ou só pesquisando',
      texto:
`Entendi, {primeiroNome}! Só pra eu te ajudar direito:

Você está pensando em comprar sem troca, ou pretende usar o seu carro atual na negociação? E hoje você já tem um modelo em mente ou ainda está pesquisando?

Dependendo do cenário eu consigo verificar possibilidades diferentes dentro do feirão.` },

    // ---- agendamento --------------------------------------------------------
    { grupo: 'Agenda', id: 'a_convite', nome: 'Convidar para a avaliação presencial',
      texto:
`{primeiroNome}, o caminho mais rápido é você dar um pulo aqui para avaliarmos o carro — leva uns 20 minutos e aí a conversa fica concreta, com número na mesa.

Tenho horário {DIA} de manhã ou à tarde. Qual fica melhor? Deixo seu café separado e você fala direto com o avaliador, sem fila.` },

    { grupo: 'Agenda', id: 'a_confirma', nome: 'Confirmar a visita',
      texto:
`Fechado, {primeiroNome}! Te espero {DIA} às {HORA}, aqui na {loja}.

Traz o documento do carro (CRLV) e a chave reserva, se tiver — assim a avaliação sai na hora e você já sai daqui com o cenário fechado.

Qualquer imprevisto me chama por aqui que eu remarco.` },

    { grupo: 'Agenda', id: 'a_lembrete', nome: 'Lembrete na véspera',
      texto:
`{primeiroNome}, tudo bem? Passando só pra confirmar nosso horário de amanhã, {HORA}, aqui na {loja}.

Continua de pé pra você? Se precisar mudar, é só falar.` },

    { grupo: 'Agenda', id: 'a_faltou', nome: 'Cliente não apareceu',
      texto:
`{primeiroNome}, tudo certo por aí? Deixei seu horário reservado hoje e acabamos não nos falando — imagino que tenha aparecido alguma coisa.

Se ainda fizer sentido, remarco pra outro dia sem problema. O {feiraoNome} vai até {feiraoAte}. Quer que eu separe outro horário?` },

    // ---- encerramento -------------------------------------------------------
    { grupo: 'Encerrar', id: 'e_optout', nome: 'Pediu para não receber mais',
      texto:
`Sem problema, {primeiroNome}! Já tirei você da lista, não te chamo mais sobre isso.

Se um dia quiser avaliar o carro ou precisar de qualquer coisa com a {loja}, é só me chamar aqui. Abraço!` },

    { grupo: 'Encerrar', id: 'e_naoagora', nome: 'Encerrar deixando a porta aberta',
      texto:
`Entendido, {primeiroNome}! Fico à disposição.

Deixo meu contato salvo aqui — se mudar de ideia, ou se quiser dar uma olhada no {modelo} lá na frente, me chama. Abraço!` },
  ]
  const RESPOSTAS_PRONTAS = PLAYBOOK

  /**
   * Monta o texto final. `contato` = item da fila; `config` = FEIRAO.getConfig().
   * `variante` = índice do template de 1º contato (ou 'followup').
   */
  // Textos editados pelo usuário na tela de campanha (carregados no boot).
  let customTpl = {}
  async function carregarCustom() {
    const st = await get(K.tpl)
    customTpl = st[K.tpl] || {}
    return customTpl
  }

  /**
   * `sementeExtra` só existe para a pré-visualização na tela de campanha: o
   * botão "sortear outra" precisa de um texto novo. No envio de verdade ela
   * fica vazia — e aí a mensagem do cliente é sempre a mesma.
   */
  /**
   * Qual família de texto usar. No modo resgate ainda há duas: quem nunca
   * respondeu recebe o primeiro toque frio; quem respondeu numa campanha
   * anterior e esfriou recebe RETOMADA — para essa pessoa não é mensagem
   * fria, é conversa que ficou pela metade.
   */
  /** O carro que a pessoa procurava, lido do nome salvo na agenda. */
  function agendaDe(contato) {
    const R = (typeof globalThis !== 'undefined' ? globalThis : self).FEIRAO_RESGATE
    if (!R || !contato) return { nome: '', modelo: '', ano: '' }
    return R.interpretarNomeAgenda(contato.nomeAgenda || contato.nome || '')
  }
  const modeloBuscadoDe = (contato) =>
    (contato && contato.modeloBuscado) || agendaDe(contato).modelo || ''

  function familiaDe(config, contato) {
    const R = (typeof globalThis !== 'undefined' ? globalThis : self).FEIRAO_RESGATE
    if (config && config.modo === 'prospeccao') {
      return { templates: TEMPLATES_PROSPECCAO, blocos: BLOCOS_PROSPECCAO, followup: BLOCOS_FOLLOWUP_PROSPECCAO, tipo: 'prospeccao' }
    }
    if (!config || config.modo !== 'resgate' || !R) {
      return { templates: TEMPLATES_PRIMEIRO, blocos: BLOCOS, tipo: 'feirao' }
    }
    const jaConversou = !!(contato && (contato.respondeuEm || contato.jaRespondeuAntes))
    if (jaConversou) return { templates: R.TEMPLATES_RETOMADA, blocos: R.BLOCOS_RETOMADA, tipo: 'retomada' }
    // Se a agenda guardou o carro que a pessoa procurava, a conversa deixa de
    // ser genérica: dá para dizer que houve atendimento e sobre qual carro.
    if (modeloBuscadoDe(contato)) {
      return { templates: R.TEMPLATES_RESGATE, blocos: R.BLOCOS_RESGATE_CARRO, tipo: 'resgate_carro' }
    }
    return { templates: R.TEMPLATES_RESGATE, blocos: R.BLOCOS_RESGATE, tipo: 'resgate' }
  }

  function montarMensagem(contato, config, variante, sementeExtra) {
    const fam = familiaDe(config, contato)
    const lista = fam.templates
    const tpl = variante === 'followup'
      ? TEMPLATE_FOLLOWUP
      : (lista[variante % lista.length] || lista[0])

    // Se você editou este texto na tela de campanha, o SEU texto manda —
    // sempre. O gerador só entra quando não há texto fixado.
    let base = customTpl[tpl.id]
    if (!base) {
      const sem = hashSemente(String((contato && contato.id) || (contato && contato.telefone) || '')
        + '|' + String(variante) + '|' + String(sementeExtra || ''))
      const semFixa = hashSemente(String((contato && contato.id) || (contato && contato.telefone) || '')
        + '|' + String(variante))
      base = variante === 'followup'
        ? comporFollowup(sem, fam.followup)
        : comporMensagem(semFixa, fam.blocos, config)
    }

    const vars = {
      primeiroNome: primeiroNome(contato.nome),
      nome: contato.nome || '',
      saudacao: saudacao(),
      saudacaoMin: saudacao().toLowerCase(),
      // No feirão o texto sai no nome de quem atendeu aquele cliente. No
      // resgate não: a lista vem da agenda de UMA pessoa, e é ela quem está
      // falando — o vendedor antigo do registro não tem nada a ver com isso.
      // Na prospecção também: quem fala é quem está prospectando.
      vendedor: ((config.modo === 'resgate' || config.modo === 'prospeccao')
        ? config.vendedor : (contato.vendedor || config.vendedor)) || '',
      estoque: config.estoqueUrl || 'www.appautodrive.com.br',
      cargo: config.cargo || '',
      modeloBuscado: modeloBuscadoDe(contato),
      anoBuscado: (contato && contato.anoBuscado) || agendaDe(contato).ano || '',
      campanhaAtual: config.campanhaAtual || '',
      campanhaAte: config.campanhaAte || '',
      loja: config.loja || '',
      cidade: config.cidade || '',
      veiculo: veiculoTitulo(contato.veiculo),
      modelo: modeloCurto(contato.veiculo),
      ano: contato.ano || '',
      placa: contato.placa || '',
      tempo: tempoDePosse(contato.dataCompra),
      // "Faz há 4 anos" é erro de português — este é o mesmo tempo sem o "há".
      tempoSem: String(tempoDePosse(contato.dataCompra) || '').replace(/^h[áa]\s+/i, ''),
      mesAno: mesAno(contato.dataCompra),
      feiraoAte: config.feiraoAte || '',
      feiraoNome: config.feiraoNome || 'feirão',
      feiraoPeriodo: config.feiraoPeriodo || '',
      anoMinimo: config.anoMinimo || 2018,
      beneficios: config.beneficios || 'condições especiais durante a campanha',
    }

    // O spin final usa a mesma semente do cliente: reabrir o painel não troca
    // a mensagem no meio do caminho.
    const semente = hashSemente(String((contato && contato.id) || (contato && contato.telefone) || '')
      + '|' + String(variante) + '|' + String(sementeExtra || '') + '|final')
    let txt = spin(base, rngDe(semente))
    txt = txt.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
    // limpeza: espaços duplos, linhas vazias triplas, sobras de campo faltando
    txt = txt.replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/\s+([,.!?])/g, '$1').trim()
    return txt
  }

  // ---------------------------------------------------------------------------
  // Higiene de importação
  // ---------------------------------------------------------------------------

  // CP1252 → byte, para desfazer texto UTF-8 que foi lido como ANSI ("JOSÃ‰").
  const CP1252 = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86,
    0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
    0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95,
    0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
  }

  /**
   * Conserta acento quebrado ("JOSÃ‰" → "JOSÉ"). Acontece quando o arquivo é
   * UTF-8 mas foi aberto/salvo como ANSI em algum ponto — tipicamente ao passar
   * pelo Excel. Se não parecer mojibake, devolve o texto intacto.
   */
  function repararTexto(txt) {
    const s = String(txt == null ? '' : txt)
    if (!/[ÃÂ][\u0080-\u00BF\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2122]/.test(s)) return s
    const bytes = []
    for (const ch of s) {
      const cp = ch.codePointAt(0)
      if (cp < 0x100) bytes.push(cp)
      else if (CP1252[cp] != null) bytes.push(CP1252[cp])
      else return s // tem caractere que não vem de CP1252: não é mojibake puro
    }
    try {
      const dec = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
      return dec
    } catch (e) { return s }
  }

  // Vocabulário de modelos que realmente aparecem na carteira, para distinguir
  // "KWID" de "JOSÉ ARNALDO DE SOUZA JUNIOR" sem depender de cadastro.
  const MODELOS = new Set(('206 207 208 408 500 2008 a3 agile aircross amarok argo azera bongo c3 c4 cactus '
    + 'captur celta city civic cobalt compass corsa countryman creta crossfox cruze duster ecosport elantra '
    + 'etios fiesta fiorino fit fluence fox gol hatch hb20 hb20s hr-v i30 idea jetta journey ka kicks kwid '
    + 'lancer logan march mobi onix pajero palio picasso prisma punto ranger renegade sandero saveiro sedan '
    + 'sentra sh150i sh150l siena sonic spacecross spin sportage strada sw t-cross tiguan tiida toro tr4 '
    + 'tracker tucson uno up! versa virtus voyage weekend x1 xc40 xc60 yaris nivus polo corolla hilux onix '
    + 'sw4 s10 montana frontier oroch duster kardian pulse fastback territory bronco').split(/\s+/))

  const CONECTIVOS = /(^|\s)(de|da|do|das|dos|e)(\s|$)/i

  /**
   * Quanto esse texto se parece com nome de pessoa (e não com um modelo de carro).
   * Usado para flagrar colunas trocadas na importação — o erro silencioso mais
   * caro que existe aqui, porque produz "Oi, Kwid!" na cara do cliente.
   */
  function scoreNomePessoa(txt) {
    const s = String(txt || '').trim()
    if (!s) return -99
    const palavras = s.split(/\s+/)
    const limpo = (w) => w.toLowerCase().replace(/[^a-zà-ÿ0-9!-]/g, '')
    let sc = 0
    if (palavras.length >= 2) sc += 2
    if (palavras.length >= 3) sc += 2
    if (CONECTIVOS.test(s)) sc += 3
    if (/\d/.test(s)) sc -= 3
    if (/\b(ltda|me|eireli|s\.?a\.?|comercio|comércio)\b/i.test(s)) sc += 4
    const modelos = palavras.filter((w) => MODELOS.has(limpo(w))).length
    sc -= modelos * 4
    if (palavras.length === 1) sc -= 2
    return sc
  }

  /** true quando "nome" e "veiculo" parecem estar invertidos. */
  function pareceTrocado(nome, veiculo) {
    if (!nome || !veiculo) return false
    const a = scoreNomePessoa(nome)
    const b = scoreNomePessoa(veiculo)
    return b > a + 2
  }

  /** Renderiza um item do playbook com os dados do cliente em atendimento. */
  function montarResposta(contato, config, id) {
    const item = PLAYBOOK.find((r) => r.id === id)
    if (!item) return ''
    const base = customTpl[item.id] || item.texto
    const c = contato || {}
    const vars = {
      primeiroNome: primeiroNome(c.nome), nome: c.nome || '', saudacao: saudacao(),
      saudacaoMin: saudacao().toLowerCase(), vendedor: c.vendedor || config.vendedor || '',
      loja: config.loja || '', cidade: config.cidade || '',
      veiculo: c.veiculo || 'seu carro', modelo: modeloCurto(c.veiculo),
      ano: c.ano || '', tempo: tempoDePosse(c.dataCompra), mesAno: mesAno(c.dataCompra),
      feiraoNome: config.feiraoNome || 'feirão', feiraoPeriodo: config.feiraoPeriodo || '',
      feiraoAte: config.feiraoAte || '', anoMinimo: config.anoMinimo || 2018,
    }
    return spin(base).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
      .replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  }

  /** Trava de qualidade — roda antes de liberar o "Abrir conversa". */
  function auditarMensagem(txt) {
    const problemas = []
    // Política comercial primeiro: é o que impede promessa indevida.
    const pol = validarPolitica(txt)
    pol.bloqueios.forEach((v) => problemas.push(`PROMESSA COMERCIAL — "${v.trecho}". ${v.porque} ${v.alternativa}`))
    pol.avisos.forEach((v) => problemas.push(`Confira se está autorizado — "${v.trecho}". ${v.porque}`))
    if (/https?:\/\/|wa\.me|bit\.ly/i.test(txt)) problemas.push('Tem link. No 1º contato, link é o maior gatilho de denúncia — tire.')
    if (txt.length > 700) problemas.push(`Muito longa (${txt.length} caracteres). Acima de ~700 vira panfleto.`)
    const pend = (txt.match(/\{[a-zA-Z]+\}/g) || []).filter((m) => m !== m.toUpperCase())
    if (pend.length) problemas.push(`Sobrou campo não preenchido (${pend[0]}). Corrija antes de enviar.`)
    const lacunas = (txt.match(/\{[A-Z]+\}/g) || [])
    if (lacunas.length) problemas.push(`Preencha ${lacunas.join(' e ')} antes de enviar.`)
    const caps = txt.replace(/[^A-ZÀ-Þ]/g, '').length / Math.max(txt.replace(/[^A-Za-zÀ-ÿ]/g, '').length, 1)
    if (caps > 0.3) problemas.push('Excesso de CAIXA ALTA — lê como propaganda.')
    const emojis = (txt.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length
    if (emojis > 2) problemas.push(`${emojis} emojis. Mais que 2 já parece disparo.`)
    return problemas
  }

  // ===========================================================================
  // AGENDA — gravar o contato e sincronizar com o celular
  //
  // Uma extensão de navegador não escreve na agenda do telefone. O caminho que
  // funciona de verdade é o padrão da indústria:
  //
  //    extensão gera .vcf  →  você importa no Google Contatos  →  sincroniza
  //    no celular  →  o WhatsApp passa a mostrar o nome salvo
  //
  // O WhatsApp lê a agenda do aparelho, então assim que o contato sincroniza, o
  // cliente aparece identificado na conversa — inclusive no WhatsApp Web.
  // ===========================================================================

  const MINUSCULAS = ['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'la', 'y']

  /** "JOSÉ ARNALDO DE SOUZA" → "José Arnaldo de Souza" (a carteira vem em caixa alta). */
  function tituloNome(s) {
    return String(s || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
      .map((w, i) => (i > 0 && MINUSCULAS.includes(w))
        ? w
        : w.replace(/^([a-zà-ÿ])/, (m) => m.toUpperCase()))
      .join(' ')
  }

  /** Primeiro nome + último sobrenome — o bastante para reconhecer na agenda. */
  function nomeCurto(s) {
    const p = tituloNome(s).split(/\s+/).filter((w) => w && !MINUSCULAS.includes(w.toLowerCase()))
    if (p.length <= 2) return p.join(' ')
    return `${p[0]} ${p[p.length - 1]}`
  }

  /** Monta o nome que vai aparecer na agenda, a partir do padrão configurado. */
  function nomeContato(c, config) {
    const cfg = config || {}
    const padrao = cfg.padraoContato || DEFAULT_CONFIG.padraoContato
    const d = parseData(c && c.dataCompra)
    const mm = d ? String(d.getMonth() + 1).padStart(2, '0') : ''
    // Mês da campanha = quando o cliente foi chamado. Se ainda não foi chamado
    // (pré-visualização, por exemplo), usa agora — que é quando ele seria.
    const dc = new Date((c && c.ultimoToqueEm) || (c && c.respondeuEm) || Date.now())
    const mmc = String(dc.getMonth() + 1).padStart(2, '0')
    const vars = {
      nome: tituloNome(c && c.nome),
      nomeCurto: nomeCurto(c && c.nome),
      primeiroNome: primeiroNome(c && c.nome),
      campanha: cfg.campanhaCurta || cfg.feiraoNome || 'Feirão',
      campanhaLonga: cfg.feiraoNome || 'Feirão',
      mesAnoCampanha: `${mmc}/${dc.getFullYear()}`,
      mesAnoCampanhaCurto: `${mmc}/${String(dc.getFullYear()).slice(2)}`,
      mesAno: d ? `${mm}/${d.getFullYear()}` : '',
      mesAnoCurto: d ? `${mm}/${String(d.getFullYear()).slice(2)}` : '',
      ano: d ? String(d.getFullYear()) : '',
      // Na agenda, sem veículo o campo some — "seu carro" é linguagem de
      // mensagem, não de contato salvo.
      modelo: (c && c.veiculo) ? modeloCurto(c.veiculo) : '',
      veiculo: (c && c.veiculo) || '',
      placa: (c && c.placa) || '',
      vendedor: (c && c.vendedor) || cfg.vendedor || '',
    }
    return String(padrao).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : ''))
      .replace(/\s+/g, ' ')
      // campo vazio deixa dois separadores colados — vira um só.
      // O {2,} protege a barra de datas: "08/2023" tem uma só, e passa intacta.
      .replace(/(?:\s*[·/]\s*){2,}/g, ' · ')
      .replace(/^[\s·/,-]+|[\s·/,-]+$/g, '').trim()
  }

  // --- mecânica do vCard 3.0 -------------------------------------------------
  const escapaVcf = (v) => String(v || '')
    .replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')

  const bytesDe = (s) => (typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(s).length
    : unescape(encodeURIComponent(s)).length)

  /** RFC 6350: a linha dobra em 75 OCTETOS — não caracteres; acento ocupa 2. */
  function dobrar(linha) {
    if (bytesDe(linha) <= 75) return linha
    const partes = []
    let atual = '', tam = 0
    for (const ch of linha) {
      const n = bytesDe(ch)
      const limite = partes.length === 0 ? 75 : 74   // continuação gasta 1 byte com o espaço
      if (tam + n > limite) { partes.push(atual); atual = ''; tam = 0 }
      atual += ch; tam += n
    }
    if (atual) partes.push(atual)
    return partes.map((p, i) => (i === 0 ? p : ' ' + p)).join('\r\n')
  }

  /** Um cartão. Devolve '' se o contato não tiver celular utilizável. */
  function vcardDe(c, config) {
    const tel = normalizarTelefone(c && c.telefone)
    if (!tel.ok) return ''
    const cfg = config || {}
    const nome = nomeContato(c, cfg)
    if (!nome) return ''
    const notas = [
      c.veiculo ? `Veículo: ${c.veiculo}${c.ano ? ' ' + c.ano : ''}` : '',
      c.placa ? `Placa: ${c.placa}` : '',
      c.dataCompra ? `Compra: ${c.dataCompra}` : '',
      c.vendedor ? `Vendedor: ${c.vendedor}` : '',
      `Origem: ${cfg.feiraoNome || 'campanha'} — cliente de carteira`,
    ].filter(Boolean).join('\n')

    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      dobrar(`N:;${escapaVcf(nome)};;;`),
      dobrar(`FN:${escapaVcf(nome)}`),
      dobrar(`TEL;TYPE=CELL,VOICE:+${tel.e164}`),
      cfg.loja ? dobrar(`ORG:${escapaVcf(cfg.loja)}`) : '',
      // CATEGORIES vira etiqueta no Google Contatos — dá para apagar o lote inteiro depois.
      dobrar(`CATEGORIES:${escapaVcf(cfg.feiraoNome || 'Campanha')}`),
      dobrar(`NOTE:${escapaVcf(notas)}`),
      'END:VCARD',
    ].filter(Boolean).join('\r\n') + '\r\n'
  }

  /** Arquivo .vcf com vários contatos. */
  function montarVcf(lista, config) {
    let total = 0, semTelefone = 0
    const cartoes = []
    ;(lista || []).forEach((c) => {
      const v = vcardDe(c, config)
      if (v) { cartoes.push(v); total++ } else semTelefone++
    })
    return { conteudo: cartoes.join(''), total, semTelefone }
  }

  /** Marca como já gravados os contatos exportados, para não repetir no próximo lote. */
  async function marcarContatosSalvos(ids) {
    const q = await getQueue()
    const set = new Set(ids || [])
    q.forEach((c) => { if (set.has(c.id)) { c.contatoSalvo = true; c.vcardPendente = false } })
    await saveQueue(q)
    return q
  }

  /**
   * Modo automático: decide se já é hora de baixar o lote acumulado.
   * Junta N contatos OU espera N minutos desde a última gravação — o que vier
   * primeiro. É o meio-termo entre um arquivo por cliente (que entope a pasta
   * de Downloads) e você ter que lembrar de clicar em exportar.
   */
  async function vcardPendentes() {
    const q = await getQueue()
    // Vale como pendente TODO mundo que já foi contatado e ainda não está na
    // agenda — não só quem tem a marca `vcardPendente`. Quem foi chamado antes
    // desta função existir não tem a marca, e ficaria de fora para sempre.
    return q.filter((c) =>
      !c.contatoSalvo &&
      !['optout', 'bloqueou', 'sem_whatsapp'].includes(c.status) &&
      (c.vcardPendente || (c.toques || 0) > 0 || !!c.respondeuEm || !!c.agendadoPara) &&
      normalizarTelefone(c.telefone).ok)
  }

  /**
   * Quem ainda falta gravar NO GOOGLE.
   *
   * Diferença crítica para vcardPendentes(): aqui NÃO se olha `contatoSalvo`.
   * `contatoSalvo` só prova que um arquivo .vcf foi BAIXADO — não que o contato
   * chegou na agenda. Quem exportou .vcf antes da integração do Google existir
   * ficou com `contatoSalvo = true` e nenhum `googleResourceName`, e por isso
   * era pulado para sempre. O único carimbo confiável de "está no Google" é o
   * googleResourceName devolvido pela própria API.
   */
  async function pendentesGoogle(opcoes) {
    const { todos = false } = opcoes || {}
    const q = await getQueue()
    return q.filter((c) =>
      !c.googleResourceName &&
      !['optout', 'bloqueou', 'sem_whatsapp'].includes(c.status) &&
      // `todos` grava a fila inteira; o padrão é só quem já teve contato.
      (todos || c.vcardPendente || (c.toques || 0) > 0 || !!c.respondeuEm || !!c.agendadoPara) &&
      normalizarTelefone(c.telefone).ok)
  }

  async function deveGravarAgenda(agora = Date.now()) {
    const config = await getConfig()
    if (config.salvarContatoAuto !== 'auto') return { gravar: false, motivo: 'modo não é automático', pendentes: [], pendentesGoogle: [] }
    const pendentes = await vcardPendentes()
    // Duas contas diferentes: o .vcf considera `contatoSalvo` (o arquivo já
    // saiu), o Google não (arquivo baixado não é contato na agenda). A conta do
    // Google só entra se a conta estiver conectada — senão a fila herdada do
    // .vcf ficaria "pendente" para sempre, pedindo gravação que não acontece.
    const pendGoogle = await pendentesGoogle()
    const st0 = await get(K_GOOGLE_TOKEN)
    const googleLigado = !!st0[K_GOOGLE_TOKEN]
    const quantos = googleLigado ? Math.max(pendentes.length, pendGoogle.length) : pendentes.length
    if (!quantos) return { gravar: false, motivo: 'nada pendente', pendentes, pendentesGoogle: pendGoogle }

    const state = await getState()
    const ultima = state.ultimaGravacaoAgenda || 0
    const lote = Math.max(1, Number(config.salvarContatoLote) || 10)
    const janelaMs = Math.max(1, Number(config.salvarContatoMinutos) || 30) * 60000

    const r = (gravar, motivo) => ({ gravar, motivo, pendentes, pendentesGoogle: pendGoogle })
    if (quantos >= lote) return r(true, `juntou ${quantos}`)
    if (ultima && agora - ultima >= janelaMs) return r(true, 'passou o tempo')
    if (!ultima) return r(true, 'primeira gravação')
    return r(false, 'aguardando juntar mais')
  }

  async function registrarGravacaoAgenda(ids, agora = Date.now()) {
    await marcarContatosSalvos(ids)
    const state = await getState()
    await set({ [K.state]: { ...state, ultimaGravacaoAgenda: agora } })
    await appendLog({ tipo: 'agenda', quantos: (ids || []).length })
  }

  /**
   * Onde cada contato REALMENTE está. A diferença entre "no Google" e "só em
   * arquivo" é a diferença entre estar na agenda do seu celular e estar num
   * .vcf esquecido na pasta Downloads.
   */
  async function situacaoAgenda() {
    const q = await getQueue()
    const chamados = q.filter((c) => (c.toques || 0) > 0 || !!c.respondeuEm)
    const noGoogle = chamados.filter((c) => c.googleResourceName)
    const soArquivo = chamados.filter((c) => !c.googleResourceName && c.contatoSalvo)
    const semGravar = chamados.filter((c) => !c.googleResourceName && !c.contatoSalvo &&
      normalizarTelefone(c.telefone).ok &&
      !['optout', 'bloqueou', 'sem_whatsapp'].includes(c.status))
    return {
      chamados: chamados.length,
      noGoogle: noGoogle.length,
      soArquivo: soArquivo.length,
      semGravar: semGravar.length,
      itensSoArquivo: soArquivo,
    }
  }

  function nomeArquivoVcf(config, sufixo) {
    const camp = String((config && config.feiraoNome) || 'campanha')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-')
      .replace(/^-|-$/g, '').toLowerCase()
    return `contatos-${camp}${sufixo ? '-' + sufixo : ''}-${hojeStr()}.vcf`
  }

  // ---------------------------------------------------------------------------
  // Cadência — a parte que evita o bloqueio
  // ---------------------------------------------------------------------------

  function hojeStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function dentroDaJanela(config, d = new Date()) {
    const dia = d.getDay() // 0 = domingo
    const h = d.getHours() + d.getMinutes() / 60
    if (dia === 0 && !config.domingo) return { ok: false, motivo: 'Domingo — a campanha está desligada.' }
    if (dia === 6) {
      if (h < config.horaInicio || h >= config.sabadoFim) return { ok: false, motivo: `Sábado: só das ${config.horaInicio}h às ${config.sabadoFim}h.` }
      return { ok: true }
    }
    if (h < config.horaInicio) return { ok: false, motivo: `Antes das ${config.horaInicio}h. Mensagem cedo demais irrita e vira bloqueio.` }
    if (h >= config.horaFim) return { ok: false, motivo: `Depois das ${config.horaFim}h. Deixe pra amanhã.` }
    return { ok: true }
  }

  function intervaloAleatorio(config) {
    const min = Math.max(LIMITES.minIntervaloSeg.min, Number(config.minIntervaloSeg) || LIMITES.minIntervaloSeg.padrao)
    const max = Math.max(min + 30, Number(config.maxIntervaloSeg) || LIMITES.maxIntervaloSeg.padrao)
    return Math.floor(min + Math.random() * (max - min)) * 1000
  }

  function pausaLongaAleatoria(config) {
    const min = Number(config.pausaLongaMin) || 8
    const max = Math.max(min + 1, Number(config.pausaLongaMax) || 15)
    return Math.floor((min + Math.random() * (max - min)) * 60) * 1000
  }

  /**
   * Diz se pode chamar o próximo agora.
   * → { liberado, esperaMs, motivo, restamHoje }
   */
  async function podeChamarAgora() {
    const config = await getConfig()
    let state = await getState()
    const hoje = hojeStr()

    if (state.day !== hoje) {
      state = await saveState({ day: hoje, sentToday: 0, sinceLongPause: 0, pausedUntil: 0 })
    }

    const restamHoje = Math.max(0, (config.maxPorDia || 30) - (state.sentToday || 0))

    // Trava de conta restrita: nada sai enquanto estiver ligada. Enviar durante
    // uma restrição é o caminho mais curto para ela virar banimento.
    if (config.contaRestrita) {
      return {
        liberado: false, esperaMs: 0, restamHoje: 0, restrita: true,
        motivo: 'CONTA RESTRITA PELA META: a campanha está travada. Não envie nada por este número '
          + 'até a restrição sair. Peça revisão no próprio WhatsApp e espere.',
      }
    }

    if (state.freio) {
      return { liberado: false, esperaMs: 0, motivo: 'FREIO ATIVO: muita rejeição nos últimos contatos. Revise a mensagem e a lista antes de continuar.', restamHoje }
    }

    const janela = dentroDaJanela(config)
    if (!janela.ok) return { liberado: false, esperaMs: 0, motivo: janela.motivo, restamHoje }

    if (restamHoje <= 0) {
      return { liberado: false, esperaMs: 0, motivo: `Teto do dia atingido (${config.maxPorDia}). Continue amanhã — é isso que mantém o número vivo.`, restamHoje: 0 }
    }

    const agora = Date.now()
    if (state.pausedUntil && agora < state.pausedUntil) {
      return { liberado: false, esperaMs: state.pausedUntil - agora, motivo: 'Pausa longa em andamento (respiro a cada bloco de envios).', restamHoje }
    }

    const proximoPermitido = (state.lastSentAt || 0) + (state.nextGapMs || 0)
    if (state.lastSentAt && agora < proximoPermitido) {
      return { liberado: false, esperaMs: proximoPermitido - agora, motivo: 'Aguardando o intervalo entre contatos.', restamHoje }
    }

    return { liberado: true, esperaMs: 0, motivo: '', restamHoje }
  }

  /**
   * Abriu uma conversa com texto pronto: o relógio do intervalo começa AQUI.
   *
   * A mensagem sai no Enter, antes de qualquer botão do painel. Quando o
   * intervalo só começava no "Enviei ✓", bastava não clicar (ou clicar em
   * "Não enviei") para o próximo cliente abrir na hora — rajada de mensagens,
   * que é o que a Meta bane. Não conta envio do dia: isso segue no Enviei.
   */
  async function reservarEnvio() {
    const config = await getConfig()
    return saveState({ lastSentAt: Date.now(), nextGapMs: intervaloAleatorio(config) })
  }

  /** Registra que um contato foi efetivamente enviado e sorteia o próximo intervalo. */
  async function registrarEnvio(contato, variante, texto) {
    const config = await getConfig()
    const state = await getState()
    const sentToday = (state.day === hojeStr() ? state.sentToday || 0 : 0) + 1
    const sinceLongPause = (state.sinceLongPause || 0) + 1

    const patch = {
      day: hojeStr(),
      sentToday,
      sinceLongPause,
      lastSentAt: Date.now(),
      nextGapMs: intervaloAleatorio(config),
      pausedUntil: 0,
    }
    if (sinceLongPause >= (config.pausaACada || 10)) {
      patch.sinceLongPause = 0
      patch.pausedUntil = Date.now() + pausaLongaAleatoria(config)
    }
    await saveState(patch)

    await appendLog({
      tipo: 'envio',
      telefone: contato.telefone,
      nome: contato.nome,
      variante,
      toque: (contato.toques || 0) + 1,
      origemDado: contato.origem || 'desconhecida',
      caracteres: (texto || '').length,
    })
    return patch
  }

  /** Marca desfecho e devolve a fila atualizada. */
  async function marcarContato(id, status, extra = {}) {
    const q = await getQueue()
    const i = q.findIndex((c) => c.id === id)
    if (i < 0) return q
    const c = q[i]
    c.status = status
    c.atualizadoEm = Date.now()
    Object.assign(c, extra)
    if (status === 'enviado') {
      c.toques = (c.toques || 0) + 1
      c.ultimoToqueEm = Date.now()
      if (c.toques >= (await getConfig()).maxToques) c.status = 'concluido'
      else c.status = 'aguardando_resposta'
    }
    if (status === 'optout') await addToBlocklist(c.telefone)

    // Agenda: marca para gravar quem já foi contatado. Quem pediu para não
    // receber nunca entra — não faz sentido guardar na agenda quem saiu.
    const cfgAg = await getConfig()
    const gravaveis = ['enviado', ...RESPONDEU_ALGUM]
    if (cfgAg.salvarContatoAuto !== 'nao' && gravaveis.includes(status) && !c.contatoSalvo) {
      c.vcardPendente = true
    }
    if (['optout', 'bloqueou'].includes(status)) { c.vcardPendente = false }

    q[i] = c
    await saveQueue(q)
    await appendLog({ tipo: 'desfecho', telefone: c.telefone, status, nome: c.nome })
    await avaliarFreio()
    return q
  }

  /** Se a rejeição recente estourar o limite, trava a campanha e obriga revisão. */
  async function avaliarFreio() {
    const config = await getConfig()
    const log = await getLog()
    // "Sem WhatsApp" não entra: é número ruim da lista, não pessoa rejeitando a
    // mensagem — não é sinal de bloqueio em massa e travava a campanha à toa.
    const desfechos = log.filter((e) => e.tipo === 'desfecho' && e.status !== 'sem_whatsapp').slice(-20)
    if (desfechos.length < 10) return false
    const ruins = desfechos.filter((e) => e.status === 'optout' || e.status === 'bloqueou').length
    const pct = (ruins / desfechos.length) * 100
    if (pct >= (config.alertaRejeicaoPct || 20)) {
      await saveState({ freio: true })
      return true
    }
    return false
  }

  async function liberarFreio() { await saveState({ freio: false }) }

  // ---------------------------------------------------------------------------
  // Seleção do próximo contato
  // ---------------------------------------------------------------------------
  async function proximoContato() {
    // Nome bagunçado da exportação do Google é consertado ANTES de sortear:
    // é daqui que sai a mensagem e o nome gravado na agenda.
    await higienizarNomes()
    const [q, block, config] = await Promise.all([getQueue(), getBlocklist(), getConfig()])
    const agora = Date.now()
    const cooldownMs = (config.cooldownDias || 90) * 86400000
    const followUpMs = (config.followUpDias || 4) * 86400000

    // 1) quem nunca foi tocado
    const novos = q.filter((c) =>
      c.status === 'pendente' &&
      !block.includes(c.telefone) &&
      !(c.ultimoContatoAnteriorEm && agora - c.ultimoContatoAnteriorEm < cooldownMs)
    )
    if (novos.length) return { contato: novos[0], variante: escolherVariante(q, config, novos[0]), restantes: novos.length }

    // 2) follow-up único de quem não respondeu
    const follow = q.filter((c) =>
      c.status === 'aguardando_resposta' &&
      (c.toques || 0) < (config.maxToques || 2) &&
      !block.includes(c.telefone) &&
      c.ultimoToqueEm && agora - c.ultimoToqueEm >= followUpMs
    )
    if (follow.length) return { contato: follow[0], variante: 'followup', restantes: follow.length }

    return { contato: null, variante: null, restantes: 0 }
  }

  // ===========================================================================
  // DETECÇÃO DE RESPOSTA
  //
  // Não existe recurso oficial que avise "este contato respondeu" no WhatsApp
  // Web — só a Cloud API entrega esse evento, via webhook. O que dá para fazer
  // aqui é LER o que já está desenhado na sua tela: a lista de conversas.
  //
  // É leitura passiva e local: nenhuma mensagem é enviada, nenhum clique é
  // simulado, nada sai do navegador. Não gera sinal nenhum no servidor da Meta
  // (que é onde a detecção de automação roda). Ainda assim, é bom você saber
  // que isso não é um recurso sancionado — o caminho oficial é a Cloud API.
  //
  // O casamento fica muito mais confiável depois que você importa os contatos
  // pelo .vcf: aí o título da conversa é exatamente o nome que a extensão
  // gravou, e não um número solto.
  // ===========================================================================

  /** Só dígitos, para comparar títulos de conversa com telefone da fila. */
  function digitos(s) { return String(s || '').replace(/\D+/g, '') }

  /**
   * Casa uma linha da lista de conversas com um contato da fila.
   * @param {{titulo:string, naoLidas:number}} linha
   * @param {Array} fila
   * @param {object} config
   */
  function casarConversa(linha, fila, config) {
    const titulo = String(linha && linha.titulo || '').trim()
    if (!titulo) return null
    const d = digitos(titulo)

    // 1) título é um telefone — comparação por dígitos, do fim para o começo
    if (d.length >= 10) {
      const achado = fila.find((c) => {
        const t = digitos(c.telefone)
        return t && (t === d || t.endsWith(d.slice(-10)) || d.endsWith(t.slice(-10)))
      })
      if (achado) return achado
    }

    // 2) título é o nome salvo pelo .vcf — comparação exata do nome gerado
    const alvo = normalizarChave(titulo)
    if (!alvo) return null
    let achado = fila.find((c) => normalizarChave(nomeContato(c, config)) === alvo)
    if (achado) return achado

    // 3) fallback: nome do cadastro (caso ele tenha salvo o contato à mão)
    achado = fila.find((c) => c.nome && normalizarChave(c.nome) === alvo)
    if (achado) return achado

    // 4) último recurso: primeiro nome + sobrenome. Só vale se UM único cliente
    //    bater — "Maria Silva" pode ser duas pessoas, e marcar a errada como
    //    "respondeu" é pior do que não marcar ninguém.
    const curto = normalizarChave(nomeCurto(titulo))
    if (curto.length >= 8) {
      const iguais = fila.filter((c) => c.nome && normalizarChave(nomeCurto(c.nome)) === curto)
      if (iguais.length === 1) return iguais[0]
    }
    return null
  }

  /**
   * A prévia da conversa é o eco da mensagem que nós mandamos?
   * Compara só o miolo alfanumérico dos primeiros caracteres — a prévia vem
   * truncada, sem quebras de linha e às vezes com reticências.
   */
  function ecoDaNossaMensagem(previa, textoEnviado) {
    if (!previa || !textoEnviado) return false
    const limpa = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '')
    const p = limpa(previa)
    const t = limpa(textoEnviado)
    if (p.length < 8 || t.length < 8) return false
    const n = Math.min(p.length, t.length, 40)
    return p.slice(0, n) === t.slice(0, n)
  }

  /**
   * Desfaz as marcações feitas pelo detector automático, preservando tudo que
   * você marcou na mão. Existe porque a v0.12.1 marcou como "respondeu" gente
   * que não respondeu, e ninguém deveria ter que consertar isso cliente a
   * cliente.
   */
  /**
   * Recomeça a campanha do zero MANTENDO os contatos.
   *
   * Zera tudo que é andamento — status, toques, respostas, agendamentos,
   * retomadas, variante sorteada — e devolve cada contato para "pendente".
   * O que é dado do contato (nome, telefone, veículo, compra, vendedor,
   * origem) fica como está.
   *
   * Três coisas NÃO são zeradas, de propósito:
   *   · quem pediu para sair (optout) e quem bloqueou continua fora — isso é
   *     vontade da pessoa, não andamento de campanha, e a LGPD exige respeitar
   *   · número sem WhatsApp continua marcado, senão a fila tenta de novo à toa
   *   · a trilha de auditoria (log) — recebe uma linha dizendo que houve o
   *     recomeço, e só
   *
   * Os textos personalizados também saem: a campanha mudou de feirão para
   * prospecção, e um texto antigo fixado passaria por cima do novo gerador.
   */
  const NAO_RECOMECA = ['optout', 'bloqueou', 'sem_whatsapp']
  const CAMPOS_DO_CONTATO = ['id', 'nome', 'telefone', 'veiculo', 'ano', 'placa', 'dataCompra',
    'vendedor', 'origem', 'criadoEm', 'nomeAgenda', 'modeloBuscado', 'anoBuscado',
    'contatoSalvo', 'googleResourceName']

  async function recomecarDoZero() {
    const q = await getQueue()
    let recomecados = 0
    let preservados = 0
    const agora = Date.now()

    const nova = q.map((c) => {
      if (NAO_RECOMECA.includes(c.status)) { preservados++; return c }
      const limpo = {}
      CAMPOS_DO_CONTATO.forEach((k) => { if (c[k] !== undefined) limpo[k] = c[k] })
      limpo.status = 'pendente'
      limpo.toques = 0
      limpo.atualizadoEm = agora
      recomecados++
      return limpo
    })

    // Ordem nova também: recomeçar na mesma sequência de antes repetiria o
    // padrão de disparo que o embaralhamento existe para evitar.
    for (let i = nova.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nova[i], nova[j]] = [nova[j], nova[i]]
    }

    await saveQueue(nova)
    // cadência do dia e freio de rejeição: tudo novo
    await set({ [K.state]: { lastSentAt: 0, day: '', sentToday: 0, sinceLongPause: 0, pausedUntil: 0, freio: false } })
    await set({ [K.tpl]: {} })
    customTpl = {}
    await appendLog({ tipo: 'recomeco', recomecados, preservados, total: q.length })
    return { recomecados, preservados, total: q.length }
  }

  async function reverterRespostasAutomaticas() {
    const q = await getQueue()
    let n = 0
    q.forEach((c) => {
      if (!c.respostaDetectada || c.statusManual) return
      n++
      c.respostaDetectada = false
      c.respondeuEm = null
      c.previaResposta = ''
      // volta para onde estaria se o detector nunca tivesse tocado nele
      c.status = (c.toques || 0) > 0 ? 'aguardando_resposta' : 'pendente'
      c.atualizadoEm = Date.now()
    })
    if (n) {
      await saveQueue(q)
      await appendLog({ tipo: 'reversao', quantos: n })
    }
    return { revertidos: n }
  }

  function normalizarChave(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '')
  }

  /**
   * Recebe as linhas lidas da tela e marca como "respondeu" quem tem mensagem
   * nova depois do nosso envio.
   * @returns {{novas:Array, examinadas:number, casadas:number}}
   */
  async function conciliarRespostas(linhas) {
    const [q, config] = await Promise.all([getQueue(), getConfig()])
    // só interessa quem já foi tocado e ainda não respondeu
    const candidatos = q.filter((c) => (c.toques || 0) > 0 &&
      ['aguardando_resposta', 'concluido', 'enviado'].includes(c.status))
    if (!candidatos.length) return { novas: [], examinadas: (linhas || []).length, casadas: 0 }

    const novas = []
    const semPar = []
    let casadas = 0
    ;(linhas || []).forEach((linha) => {
      const c = casarConversa(linha, candidatos, config)
      if (!c) { semPar.push(linha.titulo); return }
      casadas++
      // Dois sinais valem como resposta:
      //  - balãozinho de não lidas (você ainda não abriu), OU
      //  - a última mensagem da conversa é DELE (você já leu, o balão sumiu).
      // Só o primeiro sinal era usado antes, e por isso toda conversa que você
      // abria deixava de ser contabilizada.
      if (!linha.naoLidas && !linha.ultimaDele) return
      if (c.respondeuEm) return                         // já contabilizado

      // Segunda trava, independente do DOM: se a prévia é o começo do texto que
      // NÓS mandamos, a última mensagem é nossa — não importa o que os ícones
      // digam. Isso protege contra o seletor quebrar de novo no futuro.
      if (ecoDaNossaMensagem(linha.previa, c.ultimoTextoEnviado)) return
      const i = q.findIndex((x) => x.id === c.id)
      if (i < 0) return
      q[i].status = 'respondeu'
      q[i].respondeuEm = Date.now()
      q[i].respostaDetectada = true
      q[i].previaResposta = String(linha.previa || '').slice(0, 120)
      q[i].atualizadoEm = Date.now()
      novas.push(q[i])
    })

    if (novas.length) {
      await saveQueue(q)
      for (const c of novas) {
        await appendLog({ tipo: 'resposta', telefone: c.telefone, nome: c.nome, automatico: true })
      }
    }
    // semPar volta para o diagnóstico: se nada casa, é aqui que você descobre
    // que o WhatsApp está mostrando números onde a fila tem nomes (ou o contrário).
    return { novas, examinadas: (linhas || []).length, casadas, semPar: semPar.slice(0, 12) }
  }

  // ===========================================================================
  // AUDITORIA — onde cada cliente está, de verdade
  // ===========================================================================

  // A ORDEM importa: o primeiro teste que casar define o grupo. "Respondeu" vem
  // antes de "não chamei" de propósito — se a pessoa respondeu, o registro de
  // envio faltando é uma inconsistência a apontar, não motivo para tratá-la
  // como quem nunca foi contatado.
  // A ORDEM aqui é de PRECEDÊNCIA: o primeiro teste que casar define o grupo.
  // Vai do desfecho mais terminal para o começo do funil, para que um cliente
  // que já bloqueou não seja contado como "em conversa" por causa de um status
  // antigo. A ordem de EXIBIÇÃO na tela é outra (segue o funil) e vive na
  // campanha.js — são coisas diferentes de propósito.
  const GRUPOS = [
    { id: 'nao_contatar', rotulo: 'Não contatar',
      teste: (c) => ['optout', 'bloqueou', 'sem_whatsapp'].includes(c.status) },
    { id: 'vendidos', rotulo: 'Fechou negócio',
      teste: (c) => c.status === 'vendeu' },
    { id: 'futuro', rotulo: 'Volta no futuro',
      teste: (c) => ['trocar_futuro', 'aceita_promocoes'].includes(c.status) },
    { id: 'perdidos', rotulo: 'Sem interesse / não respondeu',
      teste: (c) => ['sem_interesse', 'nao_respondeu'].includes(c.status) },
    { id: 'em_conversa', rotulo: 'Em conversa agora',
      teste: (c) => EM_CONVERSA.includes(c.status) || ['compareceu', 'faltou'].includes(c.status) || !!c.respondeuEm },
    { id: 'sem_resposta', rotulo: 'Chamei e aguardo resposta',
      teste: (c) => (c.toques || 0) > 0 },
    { id: 'nao_chamados', rotulo: 'Ainda não chamei',
      teste: (c) => (c.toques || 0) === 0 },
  ]

  function grupoDe(c) {
    const g = GRUPOS.find((x) => x.teste(c))
    return g ? g.id : 'outros'
  }

  /**
   * Fotografia da campanha por grupo, mais as inconsistências que valem
   * conferir antes de confiar nos números.
   */
  async function auditoria(agora = Date.now()) {
    const [q, block] = await Promise.all([getQueue(), getBlocklist()])
    const grupos = {}
    GRUPOS.forEach((g) => { grupos[g.id] = { ...g, itens: [] } })
    grupos.outros = { id: 'outros', rotulo: 'Outros', itens: [] }
    q.forEach((c) => grupos[grupoDe(c)].itens.push(c))

    // O que costuma estar errado e ninguém percebe:
    const alertas = []
    const semTelefone = q.filter((c) => !normalizarTelefone(c.telefone).ok)
    if (semTelefone.length) {
      alertas.push({ tipo: 'sem_celular', n: semTelefone.length,
        texto: `${semTelefone.length} na fila sem celular válido — nunca vão sair.`, itens: semTelefone })
    }
    const naBlockMasAtivo = q.filter((c) => block.includes(c.telefone) && c.status !== 'optout')
    if (naBlockMasAtivo.length) {
      alertas.push({ tipo: 'block_divergente', n: naBlockMasAtivo.length,
        texto: `${naBlockMasAtivo.length} estão na lista de não perturbe mas seguem ativos na fila.`, itens: naBlockMasAtivo })
    }
    const agendadoVencido = q.filter((c) => c.agendadoPara && c.status === 'agendado' &&
      new Date(c.agendadoPara).getTime() < agora - 3 * 3600000)
    if (agendadoVencido.length) {
      alertas.push({ tipo: 'agenda_vencida', n: agendadoVencido.length,
        texto: `${agendadoVencido.length} com horário já passado e sem desfecho marcado.`, itens: agendadoVencido })
    }
    const respondeuSemToque = q.filter((c) => c.respondeuEm && !(c.toques || 0))
    if (respondeuSemToque.length) {
      alertas.push({ tipo: 'resposta_orfa', n: respondeuSemToque.length,
        texto: `${respondeuSemToque.length} marcados como "respondeu" sem registro de envio — provável marcação manual.`, itens: respondeuSemToque })
    }
    const salvarPendente = q.filter((c) => c.vcardPendente && !c.contatoSalvo)
    if (salvarPendente.length) {
      alertas.push({ tipo: 'agenda_pendente', n: salvarPendente.length,
        texto: `${salvarPendente.length} contatos ainda não gravados na agenda.`, itens: salvarPendente })
    }

    // há quantos dias cada um está esperando resposta
    const esperando = grupos.sem_resposta.itens.map((c) => ({
      contato: c,
      dias: c.ultimoToqueEm ? Math.floor((agora - c.ultimoToqueEm) / 86400000) : null,
    })).sort((a, b) => (b.dias || 0) - (a.dias || 0))

    return { total: q.length, grupos, alertas, esperando, geradoEm: agora }
  }

  // ---------------------------------------------------------------------------
  // Status — o funil de SDR
  //
  // `grupo` organiza o seletor na tela. `encerra` marca os status que tiram o
  // cliente da fila ativa. `reabreEm` diz que o status carrega uma data futura
  // para você voltar a falar.
  // ---------------------------------------------------------------------------
  const STATUS_MANUAIS = [
    // --- antes do contato ---
    { id: 'pendente', grupo: 'Fila', rotulo: 'a chamar' },
    { id: 'pulado', grupo: 'Fila', rotulo: 'pulado' },

    // --- contatado, sem retorno ---
    { id: 'aguardando_resposta', grupo: 'Contatado', rotulo: 'aguardando cliente responder' },
    { id: 'nao_respondeu', grupo: 'Contatado', rotulo: 'cliente não respondeu', encerra: true },

    // --- em conversa ---
    { id: 'respondeu', grupo: 'Em conversa', rotulo: 'respondeu — atender' },
    { id: 'em_atendimento', grupo: 'Em conversa', rotulo: 'em atendimento' },
    { id: 'negociando', grupo: 'Em conversa', rotulo: 'em negociação' },

    // --- agenda ---
    { id: 'agendado', grupo: 'Agenda', rotulo: 'agendado' },
    { id: 'compareceu', grupo: 'Agenda', rotulo: 'compareceu' },
    { id: 'faltou', grupo: 'Agenda', rotulo: 'não compareceu' },

    // --- desfechos ---
    { id: 'vendeu', grupo: 'Desfecho', rotulo: 'fechou negócio', encerra: true },
    { id: 'sem_interesse', grupo: 'Desfecho', rotulo: 'sem interesse no momento', encerra: true },
    { id: 'trocar_futuro', grupo: 'Desfecho', rotulo: 'vai trocar no futuro', reabreEm: true },
    { id: 'aceita_promocoes', grupo: 'Desfecho', rotulo: 'quer receber promoções', encerra: true },
    { id: 'concluido', grupo: 'Desfecho', rotulo: 'concluído', encerra: true },

    // --- não contatar ---
    { id: 'sem_whatsapp', grupo: 'Não contatar', rotulo: 'número sem WhatsApp', encerra: true },
    { id: 'bloqueou', grupo: 'Não contatar', rotulo: 'cliente bloqueou o número', encerra: true },
    { id: 'optout', grupo: 'Não contatar', rotulo: 'pediu para não receber', encerra: true },
  ]

  const statusInfo = (id) => STATUS_MANUAIS.find((s) => s.id === id) || null
  const rotuloStatus = (id) => (statusInfo(id) || {}).rotulo || id

  /** Status que significam "o cliente está falando com você agora". */
  const EM_CONVERSA = ['respondeu', 'em_atendimento', 'negociando', 'agendado']
  /** Status que contam como resposta do cliente, para o funil. */
  const RESPONDEU_ALGUM = [...EM_CONVERSA, 'compareceu', 'faltou', 'vendeu',
    'sem_interesse', 'trocar_futuro', 'aceita_promocoes', 'bloqueou']

  /**
   * Troca de status feita por VOCÊ, na mão. Diferente de marcarContato: não
   * conta toque, não mexe no cooldown, não dispara o freio — é correção de
   * cadastro, não desfecho de contato. O log registra que foi manual.
   */
  async function definirStatusManual(id, status) {
    const q = await getQueue()
    const i = q.findIndex((c) => c.id === id)
    if (i < 0) return null
    const c = q[i]
    const antes = c.status
    if (antes === status) return c

    c.status = status
    c.atualizadoEm = Date.now()
    c.statusManual = true

    // coerências que o usuário espera sem ter que pensar
    const naoContatar = ['optout', 'bloqueou']
    if (naoContatar.includes(status)) { await addToBlocklist(c.telefone); c.vcardPendente = false }
    if (naoContatar.includes(antes) && !naoContatar.includes(status)) await removeFromBlocklist(c.telefone)

    // Qualquer status que só existe porque o cliente falou carimba a resposta.
    if (RESPONDEU_ALGUM.includes(status) && !c.respondeuEm) c.respondeuEm = Date.now()
    if (status === 'pendente') { c.respondeuEm = null; c.respostaDetectada = false }

    // "Quer receber promoções" é opt-in explícito: vira marcador permanente,
    // para não se perder quando o status mudar depois. É o que a LGPD pede que
    // você consiga provar, e o que faz a próxima campanha valer mais.
    if (status === 'aceita_promocoes') {
      c.aceitaPromocoes = true
      c.aceitaPromocoesEm = Date.now()
      await removeFromBlocklist(c.telefone)
    }
    if (status === 'trocar_futuro' && !c.retomarEm) {
      // padrão: retomar em 6 meses. Você ajusta na tela quando souber a data.
      c.retomarEm = Date.now() + 180 * 86400000
    }

    q[i] = c
    await saveQueue(q)
    await appendLog({ tipo: 'status_manual', telefone: c.telefone, nome: c.nome, de: antes, para: status })
    return c
  }

  // ===========================================================================
  // FOLLOW-UP — o que precisa da sua atenção hoje
  // ===========================================================================

  const DIA = 86400000
  const mesmoDia = (a, b) => a && b && new Date(a).toDateString() === new Date(b).toDateString()

  /**
   * Tudo que está vencido ou vence hoje, em ordem de prioridade.
   * Tipos: 'lembrete' | 'noshow' | 'retomar' | 'followup'
   */
  async function tarefasDeHoje(agora = Date.now()) {
    const [q, config, block] = await Promise.all([getQueue(), getConfig(), getBlocklist()])
    const followUpMs = (config.followUpDias || 4) * DIA
    const retomarMs = (config.retomarDias || 3) * DIA
    const tarefas = []
    const vivo = (c) => !block.includes(c.telefone) &&
      !['optout', 'bloqueou', 'sem_whatsapp', 'vendeu'].includes(c.status)

    q.filter(vivo).forEach((c) => {
      // 1) visita marcada para amanhã, sem lembrete enviado
      if (c.agendadoPara && !c.lembreteEm) {
        const quando = new Date(c.agendadoPara).getTime()
        if (quando > agora && quando - agora <= DIA * 1.5) {
          tarefas.push({ tipo: 'lembrete', prioridade: 1, contato: c, quando,
            rotulo: 'Confirmar a visita de amanhã', playbook: 'a_lembrete' })
        }
      }
      // 2) horário passou e ninguém marcou o que aconteceu
      if (c.agendadoPara && c.status === 'agendado') {
        const quando = new Date(c.agendadoPara).getTime()
        if (agora - quando > 3 * 3600000) {
          tarefas.push({ tipo: 'noshow', prioridade: 2, contato: c, quando,
            rotulo: 'Não apareceu — remarcar', playbook: 'a_faltou' })
        }
      }
      // 3) respondeu, conversa esfriou e não virou agendamento
      if (c.status === 'respondeu' && !c.agendadoPara && c.respondeuEm &&
          agora - c.respondeuEm >= retomarMs) {
        tarefas.push({ tipo: 'retomar', prioridade: 3, contato: c, quando: c.respondeuEm,
          rotulo: 'Respondeu e esfriou — puxar para o agendamento', playbook: 'a_convite' })
      }
      // 4) não respondeu o 1º toque e já passou o prazo
      if (c.status === 'aguardando_resposta' && (c.toques || 0) < (config.maxToques || 2) &&
          c.ultimoToqueEm && agora - c.ultimoToqueEm >= followUpMs) {
        tarefas.push({ tipo: 'followup', prioridade: 4, contato: c, quando: c.ultimoToqueEm,
          rotulo: 'Follow-up (2º e último toque)', playbook: null })
      }
      // 5) disse que trocaria no futuro e a data chegou
      if (c.status === 'trocar_futuro' && c.retomarEm && agora >= c.retomarEm) {
        tarefas.push({ tipo: 'retomar_futuro', prioridade: 2, contato: c, quando: c.retomarEm,
          rotulo: 'Disse que trocaria agora — retomar', playbook: 'a_convite' })
      }
      // 6) em atendimento parado há dias: ninguém está tocando essa conversa
      if (['em_atendimento', 'negociando'].includes(c.status) &&
          c.atualizadoEm && agora - c.atualizadoEm >= retomarMs) {
        tarefas.push({ tipo: 'parado', prioridade: 1, contato: c, quando: c.atualizadoEm,
          rotulo: 'Atendimento parado — retomar a conversa', playbook: 'a_convite' })
      }
    })

    tarefas.sort((a, b) => a.prioridade - b.prioridade || a.quando - b.quando)
    return tarefas
  }

  async function marcarLembreteEnviado(id) {
    const q = await getQueue()
    const i = q.findIndex((c) => c.id === id)
    if (i < 0) return
    q[i].lembreteEm = Date.now()
    await saveQueue(q)
  }

  // ===========================================================================
  // RELATÓRIOS
  // ===========================================================================

  /** Números da campanha inteira, prontos para desenhar. */
  async function relatorio(agora = Date.now()) {
    const [q, log] = await Promise.all([getQueue(), getLog()])

    const tocados = q.filter((c) => (c.toques || 0) > 0)
    const responderam = q.filter((c) => c.respondeuEm || RESPONDEU_ALGUM.includes(c.status))
    const agendaram = q.filter((c) => c.agendadoPara)
    const compareceram = q.filter((c) => c.status === 'compareceu')
    const optout = q.filter((c) => c.status === 'optout')
    const semWhats = q.filter((c) => c.status === 'sem_whatsapp')

    // desempenho por variante de abertura — qual texto realmente puxa resposta
    const porVariante = TEMPLATES_PRIMEIRO.map((t, i) => {
      const usados = q.filter((c) => c.varianteUsada === i)
      const resp = usados.filter((c) => c.respondeuEm || RESPONDEU_ALGUM.includes(c.status))
      const ag = usados.filter((c) => c.agendadoPara)
      return {
        indice: i, nome: t.nome, enviados: usados.length,
        respostas: resp.length, agendamentos: ag.length,
        taxaResposta: usados.length ? resp.length / usados.length : null,
        taxaAgenda: resp.length ? ag.length / resp.length : null,
      }
    })

    // por dia, a partir do log (o log é a fonte de verdade do que aconteceu)
    const dias = {}
    const bump = (ts, campo) => {
      if (!ts) return
      const d = new Date(ts).toISOString().slice(0, 10)
      dias[d] = dias[d] || { dia: d, enviados: 0, respostas: 0, agendamentos: 0, optout: 0 }
      dias[d][campo]++
    }
    log.filter((e) => e.tipo === 'envio').forEach((e) => bump(e.em || e.ts, 'enviados'))
    q.forEach((c) => { bump(c.respondeuEm, 'respostas') })
    q.filter((c) => c.agendadoPara).forEach((c) => bump(c.atualizadoEm, 'agendamentos'))
    q.filter((c) => c.status === 'optout').forEach((c) => bump(c.atualizadoEm, 'optout'))
    const porDia = Object.values(dias).sort((a, b) => a.dia.localeCompare(b.dia))

    // tempo até a resposta (mediana é mais honesta que média com poucos casos)
    const esperas = q.filter((c) => c.respondeuEm && c.ultimoToqueEm && c.respondeuEm > c.ultimoToqueEm)
      .map((c) => c.respondeuEm - c.ultimoToqueEm).sort((a, b) => a - b)
    const mediana = esperas.length
      ? (esperas.length % 2 ? esperas[(esperas.length - 1) / 2]
        : (esperas[esperas.length / 2 - 1] + esperas[esperas.length / 2]) / 2)
      : null

    const pct = (n, d) => (d ? n / d : null)
    return {
      geradoEm: agora,
      total: q.length,
      contatados: tocados.length,
      responderam: responderam.length,
      agendaram: agendaram.length,
      compareceram: compareceram.length,
      optout: optout.length,
      semWhats: semWhats.length,
      naFila: q.filter((c) => c.status === 'pendente').length,
      detectadasAuto: q.filter((c) => c.respostaDetectada).length,
      taxaResposta: pct(responderam.length, tocados.length),
      taxaAgenda: pct(agendaram.length, responderam.length),
      taxaComparecimento: pct(compareceram.length, agendaram.length),
      taxaOptout: pct(optout.length, tocados.length),
      medianaRespostaMs: mediana,
      porVariante, porDia,
    }
  }

  /** Resumo em texto puro, para colar no grupo da equipe. */
  function resumoTexto(r, config) {
    const p = (v) => (v == null ? '—' : Math.round(v * 100) + '%')
    const h = (ms) => {
      if (ms == null) return '—'
      const min = Math.round(ms / 60000)
      if (min < 60) return `${min} min`
      const hrs = Math.round(min / 60)
      return hrs < 48 ? `${hrs}h` : `${Math.round(hrs / 24)} dias`
    }
    const melhor = [...r.porVariante].filter((v) => v.enviados >= 5)
      .sort((a, b) => (b.taxaResposta || 0) - (a.taxaResposta || 0))[0]
    const data = new Date(r.geradoEm).toLocaleDateString('pt-BR')
    return [
      `*${(config && config.feiraoNome) || 'Campanha'} — resumo de ${data}*`,
      '',
      `Contatados: ${r.contatados} de ${r.total}`,
      `Responderam: ${r.responderam} (${p(r.taxaResposta)})`,
      `Agendaram: ${r.agendaram} (${p(r.taxaAgenda)} de quem respondeu)`,
      `Compareceram: ${r.compareceram} (${p(r.taxaComparecimento)} dos agendados)`,
      '',
      `Tempo mediano até a resposta: ${h(r.medianaRespostaMs)}`,
      `Pediram para não receber: ${r.optout} (${p(r.taxaOptout)})`,
      r.naFila ? `Ainda na fila: ${r.naFila}` : null,
      melhor ? `\nAbertura que mais puxa resposta: "${melhor.nome}" (${p(melhor.taxaResposta)})` : null,
      // '' são quebras de linha propositais; só o que é null sai fora.
    ].filter((l) => l !== null).join('\n')
  }

  /** Rotaciona variantes para que dois contatos seguidos nunca usem o mesmo texto. */
  function escolherVariante(q, config, contato) {
    const total = familiaDe(config, contato).templates.length
    const enviados = q.filter((c) => typeof c.varianteUsada === 'number')
    const ultima = enviados.length ? enviados[enviados.length - 1].varianteUsada : -1
    let v = Math.floor(Math.random() * total)
    if (v === ultima) v = (v + 1) % total
    return v
  }

  // ---------------------------------------------------------------------------
  // Link click-to-chat (recurso oficial do WhatsApp — não é gambiarra)
  // ---------------------------------------------------------------------------
  function linkConversa(e164, texto) {
    return `https://web.whatsapp.com/send?phone=${encodeURIComponent(e164)}&text=${encodeURIComponent(texto)}&type=phone_number&app_absent=0`
  }

  return {
    K, DEFAULT_CONFIG, TEMPLATES_PRIMEIRO, TEMPLATE_FOLLOWUP, RESPOSTAS_PRONTAS,
    get, set, getConfig, saveConfig, getQueue, saveQueue, getBlocklist, addToBlocklist,
    getLog, appendLog, getState, saveState,
    normalizarTelefone, formatarTelefoneBR,
    spin, primeiroNome, modeloCurto, saudacao, tempoDePosse, mesAno, parseData,
    LIMITES, sanitizarConfig,
    montarMensagem, montarResposta, auditarMensagem, carregarCustom, PLAYBOOK,
    recomecarDoZero, nomeLimpoContato, higienizarNomes,
    BLOCOS, BLOCOS_FOLLOWUP, BLOCOS_PROSPECCAO, TEMPLATES_PROSPECCAO, BLOCOS_FOLLOWUP_PROSPECCAO,
    comporMensagem, comporFollowup, combinacoesPossiveis,
    familiaDe, templatesDe: (config, contato) => familiaDe(config, contato).templates,
    agendaDe, modeloBuscadoDe,
    hashSemente, rngDe, veiculoTitulo,
    repararTexto, scoreNomePessoa, pareceTrocado, POLITICA, validarPolitica,
    limparNomeBruto, nomeSuspeito,
    tituloNome, nomeCurto, nomeContato, vcardDe, montarVcf, nomeArquivoVcf, marcarContatosSalvos,
    vcardPendentes, pendentesGoogle, deveGravarAgenda, registrarGravacaoAgenda, situacaoAgenda,
    casarConversa, conciliarRespostas, tarefasDeHoje, marcarLembreteEnviado, relatorio, resumoTexto,
    auditoria, grupoDe, GRUPOS, STATUS_MANUAIS, definirStatusManual, removeFromBlocklist,
    statusInfo, rotuloStatus, EM_CONVERSA, RESPONDEU_ALGUM, reverterRespostasAutomaticas,
    ecoDaNossaMensagem,
    migrarConfig, MIGRACAO_ATUAL,
    dentroDaJanela, intervaloAleatorio, podeChamarAgora, registrarEnvio, reservarEnvio,
    marcarContato, avaliarFreio, liberarFreio, proximoContato, escolherVariante,
    linkConversa, hojeStr,
  }
})()

// Content scripts compartilham o mesmo mundo isolado; expor no global evita
// depender da ordem de avaliação entre os arquivos.
if (typeof window !== 'undefined') window.FEIRAO = FEIRAO
// No service worker não existe `window`; o binding léxico já é global, mas
// expor em `self` deixa explícito para quem lê o background.js.
if (typeof self !== 'undefined' && typeof window === 'undefined') self.FEIRAO = FEIRAO
if (typeof module !== 'undefined' && module.exports) module.exports = FEIRAO
