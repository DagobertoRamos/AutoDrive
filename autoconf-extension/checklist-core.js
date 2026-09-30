// =============================================================================
// checklist-core.js — regras puras dos documentos do Jotform que vão para a aba
// Contratos do AutoConf.
//
// Hoje são dois formulários (veja FORMULARIOS, no fim):
//   • entrega — "Check-list de entrega técnica": tem o nome do cliente e é do
//     carro VENDIDO (placa na saída), assinado na hora da entrega.
//   • laudo   — "PROTOCOLO DE LAUDO": não tem cliente nenhum, só a placa, e é
//     feito entre a compra e a venda — por isso vale a negociação mais próxima
//     da data, seja a compra ou a venda.
//
// Roda em três lugares (content script do Jotform, content script do AutoConf e
// painel), por isso não toca em DOM nem em rede.
// =============================================================================
;(function (raiz) {
  const TIPO_DOCUMENTO_OUTROS = '4'          // valor do <select> tipo_documento_id

  const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  const normalizarPlaca = (s) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const placaValida = (p) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizarPlaca(p))
  const chave = (s) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim()

  // --- nomes de pessoa -------------------------------------------------------
  // "Rodrigo Marangoni" x "RODRIGO MARANGONI" tem que casar; "GRUPO AUTOMOB S.A."
  // x "Ana Paula" não pode. Comparamos por palavras de 3+ letras.
  function palavrasNome(s) {
    return chave(s).replace(/[^a-z0-9 ]/g, ' ').split(' ')
      .filter((p) => p.length >= 3 && !['dos', 'das', 'com', 'ltda', 'sao'].includes(p))
  }
  function semelhancaNome(a, b) {
    const A = palavrasNome(a), B = new Set(palavrasNome(b))
    if (!A.length || !B.size) return 0
    const iguais = A.filter((p) => B.has(p)).length
    return iguais / Math.min(A.length, B.size)
  }

  // --- datas -----------------------------------------------------------------
  // AutoConf devolve "17/08/26 às 12:12"; Jotform devolve "2026-08-12 16:39:29".
  function dataAutoconf(txt) {
    const m = String(txt || '').match(/(\d{2})\/(\d{2})\/(\d{2,4})/)
    if (!m) return null
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const d = new Date(ano, Number(m[2]) - 1, Number(m[1]))
    return isNaN(d) ? null : d
  }
  function dataJotform(txt) {
    const m = String(txt || '').match(/(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return isNaN(d) ? null : d
  }
  const diasEntre = (a, b) => (a && b) ? Math.round((a - b) / 86400000) : null

  // --- distância entre placas ------------------------------------------------
  // Tolera os erros de digitação que aparecem no formulário: 0 = igual,
  // 1 = um caractere trocado (FSR1884 x FSR1I84), 2 = duas letras invertidas
  // (QUI6I66 x QIU6I66), 99 = placas diferentes.
  function distanciaPlaca(a, b) {
    a = normalizarPlaca(a); b = normalizarPlaca(b)
    if (!a || !b || a.length !== b.length) return 99
    const dif = []
    for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) dif.push(i) }
    if (!dif.length) return 0
    if (dif.length === 1) return 1
    if (dif.length === 2 && dif[1] === dif[0] + 1 && a[dif[0]] === b[dif[1]] && a[dif[1]] === b[dif[0]]) return 2
    return 99
  }
  const menorDistancia = (placas, alvo) => (placas || []).reduce((m, v) => Math.min(m, distanciaPlaca(v, alvo)), 99)

  // --- escolha da negociação -------------------------------------------------
  const EMPATE_DIAS = 7        // duas candidatas do mesmo tipo a menos de 7 dias = ambíguo
  const PREFERE_SAIDA = 15     // no modo "qualquer", empate técnico decide pela venda

  // `regra` vem do formulário (FORMULARIOS[x].regra):
  //   alvo: 'saida'    → a placa tem que estar no carro que saiu vendido
  //         'qualquer' → vale a negociação mais próxima, compra ou venda
  //   posterior        → quantos dias a negociação pode ser POSTERIOR ao documento
  //   anteriorComNome / anteriorSemNome → quantos dias pode ser ANTERIOR
  //   aproximada       → tenta resgatar placa digitada errado (exige o cliente)
  const REGRA_PADRAO = { alvo: 'saida', posterior: 3, anteriorComNome: 240, anteriorSemNome: 45, aproximada: true }

  function escolherNegociacao({ placa, dataEnvio, cliente, candidatas, aproximada, regra }) {
    const r = Object.assign({}, REGRA_PADRAO, regra || {})
    if (aproximada != null) r.aproximada = aproximada
    const p = normalizarPlaca(placa)
    const dEnvio = dataJotform(dataEnvio)
    const ativas = (candidatas || []).filter((c) => !/cancel/i.test(c.status || ''))

    const pontuar = (c, casamento, onde) => {
      const nome = semelhancaNome(cliente, c.cliente)
      return Object.assign({}, c, {
        dias: diasEntre(dEnvio, dataAutoconf(c.criadoEm)),
        nomeSemelhanca: nome,
        nomeOk: nome >= 0.5,
        casamento,
        onde,
      })
    }

    function ordenar(a, b) {
      if (a.nomeOk !== b.nomeOk) return a.nomeOk ? -1 : 1
      const da = a.dias == null ? 9999 : Math.abs(a.dias)
      const db = b.dias == null ? 9999 : Math.abs(b.dias)
      // Empate técnico entre compra e venda: fica com a venda.
      if (r.alvo === 'qualquer' && a.onde !== b.onde && Math.abs(da - db) <= PREFERE_SAIDA) {
        return a.onde === 'saida' ? -1 : 1
      }
      return da - db
    }

    function avaliar(elegiveis) {
      if (!elegiveis.length) {
        return {
          ok: false,
          motivo: 'SEM_NEGOCIACAO_VENDA',
          detalhe: r.alvo === 'saida'
            ? 'placa não aparece como saída em nenhuma negociação ativa'
            : 'placa não aparece em nenhuma negociação ativa',
        }
      }

      const pontuadas = elegiveis.slice().sort(ordenar)
      const alvo = pontuadas[0]
      const segundo = pontuadas[1]

      // Ambíguo só quando as duas primeiras são do mesmo tipo (duas vendas ou
      // duas compras) e coladas no tempo — aí a data não decide nada.
      if (segundo && alvo.nomeOk === segundo.nomeOk && alvo.onde === segundo.onde
        && alvo.dias != null && segundo.dias != null
        && Math.abs(Math.abs(alvo.dias) - Math.abs(segundo.dias)) <= EMPATE_DIAS) {
        return { ok: false, motivo: 'AMBIGUO', detalhe: 'duas negociações parecidas: #' + alvo.id + ' e #' + segundo.id, candidatas: pontuadas }
      }
      if (alvo.dias == null) return { ok: false, motivo: 'SEM_DATA', detalhe: 'não deu para ler a data da negociação', candidatas: pontuadas }
      if (alvo.dias < -r.posterior) return { ok: false, motivo: 'FORA_DA_JANELA', detalhe: 'negociação #' + alvo.id + ' é ' + Math.abs(alvo.dias) + ' dias posterior ao documento', candidatas: pontuadas }

      const limite = alvo.nomeOk ? r.anteriorComNome : r.anteriorSemNome
      if (alvo.dias > limite) {
        return { ok: false, motivo: 'FORA_DA_JANELA', detalhe: 'negociação #' + alvo.id + ' é ' + alvo.dias + ' dias anterior ao documento' + (r.alvo === 'saida' && !alvo.nomeOk ? ' e o nome do cliente não bate' : ''), candidatas: pontuadas }
      }

      const ajuste = alvo.casamento === 'placa_corrigida'
        ? 'placa digitada errado: ' + p + ' → ' + (alvo.veiculosSaida || []).join(',')
        : (alvo.casamento === 'placa_do_usado'
          ? 'a placa digitada é o usado entregue na troca; o cliente levou ' + (alvo.veiculosSaida || []).join(',')
          : (alvo.onde === 'entrada' ? 'anexado na compra do veículo (é a negociação mais próxima da data)' : null))

      return {
        ok: true,
        negociacao: alvo,
        confianca: alvo.casamento === 'exata' && (alvo.nomeOk || r.alvo === 'qualquer') ? 'alta' : 'media',
        casamento: alvo.casamento,
        onde: alvo.onde,
        ajuste,
        candidatas: pontuadas,
      }
    }

    // 1) caminho normal: placa exata.
    const exatas = []
    for (const c of ativas) {
      const naSaida = (c.veiculosSaida || []).some((v) => normalizarPlaca(v) === p)
      const naEntrada = (c.veiculosEntrada || []).some((v) => normalizarPlaca(v) === p)
      if (naSaida) exatas.push(pontuar(c, 'exata', 'saida'))
      else if (naEntrada && r.alvo === 'qualquer') exatas.push(pontuar(c, 'exata', 'entrada'))
    }

    const resultado = avaliar(exatas)
    if (resultado.ok || !r.aproximada) return resultado

    // 2) resgate: placa digitada errado, ou placa do usado que o cliente
    // entregou na troca. Vale só com o nome do cliente confirmando.
    const aproximadas = ativas
      .filter((c) => (c.veiculosSaida || []).length)   // o cliente levou algum carro
      .map((c) => {
        if ((c.veiculosSaida || []).some((v) => normalizarPlaca(v) === p)) return null   // já entrou como exata
        if (menorDistancia(c.veiculosSaida, p) <= 2) return pontuar(c, 'placa_corrigida', 'saida')
        if (menorDistancia(c.veiculosEntrada, p) <= 2) return pontuar(c, 'placa_do_usado', 'saida')
        return null
      })
      .filter((c) => c && c.nomeOk)

    if (!aproximadas.length) return resultado
    const resgate = avaliar(aproximadas)
    return resgate.ok ? resgate : resultado
  }

  // --- formulários -----------------------------------------------------------
  // `reportId` é o documento PDF customizado do Jotform — o que sai em
  // "⋮ → Baixar → <nome do documento>", e NÃO a "Versão para impressão" de
  // /pdf-submission, que é outro arquivo. Se o documento for recriado no
  // Jotform o id muda: abra o menu com o DevTools na aba Network e leia o
  // parâmetro `reportid` da chamada /API/inbox/generatePDF.
  const FORMULARIOS = {
    entrega: {
      chave: 'entrega',
      rotulo: 'Check-list de entrega técnica',
      formId: '242636544600049',
      reportId: '10242645391823056',
      qid: { cliente: '3', email: '4', telefone: '5', data: '6', vendedor: '9', veiculo: '25', placa: '26', assinaturas: ['41', '55'] },
      tipoDocumento: TIPO_DOCUMENTO_OUTROS,
      nomeDocumento: () => 'Check list de entrega tecnica assinado',
      prefixoArquivo: 'checklist-entrega',
      // O AutoConf já tem "CHECKLIST DE VENDA", "CHECKLIST ENTRADA" e "PROCESSO
      // DE VENDA" — nada disso é o nosso. Só conta quem fala de ENTREGA.
      jaTem: (nome) => {
        const n = chave(nome)
        if (!n) return false
        if (/entrada/.test(n) && !/entrega/.test(n)) return false
        return /entrega/.test(n) && /(tecnic|check)/.test(n)
      },
      regra: { alvo: 'saida', posterior: 3, anteriorComNome: 240, anteriorSemNome: 45, aproximada: true },
    },
    laudo: {
      chave: 'laudo',
      rotulo: 'Protocolo de laudo',
      formId: '253485780669070',
      reportId: '10253533054912049',
      qid: { data: '7', tipo: '8', tipoVeiculo: '10', veiculo: '12', placa: '13', empresa: '14', vendedor: '17', onde: '18', assinaturas: ['19', '20'] },
      tipoDocumento: TIPO_DOCUMENTO_OUTROS,
      nomeDocumento: (envio) => 'Protocolo de laudo - ' + (String((envio && envio.tipo) || '').toUpperCase().trim() || 'ECV'),
      prefixoArquivo: 'protocolo-laudo',
      // Vale qualquer nome que fale de laudo/vistoria — inclusive os que a loja
      // já subiu à mão ("PROTOCOLO INSPECAR"), para não duplicar.
      jaTem: (nome) => /laudo|vistoria|inspecar|cautelar|\becv\b/.test(chave(nome)),
      // Sem nome de cliente no formulário a data é o único sinal: nada de
      // resgate por placa parecida, e a janela vale para os dois lados.
      regra: { alvo: 'qualquer', posterior: 180, anteriorComNome: 180, anteriorSemNome: 180, aproximada: false },
    },
  }

  const formulario = (chaveForm) => FORMULARIOS[chaveForm] || FORMULARIOS.entrega
  const jaAnexado = (nomes, chaveForm) => (nomes || []).some((n) => formulario(chaveForm).jaTem(n))
  const nomeArquivo = (chaveForm, placa, submissionId) =>
    formulario(chaveForm).prefixoArquivo + '-' + (normalizarPlaca(placa) || 'sem-placa') + '-' + submissionId + '.pdf'

  raiz.CHK_CORE = {
    FORMULARIOS, formulario, TIPO_DOCUMENTO_OUTROS,
    normalizarPlaca, placaValida, chave, semelhancaNome, palavrasNome, distanciaPlaca,
    dataAutoconf, dataJotform, diasEntre,
    jaAnexado, escolherNegociacao, nomeArquivo,
  }
})(typeof globalThis !== 'undefined' ? globalThis : self)
