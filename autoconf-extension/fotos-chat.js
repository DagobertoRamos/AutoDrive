/**
 * fotos-chat.js — braço da extensão dentro da aba do chat.
 *
 * O service worker não enxerga a página, então tudo que envolve DOM acontece
 * aqui: anexar a foto ao compositor, colar o comando, enviar e avisar quando
 * a imagem tratada apareceu na resposta.
 *
 * Nada aqui contorna login, captcha ou proteção. É a mesma sessão que já está
 * aberta no navegador, fazendo os mesmos cliques que a pessoa faria — só que
 * na ordem certa e sem errar o arquivo.
 *
 * ── O que a inspeção da tela real mostrou (17/09/2026) ────────────────────
 *
 * 1. A imagem gerada NÃO fica dentro de [data-message-author-role="assistant"].
 *    Ela mora em div[class*="imagegen-image"], com alt="Imagem gerada". Era
 *    por isso que a colheita voltava vazia e a rodada morria ali.
 *
 * 2. O endereço dela é https://chatgpt.com/backend-api/estuary/...&sig=...,
 *    mesma origem da aba. Conferido: responde 200 com image/png de ~2 MB, o
 *    que cabe no limite de 8 MB do site.
 *
 * 3. Existem 16 <img alt="Imagem gerada"> na página, mas 14 são miniaturas do
 *    editor (48x48). Só vale o que está renderizado com 200px ou mais.
 *
 * 4. ENQUANTO GERA, o botão de enviar VIRA o botão de parar: mesmo
 *    form button[type="submit"], com data-testid="stop-button" e rótulo
 *    "Parar de responder". Clicar nele achando que é enviar aborta a geração.
 *    Por isso todo envio confere o testid e o rótulo antes de clicar.
 *
 * 5. Existem 5 input[type="file"] na página. O que serve é o de dentro do
 *    <form>; os outros são de menus laterais.
 */

