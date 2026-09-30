// =============================================================================
// checklist-fluxo.js — orquestração dos documentos do Jotform → aba Contratos.
//
// Atende os dois formulários de CHK_CORE.FORMULARIOS (entrega e laudo): cada
// rodada trata um deles, com histórico e relatório separados.
//
// Roda no service worker (importScripts em background.js). Ele não fala com o
// Jotform nem com o AutoConf diretamente: pede para os content scripts de cada
// aba, porque só lá dentro a requisição é mesma-origem e leva o cookie.
//
// Fluxo por envio do Jotform:
//   placa → busca no AutoConf → escolhe a negociação certa (regra do
//   formulário) → lê os anexos → se o documento já está lá, pula → senão baixa
//   o PDF assinado e anexa como "Outros" → confere na lista.
//
// Nada é anexado quando a placa não bate ou há duas negociações parecidas: a
// linha vai para a fila de revisão manual (decisão do dono da loja).
// =============================================================================
;(function () {
  const CORE = globalThis.CHK_CORE
  const HIST_KEY = 'checklistHistorico'      // { <form>: { submissionId: {...} } }
  const RELAT_KEY = 'checklistRelatorio'     // { <form>: { em, resumo, linhas } }
  const EXEC_KEY = 'checklistExecucao'
  const CFG_KEY = 'checklistConfig'          // { autoLigado, horas }
  const ALARME = 'checklistEntregaAuto'
  // Sobe junto com qualquer mudança nos content scripts: se a aba ficou com a
  // versão anterior (não foi recarregada), reinjetamos em vez de conversar com
  // um script que não conhece o parâmetro `form`.
  const VERSAO_SCRIPTS = 2

  const pegar = (k) => new Promise((r) => chrome.storage.local.get(k, r))
  const gravar = (o) => new Promise((r) => chrome.storage.local.set(o, r))
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

  // O histórico nasceu com um formulário só (mapa direto de submissionId).
  // Se for esse formato antigo, ele vira o histórico do "entrega".
  function normalizarHistorico(bruto) {
    const h = bruto || {}
    const chaves = Object.keys(CORE.FORMULARIOS)
    const jaSeparado = Object.keys(h).some((k) => chaves.includes(k))
    if (jaSeparado) return h
    if (!Object.keys(h).length) return {}
    return { entrega: h }
  }
  async function lerHistorico() { return normalizarHistorico((await pegar(HIST_KEY))[HIST_KEY]) }

  // O relatório também nasceu com um formulário só ({ em, resumo, linhas }).
  // Se for esse formato, ele passa a ser o relatório do "entrega" — senão o
  // relatório do laudo até é gravado, mas o painel nunca acha.
  function normalizarRelatorios(bruto) {
    const t = bruto || {}
    if (!t.linhas && !t.resumo) return t
    const out = {}
    for (const k of Object.keys(CORE.FORMULARIOS)) { if (t[k]) out[k] = t[k] }
    if (!out.entrega) out.entrega = { em: t.em, form: 'entrega', dryRun: t.dryRun, resumo: t.resumo, linhas: t.linhas, parcial: t.parcial }
    return out
  }
  async function lerRelatorios() { return normalizarRelatorios((await pegar(RELAT_KEY))[RELAT_KEY]) }

  function paraAba(tabId, msg) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        resolve(chrome.runtime.lastError ? { ok: false, erro: chrome.runtime.lastError.message } : (resp || { ok: false, erro: 'sem resposta' }))
      })
    })
  }

  async function injetar(tabId, arquivos) {
    try { await chrome.scripting.executeScript({ target: { tabId }, files: arquivos }); await dormir(400); return true }
    catch (e) { return false }
  }

  async function abaJotform(cfg) {
    const urlInbox = 'https://www.jotform.com/pt/inbox/' + cfg.formId
    const abas = await chrome.tabs.query({ url: 'https://www.jotform.com/*' })
    let aba = abas[0]
    let criada = false
    if (!aba) { aba = await chrome.tabs.create({ url: urlInbox, active: false }); criada = true; await dormir(4000) }
    let ping = await paraAba(aba.id, { type: 'CHK_JF_PING' })
    if (!ping.ok || ping.versao !== VERSAO_SCRIPTS) {
      await injetar(aba.id, ['checklist-core.js', 'jotform-checklist.js'])
      ping = await paraAba(aba.id, { type: 'CHK_JF_PING' })
    }
    if (!ping.ok) throw new Error('não consegui falar com a aba do Jotform (abra ' + urlInbox + ' logado)')
    if (ping.versao !== VERSAO_SCRIPTS) throw new Error('a aba do Jotform está com uma versão antiga da extensão — recarregue a aba (F5)')
    return { aba, criada }
  }

  async function abaAutoconf() {
    const abas = await chrome.tabs.query({ url: 'https://app.autoconf.com.br/*' })
    let aba = abas[0]
    let criada = false
    if (!aba) { aba = await chrome.tabs.create({ url: 'https://app.autoconf.com.br/negociacao', active: false }); criada = true; await dormir(4000) }
    let ping = await paraAba(aba.id, { type: 'CHK_AC_PING' })
    if (!ping.ok || ping.versao !== VERSAO_SCRIPTS) {
      await injetar(aba.id, ['checklist-core.js', 'contrato-anexar.js'])
      ping = await paraAba(aba.id, { type: 'CHK_AC_PING' })
    }
    if (!ping.ok) throw new Error('não consegui falar com a aba do AutoConf (abra app.autoconf.com.br logado)')
    if (ping.versao !== VERSAO_SCRIPTS) throw new Error('a aba do AutoConf está com uma versão antiga da extensão — recarregue a aba (F5)')
    if (ping.logado === false) throw new Error('AutoConf parece deslogado — faça login na aba aberta')
    return { aba, criada }
  }

  const estadoInicial = { rodando: false, feitos: 0, total: 0, etapa: '', parar: false, dryRun: true, form: 'entrega', em: 0 }
  const SEM_SINAL_MS = 3 * 60 * 1000   // service worker do MV3 pode ser encerrado no meio

  async function lerEstado() {
    const e = (await pegar(EXEC_KEY))[EXEC_KEY] || estadoInicial
    // Sem sinal de vida há minutos: a rodada morreu junto com o service worker.
    if (e.rodando && Date.now() - (e.atualizadoEm || e.em || 0) > SEM_SINAL_MS) {
      return Object.assign({}, e, { rodando: false, parar: false, etapa: 'interrompida pelo Chrome (o navegador encerrou o processo da extensão)' })
    }
    return e
  }
  const salvarEstado = (e) => gravar({ [EXEC_KEY]: Object.assign({}, e, { atualizadoEm: Date.now() }) })

  async function rodar(opcoes) {
    const { form = 'entrega', dryRun = true, limite = 0, desde = '', somente = null } = opcoes || {}
    const cfg = CORE.formulario(form)
    const jaRodando = await lerEstado()
    if (jaRodando.rodando) return { ok: false, erro: 'já tem uma rodada em andamento' }

    const estado = { rodando: true, feitos: 0, total: 0, etapa: 'abrindo as abas', parar: false, dryRun, form: cfg.chave, em: Date.now() }
    await salvarEstado(estado)

    const linhas = []
    const resumo = { total: 0, anexados: 0, jaTinha: 0, vaiSubir: 0, revisar: 0, naoEncontradas: 0, erros: 0, pulados: 0 }
    let jf = null
    let ac = null

    const fecharSeCriada = async (x) => { try { if (x && x.criada) await chrome.tabs.remove(x.aba.id) } catch (e) { /* aba já foi fechada */ } }
    const salvarRelatorio = async (parcial, erro) => {
      const todos = await lerRelatorios()
      todos[cfg.chave] = { em: Date.now(), form: cfg.chave, dryRun, resumo, linhas, parcial, erro: erro || null }
      await gravar({ [RELAT_KEY]: todos })
    }

    try {
      jf = await abaJotform(cfg)
      ac = await abaAutoconf()

      estado.etapa = 'lendo os envios do Jotform'
      await salvarEstado(estado)
      const lista = await paraAba(jf.aba.id, { type: 'CHK_JF_LISTA', form: cfg.chave, limite: 1000 })
      if (!lista.ok) throw new Error('Jotform: ' + lista.erro)

      const historico = await lerHistorico()
      const hist = historico[cfg.chave] || (historico[cfg.chave] = {})

      let envios = lista.envios
      if (desde) envios = envios.filter((e) => String(e.criadoEm).slice(0, 10) >= desde)
      if (somente && somente.length) {
        const alvo = new Set(somente.map(String))
        envios = envios.filter((e) => alvo.has(e.submissionId))
      }
      // do mais antigo para o mais novo: se parar no meio, o backlog anda em ordem
      envios = envios.slice().reverse()

      estado.total = envios.length
      resumo.total = envios.length
      await salvarEstado(estado)

      const cacheBusca = new Map()
      // `limite` conta ANEXOS (ou candidatos, na simulação) — não linhas lidas.
      // Quem já foi tratado antes é pulado sem gastar a cota, senão um limite
      // pequeno se esgotaria nos envios antigos que já estão resolvidos.
      let efetivos = 0

      for (const envio of envios) {
        if (limite > 0 && efetivos >= limite) { estado.etapa = 'limite de ' + limite + ' atingido'; break }
        const atual = await lerEstado()
        if (atual.parar) { estado.etapa = 'interrompido por você'; break }
        estado.feitos++
        estado.etapa = (dryRun ? 'simulando ' : 'subindo ') + envio.placa
        await salvarEstado(estado)

        const base = {
          submissionId: envio.submissionId,
          placa: envio.placa,
          cliente: envio.cliente,
          veiculo: envio.veiculo,
          vendedor: envio.vendedor,
          tipo: envio.tipo,
          dataEnvio: String(envio.criadoEm).slice(0, 10),
          urlEnvio: envio.urlEnvio,
        }

        try {
          const feito = hist[envio.submissionId]
          if (feito && !somente) {
            resumo.pulados++
            linhas.push(Object.assign({}, base, { resultado: 'JA_PROCESSADO', negociacaoId: feito.negociacaoId || null, detalhe: 'já tratado em ' + new Date(feito.em).toLocaleDateString('pt-BR') }))
            continue
          }
          if (!envio.placaValida) {
            resumo.revisar++
            linhas.push(Object.assign({}, base, { resultado: 'REVISAR', motivo: 'PLACA_INVALIDA', detalhe: 'placa "' + envio.placaCrua + '" não tem formato válido' }))
            continue
          }

          let candidatas = cacheBusca.get(envio.placa)
          if (!candidatas) {
            const busca = await paraAba(ac.aba.id, { type: 'CHK_AC_BUSCA', placa: envio.placa })
            if (!busca.ok) throw new Error('busca: ' + busca.erro)
            candidatas = busca.candidatas
            cacheBusca.set(envio.placa, candidatas)
            await dormir(300)
          }

          const dados = { placa: envio.placa, dataEnvio: envio.criadoEm, cliente: envio.cliente, regra: cfg.regra }
          let escolha = CORE.escolherNegociacao(Object.assign({ candidatas }, dados))

          // Resgate (só nos formulários que têm cliente): placa digitada errado
          // no formulário ou placa do usado da troca. Primeiro tenta com o que a
          // busca por placa já trouxe (a busca do AutoConf é tolerante); só
          // então gasta uma busca pelo nome.
          let buscouPorNome = false
          if (!escolha.ok && cfg.regra.aproximada && (escolha.motivo === 'SEM_NEGOCIACAO_VENDA' || escolha.motivo === 'FORA_DA_JANELA')) {
            let tentativa = CORE.escolherNegociacao(Object.assign({ candidatas, aproximada: true }, dados))
            if (!tentativa.ok) {
              const porNome = await paraAba(ac.aba.id, { type: 'CHK_AC_BUSCA_NOME', cliente: envio.cliente })
              buscouPorNome = porNome.ok
              if (porNome.ok && porNome.candidatas.length) {
                const vistos = new Set(candidatas.map((c) => c.id))
                const juntas = candidatas.concat(porNome.candidatas.filter((c) => !vistos.has(c.id)))
                tentativa = CORE.escolherNegociacao(Object.assign({ candidatas: juntas, aproximada: true }, dados))
              }
              await dormir(300)
            }
            if (tentativa.ok) escolha = tentativa
          }

          if (!escolha.ok) {
            // Placa que a busca do AutoConf não conhece não é "decisão a tomar":
            // é laudo/checklist de negociação que nunca foi cadastrada, ou placa
            // de teste. Vai para um balde próprio para não poluir a revisão.
            const naoExiste = !candidatas.length && escolha.motivo === 'SEM_NEGOCIACAO_VENDA'
            if (naoExiste) {
              resumo.naoEncontradas++
              linhas.push(Object.assign({}, base, {
                resultado: 'NAO_ENCONTRADA',
                motivo: 'PLACA_NAO_ENCONTRADA',
                detalhe: 'a busca do AutoConf não devolve nada para essa placa' + (buscouPorNome ? ' (nem pelo nome do cliente)' : '') + ' — negociação não cadastrada ou placa de teste',
              }))
              continue
            }
            resumo.revisar++
            linhas.push(Object.assign({}, base, {
              resultado: 'REVISAR',
              motivo: escolha.motivo,
              detalhe: escolha.detalhe,
              candidatas: (escolha.candidatas || candidatas || []).map((c) => c.id + ' ' + c.tipo + '/' + c.status + ' ' + c.criadoEm),
            }))
            continue
          }

          const neg = escolha.negociacao
          const anexos = await paraAba(ac.aba.id, { type: 'CHK_AC_ANEXOS', negociacaoId: neg.id })
          if (!anexos.ok) throw new Error('anexos: ' + anexos.erro)
          await dormir(250)

          if (CORE.jaAnexado(anexos.anexos, cfg.chave)) {
            resumo.jaTinha++
            hist[envio.submissionId] = { negociacaoId: neg.id, em: Date.now(), resultado: 'ja_existia' }
            await gravar({ [HIST_KEY]: historico })
            linhas.push(Object.assign({}, base, { resultado: 'JA_TINHA', negociacaoId: neg.id, urlNegociacao: neg.url, detalhe: 'o AutoConf já tem esse documento' }))
            continue
          }

          if (dryRun) {
            resumo.vaiSubir++
            efetivos++
            linhas.push(Object.assign({}, base, {
              resultado: 'VAI_SUBIR', negociacaoId: neg.id, urlNegociacao: neg.url, confianca: escolha.confianca,
              motivo: escolha.casamento === 'exata' && escolha.onde === 'saida' ? '' : (escolha.casamento === 'exata' ? 'na_compra' : escolha.casamento),
              detalhe: neg.tipo + '/' + neg.status + ' de ' + neg.criadoEm + ' — ' + (neg.cliente || 'sem cliente') + (escolha.ajuste ? ' | ' + escolha.ajuste : ''),
            }))
            continue
          }

          const pdf = await paraAba(jf.aba.id, { type: 'CHK_JF_PDF', form: cfg.chave, submissionId: envio.submissionId })
          if (!pdf.ok) throw new Error('PDF: ' + pdf.erro)

          const nomeDoc = cfg.nomeDocumento(envio)
          const envioAnexo = await paraAba(ac.aba.id, {
            type: 'CHK_AC_UPLOAD',
            negociacaoId: neg.id,
            nome: nomeDoc,
            tipoDocumento: cfg.tipoDocumento,
            form: cfg.chave,
            base64: pdf.base64,
            arquivo: CORE.nomeArquivo(cfg.chave, envio.placa, envio.submissionId),
          })
          if (!envioAnexo.ok) throw new Error('anexo: ' + envioAnexo.erro)

          resumo.anexados++
          efetivos++
          hist[envio.submissionId] = { negociacaoId: neg.id, em: Date.now(), resultado: 'anexado' }
          await gravar({ [HIST_KEY]: historico })
          linhas.push(Object.assign({}, base, {
            resultado: 'ANEXADO', negociacaoId: neg.id, urlNegociacao: neg.url, confianca: escolha.confianca,
            motivo: escolha.casamento === 'exata' && escolha.onde === 'saida' ? '' : (escolha.casamento === 'exata' ? 'na_compra' : escolha.casamento),
            bytes: pdf.bytes, detalhe: nomeDoc + ' → ' + neg.tipo + '/' + neg.status + ' — ' + (neg.cliente || 'sem cliente') + (escolha.ajuste ? ' | ' + escolha.ajuste : ''),
          }))
          await dormir(900)
        } catch (e) {
          const msg = (e && e.message) || String(e)
          resumo.erros++
          linhas.push(Object.assign({}, base, { resultado: 'ERRO', detalhe: msg }))
          if (/sess(ã|a)o/i.test(msg)) { estado.etapa = 'parou: ' + msg; break }
          await dormir(500)
        }

        if (estado.feitos % 10 === 0) await salvarRelatorio(true)
      }

      await salvarRelatorio(false)
      return { ok: true, resumo, linhas }
    } catch (e) {
      const msg = (e && e.message) || String(e)
      // Sem isso, uma falha logo no começo (aba fechada, sessão caída) não
      // aparece em lugar nenhum e o painel parece que ignorou o clique.
      estado.erro = msg
      estado.etapa = 'falhou: ' + msg
      await salvarRelatorio(true, msg)
      return { ok: false, erro: msg, resumo, linhas }
    } finally {
      await salvarEstado(Object.assign({}, estado, { rodando: false, parar: false, terminadoEm: Date.now() }))
      await fecharSeCriada(jf)
      await fecharSeCriada(ac)
    }
  }

  // --- rotina automática -----------------------------------------------------
  async function configurarAlarme() {
    const cfg = (await pegar(CFG_KEY))[CFG_KEY] || {}
    await chrome.alarms.clear(ALARME)
    if (cfg.autoLigado === true) {
      const horas = Number(cfg.horas) > 0 ? Number(cfg.horas) : 24
      chrome.alarms.create(ALARME, { periodInMinutes: horas * 60, delayInMinutes: 5 })
    }
  }

  async function rodadaAutomatica() {
    const cfg = (await pegar(CFG_KEY))[CFG_KEY] || {}
    if (cfg.autoLigado !== true) return
    const resultados = {}
    for (const chaveForm of Object.keys(CORE.FORMULARIOS)) {
      const r = await rodar({ form: chaveForm, dryRun: false })
      resultados[chaveForm] = { ok: r.ok, resumo: r.resumo || null, erro: r.erro || null }
      await dormir(2000)
    }
    await gravar({ checklistUltimaAuto: { em: Date.now(), resultados } })
  }

  globalThis.CHECKLIST = {
    rodar,
    lerEstado,
    configurarAlarme,
    rodadaAutomatica,
    ALARME,
    parar: async () => { const e = await lerEstado(); await salvarEstado(Object.assign({}, e, { parar: true })); return { ok: true } },
    relatorio: async (form) => (await lerRelatorios())[form || 'entrega'] || null,
    historico: async (form) => {
      const h = await lerHistorico()
      return form ? (h[form] || {}) : h
    },
    limparHistorico: async (form) => {
      if (!form) { await chrome.storage.local.remove(HIST_KEY); return { ok: true } }
      const h = await lerHistorico()
      delete h[form]
      await gravar({ [HIST_KEY]: h })
      return { ok: true }
    },
    config: async () => (await pegar(CFG_KEY))[CFG_KEY] || { autoLigado: false, horas: 24 },
    salvarConfig: async (cfg) => { await gravar({ [CFG_KEY]: cfg }); await configurarAlarme(); return { ok: true } },
  }
})()
