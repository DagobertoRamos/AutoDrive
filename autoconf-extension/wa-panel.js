// =============================================================================
// wa-panel.js — painel assistido injetado no WhatsApp Web.
//
// O QUE ELE FAZ: mostra o próximo cliente da fila, o texto já personalizado,
// e abre a conversa com o texto pronto no campo de digitação do WhatsApp
// (usando o link click-to-chat oficial).
//
// O QUE ELE NÃO FAZ — de propósito: não clica em "enviar", não aperta Enter,
// não manda nada sozinho. Quem envia é você. É exatamente isso que mantém a
// operação fora do padrão que a Meta pune (automação de sessão do WhatsApp Web).
// =============================================================================

(() => {
  'use strict'
  if (window.__feiraoPanelLoaded) return
  window.__feiraoPanelLoaded = true

  const UI_KEY = 'feiraoUi' // { aberto, contatoAtual, textoAtual, variante, aguardandoDesfecho }

  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag)
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'style') Object.assign(n.style, v)
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k === 'class') n.className = v
      else n.setAttribute(k, v)
    })
    kids.flat().forEach((c) => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c))
    return n
  }

  // ---------------------------------------------------------------------------
  // A EXTENSÃO AINDA ESTÁ VIVA NESTA PÁGINA?
  //
  // Quando você recarrega a extensão em chrome://extensions, o script que já
  // está rodando dentro do WhatsApp Web fica órfão: o Chrome corta o acesso a
  // `chrome.storage` e cada chamada estoura "Extension context invalidated".
  // Era isso na lista de erros — e o painel morria em silêncio, sem dizer nada.
  //
  // Agora a morte é detectada: os relógios param e o painel mostra um aviso
  // pedindo F5, que é o que resolve. Nenhuma exceção solta.
  // ---------------------------------------------------------------------------
  let contextoMorto = false

  const extensaoViva = () => {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id) } catch (e) { return false }
  }

  function marcarContextoMorto() {
    if (contextoMorto) return
    contextoMorto = true
    // Cada parada é protegida: em boot muito cedo, algum destes ainda nem existe.
    try { pararCronometro() } catch (e) { /* ainda não existe */ }
    try { autoTimers.forEach((t) => clearInterval(t)) } catch (e) { /* idem */ }
    try { if (varreduraTimer) clearInterval(varreduraTimer) } catch (e) { /* idem */ }
    try { mostrarAvisoDeRecarga() } catch (e) { /* idem */ }
  }

  /** Aviso visível no lugar do painel: o script órfão não consegue mais nada. */
  function mostrarAvisoDeRecarga() {
    if (document.getElementById('feirao-morto')) return
    const caixa = document.createElement('div')
    caixa.id = 'feirao-morto'
    caixa.style.cssText = 'position:fixed;right:16px;bottom:16px;width:320px;z-index:2147483001;'
      + 'background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px;'
      + 'font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#92400e;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.16)'
    const titulo = document.createElement('b')
    titulo.textContent = 'A extensão foi atualizada.'
    const txt = document.createElement('div')
    txt.style.marginTop = '5px'
    txt.textContent = 'Esta aba ainda está rodando a versão antiga e parou de responder. '
      + 'Recarregue a página para o painel voltar — nada da campanha se perde.'
    const bt = document.createElement('button')
    bt.textContent = 'Recarregar a página'
    bt.style.cssText = 'margin-top:10px;width:100%;border:0;border-radius:9px;padding:9px;'
      + 'font-weight:700;cursor:pointer;background:#1e40af;color:#fff'
    bt.addEventListener('click', () => location.reload())
    caixa.appendChild(titulo); caixa.appendChild(txt); caixa.appendChild(bt)
    const painel = document.getElementById('feirao-panel')
    if (painel) painel.style.display = 'none'
    const fab = document.getElementById('feirao-fab')
    if (fab) fab.style.display = 'none'
    document.body.appendChild(caixa)
  }

  /** Executa algo que usa `chrome.*` sem nunca estourar na página. */
  async function comChrome(fn, seMorto) {
    if (!extensaoViva()) { marcarContextoMorto(); return seMorto }
    try {
      return await fn()
    } catch (e) {
      if (/context invalidated|Extension context/i.test(String(e && e.message || e))) {
        marcarContextoMorto()
        return seMorto
      }
      throw e
    }
  }

  const getUi = () => comChrome(
    () => new Promise((r) => chrome.storage.local.get(UI_KEY, (s) => r((s && s[UI_KEY]) || {}))), {})
  const setUi = (patch) => comChrome(
    () => getUi().then((cur) => new Promise((r) => chrome.storage.local.set({ [UI_KEY]: { ...cur, ...patch } }, r))), null)

  // ---------------------------------------------------------------------------
  // Estilos
  // ---------------------------------------------------------------------------
  const css = `
  #feirao-panel{position:fixed;right:16px;bottom:16px;width:340px;z-index:2147483000;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;
    background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 40px rgba(15,23,42,.18);overflow:hidden}
  #feirao-panel *{box-sizing:border-box}
  #feirao-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;cursor:move;user-select:none}
  #feirao-head strong{font-size:13px;letter-spacing:.2px}
  #feirao-head .sp{flex:1}
  #feirao-head button{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:14px;line-height:1}
  #feirao-body{padding:12px;max-height:70vh;overflow:auto}
  .fp-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
  .fp-metric{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:6px 8px;text-align:center}
  .fp-metric b{display:block;font-size:17px;color:#1e3a8a;line-height:1.15}
  .fp-metric span{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
  .fp-card{border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-bottom:10px}
  .fp-nome{font-size:14px;font-weight:700;margin-bottom:2px}
  .fp-meta{font-size:11px;color:#64748b;line-height:1.45}
  .fp-tag{display:inline-block;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;
    background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:2px 7px;margin-left:6px;vertical-align:middle}
  #feirao-texto{width:100%;min-height:132px;border:1px solid #cbd5e1;border-radius:9px;padding:9px;font-size:12px;
    line-height:1.5;resize:vertical;font-family:inherit;color:#0f172a}
  #feirao-texto:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
  .fp-chars{font-size:10px;color:#94a3b8;text-align:right;margin-top:3px}
  .fp-btn{border:0;border-radius:9px;padding:10px;font-size:12.5px;font-weight:700;cursor:pointer;width:100%}
  .fp-primary{background:#16a34a;color:#fff}
  .fp-primary:disabled{background:#cbd5e1;color:#64748b;cursor:not-allowed}
  .fp-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
  .fp-ghost{background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;padding:8px;font-size:11px;font-weight:600;border-radius:8px;cursor:pointer}
  .fp-danger{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
  .fp-alert{border-radius:9px;padding:8px 10px;font-size:11px;line-height:1.45;margin-bottom:9px}
  .fp-alert.warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}
  .fp-alert.stop{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
  .fp-alert.info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af}
  .fp-hint{font-size:10px;color:#94a3b8;line-height:1.45;margin-top:8px;border-top:1px solid #f1f5f9;padding-top:8px}
  #feirao-fab{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:linear-gradient(135deg,#0f172a,#1e3a8a);
    color:#fff;border:0;border-radius:999px;padding:11px 16px;font-size:12px;font-weight:700;cursor:pointer;
    box-shadow:0 8px 24px rgba(15,23,42,.28);font-family:system-ui,sans-serif}
  .fp-collapsed #feirao-body{display:none}
  `

  document.documentElement.appendChild(el('style', {}, css))

  // ---------------------------------------------------------------------------
  // Montagem
  // ---------------------------------------------------------------------------
  let panel, fab, tickTimer
  let autoTimers = []
  let atual = null // { contato, variante, texto }

  function montar() {
    fab = el('button', { id: 'feirao-fab', onclick: () => abrir(true) }, 'Feirão · abrir painel')
    document.body.appendChild(fab)

    panel = el('div', { id: 'feirao-panel', style: { display: 'none' } },
      el('div', { id: 'feirao-head' },
        el('strong', {}, 'Campanha Feirão'),
        el('span', { class: 'sp' }),
        el('button', { title: 'Procurar respostas agora', onclick: () => varrerRespostas({ silencioso: false }) }, '⟳'),
        el('button', { title: 'Playbook de respostas', onclick: () => renderPlaybook() }, '☰'),
        el('button', { title: 'Minimizar', onclick: () => abrir(false) }, '—'),
      ),
      el('div', { id: 'feirao-body' }),
    )
    document.body.appendChild(panel)
    arrastar(panel, panel.querySelector('#feirao-head'))
  }

  function abrir(v) {
    panel.style.display = v ? 'block' : 'none'
    fab.style.display = v ? 'none' : 'block'
    setUi({ aberto: !!v })
    if (v) render()
  }

  function arrastar(box, handle) {
    let sx, sy, ox, oy, on = false
    handle.addEventListener('mousedown', (e) => {
      on = true; sx = e.clientX; sy = e.clientY
      const r = box.getBoundingClientRect(); ox = r.left; oy = r.top
      box.style.right = 'auto'; box.style.bottom = 'auto'; box.style.left = ox + 'px'; box.style.top = oy + 'px'
      e.preventDefault()
    })
    window.addEventListener('mousemove', (e) => {
      if (!on) return
      box.style.left = Math.max(0, ox + e.clientX - sx) + 'px'
      box.style.top = Math.max(0, oy + e.clientY - sy) + 'px'
    })
    window.addEventListener('mouseup', () => { on = false })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  async function render() {
    autoTimers.forEach(clearInterval); autoTimers = []
    pararCronometro()
    const body = panel.querySelector('#feirao-body')
    body.innerHTML = ''

    const [config, state, fila, ui] = await Promise.all([
      FEIRAO.getConfig(), FEIRAO.getState(), FEIRAO.getQueue(), getUi(),
    ])

    const pendentes = fila.filter((c) => c.status === 'pendente').length
    const enviadosHoje = state.day === FEIRAO.hojeStr() ? state.sentToday || 0 : 0
    const restam = Math.max(0, (config.maxPorDia || 40) - enviadosHoje)

    const respostasAbertas = fila.filter((c) => c.status === 'respondeu').length
    body.appendChild(el('div', { class: 'fp-metrics' },
      el('div', { class: 'fp-metric' }, el('b', {}, String(enviadosHoje)), el('span', {}, 'hoje')),
      el('div', { class: 'fp-metric' }, el('b', {}, String(restam)), el('span', {}, 'restam')),
      el('div', { class: 'fp-metric' },
        el('b', { style: respostasAbertas ? { color: '#15803d' } : {} }, String(respostasAbertas)),
        el('span', {}, 'responderam')),
    ))
    body.appendChild(el('div', { id: 'feirao-respostas' }))

    // Painel de respostas: mostra só o ÚLTIMO que respondeu. A lista inteira
    // dentro de um painel de 340px vira ruído — quem trata lead trata um por
    // vez, e o resto tem lugar próprio (a tela de campanha).
    const responderam = fila.filter((c) => c.status === 'respondeu')
      .sort((a, b) => (b.respondeuEm || 0) - (a.respondeuEm || 0))
    if (responderam.length) {
      const ultimo = responderam[0]
      const cx = el('div', { class: 'fp-card', style: { borderColor: '#bbf7d0', background: '#f0fdf4' } },
        el('div', { style: { fontSize: '11px', fontWeight: '800', color: '#15803d', marginBottom: '6px' } },
          'ÚLTIMO QUE RESPONDEU'))

      cx.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '700' } },
        FEIRAO.primeiroNome(ultimo.nome) || FEIRAO.formatarTelefoneBR(ultimo.telefone)))
      if (ultimo.veiculo) {
        cx.appendChild(el('div', { class: 'fp-meta' }, ultimo.veiculo))
      }
      if (ultimo.previaResposta) {
        cx.appendChild(el('div', { style: { fontSize: '11px', color: '#334155', marginTop: '4px', fontStyle: 'italic' } },
          '"' + ultimo.previaResposta.slice(0, 90) + '"'))
      }
      cx.appendChild(el('button', {
        class: 'fp-btn fp-primary', style: { marginTop: '8px' },
        onclick: async () => { await irParaConversa(ultimo, '', config) },
      }, 'Abrir a conversa'))

      if (responderam.length > 1) {
        const n = responderam.length - 1
        cx.appendChild(el('div', { style: { marginTop: '8px', fontSize: '11px', color: '#15803d' } },
          `e mais ${n} esperando `,
          el('a', {
            href: '#',
            style: { color: '#1e40af', fontWeight: '700', textDecoration: 'underline', cursor: 'pointer' },
            onclick: (e) => {
              e.preventDefault()
              mandar({ type: 'abrirCampanha', hash: 'fila/em_conversa' })
            },
          }, 'abrir a lista em outra aba')))
      }
      body.appendChild(cx)
    }

    // Tarefas de hoje: follow-up, lembrete de véspera, no-show, retomada
    const tarefas = await FEIRAO.tarefasDeHoje()
    if (tarefas.length) {
      const tc = el('div', { class: 'fp-card', style: { borderColor: '#fde68a', background: '#fffbeb' } },
        el('div', { style: { fontSize: '11px', fontWeight: '800', color: '#92400e', marginBottom: '6px' } },
          `PARA HOJE — ${tarefas.length}`))
      tarefas.slice(0, 5).forEach((t) => {
        const c = t.contato
        tc.appendChild(el('div', { style: { marginBottom: '5px' } },
          el('div', { style: { fontSize: '11px', fontWeight: '600' } },
            FEIRAO.primeiroNome(c.nome) || FEIRAO.formatarTelefoneBR(c.telefone)),
          el('div', { style: { fontSize: '10px', color: '#92400e' } }, t.rotulo),
          el('div', { class: 'fp-row', style: { marginTop: '3px' } },
            el('button', {
              class: 'fp-ghost', style: { fontSize: '10px', padding: '5px' },
              onclick: async () => {
                if (t.playbook) {
                  if (!(await liberadoParaAbrir())) { render(); return }
                  const txt = FEIRAO.montarResposta(c, config, t.playbook)
                  await setUi({ contatoAtual: c, textoAtual: txt, aguardandoDesfecho: true, abertoEm: Date.now() })
                  if (t.tipo === 'lembrete') await FEIRAO.marcarLembreteEnviado(c.id)
                  const r = await irParaConversa(c, txt, config)
                  if (!r.recarregou) render()
                } else {
                  const r = await irParaConversa(c, '', config)
                  if (!r.recarregou) render()
                }
              },
            }, t.playbook ? 'Abrir com o texto' : 'Abrir conversa'),
            el('button', {
              class: 'fp-ghost', style: { fontSize: '10px', padding: '5px' },
              onclick: async () => {
                if (t.tipo === 'lembrete') await FEIRAO.marcarLembreteEnviado(c.id)
                else if (t.tipo === 'noshow') await FEIRAO.marcarContato(c.id, 'faltou')
                else if (t.tipo === 'retomar') await FEIRAO.marcarContato(c.id, 'concluido')
                render()
              },
            }, 'Já resolvi'))))
      })
      if (tarefas.length > 5) tc.appendChild(el('div', { class: 'fp-hint' }, `e mais ${tarefas.length - 5}.`))
      body.appendChild(tc)
    }

    if (!fila.length) {
      body.appendChild(el('div', { class: 'fp-alert info' },
        'Fila vazia. Abra a tela de campanha na extensão, importe os clientes e volte aqui.'))
      body.appendChild(el('button', {
        class: 'fp-btn fp-primary',
        onclick: () => mandar({ type: 'abrirCampanha' }),
      }, 'Abrir tela de campanha'))
      return
    }

    if (state.freio) {
      body.appendChild(el('div', { class: 'fp-alert stop' },
        el('b', {}, 'Freio automático ligado. '),
        'Nos últimos contatos a taxa de "não quero"/bloqueio passou de ',
        String(config.alertaRejeicaoPct), '%. Isso é o sinal que antecede bloqueio em massa. ',
        'Revise o texto e a segmentação antes de soltar de novo.'))
      body.appendChild(el('button', {
        class: 'fp-ghost', style: { width: '100%' },
        onclick: async () => { await FEIRAO.liberarFreio(); render() },
      }, 'Já revisei — liberar campanha'))
      return
    }

    const permissao = await FEIRAO.podeChamarAgora()

    // aguardando você confirmar o desfecho do contato anterior
    if (ui.aguardandoDesfecho && ui.contatoAtual) {
      renderDesfecho(body, ui)
      return
    }

    let noEspera = null
    if (!permissao.liberado) {
      const grave = /FREIO|Teto do dia|Domingo/.test(permissao.motivo)
      noEspera = permissao.esperaMs > 0
        ? el('div', { style: { marginTop: '4px', fontWeight: '700' } }, `Libera em ${fmtEspera(permissao.esperaMs)}`)
        : null
      body.appendChild(el('div', { class: `fp-alert ${grave ? 'warn' : 'info'}` },
        permissao.motivo, noEspera || ''))
      // continua mostrando quem é o próximo, só sem liberar o botão
    }

    const prox = await FEIRAO.proximoContato()
    if (!prox.contato) {
      body.appendChild(el('div', { class: 'fp-alert info' },
        'Ninguém elegível agora. Ou a fila acabou, ou os follow-ups ainda não venceram o prazo de ',
        String(config.followUpDias), ' dias.'))
      rodapeDeteccao(body, config)
      return
    }

    const texto = FEIRAO.montarMensagem(prox.contato, config, prox.variante)
    atual = { contato: prox.contato, variante: prox.variante, texto }

    const c = prox.contato
    body.appendChild(el('div', { class: 'fp-card' },
      el('div', { class: 'fp-nome' }, c.nome || FEIRAO.formatarTelefoneBR(c.telefone),
        prox.variante === 'followup' ? el('span', { class: 'fp-tag' }, '2º toque') : ''),
      el('div', { class: 'fp-meta' },
        FEIRAO.formatarTelefoneBR(c.telefone),
        c.veiculo ? el('div', {}, `${c.veiculo}${c.ano ? ' · ' + c.ano : ''}${c.placa ? ' · ' + c.placa : ''}`) : '',
        c.dataCompra ? el('div', {}, `Comprou em ${FEIRAO.mesAno(c.dataCompra)} (${FEIRAO.tempoDePosse(c.dataCompra)})`) : '',
        c.vendedor ? el('div', {}, `Vendedor: ${c.vendedor}`) : '',
      ),
    ))

    // Trava contra colunas invertidas na importação: chamar o cliente pelo nome
    // do carro é o erro mais caro que essa ferramenta pode cometer.
    // Nome que veio quebrado do import não pode virar mensagem: o cliente
    // recebe "Oi, Fernando,souza,easycar,............importado!" e a conversa
    // morre ali. É trava, não aviso.
    const nomeRuim = FEIRAO.nomeSuspeito ? FEIRAO.nomeSuspeito(c.nome) : ''
    if (nomeRuim) {
      body.appendChild(el('div', { class: 'fp-alert stop' },
        el('b', {}, 'O nome deste contato está quebrado. '),
        `O cadastro ${nomeRuim}: ${JSON.stringify(String(c.nome || '').slice(0, 60))}. `,
        'A mensagem chamaria o cliente por esse texto. Corrija na tela de campanha antes de enviar.',
        el('button', {
          class: 'fp-ghost', style: { width: '100%', marginTop: '7px' },
          onclick: () => mandar({ type: 'abrirCampanha', hash: 'fila' }),
        }, 'Abrir a fila para corrigir')))
    }

    const trocado = FEIRAO.pareceTrocado(c.nome, c.veiculo)
    if (trocado) {
      body.appendChild(el('div', { class: 'fp-alert stop' },
        el('b', {}, 'Este cadastro parece invertido. '),
        `A mensagem chamaria o cliente de "${FEIRAO.primeiroNome(c.nome)}" e trataria "${c.veiculo}" como o carro dele. `,
        el('button', {
          class: 'fp-ghost', style: { width: '100%', marginTop: '7px' },
          onclick: async () => {
            const fila = await FEIRAO.getQueue()
            const alvo = fila.find((x) => x.id === c.id)
            if (alvo) { const t = alvo.nome; alvo.nome = alvo.veiculo; alvo.veiculo = t; await FEIRAO.saveQueue(fila) }
            render()
          },
        }, 'Trocar nome ↔ veículo neste cliente'),
        el('div', { style: { fontSize: '10px', marginTop: '5px' } },
          'Se a fila inteira veio assim, use "Corrigir nome ↔ veículo" na aba Fila da tela de campanha.')))
    }

    const ta = el('textarea', { id: 'feirao-texto' })
    ta.value = texto
    const chars = el('div', { class: 'fp-chars' })
    const alerta = el('div', {})

    const btn = el('button', { class: 'fp-btn fp-primary' }, 'Abrir conversa com o texto pronto')

    function revalidar() {
      const t = ta.value
      chars.textContent = `${t.length} caracteres`
      const probs = FEIRAO.auditarMensagem(t)
      const promessa = probs.some((p) => p.startsWith('PROMESSA COMERCIAL'))
      alerta.innerHTML = ''
      if (probs.length) {
        alerta.appendChild(el('div', { class: promessa ? 'fp-alert stop' : 'fp-alert warn' },
          el('b', {}, promessa ? 'Bloqueado pela política comercial:' : 'Revise antes de mandar:'),
          el('ul', { style: { margin: '4px 0 0', paddingLeft: '16px' } }, probs.map((p) => el('li', {}, p)))))
      }
      btn.disabled = !permissao.liberado || trocado || !!nomeRuim || promessa || probs.some((p) => p.includes('Sobrou campo'))
      btn.textContent = promessa
        ? 'Promessa comercial — reescreva antes de enviar'
        : nomeRuim
        ? 'Nome quebrado — corrija o cadastro antes de enviar'
        : trocado
        ? 'Corrija o cadastro antes de enviar'
        : permissao.liberado
        ? 'Abrir conversa com o texto pronto'
        : (permissao.esperaMs > 0 ? `Aguarde ${fmtEspera(permissao.esperaMs)}` : 'Fora da janela de envio')
    }
    ta.addEventListener('input', revalidar)

    body.appendChild(ta)
    body.appendChild(chars)
    body.appendChild(alerta)

    // Se a última abertura teve que recarregar a página, diga por quê — senão a
    // lentidão volta a ser um mistério.
    const uiAgora = await getUi()
    // Só vale falar de uma recarga recente: um aviso de ontem não descreve mais
    // a tela de hoje.
    const recargaRecente = uiAgora.motivoRecarga
      && (Date.now() - (uiAgora.motivoRecargaEm || 0)) < 15 * 60000
    if (recargaRecente && config.abrirSemRecarregar !== false) {
      const porAgenda = !!uiAgora.recargaPorAgenda
      body.appendChild(el('div', { class: 'fp-alert warn' },
        el('b', {}, 'A última conversa precisou recarregar a página. '),
        `Motivo: ${uiAgora.motivoRecarga}. `,
        porAgenda
          ? el('span', {},
            el('b', {}, 'Como acabar com as recargas: '),
            'grave a fila inteira no Google Contatos. Cliente salvo na agenda o WhatsApp acha na busca, '
            + 'e aí a conversa abre sem recarregar nada. Sem estar salvo, a primeira conversa só abre '
            + 'pelo link oficial — não é defeito da extensão, é limite do WhatsApp Web.',
            el('button', {
              class: 'fp-ghost', style: { width: '100%', marginTop: '7px' },
              onclick: () => mandar({ type: 'abrirCampanha', hash: 'fila/todos' }),
            }, 'Abrir a tela de campanha e gravar a fila no Google'))
          : 'A abertura rápida tenta de novo no próximo cliente — recarregar não quebra nada, só demora. '
            + 'Se acontecer sempre, copie o diagnóstico e me mande.',
        el('div', { class: 'fp-row', style: { marginTop: '7px' } },
          botaoDiagnostico(),
          el('button', {
            class: 'fp-ghost',
            onclick: async () => { await setUi({ motivoRecarga: '' }); render() },
          }, 'Dispensar'))))
    }

    let abrindo = false
    async function abrirConversa() {
      const t = ta.value.trim()
      if (!t || abrindo) return
      abrindo = true
      if (!(await liberadoParaAbrir())) { abrindo = false; render(); return }
      await setUi({
        contatoAtual: c, textoAtual: t, variante: prox.variante, aguardandoDesfecho: true, abertoEm: Date.now(),
      })
      btn.textContent = 'Abrindo a conversa...'
      const r = await irParaConversa(c, t, config)
      // Sem recarregar, a página continua viva: o painel precisa se redesenhar
      // para mostrar o passo "Enviei ✓". Com recarga, o render vem do boot.
      if (!r.recarregou) render()
    }
    btn.addEventListener('click', abrirConversa)
    body.appendChild(btn)

    // -------------------------------------------------------------------------
    // Abertura automática: quando o cronômetro zera, o painel abre a conversa
    // sozinho com o texto pronto. O ENVIO continua sendo seu — é o Enter que a
    // Meta lê como comportamento humano, e é ele que não pode ser automatizado.
    // -------------------------------------------------------------------------
    if (config.autoAbrir && permissao.liberado && !btn.disabled) {
      const segundos = Math.max(2, Number(config.autoAbrirSegundos) || 4)
      const aviso = el('div', { class: 'fp-alert info', style: { marginTop: '8px' } })
      const cancelar = el('button', { class: 'fp-ghost', style: { width: '100%', marginTop: '6px' } }, 'Segurar — eu abro na mão')
      body.appendChild(aviso); body.appendChild(cancelar)

      let resta = segundos, parado = false
      const pinta = () => { aviso.innerHTML = ''; aviso.appendChild(el('b', {}, `Abrindo a conversa em ${resta}s`)) }
      pinta()
      const conta = setInterval(async () => {
        if (parado) return
        // Se você estiver digitando, não interrompo.
        //
        // Antes bastava um campo estar FOCADO para o contador travar. Só que o
        // WhatsApp mantém o foco no campo de mensagem o tempo todo que existe
        // uma conversa aberta — ou seja, sempre, depois do primeiro cliente.
        // O contador ficava "Pausado — você está digitando" para sempre e a
        // abertura automática nunca disparava. Agora o que conta é TECLA
        // DIGITADA de verdade, nos últimos segundos.
        if (digitandoAgora()) {
          aviso.innerHTML = ''
          aviso.appendChild(el('b', {}, 'Pausado — você está digitando. Termine que eu retomo.'))
          return
        }
        resta -= 1
        if (resta > 0) { pinta(); return }
        clearInterval(conta)
        await abrirConversa()
      }, 1000)
      cancelar.addEventListener('click', () => {
        parado = true; clearInterval(conta)
        aviso.innerHTML = ''
        aviso.appendChild(el('span', {}, 'Abertura automática pausada para este cliente.'))
        cancelar.remove()
      })
      autoTimers.push(conta)
    }

    body.appendChild(el('div', { class: 'fp-row' },
      el('button', {
        class: 'fp-ghost',
        onclick: async () => { await FEIRAO.marcarContato(c.id, 'pulado'); render() },
      }, 'Pular por enquanto'),
      el('button', {
        class: 'fp-ghost fp-danger',
        onclick: async () => { await FEIRAO.marcarContato(c.id, 'optout', { motivo: 'removido manualmente' }); render() },
      }, 'Nunca contatar'),
    ))

    body.appendChild(el('div', { class: 'fp-hint' },
      'O painel abre a conversa com o texto já escrito no campo de digitação. ',
      el('b', {}, 'Você lê, ajusta se quiser e aperta Enter. '),
      'A extensão nunca aperta o Enter por você — automatizar o envio dentro do WhatsApp Web '
      + 'viola os Termos Comerciais e é detectado no servidor da Meta, não no navegador.'))

    rodapeDeteccao(body, config)

    revalidar()

    // Cronômetro silencioso: atualiza só o texto do aviso e o rótulo do botão.
    // Nada de redesenhar o painel a cada segundo.
    pararCronometro()
    if (permissao.esperaMs > 0) {
      iniciarCronometro([
        { no: noEspera, molde: (t) => `Libera em ${t}` },
        { no: btn, molde: (t) => `Aguarde ${t}` },
      ], permissao.esperaMs, () => render())
    }
  }

  /**
   * Baixa um .vcf pelo service worker. O content script roda dentro do
   * web.whatsapp.com, cuja CSP bloqueia download por blob: — por isso o
   * arquivo é gerado aqui e entregue ao background, que usa chrome.downloads.
   */
  function baixarVcf(conteudo, nome) {
    return new Promise((resolve) => {
      try {
        mandar({ type: 'baixarVcf', conteudo, nome }).then((r) => resolve(r || { ok: false }))
      } catch (e) { resolve({ ok: false, erro: String(e) }) }
    })
  }

  /**
   * Gravação automática na agenda. Roda depois de cada desfecho e a cada
   * varredura: quando junta o lote ou vence o tempo, baixa um .vcf só com todos
   * os novos. Você continua tendo que importar no Google Contatos uma vez —
   * extensão de navegador não escreve na agenda do telefone.
   */
  const mandar = (msg) => comChrome(() => new Promise((r) => {
    try {
      chrome.runtime.sendMessage(msg, (x) => {
        // lastError precisa ser LIDO, senão o Chrome imprime o erro sozinho
        const err = chrome.runtime.lastError
        if (err && /context invalidated|Extension context/i.test(err.message || '')) marcarContextoMorto()
        r(x || {})
      })
    } catch (e) { r({}) }
  }), {})

  async function gravarAgendaSePreciso() {
    try {
      const d = await FEIRAO.deveGravarAgenda()
      if (!d.gravar) return null

      // Caminho preferido: escrever direto na conta do Google. `chrome.identity`
      // não existe em content script, então quem faz é o service worker.
      const g = await mandar({ type: 'googleGravar' })
      if (g && g.ok && g.criados) return { via: 'google', total: g.criados }
      if (g && g.ok && g.nada) return null
      // Se o Google não está conectado (ou falhou), cai para o arquivo .vcf.

      const config = await FEIRAO.getConfig()
      const { conteudo, total } = FEIRAO.montarVcf(d.pendentes, config)
      if (!total) return null
      const arq = FEIRAO.nomeArquivoVcf(config, 'auto')
      const r = await baixarVcf(conteudo, arq)
      if (!r || !r.ok) return null
      await FEIRAO.registrarGravacaoAgenda(d.pendentes.map((c) => c.id))
      return { via: 'vcf', total, arquivo: arq }
    } catch (e) { return null }   // agenda nunca pode derrubar a campanha
  }

  async function salvarContatoAgora(c, config, botao) {
    // Caminho preferido: Google, porque é o único que chega de fato na agenda.
    // ids: só este cliente — o botão é individual, não deve arrastar a fila toda.
    const g = await mandar({ type: 'googleGravar', ids: [c.id], todos: true })
    if (g && g.ok && g.criados) {
      if (botao) botao.textContent = 'gravado no Google ✓'
      return true
    }

    const { conteudo, total } = FEIRAO.montarVcf([c], config)
    if (!total) { if (botao) botao.textContent = 'sem celular válido'; return false }
    const arq = FEIRAO.nomeArquivoVcf(config, FEIRAO.primeiroNome(c.nome).toLowerCase().replace(/\W+/g, ''))
    const r = await baixarVcf(conteudo, arq)
    if (r && r.ok) await FEIRAO.marcarContatosSalvos([c.id])
    // O rótulo diz o que REALMENTE aconteceu: o arquivo baixou, e a importação
    // ainda é sua. Dizer "gravado" aqui seria mentira.
    if (botao) botao.textContent = r && r.ok ? 'baixado — falta importar no Google' : 'falhou — use a tela de campanha'
    return !!(r && r.ok)
  }

  function renderDesfecho(body, ui) {
    const c = ui.contatoAtual

    // Conferência de segurança: a conversa que está aberta na tela é mesmo a
    // deste cliente? Depois de uma recarga o painel renasce sem memória, e
    // escrever/enviar na conversa errada é o erro que não se desfaz.
    const digitos = soDigitos(FEIRAO.normalizarTelefone(c.telefone).e164 || c.telefone)
    const tituloAberto = tituloDaConversaAberta()
    const confere = tituloAberto
      ? mesmoContato(tituloAberto, digitos, FEIRAO.nomeContato(c, {}), c.nome || '')
      : null

    if (confere === false) {
      body.appendChild(el('div', { class: 'fp-alert stop' },
        el('b', {}, 'NÃO ENVIE. '),
        `A conversa aberta na tela é ${JSON.stringify(tituloAberto)}, e este cliente é `,
        el('b', {}, `${c.nome || ''} (${FEIRAO.formatarTelefoneBR(c.telefone)})`),
        '. Se você enviar agora, a mensagem vai para a pessoa errada. ',
        'Abra a conversa de novo pelo botão abaixo — ou feche este cliente em "Não enviei — voltar".'))
    }

    body.appendChild(el('div', { class: confere === false ? 'fp-alert warn' : 'fp-alert info' },
      'Conversa aberta com ', el('b', {}, FEIRAO.primeiroNome(c.nome) || FEIRAO.formatarTelefoneBR(c.telefone)),
      '. Confira o texto na tela do WhatsApp, ajuste se precisar e envie. Depois me diga o que aconteceu:'))

    body.appendChild(el('button', {
      class: 'fp-btn fp-primary',
      onclick: async () => {
        await FEIRAO.registrarEnvio(c, ui.variante, ui.textoAtual)
        await FEIRAO.marcarContato(c.id, 'enviado', {
          varianteUsada: ui.variante,
          // guarda o começo do que foi enviado: se a prévia da conversa for o
          // eco disto, a última mensagem é nossa, não uma resposta
          ultimoTextoEnviado: String(ui.textoAtual || '').slice(0, 80),
        })
        const cfg = await FEIRAO.getConfig()
        if (cfg.salvarContatoAuto === 'imediato' && !c.contatoSalvo) await salvarContatoAgora(c, cfg)
        else await gravarAgendaSePreciso()
        await setUi({ aguardandoDesfecho: false, contatoAtual: null, textoAtual: '' })
        render()
      },
    }, 'Enviei ✓'))

    body.appendChild(el('div', { class: 'fp-row' },
      el('button', {
        class: 'fp-ghost',
        onclick: async () => {
          await FEIRAO.marcarContato(c.id, 'sem_whatsapp')
          await setUi({ aguardandoDesfecho: false, contatoAtual: null })
          render()
        },
      }, 'Número sem WhatsApp'),
      el('button', {
        class: 'fp-ghost',
        onclick: async () => {
          await setUi({ aguardandoDesfecho: false, contatoAtual: null })
          render()
        },
      }, 'Não enviei — voltar'),
    ))

    body.appendChild(el('div', { class: 'fp-row' },
      el('button', {
        class: 'fp-ghost fp-danger',
        onclick: async () => {
          await FEIRAO.marcarContato(c.id, 'optout', { motivo: 'pediu para não receber' })
          await setUi({ aguardandoDesfecho: false, contatoAtual: null })
          render()
        },
      }, 'Pediu para não receber'),
      el('button', {
        class: 'fp-ghost',
        onclick: async () => {
          await FEIRAO.registrarEnvio(c, ui.variante, ui.textoAtual)
          await FEIRAO.marcarContato(c.id, 'respondeu', {
            varianteUsada: ui.variante, toques: (c.toques || 0) + 1,
            ultimoTextoEnviado: String(ui.textoAtual || '').slice(0, 80),
          })
          await setUi({ aguardandoDesfecho: false, contatoAtual: null })
          render()
        },
      }, 'Respondeu — vou atender'),
    ))

    // O desfecho que realmente conta.
    body.appendChild(el('button', {
      class: 'fp-btn fp-primary', style: { marginTop: '8px', background: '#1e3a8a' },
      onclick: () => formAgendamento(body, c, ui),
    }, 'Agendou ★'))

    // --- gravar na agenda ----------------------------------------------------
    //
    // HONESTIDADE AQUI IMPORTA: "gravado" só pode significar "chegou na agenda".
    // A versão anterior dizia "contato já gravado ✓" assim que o arquivo .vcf
    // era BAIXADO — mas um .vcf parado na pasta Downloads não está na agenda de
    // ninguém. O painel afirmava uma coisa que não tinha acontecido.
    Promise.all([FEIRAO.getConfig(), mandar({ type: 'googleStatus' })]).then(([config, g]) => {
      const nome = FEIRAO.nomeContato(c, config)
      if (!nome) return

      const noGoogle = !!c.googleResourceName
      const soArquivo = !noGoogle && !!c.contatoSalvo

      const btnSalvar = el('button', {
        class: 'fp-ghost',
        style: { width: '100%', marginTop: '8px', ...(soArquivo ? { borderColor: '#fde68a', background: '#fffbeb' } : {}) },
      }, noGoogle ? 'no Google Contatos ✓'
        : soArquivo ? 'só no arquivo .vcf — falta importar'
        : (g && g.conectado ? 'Gravar no Google Contatos' : 'Salvar contato (.vcf)'))
      btnSalvar.addEventListener('click', () => salvarContatoAgora(c, config, btnSalvar))
      body.appendChild(btnSalvar)

      const dica = el('div', { class: 'fp-hint' }, 'Vai ser gravado como ', el('b', {}, nome), '. ')

      if (g && g.conectado) {
        dica.appendChild(el('span', {}, 'Google conectado — vai direto para a conta. '))
      } else {
        dica.appendChild(el('span', { style: { color: '#92400e' } },
          'Google NÃO conectado: sai em arquivo .vcf, e o arquivo só vira contato depois que VOCÊ importa no Google Contatos. '))
      }
      if (config.salvarContatoAuto === 'nao') {
        dica.appendChild(el('b', { style: { color: '#92400e' } }, 'A gravação automática está desligada. '))
      }
      dica.appendChild(el('a', {
        href: '#',
        style: { color: '#1e40af', fontWeight: '700', textDecoration: 'underline', cursor: 'pointer' },
        onclick: (e) => {
          e.preventDefault()
          chrome.runtime.sendMessage({ type: 'abrirCampanha', hash: 'fila/todos' })
        },
      }, 'abrir a tela de agenda'))
      body.appendChild(dica)
    })

    body.appendChild(el('div', { class: 'fp-hint' },
      'Marcar o desfecho não é burocracia: é o que alimenta o cooldown, o freio automático e a trilha de opt-out exigida pela LGPD.'))
  }

  // ===========================================================================
  // LEITOR DA LISTA DE CONVERSAS
  //
  // Lê o que já está desenhado na tela: título da conversa, prévia da última
  // mensagem e o badge de não lidas. Nada é enviado, nada é clicado, nada sai
  // do navegador. O DOM do WhatsApp Web muda sem aviso, então tudo aqui usa
  // vários seletores em cascata e falha em silêncio — se parar de funcionar,
  // o painel avisa em vez de fingir que está tudo bem.
  // ===========================================================================

  const SEL_PAINEL = ['#pane-side', 'div[aria-label="Lista de conversas"]',
    'div[aria-label="Chat list"]', 'div[data-testid="chat-list"]']
  const SEL_LINHA = ['div[role="listitem"]', 'div[data-testid="cell-frame-container"]']

  // ---------------------------------------------------------------------------
  // ACHAR A LISTA DE CONVERSAS — em três camadas.
  //
  // Depender de `#pane-side` foi ingenuidade minha: o WhatsApp Web troca ids,
  // aria-labels e data-testids sem avisar, e quando trocou o painel passou a
  // dizer "não consegui ler a lista de conversas". Agora, se os nomes conhecidos
  // falharem, a lista é encontrada pela ESTRUTURA — que muda muito menos:
  //
  //   1. seletores conhecidos (rápido, e o que vale em 99% dos dias);
  //   2. as próprias linhas, por papel de acessibilidade + geometria: a lista
  //      fica na faixa esquerda da tela e cada linha tem um nome;
  //   3. o container rolável da esquerda, pegando os filhos que parecem linha.
  //
  // Cada camada é conferida antes de valer: precisa de pelo menos duas linhas
  // com título. Continua valendo a regra de sempre — na dúvida, o painel diz
  // que não conseguiu ler, em vez de inventar dados.
  // ---------------------------------------------------------------------------
  const SEL_LINHA_EXTRA = [
    '[role="listitem"]', '[role="row"]', '[data-testid="cell-frame-container"]',
    '[data-testid^="list-item"]',
  ]

  /** O nome/telefone que aparece na linha, com alternativas se o title sumir. */
  function tituloDaLinha(li) {
    const sp = li.querySelector('span[title]')
    if (sp) return String(sp.getAttribute('title') || sp.textContent || '').trim()
    // sem span[title]: o nome costuma ser o primeiro texto em negrito/dir=auto
    const alt = li.querySelector('span[dir="auto"], span[dir="ltr"]')
    return alt ? String(alt.textContent || '').trim() : ''
  }

  const ehDoNossoPainel = (n) => !!(n && n.closest && n.closest('#feirao-panel, #feirao-fab'))

  function pareceLinhaDeConversa(li, largura) {
    if (ehDoNossoPainel(li)) return false
    if (!tituloDaLinha(li)) return false
    const r = li.getBoundingClientRect()
    if (!r.width || !r.height) return false          // invisível não conta
    if (r.height > 200) return false                 // é container, não linha
    // A lista fica na coluna da esquerda; o histórico da conversa, à direita.
    return r.left < largura * 0.55 && r.width < largura * 0.62
  }

  /** Camada 2 — acha as linhas soltas e devolve o pai que as agrupa. */
  function descobrirPelaEstrutura() {
    const largura = window.innerWidth || 1280
    const brutas = []
    SEL_LINHA_EXTRA.forEach((sel) => {
      document.querySelectorAll(sel).forEach((n) => { if (brutas.indexOf(n) < 0) brutas.push(n) })
    })
    const linhas = brutas.filter((li) => pareceLinhaDeConversa(li, largura))
    if (linhas.length < 2) return null

    // O pai mais frequente dessas linhas é a lista.
    const contagem = new Map()
    linhas.forEach((li) => {
      const pai = li.parentElement
      if (!pai) return
      contagem.set(pai, (contagem.get(pai) || 0) + 1)
    })
    let melhor = null, maior = 0
    contagem.forEach((n, pai) => { if (n > maior) { maior = n; melhor = pai } })
    return maior >= 2 ? melhor : null
  }

  /** Camada 3 — o container rolável da esquerda. */
  function descobrirPeloScroll() {
    const largura = window.innerWidth || 1280
    const candidatos = [...document.querySelectorAll('div')].filter((d) => {
      const r = d.getBoundingClientRect()
      if (r.left > largura * 0.45 || r.width > largura * 0.62 || r.height < 200) return false
      return d.scrollHeight > d.clientHeight + 40 && d.children.length >= 3
    })
    if (!candidatos.length) return null
    // o mais "alto" em conteúdo é a lista de conversas
    candidatos.sort((a, b) => b.scrollHeight - a.scrollHeight)
    return candidatos[0]
  }

  let painelMemorizado = null
  function acharPainelLista() {
    // memória curta: se o que funcionou ainda está na tela, reaproveita
    if (painelMemorizado && painelMemorizado.isConnected) return painelMemorizado

    for (const s of SEL_PAINEL) {
      const n = document.querySelector(s)
      if (n) { painelMemorizado = n; return n }
    }
    // 1.5 — por rótulo de acessibilidade, em qualquer idioma. O texto muda
    // ("Lista de conversas", "Chat list", "Lista de chats"), o sentido não.
    const porRotulo = [...document.querySelectorAll('[aria-label], [role="grid"]')]
      .find((n) => /convers|chat/i.test(n.getAttribute('aria-label') || '')
        && n.querySelectorAll('span[title]').length >= 2)
    if (porRotulo) { painelMemorizado = porRotulo; return porRotulo }

    const porEstrutura = descobrirPelaEstrutura()
    if (porEstrutura) { painelMemorizado = porEstrutura; return porEstrutura }
    const porScroll = descobrirPeloScroll()
    if (porScroll) { painelMemorizado = porScroll; return porScroll }
    return null
  }

  /** As linhas de conversa, com a mesma cascata de camadas. */
  function linhasDoPainel(painel) {
    if (!painel) return []
    for (const s of SEL_LINHA) {
      const a = painel.querySelectorAll(s)
      if (a.length) return [...a]
    }
    const largura = window.innerWidth || 1280
    for (const s of SEL_LINHA_EXTRA) {
      const a = [...painel.querySelectorAll(s)].filter((li) => pareceLinhaDeConversa(li, largura))
      if (a.length) return a
    }
    // último recurso: filhos diretos que tenham um nome dentro
    return [...painel.children].filter((li) => pareceLinhaDeConversa(li, largura))
  }

  /**
   * Relatório da estrutura da tela, para quando nada funcionar. Não sai do
   * navegador: é você quem copia e me manda.
   */
  const versaoDaExtensao = () => {
    try { return chrome.runtime.getManifest().version } catch (e) { return '?' }
  }

  function diagnosticoDaTela() {
    const largura = window.innerWidth || 1280
    const conta = (sel) => { try { return document.querySelectorAll(sel).length } catch (e) { return -1 } }
    const desc = (n) => (n ? (n.tagName + (n.id ? '#' + n.id : '') + ' ' + (rotuloDe(n) || '').slice(0, 120)) : 'NENHUM')
    const painel = acharPainelLista()
    const linhas = linhasDoPainel(painel)
    return [
      'DIAGNÓSTICO DA TELA DO WHATSAPP WEB',
      `extensão: v${versaoDaExtensao()}`,
      `url: ${location.href}`,
      `janela: ${largura}x${window.innerHeight}`,
      'seletores conhecidos: ' + SEL_PAINEL.map((s) => `${s}=${conta(s)}`).join(' | '),
      'linhas conhecidas: ' + SEL_LINHA.map((s) => `${s}=${conta(s)}`).join(' | '),
      'linhas alternativas: ' + SEL_LINHA_EXTRA.map((s) => `${s}=${conta(s)}`).join(' | '),
      `busca conhecida: ${SEL_BUSCA.map((s) => `${s}=${conta(s)}`).join(' | ')}`,
      `mensagem conhecida: ${SEL_COMPOR.map((s) => `${s}=${conta(s)}`).join(' | ')}`,
      `painel encontrado: ${painel ? (painel.id || painel.className || painel.tagName) : 'NENHUM'}`,
      `linhas encontradas: ${linhas.length}`,
      'primeiros títulos: ' + linhas.slice(0, 3).map((l) => JSON.stringify(tituloDaLinha(l))).join(', '),
      `busca por descoberta: ${desc(acharBusca())}`,
      `campo de mensagem por descoberta: ${desc(acharCompor())}`,
      `cabeçalho por descoberta: ${desc(acharCabecalho())}`,
      `conversa aberta: ${JSON.stringify(tituloDaConversaAberta())}`,
      'campos editáveis na tela: ' + camposEditaveis().map((n) => {
        const r = n.getBoundingClientRect()
        return `[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`
          + ' <' + n.tagName + '>'
          + (rotuloDe(n) ? ' "' + rotuloDe(n).slice(0, 120) + '"' : '')
      }).join(' '),
    ].join('\n')
  }

  // ===========================================================================
  // ABRIR A CONVERSA SEM RECARREGAR A PÁGINA
  //
  // O caminho antigo era `location.href = wa.me/send?phone=...`. Funciona, é o
  // link oficial — e recarrega o WhatsApp Web inteiro a cada cliente. Com 150
  // clientes na fila isso vira minutos de tela branca.
  //
  // Aqui a conversa é aberta DENTRO da página que já está carregada: acha a
  // conversa na lista (ou pesquisa o número), clica nela e escreve o texto no
  // campo de mensagem. O ENVIO continua sendo seu — nada aperta Enter.
  //
  // Regra de ouro: escrever no campo de mensagem da conversa ERRADA seria pior
  // do que qualquer lentidão. Por isso o texto só é digitado depois de conferir
  // o cabeçalho da conversa aberta. Qualquer dúvida, a função desiste e devolve
  // o controle para o link oficial, que recarrega mas nunca erra de contato.
  // ===========================================================================
  // A busca virou um <input> de verdade (era um div contenteditable). Foi por
  // isso que "não consegui escrever na busca": o caminho de digitação era o de
  // contenteditable, que não funciona em input. Os dois casos são tratados.
  const SEL_BUSCA = [
    'input[aria-label="Pesquisar ou começar uma nova conversa"]',
    'input[aria-label*="Pesquis"]:not([aria-label*="nome"])',
    'input[aria-label*="Pesquis"]',
    'input[aria-label*="Search"]',
    'input[placeholder*="Pesquis"]',
    'input[placeholder*="Search"]',
    '#side input[type="text"]',
    'div[contenteditable="true"][data-tab="3"]',
    '#side div[contenteditable="true"][role="textbox"]',
    'div[aria-label*="Pesquis"][contenteditable="true"]',
    'div[aria-label*="Search"][contenteditable="true"]',
    '[data-testid="chat-list-search"]',
  ]
  const SEL_COMPOR = [
    'footer div[contenteditable="true"][data-tab="10"]',
    '#main footer div[contenteditable="true"][role="textbox"]',
    '#main div[aria-label*="Digite uma mensagem"][contenteditable="true"]',
    '#main div[aria-label*="Type a message"][contenteditable="true"]',
    '[data-testid="conversation-compose-box-input"]',
  ]
  const SEL_CABECALHO = [
    'header span[title]', 
    'header [role="button"] span[dir="auto"]',
    '[data-testid="conversation-info-header-chat-title"]',
    '#main [data-testid="conversation-info-header"] span[title]',
    '#main span[title]'
  ]
  const soDigitos = (v) => String(v || '').replace(/\D+/g, '')
  const semAcento = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()

  function primeiroQue(lista) {
    for (const sel of lista) {
      let n = null
      try { n = document.querySelector(sel) } catch (e) { n = null }
      if (n) return n
    }
    return null
  }

  /** Todos os campos de digitação da página (o WhatsApp usa div, não input). */
  function camposEditaveis() {
    return [...document.querySelectorAll(
      '[contenteditable="true"], [role="textbox"], input[type="text"], input:not([type]), textarea')]
      // O nosso próprio painel também tem caixa de texto, e fica na direita
      // embaixo — exatamente onde a descoberta por posição procura o campo de
      // mensagem. Sem esta linha, um dia a extensão escreveria em si mesma.
      .filter((n) => !ehDoNossoPainel(n))
      .filter((n) => { const r = n.getBoundingClientRect(); return r.width > 40 && r.height > 10 })
  }

  const rotuloDe = (n) => String(n.getAttribute('aria-label') || n.getAttribute('data-placeholder')
    || n.getAttribute('placeholder') || n.getAttribute('title') || '')

  /**
   * O campo de busca — por nome conhecido, por rótulo (em qualquer idioma) ou,
   * em último caso, por posição: é o campo de digitação da coluna ESQUERDA, no
   * alto da tela. Mesma lógica de camadas da lista de conversas: quando o
   * WhatsApp renomeia as coisas, a geometria continua a mesma.
   */
  function acharBusca() {
    const conhecido = primeiroQue(SEL_BUSCA)
    if (conhecido) return conhecido
    const campos = camposEditaveis()
    const porRotulo = campos.find((n) => /pesquis|search|buscar|busca/i.test(rotuloDe(n)))
    if (porRotulo) return porRotulo
    const largura = window.innerWidth || 1280
    return campos.find((n) => {
      const r = n.getBoundingClientRect()
      return r.left < largura * 0.45 && r.top < (window.innerHeight || 800) * 0.35
    }) || null
  }

  /** O campo de mensagem — coluna DIREITA, embaixo. */
  function acharCompor() {
    const conhecido = primeiroQue(SEL_COMPOR)
    if (conhecido) return conhecido
    const campos = camposEditaveis()
    const porRotulo = campos.find((n) => /digite uma mensagem|mensagem|type a message|message/i.test(rotuloDe(n)))
    if (porRotulo) return porRotulo
    const largura = window.innerWidth || 1280
    const altura = window.innerHeight || 800
    return campos.find((n) => {
      const r = n.getBoundingClientRect()
      return r.left > largura * 0.3 && r.top > altura * 0.55
    }) || null
  }
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
  async function esperarPor(fn, limiteMs = 6000, passo = 120) {
    const fim = Date.now() + limiteMs
    for (;;) {
      let v = null
      try { v = fn() } catch (e) { v = null }
      if (v) return v
      if (Date.now() > fim) return null
      await dormir(passo)
    }
  }

  /** Clique que o WhatsApp entende (a linha da lista ignora .click() puro). */
  function clicarDeVerdade(node) {
    const alvo = node.querySelector('[role="button"], span[title]') || node
    const op = { bubbles: true, cancelable: true, view: window, button: 0 }
    try { alvo.dispatchEvent(new PointerEvent('pointerdown', op)) } catch (e) { /* navegador antigo */ }
    alvo.dispatchEvent(new MouseEvent('mousedown', op))
    try { alvo.dispatchEvent(new PointerEvent('pointerup', op)) } catch (e) { /* idem */ }
    alvo.dispatchEvent(new MouseEvent('mouseup', op))
    alvo.dispatchEvent(new MouseEvent('click', op))
  }

  /**
   * Escreve num campo do WhatsApp (que é contenteditable, não input).
   * Substitui o conteúdo em vez de concatenar — senão um rascunho antigo
   * gruda na frente da mensagem.
   */
  /**
   * O campo tem MESMO o texto que eu quis escrever?
   *
   * Conferir só o tamanho era furado: o texto ANTERIOR, que ainda estava no
   * campo, passava na conta e eu concluía "já escreveu" sem ter escrito nada.
   * Agora o começo do texto tem que bater — o editor pode normalizar espaços,
   * então a comparação é frouxa no espaçamento e rígida no conteúdo.
   */
  function confere(escrito, querido) {
    const a = String(escrito || '').replace(/\s+/g, ' ').trim()
    const b = String(querido || '').replace(/\s+/g, ' ').trim()
    if (!b) return a === ''
    if (!a) return false
    const n = Math.min(24, b.length)
    return a.slice(0, n) === b.slice(0, n)
  }

  /** O que está escrito no campo, seja input ou contenteditable. */
  const textoDoCampo = (n) => ((n.tagName === 'INPUT' || n.tagName === 'TEXTAREA')
    ? String(n.value || '') : String(n.textContent || '')).replace(/\s+/g, ' ').trim()

  /**
   * Escreve num campo do WhatsApp e SÓ ENTÃO confirma que o texto entrou.
   *
   * Aqui estava o defeito que mandava tudo para a recarga: o campo de mensagem
   * é um editor React (Lexical). O execCommand insere o texto, mas o DOM só é
   * reconstruído no ciclo seguinte — ler `textContent` na mesma linha devolve
   * vazio. Eu concluía "não consegui escrever" e caía no link oficial, mesmo
   * com o texto JÁ no campo. É por isso que o campo aparecia alto (com texto)
   * nos seus diagnósticos e mesmo assim a página recarregava.
   *
   * Agora a confirmação espera o editor terminar de desenhar.
   */
  async function escreverEm(alvo, texto) {
    alvo.focus()

    if (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA') {
      // <input>: o valor precisa passar pelo setter nativo, senão o React não
      // percebe a mudança e a busca não filtra nada.
      try {
        const proto = alvo.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
        setter.call(alvo, texto)
      } catch (e) { alvo.value = texto }
      alvo.dispatchEvent(new Event('input', { bubbles: true }))
      alvo.dispatchEvent(new Event('change', { bubbles: true }))
      const querIn = String(texto || '').trim()
      if (!querIn) return String(alvo.value || '') === ''
      return confere(String(alvo.value || ''), querIn)
    }

    // --- campo de mensagem (contenteditable, editor Lexical) -----------------
    // Seleciona o que já existe para SUBSTITUIR — senão a mensagem gruda num
    // rascunho anterior.
    const selecionarTudo = () => {
      try {
        const sel = window.getSelection()
        const r = document.createRange()
        r.selectNodeContents(alvo)
        sel.removeAllRanges(); sel.addRange(r)
      } catch (e) { /* segue sem seleção */ }
    }
    selecionarTudo()

    const querido = String(texto || '').replace(/\s+/g, ' ').trim()
    if (!querido) {
      try { document.execCommand('insertText', false, '') } catch (e) { /* nada */ }
      await esperarPor(() => (textoDoCampo(alvo) === '' ? true : null), 600, 60)
      return true
    }
    const chegou = () => confere(textoDoCampo(alvo), querido)

    // MÉTODO 1 — colar.
    //
    // É assim que uma pessoa põe um texto de vários parágrafos no WhatsApp, e o
    // editor trata as quebras de linha do jeito certo. O insertText, sozinho,
    // ENGOLE as quebras e a mensagem sai num parágrafo só.
    try {
      const dt = new DataTransfer()
      dt.setData('text/plain', texto)
      alvo.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    } catch (e) { /* o método 2 assume */ }

    // CONFERIR ANTES DE TENTAR DE NOVO.
    //
    // Este await é o que conserta a mensagem duplicada: antes, o segundo método
    // rodava sempre que o primeiro "parecia" ter falhado — e o editor tinha
    // aceitado os dois. O texto saía duas vezes, com quebras diferentes em cada
    // cópia. Agora só existe segunda tentativa se a primeira não escreveu nada.
    if (await esperarPor(() => (chegou() ? true : null), 1200, 80)) return true

    // MÉTODO 2 — digitar, linha por linha.
    // A quebra de linha é um comando à parte; mandar "\n" dentro do texto não
    // funciona no editor do WhatsApp.
    selecionarTudo()
    try {
      const linhas = String(texto).split('\n')
      for (let i = 0; i < linhas.length; i++) {
        if (i) document.execCommand('insertLineBreak')
        if (linhas[i]) document.execCommand('insertText', false, linhas[i])
      }
    } catch (e) { /* a conferência abaixo decide */ }
    try {
      alvo.dispatchEvent(new InputEvent('input', { bubbles: true, data: texto, inputType: 'insertText' }))
    } catch (e) { alvo.dispatchEvent(new Event('input', { bubbles: true })) }

    return !!(await esperarPor(() => (chegou() ? true : null), 1500, 80))
  }

  // As linhas visíveis vêm do mesmo lugar que o leitor de respostas usa —
  // uma descoberta só, para os dois nunca divergirem.
  const linhasVisiveis = () => linhasDoPainel(acharPainelLista())

  /**
   * Dois títulos são o mesmo contato?
   * - por número: os 8 últimos dígitos batem (o WhatsApp formata de jeitos
   *   diferentes, e o 9 na frente do celular entra e sai);
   * - por nome: igual ao nome que a extensão gravou na agenda, ou contendo o
   *   primeiro E o último nome do cliente. Só o primeiro nome não vale — há
   *   muita "Ana" na lista.
   */
  function mesmoContato(titulo, digitos, nomeSalvo, nomeCliente) {
    const t = String(titulo || '').trim()
    if (!t) return false
    const dt = soDigitos(t)
    if (dt.length >= 8 && digitos.length >= 8 && dt.slice(-8) === digitos.slice(-8)) return true

    const nt = semAcento(t)
    if (nomeSalvo && nt === semAcento(nomeSalvo)) return true

    const partes = semAcento(nomeCliente).split(' ').filter((x) => x.length > 2)
    if (partes.length >= 2) {
      const primeiro = partes[0], ultimo = partes[partes.length - 1]
      if (nt.includes(primeiro) && nt.includes(ultimo)) return true
    }
    return false
  }

  function acharLinha(digitos, nomeSalvo, nomeCliente) {
    return linhasVisiveis().find((li) => mesmoContato(tituloDaLinha(li), digitos, nomeSalvo, nomeCliente)) || null
  }

  /** Depois de pesquisar, a lista fica filtrada — e o leitor de respostas leria
   *  só o resultado da busca. Limpar é obrigatório, não cosmético. */
  /**
   * Limpa a busca — SEM Escape.
   *
   * Aqui estava o defeito que jogava quase todo cliente para a recarga: eu
   * mandava Escape "para fechar a busca", e no WhatsApp Web o Escape FECHA A
   * CONVERSA ABERTA. Ou seja: eu abria a conversa certa e, na linha seguinte,
   * fechava ela sozinho. A conferência então via "nenhuma conversa aberta",
   * concluía que não conferia com o cliente e caía no link oficial.
   *
   * Medido no navegador: conversa aberta "Paulo Coutinho · Feirão 08/2026 ·
   * Ranger" → Escape → "(nenhuma)". Esvaziar o campo já desfaz o filtro da
   * lista; o Escape nunca foi necessário.
   */
  async function limparBusca(busca) {
    if (!busca) return
    try { await escreverEm(busca, '') } catch (e) { /* não trava o fluxo */ }
  }

  /** O cabeçalho da conversa aberta: nome conhecido ou o título no alto da direita. */
  function acharCabecalho() {
    const conhecido = primeiroQue(SEL_CABECALHO)
    if (conhecido) return conhecido
    const largura = window.innerWidth || 1280
    const candidatos = [...document.querySelectorAll(
      'header span[title], header span[dir="auto"], [role="button"] span[title], #main span[title], #main span[dir="auto"]')]
      .filter((n) => {
        const r = n.getBoundingClientRect()
        return r.width > 30 && r.left > largura * 0.3 && r.top < 160 && (n.textContent || '').trim()
      })
    if (!candidatos.length) return null
    // O cabeçalho tem mais de um texto: o nome do contato e selos como
    // "Conta comercial" ou "online". O nome é sempre o mais longo — e era o
    // selo que estava sendo escolhido.
    candidatos.sort((a, b) => (b.textContent || '').trim().length - (a.textContent || '').trim().length)
    return candidatos[0]
  }

  /**
   * Com quem é a conversa aberta agora.
   *
   * A fonte mais confiável não é o cabeçalho — é o rótulo do campo de mensagem:
   * "Digite uma mensagem para Priscila Santos · Feirão 08/2026 · Uno". Ele traz
   * o nome inteiro, vem do próprio WhatsApp e só existe quando há uma conversa
   * aberta. O cabeçalho fica como segunda opção.
   */
  function tituloDaConversaAberta() {
    const compor = acharCompor()
    const rot = compor ? rotuloDe(compor) : ''
    const m = rot.match(/(?:mensagem para|message to)\s+(.+)$/i)
    if (m && m[1].trim()) return m[1].trim()

    const h = acharCabecalho()
    if (!h) return ''
    return String(h.getAttribute('title') || h.textContent || '').trim()
  }

  /** A conversa aberta é mesmo a deste cliente? */
  function cabecalhoConfere(digitos, nomeSalvo, nomeCliente) {
    const titulo = tituloDaConversaAberta()
    if (!titulo) return false
    return mesmoContato(titulo, digitos, nomeSalvo, nomeCliente)
  }

  /**
   * Abre a conversa do cliente na página que já está carregada.
   * Devolve { ok, motivo } — quando ok é falso, quem chamou cai no link oficial.
   */
  // Trilha do último "abrir conversa": que passos rodaram e o que cada um viu.
  // Sem isto eu só sabia QUE falhou, e ficava adivinhando ONDE.
  let trilhaAbertura = []
  const passo = (txt) => { trilhaAbertura.push(txt); if (trilhaAbertura.length > 40) trilhaAbertura.shift() }

  async function abrirConversaNaPagina(c, texto, config) {
    trilhaAbertura = []
    try {
      const tel = FEIRAO.normalizarTelefone(c.telefone)
      if (!tel.ok) return { ok: false, motivo: 'telefone inválido' }
      const digitos = soDigitos(tel.e164)
      const nomeSalvo = FEIRAO.nomeContato(c, config)
      const nomeCliente = c.nome || ''
      passo(`alvo: ${JSON.stringify(nomeSalvo)} / ${digitos}`)

      // 1) a conversa já está na lista? (o caso comum de quem você acabou de chamar)
      let li = acharLinha(digitos, nomeSalvo, nomeCliente)
      let busca = null
      passo(li ? 'achou na lista visível' : `não está entre as ${linhasVisiveis().length} conversas visíveis`)

      // 2) senão, pesquisa no WhatsApp. Vários termos, porque a busca casa por
      //    NOME quando o contato está salvo e por NÚMERO quando não está — e o
      //    formato do número que ela reconhece varia.
      if (!li) {
        busca = acharBusca()
        if (!busca) return { ok: false, motivo: 'campo de busca não encontrado' }

        const termos = []
        if (nomeSalvo) termos.push(nomeSalvo)
        if (nomeCliente && nomeCliente !== nomeSalvo) termos.push(FEIRAO.primeiroNome(nomeCliente))
        termos.push(FEIRAO.formatarTelefoneBR(tel.e164))
        termos.push(digitos.slice(-11))
        termos.push(digitos)

        for (const termo of termos) {
          if (!termo) continue
          const escreveu = await escreverEm(busca, termo)
          if (!escreveu) { passo(`busca "${termo}": não consegui escrever`); continue }
          li = await esperarPor(() => acharLinha(digitos, nomeSalvo, nomeCliente), 2200, 120)
          passo(`busca "${termo}": ${li ? 'achou' : 'nada'}`)
          if (li) break
        }
        if (!li) {
          await limparBusca(busca)
          // Este é o caso mais comum, e a explicação importa: o WhatsApp Web só
          // acha quem já tem conversa OU está salvo na agenda do celular. Para
          // um cliente frio e não salvo, não existe caminho dentro da página —
          // o link oficial (que recarrega) é o único jeito de abrir a PRIMEIRA
          // conversa. Salvar a fila na agenda acaba com as recargas.
          return {
            ok: false,
            semAgenda: true,
            motivo: 'este cliente ainda não está salvo na sua agenda e não tem conversa —'
              + ' o WhatsApp Web não consegue abrir uma primeira conversa sem recarregar',
          }
        }
      }

      const anterior = tituloDaConversaAberta()
      clicarDeVerdade(li)

      // espera a conversa realmente trocar e o campo de mensagem aparecer
      const trocou = await esperarPor(() => {
        const t = tituloDaConversaAberta()
        return t && t !== anterior ? t : null
      }, 4000)
      passo(`depois do clique: ${JSON.stringify(trocou || tituloDaConversaAberta())}`)

      const compor = await esperarPor(() => acharCompor(), 5000)
      if (!compor) { await limparBusca(busca); return { ok: false, motivo: 'o campo de mensagem não apareceu' } }

      // 3) confere ANTES de escrever. Escrever na conversa errada é o erro que
      //    não se desfaz.
      const aberta = tituloDaConversaAberta()
      if (!mesmoContato(aberta, digitos, nomeSalvo, nomeCliente)) {
        passo(`conferência falhou: abriu ${JSON.stringify(aberta)}`)
        return { ok: false, motivo: `a conversa aberta (${aberta || 'nenhuma'}) não confere com o cliente` }
      }
      passo('conferência ok')

      if (texto) {
        const escreveu = await escreverEm(compor, texto)
        passo(`escrever mensagem: ${escreveu ? 'ok' : 'falhou'} (campo com ${textoDoCampo(compor).length} caracteres)`)
        if (!escreveu) { await limparBusca(busca); return { ok: false, motivo: 'não consegui escrever a mensagem' } }
      }
      // A busca só é limpa no FIM, com a mensagem já escrita. Limpar antes
      // mexia na tela no meio da abertura — e era de onde vinha o estrago.
      await limparBusca(busca)
      compor.focus()
      passo('pronto — conversa aberta e texto no campo, sem recarregar')
      return { ok: true }
    } catch (e) {
      passo('erro: ' + String((e && e.message) || e))
      return { ok: false, motivo: String((e && e.message) || e) }
    }
  }

  /**
   * Ponto único de abertura. Tenta sem recarregar; se qualquer etapa falhar,
   * usa o link oficial (que recarrega, mas sempre acerta).
   */
  // --- "o usuário está digitando?" -------------------------------------------
  // Foco não é digitação: o WhatsApp deixa o cursor no campo de mensagem o
  // tempo inteiro. O que interrompe de verdade é tecla sendo apertada.
  let ultimaTecla = 0
  document.addEventListener('keydown', (ev) => {
    if (!ev.isTrusted) return                 // evento de script não é você digitando
    if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(ev.key)) return
    ultimaTecla = Date.now()
  }, true)

  function digitandoAgora(janelaMs = 4000) {
    if (Date.now() - ultimaTecla > janelaMs) return false
    const a = document.activeElement
    return !!(a && (a.isContentEditable || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'))
  }

  let ultimoMotivoAbertura = ''
  /**
   * Trava de ritmo no MOMENTO do clique, para toda conversa aberta com texto
   * pronto. O painel desenhado há minutos pode estar com o botão liberado de
   * um estado antigo; aqui a espera é conferida de novo e, se puder, o relógio
   * do próximo intervalo já começa.
   */
  async function liberadoParaAbrir() {
    const p = await FEIRAO.podeChamarAgora()
    if (!p.liberado) {
      const quanto = p.esperaMs > 0 ? ` Libera em ${fmtEspera(p.esperaMs)}.` : ''
      window.alert(`Ainda não. ${p.motivo || 'Aguardando o intervalo entre contatos.'}${quanto}

Mandar mensagens em sequência é o que faz a Meta banir o número.`)
      return false
    }
    await FEIRAO.reservarEnvio()
    return true
  }

  async function irParaConversa(c, texto, config) {
    if (!config || config.abrirSemRecarregar !== false) {
      const r = await abrirConversaNaPagina(c, texto, config || {})
      if (r.ok) {
        // Limpa SEMPRE, não só quando esta cópia do script lembra da falha.
        // O aviso é gravado antes de uma recarga; depois dela a memória do
        // script está zerada, e a condição antiga nunca era verdadeira — o
        // aviso ficava colado na tela para sempre, mesmo já funcionando.
        ultimoMotivoAbertura = ''
        await setUi({ motivoRecarga: '', motivoRecargaEm: 0, trilhaRecarga: '', recargaPorAgenda: false })
        return { ok: true, recarregou: false }
      }
      // Guarda o porquê: como o caminho antigo RECARREGA a página, sem isso o
      // motivo se perderia junto com a memória do script.
      ultimoMotivoAbertura = r.motivo || ''
      await setUi({
        motivoRecarga: ultimoMotivoAbertura,
        motivoRecargaEm: Date.now(),
        recargaPorAgenda: !!r.semAgenda,
        trilhaRecarga: trilhaAbertura.join('\n  · '),
      })
    }
    const url = FEIRAO.linkConversa(c.telefone, texto || '')
    const antes = tituloDaConversaAberta()
    const a = document.createElement('a')
    a.href = url
    document.body.appendChild(a)
    a.click()
    a.remove()

    // O WhatsApp Web hoje trata esse link DENTRO da página (abre a conversa
    // pelo número, sem recarregar). Se este código ainda está rodando e a
    // conversa trocou, não houve recarga: apagar o aviso "precisou recarregar",
    // que ficava na tela descrevendo uma coisa que não aconteceu. Se a página
    // recarregar, nada daqui roda e o motivo gravado acima segue valendo.
    const abriu = await esperarPor(() => {
      const t = tituloDaConversaAberta()
      return t && t !== antes && acharCompor() ? t : null
    }, 8000)
    if (abriu) {
      ultimoMotivoAbertura = ''
      await setUi({ motivoRecarga: '', motivoRecargaEm: 0, trilhaRecarga: '', recargaPorAgenda: false })
    }
    return { ok: true, recarregou: false }
  }

  /** Extrai {titulo, previa, naoLidas} de cada conversa visível. */
  function lerConversas() {
    const painel = acharPainelLista()
    if (!painel) return { ok: false, motivo: 'lista de conversas não encontrada', linhas: [] }

    const linhas = linhasDoPainel(painel)
    if (!linhas.length) return { ok: false, motivo: 'nenhuma conversa visível', linhas: [] }

    const lidas = linhas.map((li) => {
      // título: normalmente um span[title]; se o WhatsApp tirar o atributo,
      // tituloDaLinha cai no primeiro texto da linha.
      const titulo = tituloDaLinha(li)

      // não lidas: badge com aria-label ("3 mensagens não lidas") ou número solto
      let naoLidas = 0
      const badge = li.querySelector('[aria-label*="não lida"], [aria-label*="unread"], [aria-label*="no leído"]')
      if (badge) {
        const rot = badge.getAttribute('aria-label') || badge.textContent || ''
        const n = parseInt(String(rot).replace(/\D+/g, ''), 10)
        naoLidas = Number.isFinite(n) && n > 0 ? n : 1
      }

      // prévia: o texto da última mensagem, útil para você ver o que ele disse
      let previa = ''
      const spans = li.querySelectorAll('span[dir="ltr"], span[dir="auto"]')
      if (spans.length) previa = (spans[spans.length - 1].textContent || '').trim()

      // De quem é a ÚLTIMA mensagem. O tiquinho de entrega só aparece quando a
      // última mensagem é NOSSA.
      //
      // CUIDADO — foi aqui que a v0.12.1 errou feio: eu concluía "o cliente
      // respondeu" a partir da AUSÊNCIA do ícone. Quando o WhatsApp muda a
      // marcação e o seletor para de casar, a ausência vira universal e TODO
      // mundo é marcado como tendo respondido. Detector que falha aberto é pior
      // que detector nenhum, porque corrompe os dados em silêncio.
      //
      // Agora a ausência do ícone não afirma nada sozinha: quem decide é a
      // calibração (lá embaixo) e a comparação com o texto que você enviou.
      const iconeNosso = li.querySelector(
        '[data-icon*="check"], [data-icon*="msg-time"], [data-icon*="status-time"],'
        + ' [aria-label*="Entregue"], [aria-label*="Lida"], [aria-label*="Enviando"],'
        + ' [aria-label*="Delivered"], [aria-label*="Read"], [aria-label*="Sent"]')
      const prefixoNosso = /^(você|voce|you)\s*:/i.test(previa)
      const rascunho = /^(rascunho|draft)\s*:/i.test(previa)

      return {
        titulo: String(titulo || '').trim(),
        previa, naoLidas, rascunho,
        temIconeNosso: !!iconeNosso,
        prefixoNosso,
      }
    }).filter((l) => l.titulo)

    // CALIBRAÇÃO: você acabou de mandar mensagem para vários desses contatos,
    // então o ícone de entrega TEM que aparecer em alguma linha. Se não aparece
    // em nenhuma, o seletor está cego — e aí a ausência de ícone não significa
    // nada. Sem isso, um detector cego marcaria a lista inteira como respondida.
    const comIcone = lidas.filter((l) => l.temIconeNosso).length
    const calibrado = comIcone > 0

    lidas.forEach((l) => {
      l.ultimaNossa = l.temIconeNosso || l.prefixoNosso
      l.ultimaDele = calibrado && !l.ultimaNossa && !l.rascunho && l.previa.length > 0
      l.calibrado = calibrado
    })

    return { ok: true, linhas: lidas, calibrado, comIcone }
  }

  /**
   * Rodapé honesto sobre o detector. Raspagem de DOM quebra quando o WhatsApp
   * muda a tela — melhor você saber na hora do que descobrir depois que
   * "ninguém respondeu" na verdade era o leitor cego.
   */
  function rodapeDeteccao(body, config) {
    if (!config.detectarRespostas) {
      body.appendChild(el('div', { class: 'fp-hint' },
        'Detecção de respostas desligada. Ligue na aba Ritmo e segurança da tela de campanha.'))
      return
    }
    if (!diagnostico.rodou) {
      body.appendChild(el('div', { class: 'fp-hint' }, 'Detector de respostas iniciando…'))
      return
    }
    if (!diagnostico.ok) {
      body.appendChild(el('div', { class: 'fp-alert warn' },
        el('b', {}, 'Não consegui ler a lista de conversas. '),
        `(${diagnostico.motivo}) `,
        'Deixe a lista de conversas visível (sem busca aberta, sem filtro de "não lidas") e clique em recarregar o leitor. ',
        'Se continuar assim, o WhatsApp mudou a tela — copie o diagnóstico e me mande.',
        el('div', { class: 'fp-row', style: { marginTop: '7px' } },
          el('button', {
            class: 'fp-ghost',
            onclick: async () => {
              painelMemorizado = null          // esquece o que achou antes e procura de novo
              await varrerRespostas({ silencioso: false })
              render()
            },
          }, 'Tentar de novo'),
          botaoDiagnostico())))
      return
    }
    if (!diagnostico.calibrado && diagnostico.examinadas > 0) {
      body.appendChild(el('div', { class: 'fp-alert warn' },
        el('b', {}, 'Detector em modo cauteloso. '),
        'Não achei o tiquinho de entrega em nenhuma conversa — sinal de que o WhatsApp mudou a tela. ',
        'Só vou marcar resposta quando houver mensagem NÃO LIDA, para não marcar quem não respondeu. ',
        'Me avise que eu ajusto o leitor.'))
    }
    body.appendChild(el('div', { class: 'fp-hint' },
      `Detector ativo: ${diagnostico.examinadas} conversas na tela, ${diagnostico.casadas} da campanha. `,
      diagnostico.casadas === 0 && diagnostico.examinadas > 0
        ? 'Nenhuma bateu com a fila — se você ainda não importou os contatos pelo .vcf, o WhatsApp mostra só o número e o casamento fica mais difícil.'
        : 'Lê só o que já está na sua tela; nada é enviado.'))
  }

  let diagnostico = { rodou: false, ok: false, examinadas: 0, casadas: 0, em: 0, motivo: '' }
  let varreduraTimer = null

  async function varrerRespostas({ silencioso = true } = {}) {
    const config = await FEIRAO.getConfig()
    if (!config.detectarRespostas) return
    const leitura = lerConversas()
    diagnostico = { rodou: true, ok: leitura.ok, examinadas: leitura.linhas.length,
      casadas: 0, em: Date.now(), motivo: leitura.motivo || '',
      calibrado: !!leitura.calibrado, comIcone: leitura.comIcone || 0 }
    if (!leitura.ok) return

    const r = await FEIRAO.conciliarRespostas(leitura.linhas)
    diagnostico.casadas = r.casadas
    diagnostico.semPar = r.semPar || []
    await gravarAgendaSePreciso()

    // Redesenha de verdade: o contador e o card "RESPONDERAM" ficam no render(),
    // e atualizar só o avisinho deixava a tela mentindo. A única coisa que não
    // pode ser interrompida é você digitando — nesse caso, só o aviso.
    if (r.novas.length || !silencioso) {
      const a = document.activeElement
      const digitando = a && (a.id === 'feirao-texto' || a.isContentEditable ||
        a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')
      const ui = await getUi()
      if (digitando || ui.aguardandoDesfecho) atualizarAvisoRespostas(r.novas)
      else render()
    }
    return r
  }

  /** Botão que copia o relatório da tela para você me mandar. */
  /** Estrutura da tela + o que aconteceu na última tentativa de abrir conversa. */
  async function textoDiagnostico() {
    const ui = await getUi()
    const partes = [diagnosticoDaTela()]
    partes.push('', 'ÚLTIMA TENTATIVA (nesta página):', trilhaAbertura.length
      ? '  · ' + trilhaAbertura.join('\n  · ')
      : '  (nenhuma tentativa de abrir conversa desde que esta página carregou)')
    if (!ui.motivoRecarga) partes.push('', 'ÚLTIMA RECARGA: nenhuma registrada.')
    if (ui.motivoRecarga) {
      partes.push('', `ÚLTIMA RECARGA — motivo: ${ui.motivoRecarga}`,
        `quando: ${ui.motivoRecargaEm ? new Date(ui.motivoRecargaEm).toLocaleString('pt-BR') : '?'}`)
      if (ui.trilhaRecarga) partes.push('passos:', '  · ' + ui.trilhaRecarga)
    }
    return partes.join('\n')
  }

  function botaoDiagnostico() {
    const b = el('button', { class: 'fp-ghost' }, 'Copiar diagnóstico')
    b.addEventListener('click', async () => {
      const txt = await textoDiagnostico()
      try { await navigator.clipboard.writeText(txt); b.textContent = 'copiado ✓' }
      catch (e) { console.log('[feirão] diagnóstico:\n' + txt); b.textContent = 'veja no console (F12)' }
    })
    return b
  }

  function atualizarAvisoRespostas(novas) {
    if (!panel || panel.style.display === 'none') return
    if (!novas || !novas.length) return
    const alvo = panel.querySelector('#feirao-respostas')
    if (!alvo) return
    alvo.innerHTML = ''
    alvo.appendChild(el('div', { class: 'fp-alert info' },
      el('b', {}, `${novas.length} nova${novas.length > 1 ? 's' : ''} resposta${novas.length > 1 ? 's' : ''}: `),
      novas.map((c) => FEIRAO.primeiroNome(c.nome) || FEIRAO.formatarTelefoneBR(c.telefone)).join(', '),
      el('div', { style: { marginTop: '5px' } },
        el('button', { class: 'fp-ghost', style: { padding: '4px 8px', fontSize: '10px' }, onclick: () => render() },
          'atualizar painel'))))
  }

  function agendarVarredura(config) {
    clearInterval(varreduraTimer)
    if (!config.detectarRespostas) return
    const seg = Math.max(10, Number(config.detectarIntervaloSeg) || 20)
    varreduraTimer = setInterval(() => varrerRespostas({ silencioso: true }), seg * 1000)
  }

  // ---------------------------------------------------------------------------
  // Agendamento — o desfecho que interessa
  // ---------------------------------------------------------------------------
  function formAgendamento(body, c, ui) {
    body.innerHTML = ''
    body.appendChild(el('div', { class: 'fp-alert info' },
      'Marcando horário com ', el('b', {}, FEIRAO.primeiroNome(c.nome) || FEIRAO.formatarTelefoneBR(c.telefone))))

    const hoje = new Date()
    const dia = el('input', { type: 'date', style: { width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px' } })
    dia.value = new Date(hoje.getTime() + 86400000).toISOString().slice(0, 10)
    const hora = el('input', { type: 'time', style: { width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px' } })
    hora.value = '10:00'
    const canal = el('select', { style: { width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px' } })
    ;[['loja', 'Visita à loja (avaliação)'], ['telefone', 'Ligação'], ['whatsapp', 'Continuar pelo WhatsApp']]
      .forEach(([v, t]) => canal.appendChild(el('option', { value: v }, t)))

    const lbl = (t) => el('div', { style: { fontSize: '10px', fontWeight: '700', color: '#64748b', margin: '8px 0 3px' } }, t)
    body.appendChild(lbl('Dia')); body.appendChild(dia)
    body.appendChild(lbl('Hora')); body.appendChild(hora)
    body.appendChild(lbl('Como')); body.appendChild(canal)

    body.appendChild(el('button', {
      class: 'fp-btn fp-primary', style: { marginTop: '10px' },
      onclick: async () => {
        await FEIRAO.registrarEnvio(c, ui.variante, ui.textoAtual)
        await FEIRAO.marcarContato(c.id, 'agendado', {
          varianteUsada: ui.variante,
          ultimoTextoEnviado: String(ui.textoAtual || '').slice(0, 80),
          agendadoPara: `${dia.value}T${hora.value}`,
          canalPreferido: canal.value,
          toques: (c.toques || 0) + 1,
        })
        await setUi({ aguardandoDesfecho: false, contatoAtual: null, textoAtual: '' })
        render()
      },
    }, 'Salvar agendamento'))
    body.appendChild(el('button', { class: 'fp-ghost', style: { width: '100%', marginTop: '6px' }, onclick: () => render() }, 'Cancelar'))
  }

  // ---------------------------------------------------------------------------
  // Playbook — o que responder quando ele responde
  // ---------------------------------------------------------------------------
  function copiar(txt, botao) {
    const done = () => { const t = botao.textContent; botao.textContent = 'Copiado ✓'; setTimeout(() => { botao.textContent = t }, 1200) }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(() => fallback())
    } else fallback()
    function fallback() {
      const ta = document.createElement('textarea')
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); done() } catch (e) { /* silêncio */ }
      document.body.removeChild(ta)
    }
  }

  async function renderPlaybook() {
    const body = panel.querySelector('#feirao-body')
    body.innerHTML = ''
    const [config, ui] = await Promise.all([FEIRAO.getConfig(), getUi()])
    const c = ui.contatoAtual || (atual && atual.contato) || {}

    body.appendChild(el('button', { class: 'fp-ghost', style: { width: '100%', marginBottom: '9px' }, onclick: () => render() }, '← voltar para a fila'))
    body.appendChild(el('div', { class: 'fp-alert info' },
      c.nome ? el('span', {}, 'Respostas já personalizadas para ', el('b', {}, FEIRAO.primeiroNome(c.nome)))
             : 'Abra uma conversa da fila para personalizar automaticamente.'))

    const busca = el('input', { placeholder: 'buscar resposta...', style: { width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', marginBottom: '8px' } })
    body.appendChild(busca)
    const lista = el('div', {})
    body.appendChild(lista)

    function desenhar(filtro) {
      lista.innerHTML = ''
      let grupoAtual = ''
      FEIRAO.PLAYBOOK.forEach((r) => {
        const txt = FEIRAO.montarResposta(c, config, r.id)
        const pol = FEIRAO.validarPolitica(txt)
        if (filtro && !(r.nome + ' ' + r.grupo + ' ' + txt).toLowerCase().includes(filtro)) return
        if (r.grupo !== grupoAtual) {
          grupoAtual = r.grupo
          lista.appendChild(el('div', { style: { fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '.5px', color: '#1e3a8a', margin: '10px 0 5px' } }, r.grupo))
        }
        const corpo = el('div', { style: { display: 'none', fontSize: '11px', lineHeight: '1.5', color: '#334155', whiteSpace: 'pre-wrap', margin: '5px 0' } }, txt)
        const btnCopiar = el('button', { class: 'fp-ghost', style: { padding: '5px 9px', fontSize: '10px' } }, 'Copiar')
        btnCopiar.addEventListener('click', (e) => { e.stopPropagation(); copiar(txt, btnCopiar) })
        const card = el('div', { style: { border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 9px', marginBottom: '5px', cursor: 'pointer' } },
          el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
            el('span', { style: { flex: '1', fontSize: '11.5px', fontWeight: '600' } }, r.nome),
            pol.ok ? '' : el('span', { style: { fontSize: '9px', color: '#b91c1c', fontWeight: '800' } }, '⚠'),
            btnCopiar),
          corpo)
        card.addEventListener('click', () => { corpo.style.display = corpo.style.display === 'none' ? 'block' : 'none' })
        lista.appendChild(card)
      })
      if (!lista.children.length) lista.appendChild(el('div', { class: 'fp-hint' }, 'Nada encontrado.'))
    }
    busca.addEventListener('input', () => desenhar(busca.value.toLowerCase().trim()))
    desenhar('')
  }

  function fmtEspera(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000))
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    return `${m}min ${s % 60}s`
  }

  /**
   * Cronômetro silencioso.
   *
   * A versão anterior chamava render() a cada segundo — ou seja, reconstruía o
   * painel inteiro (innerHTML = '') 60 vezes por minuto. Daí o pisca-pisca, a
   * rolagem pulando e o texto perdendo o foco enquanto você lia.
   *
   * Agora só o TEXTO do contador muda. O painel inteiro é redesenhado uma única
   * vez: quando o tempo zera e o botão precisa de fato liberar.
   */
  function pararCronometro() {
    clearInterval(tickTimer)
    tickTimer = null
  }

  function iniciarCronometro(alvos, esperaMs, aoLiberar) {
    pararCronometro()
    if (!(esperaMs > 0)) return
    let restante = esperaMs
    const pinta = () => {
      const txt = fmtEspera(restante)
      alvos.forEach(({ no, molde }) => { if (no && no.isConnected) no.textContent = molde(txt) })
    }
    pinta()
    tickTimer = setInterval(() => {
      restante -= 1000
      if (restante > 0) { pinta(); return }
      pararCronometro()
      // agora sim vale redesenhar: o estado do botão mudou de verdade
      if (panel && panel.style.display !== 'none') (aoLiberar || render)()
    }, 1000)
  }

  // A tela de campanha pode pedir uma varredura sob demanda.
  // O próprio listener precisa ser registrado com cuidado: num script órfão,
  // até `chrome.runtime.onMessage` estoura.
  if (extensaoViva()) chrome.runtime.onMessage.addListener((req, _s, responder) => {
    if (req && req.type === 'auditarAgora') {
      varrerRespostas({ silencioso: false })
        .then((r) => responder({
          ok: !!diagnostico.ok,
          motivo: diagnostico.motivo || '',
          examinadas: diagnostico.examinadas,
          casadas: diagnostico.casadas,
          semPar: diagnostico.semPar || [],
          novas: r && r.novas ? r.novas.map((c) => ({ nome: c.nome, telefone: c.telefone })) : [],
        }))
        .catch((e) => responder({ ok: false, motivo: String(e && e.message || e) }))
      return true
    }
  })

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    if (!document.body) return setTimeout(boot, 400)
    await FEIRAO.migrarConfig()
    await FEIRAO.carregarCustom()
    montar()
    getUi().then((ui) => {
      // se veio de um "Abrir conversa", reabre o painel automaticamente
      abrir(ui.aberto !== false || ui.aguardandoDesfecho === true)
    })
    // Detector de respostas: a lista de conversas demora a montar no SPA.
    const config = await FEIRAO.getConfig()
    setTimeout(() => varrerRespostas({ silencioso: true }), 4000)
    agendarVarredura(config)
  }

  // O WhatsApp Web é SPA e recarrega inteiro no click-to-chat; esperamos a UI subir.
  const ready = setInterval(() => {
    if (document.body && document.querySelector('#app, [data-testid="app-wrapper-web"], div#main, ._aigw, header')) {
      clearInterval(ready)
      boot()
    }
  }, 600)
  setTimeout(() => { clearInterval(ready); if (!panel) boot() }, 12000)
})()