;(() => {
  if (window.__fotosChatCarregado) return
  window.__fotosChatCarregado = true

  const SELETORES = {
    composer: [
      '#prompt-textarea',
      'div[contenteditable="true"][data-virtualkeyboard]',
      'form div[contenteditable="true"]',
      'textarea[data-testid="prompt-textarea"]',
      'form textarea',
    ],
    // O de dentro do form é o do compositor. Os de fora pertencem aos menus
    // "Adicionar fotos" e "Adicionar mídia", que abrem seletor próprio.
    anexo: [
      'form input[type="file"]',
      'input[data-testid="upload-photos-input"]',
      'input[data-testid="upload-media-input"]',
      'input[type="file"]',
    ],
    enviar: [
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]',
      'form button[type="submit"]',
      'button[aria-label*="Enviar" i]',
      'button[aria-label*="Send" i]',
    ],
    parar: ['button[data-testid="stop-button"]', 'button[aria-label*="Parar" i]', 'button[aria-label*="Stop" i]'],
    geradas: ['img[alt="Imagem gerada"]', 'img[alt="Generated image"]', 'div[class*="imagegen-image"] img'],
  }

  /** Abaixo disto é miniatura do editor, não a imagem de verdade. */
  const LARGURA_MINIMA = 200

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

  /**
   * O operador pediu para parar?
   *
   * A espera pela imagem dura até 15 minutos, e durante ela o service worker
   * está parado dentro de sendMessage — não tem como ele avisar por mensagem.
   * Por isso a checagem é feita aqui, lendo a mesma chave de storage que o
   * botão "Parar" escreve. Sem isto, clicar em Parar não fazia nada até a
   * espera estourar, e a extensão parecia travada.
   */
  async function pediramParar() {
    try {
      const r = await chrome.storage.local.get('fotosEstado')
      return !!r.fotosEstado?.parar
    } catch {
      return false
    }
  }

  async function abortarSePediram() {
    if (await pediramParar()) throw new Error('parado pelo operador')
  }

  function achar(lista) {
    for (const seletor of lista) {
      const todos = [...document.querySelectorAll(seletor)].filter((el) => el.isConnected)
      if (todos.length) return todos[todos.length - 1]
    }
    return null
  }

  async function esperar(lista, limiteMs = 15000) {
    const ate = Date.now() + limiteMs
    for (;;) {
      const el = achar(lista)
      if (el) return el
      if (Date.now() > ate) return null
      await dormir(250)
    }
  }

  const gerando = () => !!achar(SELETORES.parar)

  /**
   * Botão de enviar de verdade.
   *
   * Enquanto o chat responde, o MESMO botão submit vira "Parar de responder".
   * Clicar nele aqui abortaria a geração e a rodada ficaria esperando para
   * sempre uma imagem que nunca vem.
   */
  function botaoEnviar() {
    for (const seletor of SELETORES.enviar) {
      for (const b of [...document.querySelectorAll(seletor)].reverse()) {
        if (!b.isConnected) continue
        if (b.getAttribute('data-testid') === 'stop-button') continue
        if (/parar|stop/i.test(b.getAttribute('aria-label') || '')) continue
        return b
      }
    }
    return null
  }

  function entradaDeArquivo() {
    for (const seletor of SELETORES.anexo) {
      const achados = [...document.querySelectorAll(seletor)].filter((el) => el.isConnected)
      if (achados.length) return achados[0]
    }
    return null
  }

  /**
   * Endereços das imagens geradas em tamanho real, sem miniatura nem avatar,
   * na ORDEM em que aparecem na conversa — a última é a resposta mais nova.
   *
   * A ordem importa porque a lista da conversa é virtualizada: rolar a tela
   * monta e desmonta mensagens antigas. Se uma antiga voltar a ser montada
   * durante a espera, ela conta como "nova" na comparação com o marco. Pegar
   * a última em ordem de documento é o que garante a foto certa.
   */
  function imagensGeradas() {
    const vistas = new Set()
    const ordenadas = []
    for (const seletor of SELETORES.geradas) {
      for (const img of document.querySelectorAll(seletor)) {
        if (img.getBoundingClientRect().width < LARGURA_MINIMA) continue
        const src = img.currentSrc || img.src || ''
        if (!/^https?:|^blob:/.test(src)) continue
        if (/avatar|profile|favicon/i.test(src)) continue
        if (vistas.has(src)) continue
        vistas.add(src)
        ordenadas.push({ src, topo: img.getBoundingClientRect().top + window.scrollY })
      }
    }
    return ordenadas.sort((a, b) => a.topo - b.topo).map((x) => x.src)
  }

  /** Texto da última resposta do chat (para ler pergunta ou aviso de limite). */
  function ultimaResposta() {
    const turnos = document.querySelectorAll('[data-message-author-role="assistant"]')
    const ultimo = turnos[turnos.length - 1]
    return ultimo ? (ultimo.innerText || '').trim() : ''
  }

  /** A última resposta ainda tem imagem sendo desenhada? */
  function imagemEmAndamento() {
    const turnos = document.querySelectorAll('[data-message-author-role="assistant"]')
    const ultimo = turnos[turnos.length - 1]
    const bloco = ultimo?.closest('article') || ultimo?.parentElement
    return !!bloco?.querySelector('div[class*="imagegen"]:not(:has(img[alt]))')
  }

  /** Converte data URL em File, que é o que o input[type=file] aceita. */
  function paraArquivo(dataUrl, nome) {
    const [cabecalho, base64] = String(dataUrl).split(',')
    const tipo = (cabecalho.match(/data:([^;]+)/) || [])[1] || 'image/jpeg'
    const binario = atob(base64)
    const bytes = new Uint8Array(binario.length)
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
    return new File([bytes], nome, { type: tipo })
  }

  /** Escreve no compositor, que pode ser textarea ou contenteditable. */
  function escrever(campo, texto) {
    campo.focus()
    if (campo.tagName === 'TEXTAREA' || campo.tagName === 'INPUT') {
      const proto = campo.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(campo, texto)
      campo.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    // Contenteditable: insertText mantém o editor (ProseMirror) sabendo do
    // conteúdo. Mexer no innerHTML direto deixa o botão de enviar desligado.
    const selecao = window.getSelection()
    const faixa = document.createRange()
    faixa.selectNodeContents(campo)
    selecao.removeAllRanges()
    selecao.addRange(faixa)
    document.execCommand('insertText', false, texto)
    campo.dispatchEvent(new InputEvent('input', { bubbles: true, data: texto, inputType: 'insertText' }))
  }

  function linksZipGerados() {
    const vistas = new Set()
    const ordenadas = []
    for (const a of document.querySelectorAll('a')) {
      const isZip = 
        (a.href && a.href.toLowerCase().includes('.zip')) ||
        (a.download && a.download.toLowerCase().includes('.zip')) ||
        (a.innerText && a.innerText.toLowerCase().includes('.zip'))
      
      if (!isZip) continue
      
      const src = a.href || ''
      if (!/^https?:|^blob:/.test(src)) continue
      if (vistas.has(src)) continue
      vistas.add(src)
      ordenadas.push({ src, topo: a.getBoundingClientRect().top + window.scrollY })
    }
    return ordenadas.sort((a, b) => a.topo - b.topo).map((x) => x.src)
  }

  async function anexar(imagens) {
    const entrada = entradaDeArquivo()
    if (!entrada) throw new Error('campo de anexo não encontrado na tela do chat')

    const transferencia = new DataTransfer()
    for (const imagem of imagens) transferencia.items.add(paraArquivo(imagem.dataUrl, imagem.nome))
    entrada.files = transferencia.files
    entrada.dispatchEvent(new Event('change', { bubbles: true }))

    // O chat só libera o envio depois de subir os anexos. Esperar o botão
    // ficar clicável é mais confiável do que cronometrar.
    const ate = Date.now() + 180000
    for (;;) {
      await abortarSePediram()
      const botao = botaoEnviar()
      if (botao && !botao.disabled && botao.getAttribute('aria-disabled') !== 'true') return
      if (Date.now() > ate) throw new Error('os anexos não terminaram de subir em 3 minutos')
      await dormir(500)
    }
  }

  /** Espera a resposta anterior terminar, para não clicar em "parar". */
  async function esperarFicarLivre(limiteMs) {
    const ate = Date.now() + (limiteMs || 15 * 60 * 1000)
    while (gerando()) {
      await abortarSePediram()
      if (Date.now() > ate) throw new Error('o chat ficou gerando a resposta anterior e não liberou')
      await dormir(1500)
    }
  }

  async function enviar({ comando, imagens, limiteMs, loteZip }) {
    await esperarFicarLivre(limiteMs)

    const campo = await esperar(SELETORES.composer, 20000)
    if (!campo) throw new Error('compositor do chat não encontrado — a tela mudou?')

    // Marco: o que já existia antes deste envio não conta como resposta nova.
    // Os dois tipos entram no marco: no Modo Turbo o chat às vezes ignora o
    // pedido de .zip e devolve imagem solta, e ela também precisa ser colhida.
    const antes = [...linksZipGerados(), ...imagensGeradas()]
    const textoAntes = ultimaResposta()

    if (imagens && imagens.length) await anexar(imagens)
    if (comando) escrever(campo, comando)

    await dormir(400)
    const botao = botaoEnviar()
    if (!botao) throw new Error('botão de enviar não encontrado (só achei o de parar)')
    botao.click()
    return { antes, textoAntes }
  }

  /**
   * Espera a imagem tratada e devolve o endereço dela.
   *
   * "Pronta" é: apareceu endereço que não existia antes, o botão de parar
   * sumiu, e a contagem parou de crescer por 5 segundos. A geração levou
   * 3m45s na conversa real, então a espera precisa ser generosa.
   */
  async function colher({ antes, textoAntes, esperadas, limiteMs, loteZip }) {
    const limite = Number(limiteMs) || 15 * 60 * 1000
    const alvo = Math.max(1, Number(esperadas) || 1)
    const ate = Date.now() + limite
    const jaExistia = new Set(antes || [])
    let estavelDesde = 0
    let ultimaContagem = -1
    let textoVisto = ''
    let textoDesde = 0

    for (;;) {
      await abortarSePediram()
      const zips = loteZip ? linksZipGerados().filter((src) => !jaExistia.has(src)) : []
      if (zips.length && !gerando()) return await finalizarColheita(zips.slice(-1))
      const novas = imagensGeradas().filter((src) => !jaExistia.has(src))

      // Chegou o lote inteiro e parou de gerar: não há o que esperar.
      if (novas.length >= alvo && !gerando()) return await finalizarColheita(novas.slice(0, alvo))

      if (novas.length && !gerando()) {
        // Voltou menos do que foi pedido. Pode ser que ainda venha mais, ou
        // que o chat tenha entregue só parte. A contagem parada por 12s
        // decide: devolve o que chegou e o motor reenvia o que faltou.
        if (novas.length !== ultimaContagem) {
          ultimaContagem = novas.length
          estavelDesde = Date.now()
        } else if (Date.now() - estavelDesde > 12000) {
          return await finalizarColheita(novas)
        }
      } else {
        ultimaContagem = -1
      }

      // Respondeu SÓ com texto — pergunta ("posso gerar no máximo 10…") ou
      // aviso de limite. Esperar imagem aqui travava a rodada por mais de uma
      // hora; devolve o texto para o motor decidir o que responder.
      if (!novas.length && !gerando() && !imagemEmAndamento()) {
        const texto = ultimaResposta()
        if (texto && texto !== (textoAntes || '')) {
          if (texto !== textoVisto) {
            textoVisto = texto
            textoDesde = Date.now()
          } else if (Date.now() - textoDesde > 30000) {
            return { imagens: [], texto }
          }
        }
      } else {
        textoVisto = ''
      }

      if (Date.now() > ate) {
        const quanto = limite >= 60000 ? `${Math.round(limite / 60000)} min` : `${Math.round(limite / 1000)} s`
        throw new Error(
          `o chat não devolveu a foto tratada em ${quanto}` +
            (novas.length ? ` (${novas.length} chegaram mas ainda estava gerando)` : ''),
        )
      }
      await dormir(1500)
    }
  }

  async function baixarParaDataUrl(url) {
    if (url.startsWith('data:')) return url
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((r) => {
      const leitor = new FileReader()
      leitor.onload = () => r(leitor.result)
      leitor.readAsDataURL(blob)
    })
  }

  async function finalizarColheita(urls) {
    const prontas = []
    for (const u of urls) {
      try {
        prontas.push(await baixarParaDataUrl(u))
      } catch (e) {
        // Se falhar (CORS em origem estranha ou blob expirado), devolve a original
        prontas.push(u)
      }
    }
    return { imagens: prontas }
  }

  /**
   * Tarefas longas (enviar, colher) rodam AQUI, soltas, e o service worker só
   * consulta de tempos em tempos. Antes ele ficava preso numa única mensagem
   * esperando a resposta — até 50 minutos — e o Chrome derruba o service
   * worker quando uma chamada passa de 5 minutos: o chat terminava as fotos e
   * não havia mais ninguém do outro lado para baixar e publicar.
   */
  const tarefas = new Map()
  let sequencia = 0

  function iniciarTarefa(req) {
    const id = `${Date.now()}-${++sequencia}`
    const tarefa = { pronto: false, resultado: null }
    tarefas.set(id, tarefa)
    const trabalho = req.tarefa === 'enviar' ? enviar(req) : colher(req)
    trabalho
      .then((r) => { tarefa.resultado = { ok: true, ...r } })
      .catch((e) => { tarefa.resultado = { ok: false, erro: String((e && e.message) || e) } })
      .finally(() => { tarefa.pronto = true })
    return id
  }

  chrome.runtime.onMessage.addListener((req, _remetente, responder) => {
    if (!req || !req.type || !req.type.startsWith('fotosChat')) return
    ;(async () => {
      switch (req.type) {
        case 'fotosChatPronto':
          return {
            ok: true,
            composer: !!achar(SELETORES.composer),
            anexo: !!entradaDeArquivo(),
            enviar: !!botaoEnviar(),
            gerando: gerando(),
            geradasNaTela: imagensGeradas().length,
          }
        case 'fotosChatEnviar':
          return { ok: true, ...(await enviar(req)) }
        case 'fotosChatColher':
          return { ok: true, ...(await colher(req)) }
        case 'fotosChatIniciar':
          return { ok: true, id: iniciarTarefa(req) }
        case 'fotosChatConsultar': {
          const tarefa = tarefas.get(req.id)
          // Sem a tarefa = a aba recarregou (e este script é outro).
          if (!tarefa) return { ok: false, erro: 'a aba do chat não respondeu (recarregou no meio da tarefa)' }
          if (!tarefa.pronto) return { ok: true, pronto: false }
          tarefas.delete(req.id)
          return { ok: true, pronto: true, resultado: tarefa.resultado }
        }
        default:
          return { ok: false, erro: `tipo desconhecido: ${req.type}` }
      }
    })()
      .then(responder)
      .catch((e) => responder({ ok: false, erro: String((e && e.message) || e) }))
    return true
  })
})()
