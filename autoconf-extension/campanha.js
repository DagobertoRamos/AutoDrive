// =============================================================================
// campanha.js — tela de montagem e controle da Campanha Feirão.
// =============================================================================
(() => {
  'use strict'
  const $ = (id) => document.getElementById(id)
  const el = (t, p = {}, ...k) => {
    const n = document.createElement(t)
    Object.entries(p).forEach(([key, v]) => {
      if (key === 'class') n.className = v
      else if (key.startsWith('on')) n.addEventListener(key.slice(2).toLowerCase(), v)
      else if (key === 'html') n.innerHTML = v
      else n.setAttribute(key, v)
    })
    k.flat().forEach((c) => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c))
    return n
  }

  let previa = null // resultado da última análise de importação
  let mapa = null   // de qual coluna da planilha veio cada campo
  let filtroGrupo = 'todos'  // chip de auditoria selecionado (usado por aplicarHash)

  // ---------------------------------------------------------------------------
  // Abas
  // ---------------------------------------------------------------------------
  function irParaAba(nome) {
    const alvo = document.querySelector(`.tab[data-tab="${nome}"]`)
    if (!alvo) return
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === alvo))
    document.querySelectorAll('section[id^="tab-"]').forEach((s) => {
      s.classList.toggle('hidden', s.id !== 'tab-' + nome)
    })
  }
  document.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => irParaAba(b.dataset.tab))
  })

  /**
   * O painel do WhatsApp abre esta tela já na visão certa, via #aba/grupo.
   * Ex.: #fila/em_conversa cai na fila filtrada por quem está em conversa.
   */
  function aplicarHash() {
    const [aba, grupo] = String(location.hash || '').replace(/^#/, '').split('/')
    if (!aba) return
    irParaAba(aba)
    if (grupo) filtroGrupo = grupo
  }
  window.addEventListener('hashchange', () => {
    aplicarHash(); renderAuditoria(); renderFila()
  })

  // ---------------------------------------------------------------------------
  // Métricas e alertas
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Filtros dos cards.
  //
  // Antes cada card contava um status EXATO ('respondeu', 'pendente'...). Como a
  // taxonomia de SDR move o cliente para 'em atendimento', 'agendado', 'vendeu'
  // etc. assim que ele responde, o card "responderam" ficava eternamente em 0
  // enquanto a conversa acontecia. Agora cada card tem um teste próprio, e é
  // exatamente esse teste que filtra a tabela quando você clica nele.
  // ---------------------------------------------------------------------------
  const NAO_CONTATAR = ['optout', 'bloqueou', 'sem_whatsapp']
  const respondeuDeFato = (c) => !!c.respondeuEm || FEIRAO.RESPONDEU_ALGUM.includes(c.status)
  const ehHoje = (ts) => {
    if (!ts) return false
    const d = new Date(ts); const h = new Date()
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate()
  }

  const FILTROS_CARD = {
    todos: { rotulo: 'Todos', teste: () => true },
    a_chamar: { rotulo: 'A chamar',
      teste: (c) => (c.toques || 0) === 0 && !NAO_CONTATAR.includes(c.status) },
    enviados_hoje: { rotulo: 'Enviados hoje', teste: (c) => ehHoje(c.ultimoToqueEm) },
    aguardando: { rotulo: 'Aguardando resposta',
      teste: (c) => (c.toques || 0) > 0 && !respondeuDeFato(c) && !NAO_CONTATAR.includes(c.status) },
    responderam: { rotulo: 'Responderam', teste: respondeuDeFato },
    nao_perturbe: { rotulo: 'Não perturbe', teste: (c) => NAO_CONTATAR.includes(c.status) },
  }

  /** Resolve o filtro ativo: card virtual OU grupo da auditoria. */
  function testeDoFiltro(id) {
    if (FILTROS_CARD[id]) return FILTROS_CARD[id].teste
    return (c) => FEIRAO.grupoDe(c) === id
  }

  /** Aplica o filtro, leva a tela até a tabela e redesenha o que depende dele. */
  async function filtrarPor(id) {
    filtroGrupo = id
    irParaAba('fila')
    await renderAuditoria()
    await renderFila()
    await renderMetrics()
    const alvo = $('tabela')
    if (alvo && alvo.scrollIntoView) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function renderMetrics() {
    const [q, config, state] = await Promise.all([
      FEIRAO.getQueue(), FEIRAO.getConfig(), FEIRAO.getState(),
    ])
    const conta = (id) => q.filter(FILTROS_CARD[id].teste).length
    // "enviados hoje" tem duas fontes: o contador do dia (que o painel do
    // WhatsApp incrementa) e a data do último toque de cada cliente. Mostra a
    // maior — o contador zera à meia-noite, os toques não.
    const doContador = state.day === FEIRAO.hojeStr() ? state.sentToday || 0 : 0
    const dados = [
      ['todos', q.length, 'na fila'],
      ['a_chamar', conta('a_chamar'), 'a chamar'],
      ['enviados_hoje', Math.max(doContador, conta('enviados_hoje')), 'enviados hoje'],
      ['aguardando', conta('aguardando'), 'aguardando'],
      ['responderam', conta('responderam'), 'responderam'],
      ['nao_perturbe', conta('nao_perturbe'), 'não perturbe'],
    ]
    $('metrics').innerHTML = ''
    dados.forEach(([id, v, l]) => {
      const card = el('button', {
        class: 'metric' + (filtroGrupo === id ? ' metric-on' : ''),
        type: 'button',
        title: `Ver na tabela: ${FILTROS_CARD[id].rotulo}`,
        onclick: () => filtrarPor(id),
      }, el('b', {}, String(v)), el('span', {}, l))
      $('metrics').appendChild(card)
    })

    // alertas
    const alerts = $('alerts')
    alerts.innerHTML = ''
    if (state.freio) {
      alerts.appendChild(el('div', { class: 'alert stop' },
        el('b', {}, 'Campanha travada pelo freio automático. '),
        `A rejeição passou de ${config.alertaRejeicaoPct}% nos últimos contatos. `,
        'Antes de liberar: troque a abertura da mensagem e reduza a faixa de clientes — insistir aqui é o caminho direto para o bloqueio do número. ',
        el('button', { class: 'ghost', style: 'margin-left:8px', onclick: async () => { await FEIRAO.liberarFreio(); renderMetrics() } }, 'Revisei — liberar')))
    }
    const pend = conta('a_chamar')
    if (pend > 0) {
      const dias = Math.ceil(pend / (config.maxPorDia || 40))
      alerts.appendChild(el('div', { class: 'alert info' },
        `${pend} clientes na fila · no ritmo de ${config.maxPorDia}/dia isso leva ${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'}. `,
        'Se o feirão for mais curto que isso, divida a fila entre os vendedores em vez de acelerar o mesmo número.'))
    }
    $('capacidade').textContent =
      `Capacidade atual: ${config.maxPorDia} contatos/dia por número, entre ${config.horaInicio}h e ${config.horaFim}h, ` +
      `intervalo sorteado de ${config.minIntervaloSeg}s a ${config.maxIntervaloSeg}s, pausa longa a cada ${config.pausaACada} envios. ` +
      `Para dobrar o alcance sem dobrar o risco, use dois vendedores com números diferentes — nunca o mesmo número no dobro do ritmo.`
  }

  // ---------------------------------------------------------------------------
  // Tabela da fila
  // ---------------------------------------------------------------------------
  // Rótulos vêm do core — uma fonte só, para a tela e o painel nunca divergirem.
  const LABEL = FEIRAO.STATUS_MANUAIS.reduce((a, s) => (a[s.id] = s.rotulo, a), { invalido: 'inválido' })

  const diasDesde = (ts) => (ts ? Math.floor((Date.now() - ts) / 86400000) : null)
  const quando = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR') : '—')

  /** Tira da auditoria os números por grupo e desenha os chips clicáveis. */
  async function renderAuditoria() {
    const a = await FEIRAO.auditoria()
    const box = $('auditoria')
    box.innerHTML = ''

    // A ordem de AVALIAÇÃO dos grupos (no core) é por precedência; aqui a ordem
    // é a que faz sentido ler: do começo do funil para o fim.
    const ORDEM = ['nao_chamados', 'sem_resposta', 'em_conversa', 'futuro',
      'vendidos', 'perdidos', 'nao_contatar']
    const chips = [{ id: 'todos', rotulo: 'Todos', n: a.total },
      ...ORDEM.map((id) => FEIRAO.GRUPOS.find((g) => g.id === id))
        .filter(Boolean)
        .map((g) => ({ id: g.id, rotulo: g.rotulo, n: a.grupos[g.id].itens.length }))]
    const linha = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' })
    chips.forEach((c) => {
      const on = filtroGrupo === c.id
      linha.appendChild(el('button', {
        class: on ? 'primary' : 'ghost',
        style: 'padding:6px 12px;font-size:11.5px',
        onclick: () => filtrarPor(c.id),
      }, `${c.rotulo}: ${c.n}`))
    })
    box.appendChild(linha)

    // Quando o filtro veio de um card (e não de um chip), nenhum chip fica
    // aceso — sem esta linha a tabela parece filtrada "sozinha".
    if (FILTROS_CARD[filtroGrupo] && filtroGrupo !== 'todos') {
      box.appendChild(el('div', { class: 'mini', style: 'margin-top:8px' },
        `Tabela filtrada por: ${FILTROS_CARD[filtroGrupo].rotulo}. `,
        el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); filtrarPor('todos') } }, 'mostrar todos')))
    }

    // quem está esperando resposta há mais tempo
    if (a.esperando.length) {
      const top = a.esperando.slice(0, 3)
        .filter((x) => x.dias != null)
        .map((x) => `${FEIRAO.primeiroNome(x.contato.nome)} (${x.dias}d)`)
      if (top.length) {
        box.appendChild(el('div', { class: 'mini', style: 'margin-top:8px' },
          `Esperando resposta há mais tempo: ${top.join(' · ')}`))
      }
    }

    // inconsistências que valem conferir antes de confiar nos números
    a.alertas.forEach((al) => {
      box.appendChild(el('div', { class: 'alert warn', style: 'margin-top:8px' }, al.texto))
    })
    if (!a.alertas.length && a.total) {
      box.appendChild(el('div', { class: 'alert info', style: 'margin-top:8px' },
        'Nenhuma inconsistência: telefones válidos, lista de não perturbe batendo com a fila e nenhum agendamento vencido em aberto.'))
    }
  }

  async function renderFila() {
    const q = await FEIRAO.getQueue()
    const termo = ($('busca').value || '').toLowerCase().trim()
    const tb = $('tabela').querySelector('tbody')
    tb.innerHTML = ''
    const passa = testeDoFiltro(filtroGrupo)
    const vis = q.filter(passa)
      .filter((c) => !termo || [c.nome, c.telefone, c.veiculo, c.placa].join(' ').toLowerCase().includes(termo))

    if (!vis.length) {
      tb.appendChild(el('tr', {}, el('td', { colspan: '6', style: 'color:#94a3b8;padding:14px' },
        'Nenhum cliente neste filtro.')))
    }

    vis.slice(0, 400).forEach((c) => {
      // status editável — correção de cadastro, não desfecho de contato
      const sel = el('select', { style: 'font-size:11px;padding:3px 4px;max-width:190px' })
      const grupos = []
      FEIRAO.STATUS_MANUAIS.forEach((st) => {
        let g = grupos.find((x) => x.nome === st.grupo)
        if (!g) { g = { nome: st.grupo, itens: [] }; grupos.push(g) }
        g.itens.push(st)
      })
      grupos.forEach((g) => {
        const og = el('optgroup', { label: g.nome })
        g.itens.forEach((st) => {
          const o = el('option', { value: st.id }, st.rotulo)
          if (st.id === c.status) o.setAttribute('selected', 'selected')
          og.appendChild(o)
        })
        sel.appendChild(og)
      })
      if (!FEIRAO.STATUS_MANUAIS.some((st) => st.id === c.status)) {
        const o = el('option', { value: c.status }, LABEL[c.status] || c.status)
        o.setAttribute('selected', 'selected'); sel.appendChild(o)
      }
      sel.addEventListener('change', async () => {
        await FEIRAO.definirStatusManual(c.id, sel.value)
        await renderAuditoria(); await renderFila(); renderMetrics(); renderRelatorios()
      })

      const marcas = []
      if (c.respostaDetectada) marcas.push('resposta detectada')
      if (c.statusManual) marcas.push('status ajustado por você')
      if (c.aceitaPromocoes) marcas.push('★ aceita promoções')
      if (c.retomarEm) marcas.push('retomar ' + quando(c.retomarEm))
      if (c.agendadoPara) marcas.push('agendado ' + String(c.agendadoPara).replace('T', ' '))
      if (c.contatoSalvo) marcas.push('na agenda')

      tb.appendChild(el('tr', {},
        el('td', {}, el('div', { style: 'font-weight:600' }, c.nome || '—'),
          marcas.length ? el('div', { style: 'font-size:9.5px;color:#94a3b8' }, marcas.join(' · ')) : ''),
        el('td', {}, FEIRAO.formatarTelefoneBR(c.telefone)),
        el('td', {}, `${c.veiculo || '—'}${c.ano ? ' ' + c.ano : ''}`),
        el('td', {},
          el('div', {}, c.dataCompra ? String(c.dataCompra) : '—'),
          c.ultimoToqueEm
            ? el('div', { style: 'font-size:9.5px;color:#94a3b8' },
              `chamado ${quando(c.ultimoToqueEm)}${c.respondeuEm ? ' · respondeu ' + quando(c.respondeuEm) : ` · ${diasDesde(c.ultimoToqueEm)}d sem resposta`}`)
            : ''),
        el('td', {}, sel),
        el('td', {}, el('button', {
          class: 'ghost', style: 'padding:3px 8px;font-size:10px',
          onclick: async () => {
            await FEIRAO.definirStatusManual(c.id, 'optout')
            await renderAuditoria(); await renderFila(); renderMetrics()
          },
        }, 'remover')),
      ))
    })
    if (vis.length > 400) tb.appendChild(el('tr', {}, el('td', { colspan: '6', style: 'color:#94a3b8' }, `+${vis.length - 400} não exibidos`)))
  }

  $('auditarWhats') && $('auditarWhats').addEventListener('click', async () => {
    const btn = $('auditarWhats')
    const antes = btn.textContent
    btn.textContent = 'Auditando…'; btn.disabled = true
    chrome.runtime.sendMessage({ type: 'pedirAuditoria' }, async (r) => {
      btn.textContent = antes; btn.disabled = false
      const box = $('auditoriaResultado')
      box.innerHTML = ''
      if (!r || !r.ok) {
        box.appendChild(el('div', { class: 'alert warn' },
          el('b', {}, 'Não deu para auditar pelo WhatsApp Web. '),
          (r && r.motivo) || 'motivo desconhecido',
          '. Abra o WhatsApp Web numa aba (e dê F5 se já estiver aberto).'))
        return
      }
      const nomes = (r.novas || []).map((c) => FEIRAO.primeiroNome(c.nome) || FEIRAO.formatarTelefoneBR(c.telefone))
      box.appendChild(el('div', { class: 'alert info' },
        `Li ${r.examinadas} conversas na tela; ${r.casadas} são da campanha. `,
        nomes.length
          ? el('b', {}, `${nomes.length} nova(s) resposta(s): ${nomes.join(', ')}.`)
          : 'Nenhuma resposta nova desde a última verificação.'))

      // Se quase nada casou, o problema é o casamento — mostre o que ele leu,
      // para você comparar com o que está na fila em vez de adivinhar.
      if (r.casadas === 0 && r.examinadas > 0) {
        box.appendChild(el('div', { class: 'alert warn' },
          el('b', {}, 'Nenhuma conversa bateu com a fila. '),
          'Quase sempre é porque o WhatsApp mostra o contato com um nome diferente do cadastro. ',
          'Importe o .vcf (card Agenda, abaixo) que os títulos passam a ser exatamente os nomes gravados.'))
      }
      if (r.semPar && r.semPar.length) {
        box.appendChild(el('div', { class: 'mini' },
          'Conversas lidas que não são da campanha (amostra): ' + r.semPar.slice(0, 8).join(' · ')))
      }
      await renderAuditoria(); await renderFila(); renderMetrics(); renderRelatorios()
    })
  })

  $('busca').addEventListener('input', renderFila)

  $('abrirWhats').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://web.whatsapp.com/' })
  })

  $('reordenar').addEventListener('click', async () => {
    const q = await FEIRAO.getQueue()
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[q[i], q[j]] = [q[j], q[i]] }
    await FEIRAO.saveQueue(q); renderFila()
  })

  $('limparConcluidos').addEventListener('click', async () => {
    const q = await FEIRAO.getQueue()
    await FEIRAO.saveQueue(q.filter((c) => !['concluido', 'optout', 'sem_whatsapp', 'invalido'].includes(c.status)))
    renderFila(); renderMetrics()
  })

  $('recomecarZero').addEventListener('click', async () => {
    if (!confirm(
      'Recomeçar a campanha do zero?\n\n' +
      'Todos os contatos continuam na fila e voltam para "pendente": zera envios, ' +
      'respostas, agendamentos e textos personalizados.\n\n' +
      'Quem pediu para sair, bloqueou ou não tem WhatsApp continua fora.',
    )) return
    const r = await FEIRAO.recomecarDoZero()
    alert(`Pronto. ${r.recomecados} contato(s) recomeçaram do zero` +
      (r.preservados ? `; ${r.preservados} continuam fora (saíram, bloquearam ou sem WhatsApp).` : '.'))
    renderFila(); renderMetrics()
  })

  $('limparTudo').addEventListener('click', async () => {
    if (!confirm('Zerar a fila? A lista de não perturbe e o log de auditoria são preservados.')) return
    await FEIRAO.saveQueue([]); renderFila(); renderMetrics()
  })

  // ---------------------------------------------------------------------------
  // Desfazer o estrago do detector automático
  // ---------------------------------------------------------------------------
  $('reverterAuto') && $('reverterAuto').addEventListener('click', async () => {
    const q = await FEIRAO.getQueue()
    const alvo = q.filter((c) => c.respostaDetectada && !c.statusManual).length
    if (!alvo) { alert('Nenhuma marcação automática para desfazer.'); return }
    if (!confirm(`Desfazer ${alvo} marcação(ões) feita(s) pelo detector?\n\n`
      + 'Eles voltam para "aguardando cliente responder". O que você ajustou na mão não é tocado.')) return
    const r = await FEIRAO.reverterRespostasAutomaticas()
    await renderAuditoria(); await renderFila(); renderMetrics(); renderRelatorios()
    alert(`${r.revertidos} cliente(s) voltaram para "aguardando cliente responder".`)
  })

  // ---------------------------------------------------------------------------
  // Agendamento pela tela (sem precisar do WhatsApp aberto)
  // ---------------------------------------------------------------------------
  let agEscolhido = null

  function agPintarEscolhido() {
    const box = $('agSelecionado')
    if (!agEscolhido) { box.classList.add('hidden'); box.innerHTML = ''; return }
    box.classList.remove('hidden')
    box.innerHTML = ''
    box.appendChild(el('div', {},
      el('b', {}, agEscolhido.nome || '—'), ' · ',
      FEIRAO.formatarTelefoneBR(agEscolhido.telefone),
      agEscolhido.veiculo ? ` · ${agEscolhido.veiculo}` : '',
      el('div', { style: 'font-size:11px;margin-top:3px' },
        'Situação atual: ', LABEL[agEscolhido.status] || agEscolhido.status)))
  }

  async function agProcurar() {
    const termo = ($('agBusca').value || '').toLowerCase().trim()
    const box = $('agResultados')
    box.innerHTML = ''
    if (termo.length < 2) return
    const q = await FEIRAO.getQueue()
    const achados = q.filter((c) =>
      [c.nome, c.telefone, FEIRAO.formatarTelefoneBR(c.telefone), c.veiculo]
        .join(' ').toLowerCase().includes(termo)).slice(0, 8)
    if (!achados.length) {
      box.appendChild(el('div', { class: 'mini' }, 'Ninguém encontrado com esse termo.'))
      return
    }
    achados.forEach((c) => {
      box.appendChild(el('button', {
        class: 'ghost',
        style: 'display:block;width:100%;text-align:left;margin-top:4px;padding:6px 9px;font-size:11.5px;font-weight:500',
        onclick: () => {
          agEscolhido = c
          $('agBusca').value = c.nome || FEIRAO.formatarTelefoneBR(c.telefone)
          $('agVendedor').value = $('agVendedor').value || c.vendedor || ''
          box.innerHTML = ''
          agPintarEscolhido()
        },
      }, `${c.nome || '—'} · ${FEIRAO.formatarTelefoneBR(c.telefone)}${c.veiculo ? ' · ' + c.veiculo : ''}`))
    })
  }
  $('agBusca') && $('agBusca').addEventListener('input', agProcurar)

  $('agLimpar') && $('agLimpar').addEventListener('click', () => {
    agEscolhido = null
    ;['agBusca', 'agObs', 'agVendedor'].forEach((id) => { $(id).value = '' })
    $('agResultados').innerHTML = ''
    $('agResultado').innerHTML = ''
    agPintarEscolhido()
  })

  $('agSalvar') && $('agSalvar').addEventListener('click', async () => {
    const box = $('agResultado'); box.innerHTML = ''
    if (!agEscolhido) {
      box.appendChild(el('div', { class: 'alert warn' }, 'Escolha o cliente primeiro.')); return
    }
    if (!$('agData').value) {
      box.appendChild(el('div', { class: 'alert warn' }, 'Falta o dia.')); return
    }
    const quandoISO = `${$('agData').value}T${$('agHora').value || '10:00'}`
    if (new Date(quandoISO).getTime() < Date.now() - 3600000) {
      if (!confirm('Esse horário já passou. Agendar mesmo assim?')) return
    }
    await FEIRAO.definirStatusManual(agEscolhido.id, 'agendado')
    const q = await FEIRAO.getQueue()
    const i = q.findIndex((c) => c.id === agEscolhido.id)
    if (i >= 0) {
      q[i].agendadoPara = quandoISO
      q[i].canalPreferido = $('agCanal').value
      q[i].vendedor = $('agVendedor').value || q[i].vendedor || ''
      q[i].obsAtendimento = $('agObs').value || ''
      q[i].lembreteEm = null          // agendou de novo: o lembrete vale outra vez
      q[i].atualizadoEm = Date.now()
      await FEIRAO.saveQueue(q)
    }
    box.appendChild(el('div', { class: 'alert info' },
      el('b', {}, 'Agendado. '),
      `${agEscolhido.nome || FEIRAO.formatarTelefoneBR(agEscolhido.telefone)} — `,
      `${$('agData').value.split('-').reverse().join('/')} às ${$('agHora').value}. `,
      'Na véspera o painel do WhatsApp lembra você de confirmar.'))
    agEscolhido = null
    $('agBusca').value = ''; $('agObs').value = ''
    agPintarEscolhido()
    await renderAuditoria(); await renderFila(); await renderAgenda(); renderMetrics(); renderRelatorios()
  })

  // ---------------------------------------------------------------------------
  // Google Contatos
  // ---------------------------------------------------------------------------
  const mandar = (msg) => new Promise((r) => {
    try { chrome.runtime.sendMessage(msg, (x) => r(x || {})) } catch (e) { r({}) }
  })

  const MOTIVOS = {
    sem_client_id: 'Falta o ID do cliente OAuth — preencha o campo abaixo e siga o passo a passo.',
    access_denied: 'Você recusou a permissão na tela do Google.',
    'sem retorno': 'A janela do Google fechou antes de concluir.',
  }

  async function renderGoogle() {
    const box = $('googleStatus')
    if (!box) return
    const [s, sit] = await Promise.all([mandar({ type: 'googleStatus' }), FEIRAO.situacaoAgenda()])
    box.innerHTML = ''

    // A verdade sobre onde os contatos estão. "Gravado" só vale para o que
    // chegou no Google — .vcf baixado e não importado não está em agenda nenhuma.
    if (sit.chamados) {
      const linha = el('div', { class: 'metrics', style: 'grid-template-columns:repeat(3,1fr);margin-bottom:10px' },
        el('div', { class: 'metric' },
          el('b', { style: 'color:#16a34a' }, String(sit.noGoogle)), el('span', {}, 'no Google')),
        el('div', { class: 'metric' },
          el('b', { style: sit.soArquivo ? 'color:#b45309' : '' }, String(sit.soArquivo)), el('span', {}, 'só em arquivo')),
        el('div', { class: 'metric' },
          el('b', { style: sit.semGravar ? 'color:#b91c1c' : '' }, String(sit.semGravar)), el('span', {}, 'não gravados')))
      box.appendChild(linha)

      if (sit.soArquivo) {
        box.appendChild(el('div', { class: 'alert warn' },
          el('b', {}, `${sit.soArquivo} contato(s) estão só no arquivo .vcf. `),
          'Isso quer dizer que o arquivo foi baixado mas ',
          el('b', {}, 'ninguém importou no Google Contatos'),
          ' — eles não estão na agenda do seu celular, e é por isso que o WhatsApp mostra só o número. ',
          'Conecte o Google abaixo e clique em "Gravar agora no Google", ou importe os .vcf da sua pasta Downloads.'))
      }
    }

    if (s.conectado) {
      box.appendChild(el('div', { class: 'alert info' },
        el('b', {}, 'Conectado' + (s.conta ? ` como ${s.conta}` : '') + '. '),
        'Os clientes que você chamar vão direto para o Google Contatos, com o rótulo da campanha.'))
    } else {
      box.appendChild(el('div', { class: 'alert warn' },
        el('b', {}, 'Não conectado. '),
        MOTIVOS[s.motivo] || (s.motivo ? `Motivo: ${s.motivo}.` : ''),
        ' Enquanto isso, a gravação continua saindo em arquivo .vcf.'))
    }

    // O endereço de redirecionamento é o dado que ele precisa colar no Google.
    if (s.redirectUri) {
      const campo = el('input', { readonly: 'readonly', style: 'font-family:monospace;font-size:11px' })
      campo.value = s.redirectUri
      box.appendChild(el('div', { class: 'field' },
        el('label', {}, 'URI de redirecionamento — cole esta linha no Google Cloud'),
        campo,
        el('div', { class: 'row' },
          el('button', {
            class: 'ghost', style: 'padding:6px 10px;font-size:11px',
            onclick: (e) => {
              campo.select(); navigator.clipboard.writeText(s.redirectUri)
              e.target.textContent = 'Copiado ✓'
              setTimeout(() => { e.target.textContent = 'Copiar' }, 1500)
            },
          }, 'Copiar'),
          el('span', { class: 'mini', style: 'align-self:center' },
            `ID desta extensão: ${s.extensaoId || '—'}`))))
    }

    const cfgIn = $('googleClientId')
    if (cfgIn && !cfgIn.value && s.clientId) cfgIn.value = s.clientId
  }

  $('googleConectar') && $('googleConectar').addEventListener('click', async () => {
    const btn = $('googleConectar'); const antes = btn.textContent
    btn.textContent = 'Abrindo o Google…'; btn.disabled = true
    const r = await mandar({ type: 'googleConectar', clientId: $('googleClientId').value })
    btn.textContent = antes; btn.disabled = false
    $('googleResultado').innerHTML = ''
    if (!r.conectado) {
      $('googleResultado').appendChild(el('div', { class: 'alert stop' },
        el('b', {}, 'Não deu para conectar. '),
        MOTIVOS[r.motivo] || `Motivo: ${r.motivo || 'desconhecido'}.`,
        r.motivo && /redirect|origin/i.test(String(r.motivo))
          ? ' Confira se a URI de redirecionamento no Google Cloud está exatamente igual à mostrada acima.'
          : ''))
    }
    renderGoogle()
  })

  $('googleDesconectar') && $('googleDesconectar').addEventListener('click', async () => {
    await mandar({ type: 'googleDesconectar' })
    $('googleResultado').innerHTML = ''
    renderGoogle()
  })

  async function gravarGoogle(botao, { todos = false } = {}) {
    const antes = botao.textContent
    botao.textContent = 'Gravando…'; botao.disabled = true
    const r = await mandar({ type: 'googleGravar', todos })
    botao.textContent = antes; botao.disabled = false

    const box = $('googleResultado'); box.innerHTML = ''
    if (r.nada) {
      box.appendChild(el('div', { class: 'alert info' },
        todos ? 'A fila inteira já está no Google Contatos.'
              : 'Todos os clientes já chamados estão no Google Contatos.'))
    } else if (r.ok) {
      box.appendChild(el('div', { class: 'alert info' },
        el('b', {}, `${r.criados} contato${r.criados > 1 ? 's' : ''} gravado${r.criados > 1 ? 's' : ''} no Google. `),
        'Seu celular sincroniza em alguns minutos — e o WhatsApp passa a mostrar o nome salvo.',
        r.restantes ? ` Faltam ${r.restantes} — clique de novo.` : ''))
    } else {
      // A cota do Google é de 200 gravações por dia por projeto. Estourar não é
      // erro de configuração: é só esperar o dia virar e clicar de novo.
      const cota = /cota|quota|limite/i.test(String(r.motivo || '')) ||
        (r.erros || []).some((e) => /cota|quota|limite/i.test(String(e.motivo || '')))
      box.appendChild(el('div', { class: 'alert stop' },
        el('b', {}, cota ? 'Chegou no limite diário do Google. ' : 'Falhou. '),
        cota ? 'O Google grava até 200 contatos por dia. Os que faltam ficam guardados aqui — volte amanhã e clique de novo.'
             : (MOTIVOS[r.motivo] || (r.erros && r.erros.length ? r.erros[0].motivo : r.motivo || 'motivo desconhecido')),
        r.criados ? ` (${r.criados} foram gravados antes disso.)` : ''))
    }
    await renderAuditoria(); renderFila(); renderMetrics(); previewContato()
  }

  $('googleGravar') && $('googleGravar').addEventListener('click', (ev) => gravarGoogle(ev.target))
  $('googleGravarTudo') && $('googleGravarTudo').addEventListener('click', (ev) =>
    gravarGoogle(ev.target, { todos: true }))

  // ---------------------------------------------------------------------------
  // Agenda — exportar contatos em .vcf
  // ---------------------------------------------------------------------------
  function baixarArquivo(conteudo, nome, mime) {
    const blob = new Blob([conteudo], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = nome
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  async function exportarContatos(filtro, sufixo, rotulo) {
    const [q, config] = await Promise.all([FEIRAO.getQueue(), FEIRAO.getConfig()])
    const alvo = q.filter(filtro)
    if (!alvo.length) { alert(`Nenhum contato em "${rotulo}".`); return }
    const { conteudo, total, semTelefone } = FEIRAO.montarVcf(alvo, config)
    if (!total) { alert('Nenhum dos contatos tem celular válido.'); return }
    baixarArquivo(conteudo, FEIRAO.nomeArquivoVcf(config, sufixo), 'text/vcard')
    await FEIRAO.marcarContatosSalvos(alvo.map((c) => c.id))
    renderFila(); renderMetrics(); renderAuditoria()
    alert(`${total} contato${total > 1 ? 's' : ''} exportado${total > 1 ? 's' : ''}.`
      + (semTelefone ? `\n${semTelefone} ficaram de fora por não ter celular válido.` : '')
      + '\n\nAgora: Google Contatos → Importar → selecione o arquivo. O celular sincroniza sozinho,'
      + ' e o WhatsApp passa a mostrar o nome salvo.')
  }

  $('exportarPendentes').addEventListener('click', () =>
    exportarContatos((c) => c.vcardPendente && !c.contatoSalvo, 'novos', 'novos contatos'))
  $('exportarContatados').addEventListener('click', () =>
    exportarContatos((c) => (c.toques || 0) > 0 && c.status !== 'optout', 'contatados', 'já contatados'))
  $('exportarFila').addEventListener('click', () =>
    exportarContatos((c) => c.status !== 'optout' && c.status !== 'invalido', 'fila', 'fila inteira'))
  $('exportarAgendados').addEventListener('click', () =>
    exportarContatos((c) => !!c.agendadoPara, 'agendados', 'agendados'))

  // Atalho para acertar o atraso: grava todo mundo que já foi chamado e ainda
  // não está na agenda, sem depender do modo automático nem da marca antiga.
  $('gravarAtraso') && $('gravarAtraso').addEventListener('click', async () => {
    // pendentesGoogle: `contatoSalvo` só diz que um .vcf baixou um dia. Quem
    // não tem googleResourceName não está na agenda, e precisa entrar no arquivo.
    const [pend, config] = await Promise.all([FEIRAO.pendentesGoogle(), FEIRAO.getConfig()])
    if (!pend.length) { alert('Todos os clientes já chamados estão na agenda.'); return }
    const { conteudo, total } = FEIRAO.montarVcf(pend, config)
    if (!total) { alert('Nenhum dos pendentes tem celular válido.'); return }
    baixarArquivo(conteudo, FEIRAO.nomeArquivoVcf(config, 'atrasados'), 'text/vcard')
    await FEIRAO.registrarGravacaoAgenda(pend.map((c) => c.id))
    await renderAuditoria(); renderFila(); renderMetrics(); previewContato()
    alert(`${total} contato${total > 1 ? 's' : ''} no arquivo.\n\n`
      + 'Agora: Google Contatos → Importar → selecione o arquivo. O celular sincroniza sozinho.')
  })

  /** Mostra ao vivo como o nome vai ficar gravado, usando um cliente real da fila. */
  async function previewContato() {
    const [q, config] = await Promise.all([FEIRAO.getQueue(), FEIRAO.getConfig()])
    const cfg = {
      ...config,
      padraoContato: $('cfgPadraoContato').value || FEIRAO.DEFAULT_CONFIG.padraoContato,
      campanhaCurta: $('cfgCampanhaCurta').value || 'Feirão',
    }
    const c = q.find((x) => x.nome && x.veiculo && x.dataCompra) || {
      nome: 'JOSE ARNALDO DE SOUZA JUNIOR', veiculo: 'RENAULT KWID ZEN 1.0', dataCompra: '26/08/2023',
    }
    // Conta quem falta chegar na AGENDA — não quem falta baixar arquivo.
    const pend = (await FEIRAO.pendentesGoogle()).length
    const box = $('previewContato')
    box.innerHTML = ''
    box.appendChild(el('div', {}, 'Vai ficar assim na agenda: ',
      el('b', { style: 'font-size:13px' }, FEIRAO.nomeContato(c, cfg) || '(padrão vazio)')))
    box.appendChild(el('div', { style: 'margin-top:5px;font-size:11px' },
      pend ? `${pend} contato${pend > 1 ? 's' : ''} novo${pend > 1 ? 's' : ''} esperando gravação.`
           : 'Nenhum contato novo pendente no momento.'))

    // Modo desligado com fila esperando é a combinação que faz você achar que
    // está gravando quando não está.
    if (config.salvarContatoAuto === 'nao' && pend) {
      box.appendChild(el('div', { style: 'margin-top:6px' },
        el('b', { style: 'color:#b45309' }, 'A gravação automática está DESLIGADA. '),
        el('button', {
          class: 'ok', style: 'padding:4px 10px;font-size:11px;margin-left:4px',
          onclick: async () => {
            await FEIRAO.saveConfig({ salvarContatoAuto: 'auto' })
            $('cfgSalvarContatoAuto').value = 'auto'
            previewContato()
          },
        }, 'Ligar agora')))
    }
  }
  $('cfgPadraoContato').addEventListener('input', previewContato)
  $('cfgCampanhaCurta').addEventListener('input', previewContato)

  // ---------------------------------------------------------------------------
  // Importadores
  // ---------------------------------------------------------------------------
  const RE_TEL = /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}/g
  const RE_PLACA = /\b([A-Z]{3}[\s-]?\d[A-Z]\d{2}|[A-Z]{3}[\s-]?\d{4})\b/
  const RE_DATA = /\b(\d{2}\/\d{2}\/\d{4})\b/
  const RE_ANO = /\b(19[89]\d|20[0-4]\d)\b/

  /** Varre texto livre (colado do PDF) e extrai contatos linha a linha. */
  function parseTextoLivre(txt) {
    const out = []
    const linhas = String(txt || '').split(/\r?\n/)
    linhas.forEach((linha, idx) => {
      const l = linha.trim()
      if (l.length < 8) return
      const tels = l.match(RE_TEL)
      if (!tels || !tels.length) return

      // usa o telefone mais longo da linha (evita pegar pedaço de CPF/valor)
      const telBruto = tels.sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)[0]
      const norm = FEIRAO.normalizarTelefone(telBruto)

      let resto = l.replace(telBruto, ' ')
      const placa = (resto.toUpperCase().match(RE_PLACA) || [])[1] || ''
      if (placa) resto = resto.replace(new RegExp(placa.replace(/[-\s]/g, '[-\\s]?'), 'i'), ' ')
      const data = (resto.match(RE_DATA) || [])[1] || ''
      if (data) resto = resto.replace(data, ' ')
      // remove CPF/CNPJ e valores
      resto = resto.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, ' ')
      resto = resto.replace(/R\$\s?[\d.,]+/g, ' ')

      const ano = (resto.match(RE_ANO) || [])[1] || ''
      const pedacos = resto.split(/\s{2,}|\t|\s\|\s|;/).map((s) => s.trim()).filter((s) => s.length > 1)

      // nome = primeiro pedaço majoritariamente alfabético; veículo = próximo pedaço com letras
      const ehNome = (s) => /^[A-Za-zÀ-ÿ'.\s]{4,}$/.test(s)
      let nome = pedacos.find(ehNome) || ''
      let veiculo = pedacos.filter((s) => s !== nome).find((s) => /[A-Za-zÀ-ÿ]{3,}/.test(s)) || ''
      if (!nome && veiculo) { nome = veiculo; veiculo = '' }
      if (!nome) {
        const m = resto.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\s]{4,}/)
        nome = m ? m[0].trim() : ''
      }

      out.push({
        nome: limparNome(nome), telefoneBruto: telBruto,
        telefone: norm.e164 || '', valido: norm.ok, motivo: norm.motivo || '',
        veiculo: (veiculo || '').replace(/\s{2,}/g, ' ').trim(), ano, placa: placa.replace(/[\s-]/g, ''),
        dataCompra: data, origem: 'texto colado', linha: idx + 1,
      })
    })
    return out
  }

  function limparNome(s) {
    return String(s || '').replace(/\s{2,}/g, ' ').replace(/[|;,]+$/, '').trim()
  }

  let csvBruto = null // { head, rows } da última planilha lida, para remapear colunas

  /** CSV/TSV com cabeçalho, separador detectado automaticamente. */
  function parseCsv(txt) {
    const linhas = FEIRAO.repararTexto(String(txt || '')).split(/\r?\n/).filter((l) => l.trim())
    if (!linhas.length) return []
    const sep = [';', '\t', ','].map((s) => ({ s, n: (linhas[0].match(new RegExp('\\' + s, 'g')) || []).length }))
      .sort((a, b) => b.n - a.n)[0].s
    const split = (l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim())
    const head = split(linhas[0]).map((h) => h.toLowerCase())
    const acha = (...alts) => head.findIndex((h) => alts.some((a) => h.includes(a)))
    const iNome = acha('nome', 'cliente', 'razão', 'razao')
    const iTel = acha('celular', 'telefone', 'contato', 'whats', 'fone')
    const iVei = acha('veículo', 'veiculo', 'modelo', 'carro', 'descrição', 'descricao')
    const iAno = acha('ano')
    const iPla = acha('placa')
    const iDat = acha('data', 'compra', 'negocia')
    const iVen = acha('vendedor', 'consultor')
    csvBruto = { head: split(linhas[0]), rows: linhas.slice(1).map(split) }
    mapa = { nome: iNome, tel: iTel, veiculo: iVei, ano: iAno, placa: iPla, data: iDat, vendedor: iVen }

    return linhas.slice(1).map((l, idx) => {
      const c = split(l)
      const norm = FEIRAO.normalizarTelefone(iTel >= 0 ? c[iTel] : '')
      return {
        nome: limparNome(iNome >= 0 ? c[iNome] : ''),
        telefoneBruto: iTel >= 0 ? c[iTel] : '',
        telefone: norm.e164 || '', valido: norm.ok, motivo: norm.motivo || '',
        veiculo: iVei >= 0 ? c[iVei] : '', ano: iAno >= 0 ? c[iAno] : '',
        placa: iPla >= 0 ? c[iPla] : '', dataCompra: iDat >= 0 ? c[iDat] : '',
        vendedor: iVen >= 0 ? c[iVen] : '', origem: 'planilha', linha: idx + 2,
      }
    }).filter((r) => r.telefoneBruto)
  }

  /** Última busca do AutoConf guardada pela tela principal da extensão. */
  async function parseAutoconf(mesesMin, mesesMax) {
    const st = await FEIRAO.get(['autoconfLastResult', 'autoconfUltimoScan'])
    const res = st.autoconfLastResult || st.autoconfUltimoScan
    const rows = res && Array.isArray(res.rows) ? res.rows : null
    if (!rows) return { erro: 'Nenhuma busca do AutoConf encontrada. Faça uma busca na tela principal da extensão primeiro.' }

    const agora = new Date()
    const dentro = (d) => {
      const dt = FEIRAO.parseData(d)
      if (!dt) return false
      const meses = (agora.getFullYear() - dt.getFullYear()) * 12 + (agora.getMonth() - dt.getMonth())
      return meses >= mesesMin && meses <= mesesMax
    }

    const out = []
    rows.forEach((r, idx) => {
      const det = r.clienteDetalhes || {}
      const tel = det.telefone || r.clienteContato || det.celular || ''
      const data = r.dataNegociacao || r.finalizadoEm || r.criadoEm || ''
      if (!dentro(data)) return
      const veic = Array.isArray(r.veiculosSaida) && r.veiculosSaida.length
        ? (r.veiculosSaida[0].descricao || r.veiculosSaida[0].modelo || '')
        : ''
      const norm = FEIRAO.normalizarTelefone(tel)
      out.push({
        nome: limparNome(det.nome || r.cliente || ''),
        telefoneBruto: tel, telefone: norm.e164 || '', valido: norm.ok, motivo: norm.motivo || '',
        veiculo: veic,
        ano: (Array.isArray(r.veiculosSaida) && r.veiculosSaida[0] && r.veiculosSaida[0].ano) || '',
        placa: (Array.isArray(r.veiculosSaida) && r.veiculosSaida[0] && r.veiculosSaida[0].placa) || '',
        dataCompra: data, vendedor: r.vendedor || '', origem: `AutoConf ${r.externalId || ''}`.trim(), linha: idx + 1,
      })
    })
    return { itens: out }
  }

  // ---------- prévia -------------------------------------------------------
  async function mostrarPrevia(itens) {
    const [q, block] = await Promise.all([FEIRAO.getQueue(), FEIRAO.getBlocklist()])
    const jaNaFila = new Set(q.map((c) => c.telefone))
    const vistos = new Set()

    itens.forEach((i) => {
      if (!i.valido) i.situacao = i.motivo || 'telefone inválido'
      else if (block.includes(i.telefone)) i.situacao = 'na lista de não perturbe'
      else if (jaNaFila.has(i.telefone)) i.situacao = 'já está na fila'
      else if (vistos.has(i.telefone)) i.situacao = 'duplicado no arquivo'
      else { i.situacao = 'ok'; vistos.add(i.telefone) }
    })

    previa = itens
    renderMapeamento(itens)
    const ok = itens.filter((i) => i.situacao === 'ok').length
    const semNome = itens.filter((i) => i.situacao === 'ok' && !i.nome).length
    const semVeic = itens.filter((i) => i.situacao === 'ok' && !i.veiculo).length

    $('previaCard').classList.remove('hidden')
    $('previaResumo').innerHTML =
      `<b>${ok}</b> contatos válidos de ${itens.length} linhas lidas. ` +
      `${itens.length - ok} descartados (inválido, duplicado, já na fila ou opt-out).` +
      (semNome ? ` <b>Atenção:</b> ${semNome} sem nome — a mensagem fica impessoal, vale corrigir.` : '') +
      (semVeic ? ` ${semVeic} sem veículo identificado — o texto cai para "seu carro".` : '')

    const tb = $('previaTabela').querySelector('tbody')
    tb.innerHTML = ''
    itens.slice(0, 300).forEach((i) => {
      tb.appendChild(el('tr', {},
        el('td', {}, i.nome || el('span', { style: 'color:#b91c1c' }, 'sem nome')),
        el('td', {}, i.telefone ? FEIRAO.formatarTelefoneBR(i.telefone) : String(i.telefoneBruto || '')),
        el('td', {}, `${i.veiculo || '—'}${i.ano ? ' ' + i.ano : ''}`),
        el('td', {}, i.dataCompra || '—'),
        el('td', {}, el('span', { class: 'tag ' + (i.situacao === 'ok' ? 't-pendente' : 't-invalido') }, i.situacao)),
      ))
    })
  }

  /** Refaz a prévia usando o mapeamento de colunas escolhido à mão. */
  function aplicarMapa() {
    if (!csvBruto || !mapa) return
    const col = (r, i) => (i >= 0 && i < r.length ? r[i] : '')
    const itens = csvBruto.rows.map((c, idx) => {
      const bruto = col(c, mapa.tel)
      const norm = FEIRAO.normalizarTelefone(bruto)
      return {
        nome: limparNome(col(c, mapa.nome)), telefoneBruto: bruto,
        telefone: norm.e164 || '', valido: norm.ok, motivo: norm.motivo || '',
        veiculo: col(c, mapa.veiculo), ano: col(c, mapa.ano), placa: col(c, mapa.placa),
        dataCompra: col(c, mapa.data), vendedor: col(c, mapa.vendedor),
        origem: 'planilha', linha: idx + 2,
      }
    }).filter((r) => r.telefoneBruto)
    mostrarPrevia(itens)
  }

  /** Seletores de coluna + aviso de nome/veículo invertidos. */
  function renderMapeamento(itens) {
    const box = $('mapeamento')
    box.innerHTML = ''
    if (!csvBruto || !mapa) { box.classList.add('hidden'); return }
    box.classList.remove('hidden')

    const trocados = itens.filter((i) => FEIRAO.pareceTrocado(i.nome, i.veiculo)).length
    if (trocados > itens.length * 0.3) {
      box.appendChild(el('div', { class: 'alert stop' },
        el('b', {}, `Atenção: em ${trocados} de ${itens.length} linhas o nome parece ser o veículo e vice-versa. `),
        'Se importar assim, a mensagem vai sair "Oi, Kwid!". ',
        el('button', {
          class: 'primary', style: 'margin-left:6px;padding:5px 11px;font-size:11px',
          onclick: () => { const t = mapa.nome; mapa.nome = mapa.veiculo; mapa.veiculo = t; aplicarMapa() },
        }, 'Trocar Nome ↔ Veículo')))
    }

    const campos = [['nome', 'Nome'], ['tel', 'Telefone'], ['veiculo', 'Veículo'],
      ['ano', 'Ano'], ['placa', 'Placa'], ['data', 'Data da compra'], ['vendedor', 'Vendedor']]
    const grade = el('div', { class: 'g4' })
    campos.forEach(([k, rot]) => {
      const sel = el('select', { onchange: (e) => { mapa[k] = Number(e.target.value); aplicarMapa() } })
      sel.appendChild(el('option', { value: '-1' }, '— não usar —'))
      csvBruto.head.forEach((h, i) => {
        const o = el('option', { value: String(i) }, `${i + 1}. ${h || '(sem título)'}`)
        if (mapa[k] === i) o.setAttribute('selected', 'selected')
        sel.appendChild(o)
      })
      grade.appendChild(el('div', {}, el('label', {}, rot), sel))
    })
    box.appendChild(el('div', {}, el('h2', {}, 'De qual coluna vem cada campo'), grade,
      el('div', { class: 'mini' }, 'Detectado pelo cabeçalho. Se alguma coluna estiver no campo errado, corrija aqui — a prévia se refaz na hora.')))
  }

  $('parseColar').addEventListener('click', () => {
    csvBruto = null; mapa = null
    const itens = parseTextoLivre(FEIRAO.repararTexto($('colar').value))
    if (!itens.length) return alert('Não encontrei nenhum telefone brasileiro no texto colado. Confira se o PDF copiou o conteúdo (alguns PDFs escaneados só têm imagem — nesse caso precisa de OCR).')
    mostrarPrevia(itens)
  })

  $('arquivoCsv').addEventListener('change', (e) => {
    const f = e.target.files[0]
    if (!f) return
    const fr = new FileReader()
    fr.onload = () => {
      const itens = parseCsv(fr.result)
      if (!itens.length) return alert('Não consegui ler linhas com telefone nesse arquivo.')
      mostrarPrevia(itens)
    }
    fr.readAsText(f, 'utf-8')
  })

  $('importAutoconf').addEventListener('click', async () => {
    const min = Number($('mesesMin').value) || 0
    const max = Number($('mesesMax').value) || 999
    csvBruto = null; mapa = null
    const r = await parseAutoconf(min, max)
    if (r.erro) return alert(r.erro)
    if (!r.itens.length) return alert('Nenhum cliente na faixa de meses informada.')
    mostrarPrevia(r.itens)
  })

  // Conserta uma fila que já entrou com as colunas invertidas.
  $('corrigirTrocados').addEventListener('click', async () => {
    const q = await FEIRAO.getQueue()
    const alvo = q.filter((c) => FEIRAO.pareceTrocado(c.nome, c.veiculo))
    if (!alvo.length) return alert('Nenhum registro parece invertido. Nada a corrigir.')
    const amostra = alvo.slice(0, 5).map((c) => `  "${c.nome}"  ↔  "${c.veiculo}"`).join('\n')
    if (!confirm(`${alvo.length} de ${q.length} clientes parecem estar com nome e veículo trocados.\n\n${amostra}${alvo.length > 5 ? '\n  ...' : ''}\n\nTrocar os dois campos nesses registros?`)) return
    alvo.forEach((c) => { const t = c.nome; c.nome = c.veiculo; c.veiculo = t })
    q.forEach((c) => { c.nome = FEIRAO.repararTexto(c.nome); c.veiculo = FEIRAO.repararTexto(c.veiculo) })
    await FEIRAO.saveQueue(q)
    await FEIRAO.appendLog({ tipo: 'correcao', quantidade: alvo.length, detalhe: 'nome ↔ veículo' })
    alert(`${alvo.length} registros corrigidos.`)
    renderFila(); carregarPreviewSelect()
  })

  $('cancelarImport').addEventListener('click', () => { previa = null; $('previaCard').classList.add('hidden') })

  $('confirmarImport').addEventListener('click', async () => {
    if (!previa) return
    const q = await FEIRAO.getQueue()
    const novos = previa.filter((i) => i.situacao === 'ok').map((i) => ({
      id: 'c_' + i.telefone + '_' + Math.random().toString(36).slice(2, 7),
      nome: FEIRAO.nomeLimpoContato(i.nome), telefone: i.telefone, veiculo: i.veiculo, ano: i.ano, placa: i.placa,
      dataCompra: i.dataCompra, vendedor: i.vendedor || '', origem: i.origem,
      status: 'pendente', toques: 0, criadoEm: Date.now(),
    }))
    // embaralha na entrada: ordem de arquivo é padrão detectável
    for (let i = novos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[novos[i], novos[j]] = [novos[j], novos[i]] }
    await FEIRAO.saveQueue(q.concat(novos))
    await FEIRAO.appendLog({ tipo: 'import', quantidade: novos.length, origem: novos[0] ? novos[0].origem : '' })
    previa = null
    $('previaCard').classList.add('hidden')
    $('colar').value = ''
    alert(`${novos.length} clientes adicionados à fila.`)
    renderFila(); renderMetrics(); carregarPreviewSelect()
    document.querySelector('.tab[data-tab="fila"]').click()
  })

  // ---------------------------------------------------------------------------
  // Mensagens
  // ---------------------------------------------------------------------------
  async function templatesAtuais() {
    const st = await FEIRAO.get(FEIRAO.K.tpl)
    const custom = st[FEIRAO.K.tpl] || {}
    return FEIRAO.TEMPLATES_PRIMEIRO.map((t) => ({ ...t, texto: custom[t.id] || t.texto }))
      .concat([{ ...FEIRAO.TEMPLATE_FOLLOWUP, texto: custom[FEIRAO.TEMPLATE_FOLLOWUP.id] || FEIRAO.TEMPLATE_FOLLOWUP.texto }])
  }

  async function carregarTemplates() {
    const tpls = await templatesAtuais()
    const sel = $('tplSelect')
    sel.innerHTML = ''
    tpls.forEach((t, i) => sel.appendChild(el('option', { value: String(i) }, `${i < 6 ? (i + 1) + '. ' : '↻ '}${t.nome}`)))
    sel.onchange = async () => { $('tplTexto').value = (await templatesAtuais())[Number(sel.value)].texto }
    $('tplTexto').value = tpls[0].texto

    /** Nenhum texto com promessa comercial pode ser salvo. Vale para abertura,
        follow-up e playbook — a política é uma só. */
    function bloqueiaSalvar(texto) {
      const pol = FEIRAO.validarPolitica(texto)
      if (pol.ok) {
        if (pol.avisos.length) {
          return !confirm('Atenção — confira se está autorizado na campanha:\n\n'
            + pol.avisos.map((v) => `• "${v.trecho}" — ${v.porque}`).join('\n\n')
            + '\n\nSalvar mesmo assim?')
        }
        return false
      }
      alert('Não dá pra salvar: este texto promete resultado comercial.\n\n'
        + pol.bloqueios.map((v) => `• ${v.nome}: "${v.trecho}"\n  ${v.porque}\n  Em vez disso: ${v.alternativa}`).join('\n\n')
        + '\n\nO SDR vende a oportunidade de negociar, não o resultado da negociação.')
      return true
    }

    $('salvarTpl').onclick = async () => {
      if (bloqueiaSalvar($('tplTexto').value)) return
      const tpls2 = await templatesAtuais()
      const t = tpls2[Number(sel.value)]
      const st = await FEIRAO.get(FEIRAO.K.tpl)
      const custom = st[FEIRAO.K.tpl] || {}
      custom[t.id] = $('tplTexto').value
      await FEIRAO.set({ [FEIRAO.K.tpl]: custom })
      await FEIRAO.carregarCustom()
      alert('Texto salvo. O painel do WhatsApp Web já passa a usar esta versão.')
      atualizarPreview()
    }
    $('restaurarTpl').onclick = async () => {
      const idx = Number(sel.value)
      const orig = idx < 6 ? FEIRAO.TEMPLATES_PRIMEIRO[idx] : FEIRAO.TEMPLATE_FOLLOWUP
      const st = await FEIRAO.get(FEIRAO.K.tpl)
      const custom = st[FEIRAO.K.tpl] || {}
      delete custom[orig.id]
      await FEIRAO.set({ [FEIRAO.K.tpl]: custom })
      await FEIRAO.carregarCustom()
      $('tplTexto').value = orig.texto
      atualizarPreview()
    }

    // playbook de respostas, agrupado por momento da conversa
    const config = await FEIRAO.getConfig()
    const box = $('respostas')
    box.innerHTML = ''
    const grupos = []
    FEIRAO.PLAYBOOK.forEach((r) => {
      let g = grupos.find((x) => x.nome === r.grupo)
      if (!g) { g = { nome: r.grupo, itens: [] }; grupos.push(g) }
      g.itens.push(r)
    })
    const exemplo = { nome: 'MARCOS ANTONIO PEREIRA', veiculo: 'FIAT ARGO DRIVE 1.3', ano: '2021',
      dataCompra: '15/03/2023', vendedor: config.vendedor }
    grupos.forEach((g) => {
      box.appendChild(el('div', { style: 'font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#1e40af;margin:12px 0 6px' }, g.nome))
      g.itens.forEach((r) => {
        const ta = el('textarea', { style: 'min-height:70px;font-size:11.5px' })
        ta.value = FEIRAO.montarResposta(exemplo, config, r.id)
        box.appendChild(el('div', { style: 'margin-bottom:9px' },
          el('label', {}, r.nome), ta,
          el('div', { class: 'row', style: 'margin-top:4px' },
            el('button', {
              class: 'ghost', style: 'padding:5px 10px;font-size:11px',
              onclick: (e) => { navigator.clipboard.writeText(ta.value); e.target.textContent = 'Copiado' ; setTimeout(()=>{e.target.textContent='Copiar'},1200) },
            }, 'Copiar'),
            el('button', {
              class: 'ghost', style: 'padding:5px 10px;font-size:11px',
              onclick: async () => {
                if (bloqueiaSalvar(ta.value)) return
                const st = await FEIRAO.get(FEIRAO.K.tpl)
                const custom = st[FEIRAO.K.tpl] || {}
                custom[r.id] = ta.value
                await FEIRAO.set({ [FEIRAO.K.tpl]: custom })
                await FEIRAO.carregarCustom()
                alert('Resposta salva — o painel do WhatsApp Web já usa esta versão.')
              },
            }, 'Salvar edição'))))
      })
    })
  }

  async function carregarPreviewSelect() {
    const q = await FEIRAO.getQueue()
    const sel = $('previewContato')
    sel.innerHTML = ''
    if (!q.length) {
      sel.appendChild(el('option', { value: '' }, 'importe clientes para ver a prévia com dados reais'))
    } else {
      q.slice(0, 100).forEach((c) => sel.appendChild(el('option', { value: c.id }, `${c.nome || FEIRAO.formatarTelefoneBR(c.telefone)} — ${c.veiculo || 'sem veículo'}`)))
    }
    sel.onchange = atualizarPreview
    atualizarPreview()
  }

  async function atualizarPreview() {
    const [q, config] = await Promise.all([FEIRAO.getQueue(), FEIRAO.getConfig()])
    const id = $('previewContato').value
    const c = q.find((x) => x.id === id) || {
      nome: 'MARCOS ANTONIO PEREIRA', telefone: '5511987654321',
      veiculo: 'FIAT ARGO DRIVE 1.3', ano: '2021', placa: 'ABC1D23', dataCompra: '15/03/2023', vendedor: config.vendedor,
    }
    const idx = Number($('tplSelect').value) || 0
    const variante = idx >= 6 ? 'followup' : idx
    // A mensagem do cliente é fixa (não muda entre conferir e enviar). Só a
    // pré-visualização sorteia de novo, para você ver a variedade do gerador.
    const txt = FEIRAO.montarMensagem(c, config, variante, sorteioPreview)
    $('previewTexto').textContent = txt
    const probs = FEIRAO.auditarMensagem(txt)
    const promessa = probs.some((p) => p.startsWith('PROMESSA COMERCIAL'))
    $('previewAudit').innerHTML = probs.length
      ? `<div class="alert ${promessa ? 'stop' : 'warn'}" style="margin-top:8px"><b>${promessa ? 'Bloqueado pela política comercial:' : 'Revise:'}</b><ul style="margin:4px 0 0;padding-left:16px">${probs.map((p) => `<li>${p}</li>`).join('')}</ul></div>`
      : `<div class="alert info" style="margin-top:8px">Aprovada: ${txt.length} caracteres, sem link, sem promessa de valor, taxa ou avaliação, com dado pessoal do cliente e uma pergunta no final.<br><b>${FEIRAO.combinacoesPossiveis().toLocaleString('pt-BR')}</b> combinações diferentes no gerador — cada cliente recebe um texto próprio, e clicar em "sortear outra" mostra outra delas.</div>`
  }

  // Verificador manual: cola qualquer texto e vê o que a política diz.
  function renderPolitica() {
    const box = $('politicaBox')
    if (!box) return
    box.innerHTML = ''
    const ta = el('textarea', { id: 'politicaTexto', placeholder: 'Cole aqui qualquer mensagem — sua ou de um vendedor da equipe — para conferir antes de mandar.', style: 'min-height:88px' })
    const saida = el('div', { style: 'margin-top:8px' })
    const checar = () => {
      const pol = FEIRAO.validarPolitica(ta.value)
      saida.innerHTML = ''
      if (!ta.value.trim()) return
      if (pol.ok && !pol.avisos.length) {
        saida.appendChild(el('div', { class: 'alert info' }, 'Aprovado pela política comercial.')); return
      }
      pol.violacoes.forEach((v) => {
        saida.appendChild(el('div', { class: 'alert ' + (v.gravidade === 'bloqueia' ? 'stop' : 'warn') },
          el('b', {}, `${v.gravidade === 'bloqueia' ? 'Bloqueado' : 'Confira'} — ${v.nome}: `),
          el('code', { style: 'background:rgba(0,0,0,.06);padding:1px 4px;border-radius:4px' }, `"${v.trecho}"`),
          el('div', { style: 'margin-top:4px' }, v.porque),
          el('div', { style: 'margin-top:3px' }, el('b', {}, 'Em vez disso: '), v.alternativa)))
      })
    }
    ta.addEventListener('input', checar)
    box.appendChild(ta); box.appendChild(saida)

    const regras = $('politicaRegras')
    if (regras) {
      regras.innerHTML = ''
      FEIRAO.POLITICA.regras.forEach((r) => {
        regras.appendChild(el('tr', {},
          el('td', {}, el('span', { class: 'tag ' + (r.gravidade === 'bloqueia' ? 't-invalido' : 't-aguardando_resposta') }, r.gravidade === 'bloqueia' ? 'bloqueia' : 'confira')),
          el('td', { style: 'font-weight:600' }, r.nome),
          el('td', {}, r.porque),
          el('td', {}, r.alternativa)))
      })
    }
    const ok = $('politicaAprovadas')
    if (ok) { ok.innerHTML = ''; FEIRAO.POLITICA.aprovadas.forEach((f) => ok.appendChild(el('li', {}, f))) }
  }

  let sorteioPreview = 0
  $('reroll').addEventListener('click', () => { sorteioPreview++; atualizarPreview() })
  $('tplSelect') && $('tplSelect').addEventListener('change', atualizarPreview)

  // ---------------------------------------------------------------------------
  // Relatórios
  // ---------------------------------------------------------------------------
  const pctTxt = (v) => (v == null ? '—' : Math.round(v * 100) + '%')

  function barra(rotulo, n, base, extra) {
    const largura = base ? Math.max(3, Math.round((n / base) * 100)) : 3
    return el('div', { style: 'margin-bottom:9px' },
      el('div', { style: 'display:flex;justify-content:space-between;font-size:11.5px;color:#475569;margin-bottom:3px' },
        el('span', {}, rotulo), el('span', {}, `${n}${extra ? '  ·  ' + extra : ''}`)),
      el('div', { style: 'height:10px;background:#f1f5f9;border-radius:6px;overflow:hidden' },
        el('div', { style: `height:10px;width:${largura}%;background:#1e40af;border-radius:6px` })))
  }

  async function renderRelatorios() {
    if (!$('relFunil')) return
    const [r, config] = await Promise.all([FEIRAO.relatorio(), FEIRAO.getConfig()])

    // funil
    const f = $('relFunil'); f.innerHTML = ''
    const base = r.total || 1
    f.appendChild(barra('Na lista', r.total, base))
    f.appendChild(barra('Contatados', r.contatados, base, pctTxt(r.contatados / base)))
    f.appendChild(barra('Responderam', r.responderam, base, pctTxt(r.taxaResposta) + ' de quem foi contatado'))
    f.appendChild(barra('Agendaram', r.agendaram, base, pctTxt(r.taxaAgenda) + ' de quem respondeu'))
    f.appendChild(barra('Compareceram', r.compareceram, base, pctTxt(r.taxaComparecimento) + ' dos agendados'))
    const h = (ms) => {
      if (ms == null) return '—'
      const min = Math.round(ms / 60000)
      if (min < 60) return min + ' min'
      const hrs = Math.round(min / 60)
      return hrs < 48 ? hrs + 'h' : Math.round(hrs / 24) + ' dias'
    }
    f.appendChild(el('div', { class: 'mini' },
      `Tempo mediano até a resposta: ${h(r.medianaRespostaMs)} · `,
      `Pediram para não receber: ${r.optout} (${pctTxt(r.taxaOptout)}) · `,
      `Sem WhatsApp: ${r.semWhats} · `,
      `Detectadas automaticamente: ${r.detectadasAuto}`))
    if (r.taxaOptout != null && r.taxaOptout > 0.05) {
      f.appendChild(el('div', { class: 'alert warn', style: 'margin-top:10px' },
        el('b', {}, 'Opt-out acima de 5%. '),
        'Isso é alto para base própria e costuma anteceder queda de qualidade do número. Revise o texto e a segmentação antes de continuar a fila.'))
    }

    // por variante
    const tv = $('relVariantes').querySelector('tbody'); tv.innerHTML = ''
    const ordenadas = [...r.porVariante].sort((a, b) => (b.taxaResposta || -1) - (a.taxaResposta || -1))
    ordenadas.forEach((v) => {
      const pouco = v.enviados < 5
      tv.appendChild(el('tr', {},
        el('td', {}, `${v.indice + 1}. ${v.nome}`),
        el('td', {}, String(v.enviados)),
        el('td', {}, String(v.respostas)),
        el('td', { style: pouco ? 'color:#94a3b8' : 'font-weight:700;color:#1e40af' },
          pouco ? (v.enviados ? 'poucos dados' : '—') : pctTxt(v.taxaResposta)),
        el('td', {}, String(v.agendamentos))))
    })

    // por dia
    const td = $('relDias').querySelector('tbody'); td.innerHTML = ''
    if (!r.porDia.length) {
      td.appendChild(el('tr', {}, el('td', { colspan: '5', style: 'color:#94a3b8;padding:12px' },
        'Nada registrado ainda.')))
    }
    ;[...r.porDia].reverse().forEach((d) => {
      const [a, m, dia] = d.dia.split('-')
      td.appendChild(el('tr', {},
        el('td', {}, `${dia}/${m}`),
        el('td', {}, String(d.enviados)),
        el('td', {}, String(d.respostas)),
        el('td', {}, String(d.agendamentos)),
        el('td', { style: d.optout ? 'color:#b91c1c' : '' }, String(d.optout))))
    })

    $('relResumo').textContent = FEIRAO.resumoTexto(r, config)
  }

  $('copiarResumo') && $('copiarResumo').addEventListener('click', async () => {
    const [r, config] = await Promise.all([FEIRAO.relatorio(), FEIRAO.getConfig()])
    const txt = FEIRAO.resumoTexto(r, config)
    navigator.clipboard.writeText(txt)
      .then(() => { $('copiarResumo').textContent = 'Copiado ✓'; setTimeout(() => { $('copiarResumo').textContent = 'Copiar resumo para o grupo' }, 1500) })
      .catch(() => alert(txt))
  })

  $('atualizarRel') && $('atualizarRel').addEventListener('click', renderRelatorios)

  $('baixarCsvRel') && $('baixarCsvRel').addEventListener('click', async () => {
    const [q, config] = await Promise.all([FEIRAO.getQueue(), FEIRAO.getConfig()])
    const esc = (v) => {
      const s = String(v == null ? '' : v)
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const dt = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR') : '')
    const cab = ['nome', 'telefone', 'veiculo', 'placa', 'data_compra', 'status', 'toques',
      'variante', 'enviado_em', 'respondeu_em', 'resposta_automatica', 'previa_resposta',
      'agendado_para', 'canal', 'contato_salvo']
    const linhas = q.map((c) => [
      c.nome, FEIRAO.formatarTelefoneBR(c.telefone), c.veiculo, c.placa, c.dataCompra, c.status,
      c.toques || 0,
      typeof c.varianteUsada === 'number' ? c.varianteUsada + 1 : (c.varianteUsada || ''),
      dt(c.ultimoToqueEm), dt(c.respondeuEm), c.respostaDetectada ? 'sim' : '',
      c.previaResposta || '', c.agendadoPara ? String(c.agendadoPara).replace('T', ' ') : '',
      c.canalPreferido || '', c.contatoSalvo ? 'sim' : '',
    ].map(esc).join(';'))
    // BOM para o Excel em português abrir com acento certo
    baixarArquivo('﻿' + [cab.join(';'), ...linhas].join('\r\n'),
      `campanha-${FEIRAO.hojeStr()}.csv`, 'text/csv')
  })

  // ---------------------------------------------------------------------------
  // Agenda — o desfecho que realmente conta
  // ---------------------------------------------------------------------------
  async function renderAgenda() {
    const q = await FEIRAO.getQueue()
    const ag = q.filter((c) => c.agendadoPara)
      .sort((a, b) => String(a.agendadoPara).localeCompare(String(b.agendadoPara)))
    const tb = $('tabelaAgenda').querySelector('tbody')
    tb.innerHTML = ''
    if (!ag.length) {
      tb.appendChild(el('tr', {}, el('td', { colspan: '7', style: 'color:#94a3b8;padding:14px' },
        'Nenhum horário marcado ainda. No painel do WhatsApp Web, quando o cliente aceitar, use o botão "Agendou".')))
    }
    ag.forEach((c) => {
      const quando = String(c.agendadoPara).replace('T', ' às ')
      tb.appendChild(el('tr', {},
        el('td', { style: 'font-weight:700' }, quando),
        el('td', {}, c.nome || '—'),
        el('td', {}, c.canalPreferido === 'telefone' ? 'ligação' : (c.canalPreferido === 'loja' ? 'visita' : 'WhatsApp')),
        el('td', {}, FEIRAO.formatarTelefoneBR(c.telefone)),
        el('td', {},
          el('div', {}, `${c.veiculo || '—'}${c.ano ? ' ' + c.ano : ''}`),
          c.vendedor ? el('div', { style: 'font-size:9.5px;color:#94a3b8' }, 'com ' + c.vendedor) : '',
          c.obsAtendimento ? el('div', { style: 'font-size:9.5px;color:#64748b' }, c.obsAtendimento) : ''),
        el('td', {}, el('span', { class: 'tag t-' + c.status }, LABEL[c.status] || c.status)),
        el('td', {}, el('div', { style: 'display:flex;gap:4px' },
          el('button', { class: 'ghost', style: 'padding:3px 8px;font-size:10px',
            onclick: async () => { await FEIRAO.definirStatusManual(c.id, 'compareceu'); renderAgenda(); renderMetrics(); renderFila() } }, 'veio'),
          el('button', { class: 'ghost', style: 'padding:3px 8px;font-size:10px',
            onclick: async () => { await FEIRAO.definirStatusManual(c.id, 'faltou'); renderAgenda(); renderMetrics(); renderFila() } }, 'faltou'))),
      ))
    })

    // funil
    const cont = (s) => q.filter((c) => c.status === s).length
    const enviados = q.filter((c) => (c.toques || 0) > 0).length
    const responderam = q.filter((c) => ['respondeu', 'agendado', 'compareceu', 'faltou'].includes(c.status)).length
    const agendaram = q.filter((c) => c.agendadoPara).length
    const vieram = cont('compareceu')
    const pct = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '—')
    const etapas = [
      ['Na fila', q.length, ''],
      ['Contatados', enviados, pct(enviados, q.length)],
      ['Responderam', responderam, pct(responderam, enviados)],
      ['Agendaram', agendaram, pct(agendaram, responderam)],
      ['Compareceram', vieram, pct(vieram, agendaram)],
    ]
    $('funil').innerHTML = ''
    etapas.forEach(([rot, n, p]) => {
      const largura = q.length ? Math.max(4, Math.round((n / q.length) * 100)) : 4
      $('funil').appendChild(el('div', { style: 'margin-bottom:8px' },
        el('div', { style: 'display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:3px' },
          el('span', {}, rot), el('span', {}, `${n}${p ? '  ·  ' + p : ''}`)),
        el('div', { style: 'height:9px;background:#f1f5f9;border-radius:6px;overflow:hidden' },
          el('div', { style: `height:9px;width:${largura}%;background:#1e40af;border-radius:6px` }))))
    })
    $('funil').appendChild(el('div', { class: 'mini' },
      'Taxa de resposta abaixo de 15% quer dizer que a abertura não está funcionando — troque o texto antes de continuar a fila. '
      + 'Taxa de resposta boa com poucos agendamentos quer dizer que o problema é o meio da conversa: use o playbook.'))
  }

  // ---------------------------------------------------------------------------
  // Configuração
  // ---------------------------------------------------------------------------
  const MAP = {
    cfgLoja: 'loja', cfgCidade: 'cidade', cfgVendedor: 'vendedor', cfgFeiraoAte: 'feiraoAte',
    cfgFeiraoNome: 'feiraoNome', cfgFeiraoPeriodo: 'feiraoPeriodo', cfgAnoMinimo: 'anoMinimo',
    cfgBeneficios: 'beneficios', cfgAutoAbrirSegundos: 'autoAbrirSegundos',
    cfgPadraoContato: 'padraoContato', cfgCampanhaCurta: 'campanhaCurta',
    cfgSalvarContatoAuto: 'salvarContatoAuto',
    cfgDetectarIntervaloSeg: 'detectarIntervaloSeg', cfgRetomarDias: 'retomarDias',
    cfgSalvarContatoLote: 'salvarContatoLote', cfgSalvarContatoMinutos: 'salvarContatoMinutos',
    cfgMaxDia: 'maxPorDia', cfgMaxToques: 'maxToques', cfgMin: 'minIntervaloSeg', cfgMax: 'maxIntervaloSeg',
    cfgPausaACada: 'pausaACada', cfgPausaMin: 'pausaLongaMin', cfgPausaMax: 'pausaLongaMax',
    cfgHoraIni: 'horaInicio', cfgHoraFim: 'horaFim', cfgSabado: 'sabadoFim',
    cfgCooldown: 'cooldownDias', cfgFollowUp: 'followUpDias', cfgRejeicao: 'alertaRejeicaoPct',
  }
  const NUMERICOS = new Set(['maxPorDia', 'maxToques', 'minIntervaloSeg', 'maxIntervaloSeg', 'pausaACada',
    'pausaLongaMin', 'pausaLongaMax', 'horaInicio', 'horaFim', 'sabadoFim', 'cooldownDias', 'followUpDias',
    'alertaRejeicaoPct', 'anoMinimo', 'autoAbrirSegundos', 'detectarIntervaloSeg', 'retomarDias', 'salvarContatoLote', 'salvarContatoMinutos'])

  async function carregarConfig() {
    const c = await FEIRAO.getConfig()
    Object.entries(MAP).forEach(([id, k]) => { if ($(id)) $(id).value = c[k] })
    $('cfgDomingo').checked = !!c.domingo
    if ($('cfgContaRestrita')) $('cfgContaRestrita').checked = !!c.contaRestrita
    if ($('avisoRestrita')) {
      $('avisoRestrita').style.display = c.contaRestrita ? '' : 'none'
      if (c.contaRestrita && c.restritaEm) {
        const dias = Math.floor((Date.now() - c.restritaEm) / 86400000)
        $('avisoRestritaDias').textContent = dias === 0 ? 'hoje' : `há ${dias} dia${dias > 1 ? 's' : ''}`
      }
    }
    $('cfgAbrirSemRecarregar').checked = c.abrirSemRecarregar !== false
    $('cfgAutoAbrir').checked = !!c.autoAbrir
    $('cfgDetectarRespostas').checked = c.detectarRespostas !== false
    await previewContato()
  }

  // Os campos da agenda ficam na aba Fila, longe do botão "Salvar configurações"
  // da aba Ritmo — então salvam sozinhos, para ninguém perder ajuste sem perceber.
  ;['cfgPadraoContato', 'cfgCampanhaCurta', 'cfgSalvarContatoAuto',
    'cfgSalvarContatoLote', 'cfgSalvarContatoMinutos'].forEach((id) => {
    const campo = $(id)
    if (!campo) return
    campo.addEventListener('change', async () => {
      await FEIRAO.saveConfig({ [MAP[id]]: campo.value })
      previewContato()
    })
  })

  $('salvarCfg').addEventListener('click', async () => {
    const patch = { domingo: $('cfgDomingo').checked, autoAbrir: $('cfgAutoAbrir').checked,
      abrirSemRecarregar: $('cfgAbrirSemRecarregar').checked,
      detectarRespostas: $('cfgDetectarRespostas').checked }
    Object.entries(MAP).forEach(([id, k]) => {
      if (!$(id)) return
      patch[k] = NUMERICOS.has(k) ? Number($(id).value) || FEIRAO.DEFAULT_CONFIG[k] : $(id).value
    })
    if (patch.maxPorDia > 80 && !confirm(
      `${patch.maxPorDia} contatos por dia no mesmo número é território de risco.\n\n` +
      `Acima de ~50/dia num número que não conversa habitualmente com estranhos, ` +
      `a proporção de mensagens não respondidas dispara e é isso que a Meta lê como spam.\n\n` +
      `O caminho seguro para mais alcance é mais vendedores, não mais volume por número.\n\nSalvar assim mesmo?`
    )) return
    patch.contaRestrita = $('cfgContaRestrita') ? $('cfgContaRestrita').checked : false
    if (patch.contaRestrita) patch.restritaEm = Date.now()

    // A trava do ritmo agora vive no motor, não nesta tela: foi mexer no
    // intervalo na mão que fez a Meta restringir o número. Aqui só mostramos
    // o que foi corrigido, para não parecer que o valor digitado foi aceito.
    const ajustado = FEIRAO.sanitizarConfig({ ...FEIRAO.DEFAULT_CONFIG, ...patch })
    const mexeu = (ajustado.__ajustes || []).filter((a) => a.pedido !== undefined && a.pedido !== '')
    Object.keys(FEIRAO.LIMITES).forEach((k) => { patch[k] = ajustado[k] })

    await FEIRAO.saveConfig(patch)
    await carregarConfig()
    if (mexeu.length) {
      alert('Configuração salva, com ajustes de segurança:\n\n'
        + mexeu.map((a) => `• ${a.chave}: ${a.pedido} → ${a.usado}`).join('\n')
        + '\n\nEsses limites não são preferência: intervalo curto e volume alto são '
        + 'exatamente o padrão que a Meta usa para identificar disparo em massa. '
        + 'Foi assim que o número foi restringido.')
    } else alert('Configuração salva.')
    renderMetrics(); atualizarPreview()
  })

  // ---------------------------------------------------------------------------
  // Conformidade
  // ---------------------------------------------------------------------------
  async function carregarBlock() {
    const b = await FEIRAO.getBlocklist()
    $('blocklist').value = b.map(FEIRAO.formatarTelefoneBR).join('\n')
    const log = await FEIRAO.getLog()
    const envios = log.filter((e) => e.tipo === 'envio').length
    const desf = log.filter((e) => e.tipo === 'desfecho')
    const outs = desf.filter((e) => e.status === 'optout').length
    const primeiro = log.length ? new Date(log[0].at).toLocaleDateString('pt-BR') : '—'
    $('logResumo').innerHTML =
      `<b>${log.length}</b> eventos registrados desde ${primeiro} · <b>${envios}</b> envios · ` +
      `<b>${outs}</b> pedidos de exclusão atendidos · <b>${b.length}</b> números na lista permanente.`
  }

  $('salvarBlock').addEventListener('click', async () => {
    const nums = $('blocklist').value.split(/\r?\n/).map((l) => FEIRAO.normalizarTelefone(l))
      .filter((n) => n.e164).map((n) => n.e164)
    await FEIRAO.set({ [FEIRAO.K.block]: Array.from(new Set(nums)) })
    alert(`${nums.length} números na lista de não perturbe.`)
    carregarBlock(); renderMetrics()
  })

  function baixarCsv(nome, linhas) {
    const csv = linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = nome; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  $('exportLog').addEventListener('click', async () => {
    const log = await FEIRAO.getLog()
    baixarCsv(`feirao-auditoria-${FEIRAO.hojeStr()}.csv`,
      [['data_hora', 'tipo', 'telefone', 'nome', 'status', 'variante', 'toque', 'origem_do_dado']].concat(
        log.map((e) => [new Date(e.at).toLocaleString('pt-BR'), e.tipo, e.telefone || '', e.nome || '', e.status || '', e.variante ?? '', e.toque ?? '', e.origemDado || e.origem || ''])))
  })

  $('exportFila').addEventListener('click', async () => {
    const q = await FEIRAO.getQueue()
    baixarCsv(`feirao-fila-${FEIRAO.hojeStr()}.csv`,
      [['nome', 'telefone', 'veiculo', 'ano', 'placa', 'data_compra', 'vendedor', 'status', 'toques', 'origem']].concat(
        q.map((c) => [c.nome, FEIRAO.formatarTelefoneBR(c.telefone), c.veiculo, c.ano, c.placa, c.dataCompra, c.vendedor, c.status, c.toques || 0, c.origem])))
  })

  $('exportBlock').addEventListener('click', async () => {
    const b = await FEIRAO.getBlocklist()
    baixarCsv(`feirao-nao-perturbe-${FEIRAO.hojeStr()}.csv`, [['telefone']].concat(b.map((t) => [FEIRAO.formatarTelefoneBR(t)])))
  })

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Atualização automática.
  //
  // Esta tela costuma ficar aberta numa aba enquanto os envios acontecem na aba
  // do WhatsApp Web. Sem isto, os números só mudavam ao recarregar a página —
  // era esse o "não atualizam".
  // ---------------------------------------------------------------------------
  let redesenhoPendente = null
  function redesenharDados() {
    clearTimeout(redesenhoPendente)     // agrupa rajadas de gravação num render só
    redesenhoPendente = setTimeout(async () => {
      await renderAuditoria()
      await renderFila()
      await renderMetrics()
      await renderGoogle()
      await renderAgenda()
      await renderRelatorios()
    }, 350)
  }

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((mudancas, area) => {
      if (area !== 'local') return
      const chaves = ['feiraoQueue', 'feiraoState', 'feiraoBlocklist', 'feiraoLog']
      if (chaves.some((k) => k in mudancas)) redesenharDados()
    })
  }
  // Rede de segurança: se algo gravar sem disparar o evento (ou a aba ficar
  // suspensa), a volta do foco reconcilia a tela.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) redesenharDados() })

  ;(async function init() {
    await FEIRAO.migrarConfig()
    await FEIRAO.carregarCustom()
    await carregarConfig()
    await carregarTemplates()
    await carregarPreviewSelect()
    aplicarHash()
    await renderAuditoria()
    await renderGoogle()
    await renderFila()
    renderPolitica()
    await renderAgenda()
    await renderRelatorios()
    await renderMetrics()
    await carregarBlock()
  })()
})()
