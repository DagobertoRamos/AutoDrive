/**
 * fotos-core.js — tratamento das fotos dos veículos, de ponta a ponta.
 *
 * O que acontece em uma rodada, sem intervenção:
 *
 *   1. lê a fila no AutoDrive (/api/integrations/photos/queue, token da loja)
 *   2. abre o grupo de abas "AutoDrive — Tratamento de fotos"
 *   3. baixa as fotos da origem em
 *        <raiz>/<parceiro ou particular>/<PLACA - carro>/nao tratadas/01.jpg…
 *   4. anexa até 10 fotos numa mensagem (o máximo que o chat gera por vez),
 *      pede continuação só com texto até voltarem todas, responde perguntas
 *      e espera o limite de uso passar; acima de 10, nova mensagem
 *   5. baixa o que voltou em
 *        <raiz>/<parceiro ou particular>/<PLACA - carro>/tratadas/01.png…
 *   6. só com TODAS prontas, publica a galeria no AutoDrive e TRAVA o veículo
 *
 * A trava do passo 6 é o que impede o ciclo infinito: sem ela a sincronização
 * devolveria as fotos do parceiro por cima das tratadas a cada 15 minutos.
 *
 * CAPA DA LOJA: a fila já vem sem o logotipo do parceiro e sem a composição de
 * marketing com o nome da revenda — quem separa é src/lib/vehicle-photos.ts, no
 * site. Aqui nada é filtrado de novo, justamente para as duas pontas não
 * divergirem. O que a fila chama de `artesDaLoja` é só informativo.
 *
 * SOBRE AUTOMATIZAR O CHAT: a extensão opera a sessão que já está aberta no
 * navegador, fazendo os mesmos cliques que a pessoa faria. Não contorna login,
 * captcha nem proteção, e trata poucas dezenas de fotos por rodada. Ainda
 * assim é interface de terceiro, que muda sem aviso: por isso existe o modo
 * manual (automatico = false), que para no passo 4 e deixa o comando pronto
 * para colar. Quando houver chave de API de imagens, só o passo 4 muda.
 */

const FOTOS = (() => {
  const CFG_KEY = 'fotosConfig'
  const ESTADO_KEY = 'fotosEstado'
  const GRUPO_KEY = 'fotosGrupoAbas'

  const CFG_PADRAO = {
    // As fotos tratadas vão para o AutoDrive (SaaS), não mais para o painel do
    // site antigo. Autenticação pelo "Token do AutoDrive" (o mesmo das
    // negociações), então não há login nem cookie envolvido.
    siteUrl: 'https://www.appautodrive.online',
    // Token da LOJA DO SITE (a dona do estoque e das fotos). O token das
    // negociações é de outra loja (EasyCar); vazio = usa aquele mesmo.
    token: '',
    chatUrl: '',
    abrirChat: true,
    automatico: true,
    pastaRaiz: 'AutoDrive/estoque',
    limitePorRodada: 5,
    // Espera POR FOTO do lote: 10 fotos × 5 min dão até 50 min para a
    // mensagem inteira. O chat gera uma imagem de cada vez, então o tempo
    // total cresce com a quantidade.
    esperaMinutos: 5,
    comando:
      'A PRIMEIRA imagem desta mensagem é o EXEMPLO do estúdio oficial. As ' +
      'demais são fotos de um veículo. Trate cada foto do veículo aplicando ' +
      'FIELMENTE o estúdio do exemplo: mesmo fundo, mesma parede com o ' +
      'logotipo AUTODRIVE VEÍCULOS, mesma iluminação, mesmo piso e mesma ' +
      'plataforma. Não invente cenário nem mude o enquadramento do exemplo. ' +
      'Mantenha o veículo exatamente como está — mesma cor, mesmo ângulo, ' +
      'mesmas proporções, sem alterar a lataria nem a placa. ' +
      'Devolva UMA imagem para CADA foto de veículo enviada, na mesma ordem, ' +
      'sem tratar o exemplo.',
  }

  /** Imagem de referência do estúdio, anexada junto de todo lote. */
  const EXEMPLO_KEY = 'fotosExemplo'

  /**
   * Anexos que o chat aceita numa mensagem. O exemplo do estúdio ocupa um,
   * então com exemplo cabem 19 fotos do veículo por rodada.
   */
  const ANEXOS_POR_MENSAGEM = 20

  /**
   * Imagens que o chat gera numa leva. Ele mesmo avisa "posso gerar no máximo
   * 10 imagens por vez" e para para perguntar; mandar mais do que isso só
   * gera pergunta e espera à toa.
   */
  const FOTOS_POR_MENSAGEM = 10

  /** Tamanho máximo que o AutoDrive aceita por foto (/api/integrations/photos/…/upload). */
  const LIMITE_UPLOAD = 4 * 1024 * 1024 - 64 * 1024

  // ─── Configuração ────────────────────────────────────────────────────
  async function lerCfg() {
    const r = await chrome.storage.local.get(CFG_KEY)
    const guardado = { ...(r[CFG_KEY] || {}) }
    // `chatgptUrl` era o nome antigo do campo; quem já configurou não perde.
    if (!guardado.chatUrl && guardado.chatgptUrl) guardado.chatUrl = guardado.chatgptUrl
    if (guardado.abrirChat == null && guardado.abrirChatGpt != null) guardado.abrirChat = guardado.abrirChatGpt
    // Quem tinha o painel do site antigo salvo passa para o AutoDrive: as rotas
    // de lá (/api/admin/photo-queue…) não existem no SaaS.
    if (/dagobertoeasycar|appautodrive\.com\.br/i.test(guardado.siteUrl || '')) guardado.siteUrl = CFG_PADRAO.siteUrl
    return { ...CFG_PADRAO, ...guardado }
  }

  function limitar(valor, minimo, maximo, padrao) {
    const n = parseInt(valor, 10)
    if (!Number.isFinite(n)) return padrao
    return Math.min(Math.max(n, minimo), maximo)
  }

  async function salvarCfg(patch) {
    const atual = await lerCfg()
    const novo = { ...atual, ...patch }
    // Nunca fixar URL de chat no código: é sempre o que o usuário configurou.
    novo.siteUrl = String(novo.siteUrl || CFG_PADRAO.siteUrl).replace(/\/+$/, '')
    novo.chatUrl = String(novo.chatUrl || '').trim()
    novo.token = String(novo.token || '').trim()
    novo.pastaRaiz = String(novo.pastaRaiz || CFG_PADRAO.pastaRaiz).replace(/^\/+|\/+$/g, '')
    novo.limitePorRodada = limitar(novo.limitePorRodada, 1, 50, 5)
    novo.esperaMinutos = limitar(novo.esperaMinutos, 2, 30, 5)
    delete novo.fotosPorEnvio
    novo.automatico = novo.automatico !== false
    novo.abrirChat = novo.abrirChat !== false
    delete novo.chatgptUrl
    delete novo.abrirChatGpt
    await chrome.storage.local.set({ [CFG_KEY]: novo })
    return novo
  }

  async function lerEstado() {
    const r = await chrome.storage.local.get(ESTADO_KEY)
    return r[ESTADO_KEY] || { rodando: false, log: [], fila: [], atual: null, parar: false }
  }

  async function gravarEstado(patch) {
    const atual = await lerEstado()
    const novo = { ...atual, ...patch }
    if (novo.log && novo.log.length > 300) novo.log = novo.log.slice(-300)
    // Batida de vida. Sem ela, o MV3 derrubar o service worker no meio da
    // rodada deixava `rodando: true` gravado para sempre, e toda tentativa
    // seguinte morria em "já existe uma rodada em andamento" — a extensão
    // ficava travada sem nada rodando de verdade.
    novo.batidaEm = Date.now()
    await chrome.storage.local.set({ [ESTADO_KEY]: novo })
    return novo
  }

  /** Rodada sem batida há mais de 4 minutos está morta, não em andamento. */
  const SILENCIO_MAXIMO = 4 * 60 * 1000

  function rodadaMorta(estado) {
    if (!estado.rodando) return false
    // Parar pedido e 1 minuto sem sinal: a rodada não vai mais sair do lugar.
    if (estado.parar && Date.now() - (estado.batidaEm || 0) > 60 * 1000) return true
    return Date.now() - (estado.batidaEm || 0) > SILENCIO_MAXIMO
  }

  /**
   * Zera o estado da rodada, mas PRESERVA o progresso por veículo.
   *
   * É o botão "Reiniciar" do painel. A fila recomeça do zero; o que já foi
   * tratado e hospedado de cada carro continua guardado, então o carro que
   * parou na foto 18 retoma na 18.
   */
  async function zerar(apagarProgresso) {
    await chrome.storage.local.set({
      [ESTADO_KEY]: { rodando: false, parar: false, log: [], fila: [], atual: null, resultados: [] },
    })
    if (apagarProgresso) {
      const tudo = await chrome.storage.local.get(null)
      const chaves = Object.keys(tudo).filter((k) => k.startsWith('fotosProgresso:'))
      if (chaves.length) await chrome.storage.local.remove(chaves)
      return { zerado: true, progressoApagado: chaves.length }
    }
    return { zerado: true, progressoApagado: 0 }
  }

  async function registrar(texto) {
    const e = await lerEstado()
    const linha = `${new Date().toLocaleTimeString('pt-BR')} ${texto}`
    await gravarEstado({ log: [...(e.log || []), linha] })
    console.log('[fotos]', texto)
  }

  /** Botão "Parar" do painel: a rodada confere entre um lote e outro. */
  async function pedirParada() {
    await gravarEstado({ parar: true })
    return true
  }

  async function mandaramParar() {
    return !!(await lerEstado()).parar
  }

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

  /**
   * Mantém o service worker vivo durante a rodada.
   *
   * O MV3 derruba o worker depois de ~30 s parado, e uma rodada passa muito
   * tempo só esperando o chat responder. Cada chamada de API da extensão
   * zera esse relógio, então um ping a cada 20 s resolve. Sem isso a rodada
   * morre no meio e ninguém entende por quê.
   */
  let batida = null
  function manterVivo(ligar) {
    if (ligar) {
      if (batida) return
      let voltas = 0
      batida = setInterval(() => {
        chrome.runtime.getPlatformInfo().catch(() => {})
        // A espera de um lote de 19 fotos passa de uma hora sem nenhum
        // registrar(); sem renovar a batida, rodadaMorta() daria a rodada
        // viva como morta e um novo "Tratar agora" rodaria por cima dela.
        // Com Parar pedido a batida para: uma rodada presa não pode segurar
        // a próxima para sempre.
        if (++voltas % 3 === 0) {
          lerEstado().then((e) => (e.rodando && !e.parar ? gravarEstado({}) : null)).catch(() => {})
        }
      }, 20000)
    } else if (batida) {
      clearInterval(batida)
      batida = null
    }
  }

  // ─── Grupo de abas ───────────────────────────────────────────────────
  /**
   * Mantém UM grupo chamado "AutoDrive — Tratamento de fotos" e reaproveita
   * as abas dele. Evita o cenário de dezenas de abas soltas.
   */
  async function garantirAba(url, grupoId) {
    const abas = await chrome.tabs.query({})
    const alvo = new URL(url)
    const existente = abas.find((t) => {
      try {
        const u = new URL(t.url || '')
        return u.origin === alvo.origin && u.pathname === alvo.pathname
      } catch { return false }
    })
    if (existente) {
      if (grupoId != null && existente.groupId !== grupoId) {
        await chrome.tabs.group({ groupId: grupoId, tabIds: [existente.id] }).catch(() => {})
      }
      return existente
    }
    const nova = await chrome.tabs.create({ url, active: false })
    if (grupoId != null) await chrome.tabs.group({ groupId: grupoId, tabIds: [nova.id] }).catch(() => {})
    return nova
  }

  async function abrirGrupo() {
    const cfg = await lerCfg()
    const guardado = await chrome.storage.local.get(GRUPO_KEY)
    let grupoId = guardado[GRUPO_KEY] ?? null

    // O grupo pode ter sido fechado pelo usuário desde a última rodada.
    if (grupoId != null) {
      const ok = await chrome.tabGroups.get(grupoId).then(() => true).catch(() => false)
      if (!ok) grupoId = null
    }

    const primeira = await garantirAba(`${cfg.siteUrl}/estoque`, grupoId)
    if (grupoId == null) {
      grupoId = await chrome.tabs.group({ tabIds: [primeira.id] })
      await chrome.tabGroups.update(grupoId, {
        title: 'AutoDrive — Tratamento de fotos',
        color: 'cyan',
      }).catch(() => {})
      await chrome.storage.local.set({ [GRUPO_KEY]: grupoId })
    } else {
      await chrome.tabs.group({ groupId: grupoId, tabIds: [primeira.id] }).catch(() => {})
    }

    if (cfg.abrirChat && cfg.chatUrl) {
      await garantirAba(cfg.chatUrl, grupoId)
      await registrar('Aba do chat aberta no grupo.')
    } else if (cfg.abrirChat) {
      await registrar('Endereço do chat não configurado; aba não foi aberta.')
    }

    return grupoId
  }

  // ─── AutoDrive (SaaS) ────────────────────────────────────────────────
  /**
   * Chamada às rotas /api/integrations/photos/* do AutoDrive, autenticada pelo
   * token de integração da loja (header x-autoconf-token). Erro vira mensagem
   * legível no registro, nunca "Failed to fetch" solto.
   */
  async function api(caminho, init = {}) {
    const cfg = await lerCfg()
    const { autoconfToken } = await chrome.storage.local.get('autoconfToken')
    const token = cfg.token || autoconfToken
    if (!token) throw new Error('Falta o token da loja do site no painel de fotos ("Token da loja do site"). Cole e salve.')
    const headers = { 'x-autoconf-token': String(token).trim(), ...(init.headers || {}) }
    let res
    try {
      res = await fetch(`${cfg.siteUrl}/api/integrations/photos${caminho}`, { ...init, headers, credentials: 'omit', cache: 'no-store' })
    } catch (e) {
      throw new Error(`O AutoDrive (${cfg.siteUrl}) não respondeu: ${e.message}. Confira a internet e o endereço.`)
    }
    const corpo = await res.json().catch(() => ({}))
    if (res.status === 401) throw new Error(corpo.error || 'Token recusado pelo AutoDrive. Confira o "Token da loja do site" no painel de fotos.')
    if (!res.ok || corpo.success === false) throw new Error(corpo.error || `O AutoDrive respondeu HTTP ${res.status}.`)
    return corpo
  }

  // ─── Fila ────────────────────────────────────────────────────────────
  /** Veículos do AutoDrive com fotos da origem (ou EM_TRATAMENTO, para retomar). */
  async function lerFila(limite, situacao) {
    const cfg = await lerCfg()
    const q = new URLSearchParams({ limite: String(limite || cfg.limitePorRodada) })
    if (situacao) q.set('situacao', situacao)
    return api(`/queue?${q}`)
  }

  // ─── Pastas e download ───────────────────────────────────────────────
  function extensaoDe(url, padrao) {
    const bruta = (String(url).split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1] || ''
    const ext = bruta.toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext)) return padrao
    return ext === 'jpeg' ? 'jpg' : ext
  }

  function nomeArquivo(indice, url, padrao) {
    return `${String(indice + 1).padStart(2, '0')}.${extensaoDe(url, padrao || 'jpg')}`
  }

  /** Mesma limpeza de src/lib/vehicle-photos.ts, para as pastas baterem. */
  function limparNome(texto) {
    return String(texto || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/["*?<>|]/g, '')
      .replace(/[\\/:]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
  }

  /**
   * <raiz>/<parceiro ou particular>/<PLACA - carro>/<tratadas|nao tratadas>
   *
   * Os nomes vêm prontos da fila (pastaParceiro e pastaVeiculo), das mesmas
   * funções que o painel usa para nomear o ZIP. Assim a pasta baixada pelo
   * site e a pasta criada aqui são a mesma coisa.
   */
  function pastaDe(cfg, veiculo, subpasta) {
    const parceiro = limparNome(veiculo.pastaParceiro || veiculo.parceiro || 'particular')
    const carro = limparNome(veiculo.pastaVeiculo || veiculo.titulo || veiculo.id)
    return [cfg.pastaRaiz, parceiro, carro, subpasta].filter(Boolean).join('/')
  }

  /** Baixa uma lista de endereços para uma pasta, sem sobrescrever nada. */
  async function baixarPara(urls, pasta, padraoExtensao) {
    const cfg = await lerCfg()
    const baixados = []
    for (let i = 0; i < urls.length; i++) {
      const filename = `${pasta}/${nomeArquivo(i, urls[i], padraoExtensao)}`
      const urlAbsoluta = urls[i].startsWith('/') ? `${cfg.siteUrl}${urls[i]}` : urls[i]
      try {
        const id = await chrome.downloads.download({
          url: urlAbsoluta,
          filename,
          saveAs: false,
          conflictAction: 'uniquify',
        })
        baixados.push({ id, filename, url: urlAbsoluta })
      } catch (e) {
        await registrar(`falha ao baixar ${filename}: ${e.message}`)
      }
    }
    return baixados
  }

  /**
   * Baixa as originais a partir de `desde`.
   *
   * Ao retomar um carro, as fotos anteriores já estão no disco. Rebaixar todas
   * enchia a pasta de 01(1).jpg, 01(2).jpg e dava a impressão de que a rodada
   * só ficava baixando sem andar — era exatamente o que parecia travado.
   */
  async function baixarOriginais(veiculo, desde) {
    const cfg = await lerCfg()
    const pasta = pastaDe(cfg, veiculo, 'nao tratadas')
    const inicio = Math.max(0, desde || 0)
    const faltam = veiculo.fotos.slice(inicio)
    const saida = { pasta, pastaTratadas: pastaDe(cfg, veiculo, 'tratadas'), baixados: [] }

    if (!faltam.length) {
      await registrar(`originais já estão em "${pasta}".`)
      return saida
    }

    // Os nomes seguem o índice real, senão a foto 19 viraria 01.jpg.
    for (let i = 0; i < faltam.length; i++) {
      const indice = inicio + i
      const nome = `${pasta}/${nomeArquivo(indice, faltam[i])}`
      const urlAbsoluta = faltam[i].startsWith('/') ? `${cfg.siteUrl}${faltam[i]}` : faltam[i]
      try {
        const id = await chrome.downloads.download({
          url: urlAbsoluta,
          filename: nome,
          saveAs: false,
          conflictAction: 'overwrite',
        })
        saida.baixados.push({ id, filename: nome, url: urlAbsoluta })
      } catch (e) {
        await registrar(`falha ao baixar ${nome}: ${e.message}`)
      }
    }
    await registrar(`${saida.baixados.length}/${faltam.length} foto(s) em "${pasta}".`)
    return saida
  }

  // ─── Rede: buscar imagem e subir para o site ─────────────────────────
  function paraBase64(bytes) {
    // btoa não aceita Uint8Array, e String.fromCharCode estoura a pilha com
    // array grande; por isso o laço em pedaços de 32 KB.
    let texto = ''
    const pedaco = 0x8000
    for (let i = 0; i < bytes.length; i += pedaco) {
      texto += String.fromCharCode.apply(null, bytes.subarray(i, i + pedaco))
    }
    return btoa(texto)
  }

  /** Busca a imagem e devolve em data URL, formato que o chat aceita anexar. */
  async function buscarComoDataUrl(url, nome) {
    const cfg = await lerCfg()
    const urlAbsoluta = url.startsWith('/') ? `${cfg.siteUrl}${url}` : url
    const res = await fetch(urlAbsoluta, { credentials: 'omit' })
    if (!res.ok) throw new Error(`a foto respondeu HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const tipo = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
    return { nome, dataUrl: `data:${tipo};base64,${paraBase64(bytes)}`, bytes: bytes.length }
  }

  /** data: URL ou endereço → Blob. */
  async function paraBlob(origem) {
    if (String(origem).startsWith('data:')) {
      const [cabecalho, base64] = String(origem).split(',')
      const tipo = (cabecalho.match(/data:([^;]+)/) || [])[1] || 'image/png'
      const binario = atob(base64)
      const bytes = new Uint8Array(binario.length)
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
      return new Blob([bytes], { type: tipo })
    }
    const res = await fetch(origem, { credentials: 'omit' })
    if (!res.ok) throw new Error(`a imagem tratada respondeu HTTP ${res.status}`)
    return res.blob()
  }

  /**
   * PNG do chat (~2 MB) → WebP (~250 KB), mesma aparência.
   *
   * O AutoDrive guarda as fotos dentro do banco e aceita até 4 MB por foto:
   * 50 carros × 15 fotos em PNG passariam de 1,5 GB. Se ainda passar do
   * limite, baixa a qualidade e depois o tamanho até caber.
   */
  async function comprimir(blob) {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return blob
    const imagem = await createImageBitmap(blob)
    try {
      let escala = Math.min(1, 2400 / Math.max(imagem.width, imagem.height))
      for (const qualidade of [0.9, 0.82, 0.72, 0.72, 0.72]) {
        const w = Math.round(imagem.width * escala)
        const h = Math.round(imagem.height * escala)
        const tela = new OffscreenCanvas(w, h)
        tela.getContext('2d').drawImage(imagem, 0, 0, w, h)
        const saida = await tela.convertToBlob({ type: 'image/webp', quality: qualidade })
        if (saida.size <= LIMITE_UPLOAD) return saida
        escala *= 0.8
      }
      throw new Error('a foto tratada não coube em 4 MB nem reduzida')
    } finally {
      imagem.close()
    }
  }

  /**
   * Guarda UMA tratada no AutoDrive (ainda fora da galeria) e devolve a URL.
   * A galeria só troca no fim, com todas prontas — ver enviarTratadas().
   */
  async function hospedarNoSite(origem, nome, veiculoId) {
    if (!veiculoId) throw new Error('veículo não informado para guardar a foto tratada')
    const leve = await comprimir(await paraBlob(origem))
    const form = new FormData()
    form.append('file', new File([leve], String(nome).replace(/\.[a-z0-9]+$/i, '.webp'), { type: leve.type || 'image/webp' }))
    const r = await api(`/${encodeURIComponent(veiculoId)}/upload`, { method: 'POST', body: form })

    // Confere que o endereço ABRE antes de contar a foto como pronta: já
    // aconteceu de o armazenamento aceitar e não servir, e o carro ficou
    // "tratado" com fotos que davam 404.
    const teste = await fetch(r.absoluta, { credentials: 'omit', cache: 'no-store' }).catch(() => null)
    if (!teste || !teste.ok) {
      throw new Error(`a foto subiu mas o endereço não abre (${teste ? `HTTP ${teste.status}` : 'sem resposta'}): ${r.absoluta}`)
    }
    return r.absoluta
  }

  // ─── Envio das tratadas ──────────────────────────────────────────────
  /**
   * Publica no AutoDrive: troca a galeria inteira pelas tratadas, na ordem
   * (1ª = capa), marca TRATADA e trava — numa transação só, lá no servidor.
   * A trava impede a importação de hora em hora de trazer as fotos do
   * parceiro de volta.
   */
  async function enviarTratadas(veiculoId, urls) {
    const lista = (urls || []).map((u) => String(u).trim()).filter(Boolean)
    if (!lista.length) throw new Error('Nenhuma foto tratada informada.')
    const corpo = await api(`/${encodeURIComponent(veiculoId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fotos: lista }),
    })
    await registrar(`${lista.length} foto(s) tratadas publicadas no AutoDrive; veículo travado.`)
    return corpo
  }

  async function acaoNoVeiculo(veiculoId, acao) {
    return api(`/${encodeURIComponent(veiculoId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao }),
    })
  }

  /** Travar = começar o tratamento (EM_TRATAMENTO); destravar = restaurar. */
  const travar = (veiculoId, ligar) => acaoNoVeiculo(veiculoId, ligar === false ? 'restaurar' : 'iniciar')
  const restaurar = (veiculoId) => acaoNoVeiculo(veiculoId, 'restaurar')

  // ─── Aba do chat ─────────────────────────────────────────────────────
  function perguntar(tabId, mensagem) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, mensagem, (r) => {
        // Sem o motivo do Chrome, toda queda virava "o chat não aceitou o
        // envio" e não dava para saber se a aba recarregou, fechou ou navegou.
        if (chrome.runtime.lastError) resolve({ ok: false, erro: `a aba do chat não respondeu (${chrome.runtime.lastError.message})` })
        else resolve(r)
      })
    })
  }

  /**
   * Roda uma tarefa longa na aba do chat sem prender o service worker: manda
   * começar e depois só consulta a cada 4 s, com chamadas curtas. O Chrome
   * derruba o service worker quando UMA chamada passa de 5 minutos — e a
   * espera por um lote de fotos passa disso com folga.
   */
  async function tarefaNoChat(tabId, dados, limiteMs) {
    const inicio = await perguntar(tabId, { type: 'fotosChatIniciar', ...dados })
    if (!inicio?.ok) return inicio || { ok: false, erro: 'a aba do chat não respondeu' }
    const ate = Date.now() + (Number(limiteMs) || 15 * 60 * 1000) + 5 * 60 * 1000
    for (;;) {
      await dormir(4000)
      const r = await perguntar(tabId, { type: 'fotosChatConsultar', id: inicio.id })
      if (!r?.ok) return r || { ok: false, erro: 'a aba do chat não respondeu' }
      if (r.pronto) return r.resultado
      if (Date.now() > ate) return { ok: false, erro: 'a aba do chat não terminou a tarefa no tempo combinado' }
    }
  }

  async function esperarCarregar(tabId) {
    for (let i = 0; i < 80; i++) {
      const aba = await chrome.tabs.get(tabId).catch(() => null)
      if (!aba) throw new Error('a aba do chat foi fechada')
      if (aba.status === 'complete') return
      await dormir(500)
    }
  }

  /**
   * Garante a aba do chat pronta para receber mensagem.
   *
   * O content script entra sozinho nos endereços declarados no manifest. Para
   * qualquer outro endereço, injetamos na hora — e se o navegador recusar, o
   * erro diz que falta liberar aquele site, em vez de "não respondeu".
   */
  async function abaDoChat(grupoId, recarregar = false, tabIdAtual = null) {
    const cfg = await lerCfg()
    if (!cfg.chatUrl) throw new Error('Configure o endereço do chat antes de tratar.')

    // No meio de um veículo, a aba certa é a MESMA da conversa: depois do
    // primeiro envio o chat troca o endereço para /c/…, e procurar pelo
    // endereço configurado abriria uma conversa nova, sem as fotos.
    const mesma = tabIdAtual != null ? await chrome.tabs.get(tabIdAtual).catch(() => null) : null
    const aba = mesma || (await garantirAba(cfg.chatUrl, grupoId))
    if (recarregar) {
      await chrome.tabs.reload(aba.id)
      await dormir(2000)
    }
    await esperarCarregar(aba.id)

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const pronto = await perguntar(aba.id, { type: 'fotosChatPronto' })
      if (pronto?.ok) return aba.id

      try {
        await chrome.scripting.executeScript({ target: { tabId: aba.id }, files: ['fotos-chat.js'] })
      } catch (e) {
        if (recarregar) {
          throw new Error(
            `Não foi possível entrar na página do chat (${e.message}). ` +
              'Confira o campo "Endereço do chat" e libere esse site para a extensão.',
          )
        }
      }
      await dormir(800)
    }
    
    if (!recarregar) {
      await registrar('A página do chat parou de responder. Forçando recarregamento da aba...')
      return abaDoChat(grupoId, true, tabIdAtual ?? aba.id)
    }
    
    throw new Error('A página do chat não respondeu nem após recarregar a aba.')
  }

  /**
   * O que o chat devolveu vira lista de imagens. Um .zip (Modo Turbo) é
   * aberto aqui; imagem solta passa direto — o chat nem sempre obedece ao
   * pedido de zip, e tratar isso como falha jogava o carro inteiro fora.
   */
  async function expandirRetorno(retorno) {
    const saida = []
    for (const item of retorno || []) {
      const [cabecalho, b64] = String(item).split(',')
      const ehZip = /zip|octet-stream/i.test(cabecalho) || (b64 || '').startsWith('UEsDB')
      if (!ehZip) { saida.push(item); continue }
      if (typeof fflate === 'undefined') throw new Error('biblioteca fflate ausente no background')
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let b = 0; b < bin.length; b++) bytes[b] = bin.charCodeAt(b)
      const arquivos = fflate.unzipSync(bytes)
      let extraidas = 0
      for (const nome of Object.keys(arquivos).sort()) {
        if (nome.endsWith('/') || nome.includes('__MACOSX') || nome.includes('.DS_Store')) continue
        if (!/\.(png|jpe?g|webp)$/i.test(nome)) continue
        const mime = /\.png$/i.test(nome) ? 'image/png' : /\.webp$/i.test(nome) ? 'image/webp' : 'image/jpeg'
        saida.push(`data:${mime};base64,${paraBase64(arquivos[nome])}`)
        extraidas++
      }
      await registrar(`  ${extraidas} foto(s) extraída(s) do .zip.`)
    }
    return saida
  }

  /** Pede a próxima tratada na mesma conversa, sem anexar nada de novo. */
  function comandoContinuar(prontas, total) {
    const ate = Math.min(total, prontas + FOTOS_POR_MENSAGEM)
    return (
      `Continue sem perguntar. Você já devolveu ${prontas} de ${total} fotos do veículo que anexei acima. ` +
      `Trate agora as fotos ${prontas + 1} a ${ate} (sem contar o exemplo), com o mesmo estúdio do exemplo, ` +
      'na ordem, uma imagem por foto. Não repita as que já foram tratadas e não peça confirmação.'
    )
  }

  /** Um envio: anexa o lote, manda o comando e devolve o que voltou. */
  async function rodadaNoChat(tabId, cfg, comando, imagens, esperadas) {
    // A espera cresce com o lote: o chat gera uma imagem de cada vez.
    // Teto de 10 fotos: resposta em texto (pergunta, limite) é detectada na
    // hora, então este tempo só vale para o chat mudo de verdade.
    const limiteMs = cfg.esperaMinutos * 60 * 1000 * Math.min(10, Math.max(1, Number(esperadas) || imagens.length))
    const enviado = await tarefaNoChat(tabId, { tarefa: 'enviar', comando, imagens, limiteMs }, limiteMs)
    if (!enviado?.ok) {
      // Falhou ANTES de sair: reenviar não duplica nada na conversa.
      const erro = new Error(enviado?.erro || 'o chat não aceitou o envio')
      erro.antesDeEnviar = true
      throw erro
    }

    // `antes` é a lista de imagens que JÁ existiam na tela quando mandamos.
    // A colheita só aceita o que não estava lá, senão devolveria a foto do
    // carro anterior como se fosse a desta rodada.
    const colhido = await tarefaNoChat(tabId, {
      tarefa: 'colher',
      antes: enviado.antes,
      textoAntes: enviado.textoAntes,
      esperadas: Number(esperadas) || imagens.length,
      limiteMs,
      loteZip: cfg.loteZip,
    }, limiteMs)
    if (!colhido?.ok) throw new Error(colhido?.erro || 'o chat não devolveu as fotos')
    return { imagens: colhido.imagens || [], texto: colhido.texto || '' }
  }

  /**
   * O chat respondeu com texto em vez de imagem. Decide o que fazer:
   *   limite  → esperar o tempo que ele pediu (ou 30 min) e seguir
   *   pergunta → responder "sim, siga" sem perguntar de novo
   */
  function lerRespostaEmTexto(texto) {
    const t = String(texto || '')
    const limite =
      /(atingiu|chegou ao|alcançou|excedeu).{0,40}limite|limite (diário|de uso|de imagens|de geração)|hit (the|your) .{0,20}limit|rate limit|usage cap|try again (later|in|after)|tente novamente (mais tarde|em|às|após)|aguarde .{0,30}(minuto|hora)/i.test(t) &&
      !/no máximo \d+ imagens por vez/i.test(t)
    if (!limite) return { tipo: 'pergunta' }

    let esperaMs = 30 * 60 * 1000
    const hora = t.match(/(?:às|as|at|until)\s*(\d{1,2})[:h](\d{2})/i)
    const minutos = t.match(/(\d+)\s*(?:min|minuto)/i)
    const horas = t.match(/(\d+)\s*(?:h\b|hora|hour)/i)
    if (hora) {
      const alvo = new Date()
      alvo.setHours(Number(hora[1]), Number(hora[2]), 0, 0)
      if (alvo.getTime() < Date.now()) alvo.setDate(alvo.getDate() + 1)
      esperaMs = alvo.getTime() - Date.now() + 2 * 60 * 1000
    } else if (horas || minutos) {
      esperaMs = ((Number(horas?.[1]) || 0) * 60 + (Number(minutos?.[1]) || 0)) * 60 * 1000 + 2 * 60 * 1000
    }
    return { tipo: 'limite', esperaMs: Math.min(Math.max(esperaMs, 5 * 60 * 1000), 6 * 60 * 60 * 1000) }
  }

  /** Espera o limite do chat passar, sem parecer travada e ouvindo o Parar. */
  async function esperarLimite(esperaMs) {
    const ate = Date.now() + esperaMs
    const quando = new Date(ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    await registrar(`  Limite do chat atingido. Esperando até ${quando} para continuar…`)
    while (Date.now() < ate) {
      if (await mandaramParar()) return false
      await gravarEstado({})
      await dormir(30000)
    }
    return true
  }

  // ─── Imagem de exemplo do estúdio ────────────────────────────────────
  /**
   * A referência vai anexada em TODO lote, sempre como primeira imagem.
   *
   * Sem ela, o chat se apoia no que lembra da conversa e o estúdio vai
   * mudando de uma mensagem para outra — carros do mesmo estoque saíam com
   * fundos diferentes. Mandar o exemplo junto toda vez é o que mantém o
   * padrão, e o comando diz explicitamente que a primeira imagem é modelo e
   * não deve ser tratada.
   */
  const LIMITE_EXEMPLO = 6 * 1024 * 1024

  async function lerExemplo() {
    const r = await chrome.storage.local.get(EXEMPLO_KEY)
    return r[EXEMPLO_KEY] || null
  }

  async function salvarExemplo(dataUrl, nome) {
    if (!dataUrl) {
      await chrome.storage.local.remove(EXEMPLO_KEY)
      return { removido: true }
    }
    // base64 cresce ~33%; o storage.local tem cota e estourar apaga em silêncio.
    const bytes = Math.ceil((String(dataUrl).length - String(dataUrl).indexOf(',') - 1) * 0.75)
    if (bytes > LIMITE_EXEMPLO) {
      throw new Error(`o exemplo tem ${(bytes / 1024 / 1024).toFixed(1)} MB; use uma imagem de até 6 MB`)
    }
    const exemplo = { nome: nome || 'estudio-exemplo.png', dataUrl, bytes, em: Date.now() }
    await chrome.storage.local.set({ [EXEMPLO_KEY]: exemplo })
    return { nome: exemplo.nome, bytes }
  }

  // ─── Progresso por veículo (para retomar) ────────────────────────────
  /**
   * Guarda o que já subiu de cada veículo.
   *
   * Um carro de 25 fotos leva mais de uma hora. Se a rodada morrer na foto 18
   * — aba fechada, internet caindo, limite do chat — sem isto as 17 anteriores
   * seriam refeitas do zero. Como cada tratada já foi hospedada no site, basta
   * lembrar as URLs.
   */
  const CHAVE_PROGRESSO = (id) => `fotosProgresso:${id}`

  async function lerProgresso(veiculoId) {
    const chave = CHAVE_PROGRESSO(veiculoId)
    const r = await chrome.storage.local.get(chave)
    return r[chave] || { hospedadas: [] }
  }

  async function guardarProgresso(veiculoId, dados) {
    await chrome.storage.local.set({ [CHAVE_PROGRESSO(veiculoId)]: dados })
  }

  async function limparProgresso(veiculoId) {
    await chrome.storage.local.remove(CHAVE_PROGRESSO(veiculoId))
  }

  /**
   * Trava o veículo e marca EM_TRATAMENTO.
   *
   * O PUT da galeria exige pelo menos uma foto, então aqui reaproveitamos as
   * próprias fotos da origem: o que muda é a situação e a trava, não a
   * galeria. É isso que segura a sincronização enquanto o chat trabalha.
   */
  async function marcarEmTratamento(veiculoId) {
    await acaoNoVeiculo(veiculoId, 'iniciar')
  }

  // ─── Um veículo, do começo ao fim ────────────────────────────────────
  async function tratarVeiculo(veiculo, grupoId) {
    const cfg = await lerCfg()
    await gravarEstado({ atual: { id: veiculo.id, titulo: veiculo.titulo } })

    await registrar(`▸ ${veiculo.titulo} — ${veiculo.fotos.length} foto(s) da origem.`)
    if (veiculo.artesDaLoja?.length) {
      await registrar(`  ${veiculo.artesDaLoja.length} imagem(ns) ignoradas: arte da loja ${veiculo.parceiro || ''}.`)
    }

    // Lê o progresso ANTES de baixar: é ele que diz de onde continuar, tanto
    // no download quanto no envio ao chat.
    const feito = await lerProgresso(veiculo.id)
    if (feito.hospedadas.length) {
      await registrar(`  retomando: ${feito.hospedadas.length} de ${veiculo.fotos.length} já tratadas antes.`)
    }

    const { pasta, pastaTratadas } = await baixarOriginais(veiculo, feito.hospedadas.length)
    if (!cfg.automatico) return { id: veiculo.id, titulo: veiculo.titulo, modo: 'manual', pasta, pastaTratadas }

    // Trava ANTES de começar. Um carro de 25 fotos leva de meia hora a uma
    // hora e meia no chat, e a sincronização roda a cada 15 minutos: sem a
    // trava ela devolveria as fotos do parceiro no meio do caminho e o
    // trabalho já feito ia para o lixo. A situação vira EM_TRATAMENTO, que é
    // o que permite retomar de onde parou — ver retomarProgresso().
    await marcarEmTratamento(veiculo.id)

    let tabId = await abaDoChat(grupoId)

    const exemplo = await lerExemplo()
    if (!exemplo) {
      await registrar('  AVISO: sem imagem de exemplo do estúdio. Anexe uma no painel para o padrão não variar.')
    }

    // Em LOTE: o chat processa várias fotos numa mensagem só quando o comando
    // pede uma imagem por foto enviada. O envio ao site continua sendo um de
    // cada vez, porque mandar todas juntas estourava o limite de corpo e
    // voltava HTTP 413.
    // O laço anda pelo que REALMENTE ficou pronto, não por lote fechado: se um
    // lote de 10 volta com 7, o próximo começa na 8, não na 11.
    const total = veiculo.fotos.length
    let travas = 0
    while (feito.hospedadas.length < total) {
      const i = feito.hospedadas.length
      if (await mandaramParar()) {
        await guardarProgresso(veiculo.id, feito)
        throw new Error(`parado pelo operador em ${i}/${total}`)
      }

      const lote = veiculo.fotos.slice(i, i + Math.min(FOTOS_POR_MENSAGEM, ANEXOS_POR_MENSAGEM - (exemplo ? 1 : 0)))
      await registrar(
        `  fotos ${i + 1}–${i + lote.length} de ${total} — enviando ao chat numa mensagem só` +
          (i + lote.length < total ? ` (o resto vai na próxima rodada)…` : '…'),
      )

      const imagens = []
      if (exemplo) imagens.push({ nome: exemplo.nome, dataUrl: exemplo.dataUrl })
      
      const validasNoLote = []
      for (let k = 0; k < lote.length; k++) {
        try {
          const dados = await buscarComoDataUrl(lote[k], nomeArquivo(i + k, lote[k]))
          imagens.push(dados)
          validasNoLote.push({ indice: i + k, urlOriginal: lote[k] })
        } catch (e) {
          await registrar(`  pulando foto ${i + k + 1} (inativa/404): ${e.message}`)
        }
      }

      const qtdEnviada = imagens.length - (exemplo ? 1 : 0)
      if (qtdEnviada === 0) {
        await registrar(`  lote ${i + 1}–${i + lote.length} estava todo quebrado. Pulando.`)
        for (const url of lote) feito.hospedadas.push(url)
        await guardarProgresso(veiculo.id, feito)
        continue
      }

      // Posições do lote que o chat recebeu (as quebradas ficaram de fora).
      const recebidas = new Set(validasNoLote.map((v) => v.indice - i))
      let pos = 0
      let chegaram = 0

      // Cada tratada que chega é baixada e hospedada na hora, na posição
      // certa do lote; assim, se a rodada cair, o que já voltou está salvo.
      const consumir = async (tratadas) => {
        let t = 0
        while (pos < lote.length) {
          if (!recebidas.has(pos)) {
            // Foto quebrada (404) na origem: marca como vista para o laço andar.
            feito.hospedadas.push(lote[pos])
            pos++
            continue
          }
          if (t >= tratadas.length) break
          const tratada = tratadas[t++]
          await baixarPara([tratada], pastaTratadas, 'png')
          feito.hospedadas.push(await hospedarNoSite(tratada, nomeArquivo(i + pos, tratada, 'png'), veiculo.id))
          pos++
          chegaram++
        }
        await guardarProgresso(veiculo.id, feito)
      }

      // Uma volta no chat: consome as imagens que chegaram e devolve o texto,
      // quando a resposta foi só texto (pergunta ou aviso de limite).
      const volta = async (comando, anexos, esperadas) => {
        const r = await rodadaNoChat(tabId, cfg, comando, anexos, esperadas)
        await consumir(await expandirRetorno(r.imagens))
        return r.imagens.length ? '' : r.texto
      }

      // Anexa o lote UMA vez só. Se falhar ANTES de sair (tela sem
      // compositor, aba caída), recarrega e envia de novo — não duplica. Se
      // já saiu e só a espera estourou, NÃO reenvia: segue pedindo a
      // continuação na mesma conversa.
      const comandoLote = `${cfg.comando}\n\nSão ${qtdEnviada} foto(s) do veículo. Não faça perguntas nem peça confirmação: gere direto, na ordem.`
      let texto = ''
      try {
        texto = await volta(comandoLote, imagens, qtdEnviada)
      } catch (e) {
        if (e.antesDeEnviar) {
          await registrar(`  O envio não saiu (${e.message}). Recarregando a aba e tentando de novo...`)
          tabId = await abaDoChat(grupoId, true, tabId)
          texto = await volta(comandoLote, imagens, qtdEnviada)
        } else if (/não devolveu|não respondeu/.test(e.message)) {
          await registrar(`  As fotos foram enviadas, mas a resposta não veio (${e.message}). Sem reenviar.`)
          tabId = await abaDoChat(grupoId, false, tabId)
        } else {
          throw e
        }
      }

      // O chat gera algumas imagens por resposta e às vezes para para
      // perguntar ou bate no limite de uso. Nada disso reanexa as fotos: a
      // conversa continua só com texto até voltarem todas.
      let semAvanco = 0
      let esperasDeLimite = 0
      while (chegaram < qtdEnviada && semAvanco < 3) {
        if (await mandaramParar()) break
        const faltam = qtdEnviada - chegaram
        let comando = comandoContinuar(chegaram, qtdEnviada)

        if (texto) {
          const leitura = lerRespostaEmTexto(texto)
          if (leitura.tipo === 'limite') {
            if (++esperasDeLimite > 8) throw new Error('o chat ficou no limite de uso por tempo demais; o que ficou pronto está salvo')
            if (!(await esperarLimite(leitura.esperaMs))) break
          } else {
            await registrar(`  O chat perguntou em vez de gerar ("${texto.slice(0, 80).replace(/\s+/g, ' ')}…"). Respondendo para seguir.`)
            comando = `Sim, pode seguir. ${comando}`
          }
        }

        await registrar(`  ${chegaram}/${qtdEnviada} voltaram; pedindo a próxima (faltam ${faltam})…`)
        const antes = chegaram
        texto = ''
        try {
          texto = await volta(comando, [], faltam)
        } catch (e) {
          if (!e.antesDeEnviar && !/não devolveu|não respondeu/.test(e.message)) throw e
          await registrar(`  sem resposta nesta volta (${e.message}).`)
          tabId = await abaDoChat(grupoId, !!e.antesDeEnviar, tabId)
        }
        // Esperar o limite passar não é travar: só conta volta sem nada e sem motivo.
        if (chegaram > antes || (texto && lerRespostaEmTexto(texto).tipo === 'limite')) semAvanco = 0
        else semAvanco++
      }
      if (!chegaram) throw new Error(`o chat não devolveu nenhuma foto válida do lote ${i + 1}–${i + lote.length}`)
      if (chegaram < qtdEnviada) {
        await registrar(`  voltaram ${chegaram} de ${qtdEnviada}; o resto vai numa nova mensagem.`)
      }

      await registrar(`  ${feito.hospedadas.length}/${total} prontas e guardadas.`)

      // Trava de segurança: se um lote não rendeu nenhuma foto nova, repetir
      // o mesmo envio para sempre não ajuda ninguém.
      travas = feito.hospedadas.length > i ? 0 : travas + 1
      if (travas >= 3) {
        throw new Error(`o chat parou de devolver fotos na ${i + 1}ª de ${total}; o que ficou pronto está salvo`)
      }
    }

    if (!feito.hospedadas.length) throw new Error('o chat não devolveu imagem nenhuma')

    await registrar(`  ${feito.hospedadas.length} tratada(s) em "${pastaTratadas}". Publicando…`)
    // As quebradas da origem só marcavam posição; não vão para a galeria.
    const galeria = feito.hospedadas.filter((u) => !veiculo.fotos.includes(u))
    if (!galeria.length) throw new Error('nenhuma foto tratada para publicar')
    await enviarTratadas(veiculo.id, galeria)
    await limparProgresso(veiculo.id)

    return {
      id: veiculo.id,
      titulo: veiculo.titulo,
      modo: 'automatico',
      enviadas: feito.hospedadas.length,
      pasta,
      pastaTratadas,
    }
  }

  // ─── Rodada ──────────────────────────────────────────────────────────
  /**
   * Roda a fila inteira. Com `automatico` desligado, para depois do download e
   * deixa o comando pronto para colar — é o modo antigo, que continua servindo
   * quando a tela do chat muda e os seletores precisam de ajuste.
   */
  async function rodarTratamento(opcoes) {
    const estado = await lerEstado()
    if (estado.rodando && !rodadaMorta(estado)) {
      return { ok: false, motivo: 'Já existe uma rodada em andamento. Use Parar, ou Reiniciar se ela travou.' }
    }

    await gravarEstado({ rodando: true, parar: false, log: [], fila: [], atual: null, resultados: [] })
    if (estado.rodando) {
      await registrar('A rodada anterior parou sozinha (o navegador descarregou a extensão). Retomando.')
    }
    manterVivo(true)
    const resultados = []
    try {
      const cfg = await lerCfg()
      await registrar('Abrindo o grupo de abas…')
      const grupoId = await abrirGrupo()

      // Primeiro quem ficou preso no meio: esses já estão travados e com
      // parte das fotos tratadas guardadas. Terminar o que começou vale mais
      // do que abrir carro novo e deixar o antigo fora do ar pela metade.
      await registrar('Procurando veículos que ficaram no meio do tratamento…')
      const presos = await lerFila(opcoes?.limite, 'EM_TRATAMENTO').catch(() => ({ veiculos: [] }))
      if (presos.veiculos.length) {
        for (const preso of presos.veiculos) {
          await registrar(`  O veículo "${preso.titulo}" ficou no meio do tratamento; vai ser retomado primeiro.`)
        }
      }

      await registrar('Lendo a fila de veículos sem tratamento…')
      const fila = await lerFila(opcoes?.limite)
      await registrar(
        `Loja do token: ${fila.loja || '?'} — ${fila.estoqueComFoto ?? '?'} carro(s) ativos com foto; ` +
          `${fila.jaTratadosNaOrigem || 0} já tratado(s) no site antigo, ${fila.semFotoPropria || 0} só com arte da loja.`,
      )
      const imp = fila.importacao
      if (imp && (!imp.completadosPeloSiteAntigo || imp.erroSiteAntigo)) {
        await registrar(
          `  AVISO: a importação do AutoDrive não está trazendo placa/loja parceira/opcionais do site antigo ` +
            `(${imp.completadosPeloSiteAntigo || 0} de ${imp.carrosNoFeed || '?'} completados${imp.erroSiteAntigo ? `: ${imp.erroSiteAntigo}` : ''}).`,
        )
      }

      const aFazer = [...presos.veiculos, ...fila.veiculos].slice(0, opcoes?.limite || cfg.limitePorRodada)
      if (!aFazer.length) {
        const extra = fila.semFotoPropria
          ? ` ${fila.semFotoPropria} veículo(s) têm só arte da loja e precisam de foto nova pelo painel.`
          : ''
        await registrar(`Nenhum veículo pendente de tratamento.${extra}`)
        await gravarEstado({ rodando: false, fila: [] })
        return { ok: true, total: 0 }
      }
      await registrar(`${aFazer.length} veículo(s) na fila.`)
      await gravarEstado({ fila: aFazer })

      for (const veiculo of aFazer) {
        if (await mandaramParar()) {
          await registrar('Parado pelo operador.')
          break
        }
        try {
          resultados.push(await tratarVeiculo(veiculo, grupoId))
        } catch (e) {
          // Um carro falhar não pode derrubar a rodada inteira: o próximo ainda
          // pode dar certo, e o que já foi tratado já está publicado.
          resultados.push({ id: veiculo.id, titulo: veiculo.titulo, erro: e.message })
          await registrar(`  ERRO em ${veiculo.titulo}: ${e.message}`)
        }
        await gravarEstado({ resultados })
      }

      const ok = resultados.filter((r) => !r.erro).length
      await registrar(
        cfg.automatico
          ? `Fim da rodada: ${ok}/${resultados.length} veículo(s) tratados e publicados.`
          : 'Fotos baixadas. Solte-as no chat, salve os resultados e volte para enviar.',
      )
      // `parar` precisa voltar a false aqui: se ficasse gravado, o content
      // script abortaria a PRÓXIMA rodada logo no primeiro passo.
      await gravarEstado({ rodando: false, parar: false, atual: null, resultados, comando: cfg.comando })
      return { ok: true, total: resultados.length, resultados }
    } catch (e) {
      await registrar(`ERRO: ${e.message}`)
      await gravarEstado({ rodando: false, parar: false, atual: null, resultados })
      return { ok: false, motivo: e.message }
    } finally {
      manterVivo(false)
    }
  }

  /** Só baixa, sem mexer no chat. É o modo manual. */
  async function prepararRodada(opcoes) {
    const cfg = await lerCfg()
    await salvarCfg({ automatico: false })
    try {
      return await rodarTratamento(opcoes)
    } finally {
      await salvarCfg({ automatico: cfg.automatico })
    }
  }

  // ─── Publicar a partir de arquivos do disco ─────────────────────────────
  /** pastaVeiculo → { id, situacao } de todo o estoque tratável do AutoDrive. */
  async function mapaDePastas() {
    const mapa = {}
    for (const situacao of ['ORIGEM', 'EM_TRATAMENTO', 'TRATADA']) {
      const r = await lerFila(300, situacao)
      for (const v of r.veiculos || []) mapa[limparNome(v.pastaVeiculo)] = { id: v.id, situacao: v.situacao, titulo: v.titulo }
    }
    return mapa
  }

  /** Sobe as fotos (data URLs, na ordem) e publica a galeria do veículo. */
  async function publicarArquivos(veiculoId, arquivos) {
    const lista = (arquivos || []).filter((a) => a && a.dataUrl)
    if (!lista.length) throw new Error('nenhuma foto na pasta')
    await acaoNoVeiculo(veiculoId, 'iniciar')
    const urls = []
    for (let i = 0; i < lista.length; i++) urls.push(await hospedarNoSite(lista[i].dataUrl, lista[i].nome || nomeArquivo(i, '', 'png'), veiculoId))
    await enviarTratadas(veiculoId, urls)
    await limparProgresso(veiculoId)
    return { publicadas: urls.length }
  }

  // ─── Auditoria de Integridade ──────────────────────────────────────────
  /**
   * Confere o que está no AutoDrive:
   *   · TRATADA: toda foto da galeria abre e tem tamanho de foto (≥ 5 KB).
   *     Se alguma falhar, restaura (volta as fotos de antes) e o carro entra
   *     de novo na fila.
   *   · EM_TRATAMENTO sem progresso guardado nesta extensão: ficou preso por
   *     uma rodada que morreu antes de tratar qualquer foto. Restaura para
   *     destravar — a galeria dele nunca mudou, então nada se perde.
   */
  async function rodarAuditoria() {
    const e = await lerEstado()
    if (e.rodando && !rodadaMorta(e)) throw new Error('já existe uma rodada em andamento')

    await gravarEstado({ rodando: true, log: [], fila: [], atual: null, parar: false })
    await registrar('Auditando as fotos no AutoDrive…')
    let devolvidos = 0
    try {
      manterVivo(true)
      const tratados = (await lerFila(50, 'TRATADA')).veiculos || []
      const presos = (await lerFila(50, 'EM_TRATAMENTO')).veiculos || []
      await registrar(`${tratados.length} tratado(s) e ${presos.length} em tratamento para conferir.`)

      for (const v of tratados) {
        if (await mandaramParar()) break
        let problema = ''
        for (const url of v.fotos) {
          const r = await fetch(url, { credentials: 'omit', cache: 'no-store' }).catch((err) => ({ ok: false, status: err.message }))
          if (!r.ok) { problema = `foto não abre (${r.status}): ${url}`; break }
          const tamanho = (await r.blob()).size
          if (tamanho < 5120) { problema = `foto com ${tamanho} bytes (corrompida): ${url}`; break }
        }
        if (!problema) { await registrar(`  OK: ${v.titulo} (${v.fotos.length} fotos).`); continue }
        await registrar(`  PROBLEMA em ${v.titulo}: ${problema}. Restaurando as fotos de antes.`)
        await restaurar(v.id).then(() => devolvidos++).catch((err) => registrar(`    não restaurou: ${err.message}`))
      }

      for (const v of presos) {
        if (await mandaramParar()) break
        const progresso = await lerProgresso(v.id)
        if (progresso.hospedadas.length) {
          await registrar(`  ${v.titulo}: em tratamento com ${progresso.hospedadas.length} foto(s) prontas — a próxima rodada retoma.`)
          continue
        }
        await registrar(`  ${v.titulo}: preso em tratamento sem nenhuma foto pronta. Destravando.`)
        await restaurar(v.id).then(() => devolvidos++).catch((err) => registrar(`    não destravou: ${err.message}`))
      }
      await registrar(`Auditoria concluída. ${devolvidos} veículo(s) devolvido(s) para a fila.`)
    } catch (err) {
      await registrar(`ERRO: ${err.message}`)
    } finally {
      manterVivo(false)
      await gravarEstado({ rodando: false, atual: null, parar: false })
    }
  }

  return {
    CFG_PADRAO,
    lerCfg,
    salvarCfg,
    lerEstado,
    gravarEstado,
    lerFila,
    abrirGrupo,
    baixarOriginais,
    prepararRodada,
    rodarTratamento,
    pedirParada,
    lerExemplo,
    salvarExemplo,
    zerar,
    rodadaMorta,
    tratarVeiculo,
    enviarTratadas,
    hospedarNoSite,
    travar,
    restaurar,
    rodarAuditoria,
    mapaDePastas,
    publicarArquivos,
  }
})()

if (typeof globalThis !== 'undefined') globalThis.FOTOS = FOTOS
