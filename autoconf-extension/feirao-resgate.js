// =============================================================================
// feirao-resgate.js — textos do MODO RESGATE (lista antiga, sem campanha).
//
// Por que é um módulo separado: o feirão continua existindo e funcionando. O
// resgate é outro jogo, com outra premissa de conversa, e misturar os dois no
// mesmo arquivo faria a política de um vazar para o outro.
//
// A diferença que importa: o feirão podia AFIRMAR o relacionamento ("foi com a
// gente que você levou o Kwid") porque tinha o dado na mão. Aqui não temos —
// o contato veio da agenda, pode ser de anos atrás, o carro pode nem ser o
// mesmo e não sabemos quando falamos pela última vez. Fingir intimidade nesse
// cenário é exatamente o padrão que o cliente aprendeu a reconhecer como golpe,
// e denúncia (não volume) é o que derruba número no WhatsApp.
//
// Então a estrutura vira:
//   identificação completa → lacuna assumida → o que eu faço hoje →
//   pergunta barata COM a saída na mesma mensagem.
//
// Nenhum bloco usa {modelo}, {veiculo}, {feiraoNome}, {beneficios} ou {tempo}:
// se o dado pode não existir, a mensagem não pode depender dele.
// =============================================================================
;(function (raiz) {
  const BLOCOS_RESGATE = {
    // Identificação na primeira linha. Abrir com "oi, tudo bem?" solto é a
    // assinatura do golpista — e é o que leva o dedo ao "denunciar".
    abertura: [
      '{Oi|Olá}, {primeiroNome}! Aqui é o {vendedor}, {cargo} da {loja}, em {cidade}.',
      '{primeiroNome}, {saudacaoMin}! É o {vendedor}, {cargo} da {loja} — {cidade}.',
      '{Oi|Olá}, {primeiroNome}! {saudacao}. Quem fala é o {vendedor}, {cargo} da {loja}, aqui de {cidade}.',
      '{primeiroNome}, {saudacaoMin}! {vendedor} falando, {cargo} da {loja} ({cidade}).',
      '{Oi|Olá}, {primeiroNome}! Sou o {vendedor}, {cargo} da {loja}, em {cidade}.',
      '{primeiroNome}, {saudacao}. Aqui quem fala é o {vendedor}, {cargo} na {loja} — {cidade}.',
    ],

    // A lacuna assumida: por que estou escrevendo sem lembrar de tudo. É
    // honesto, explica de onde veio o número e desarma o "quem é você?".
    ponte: [
      'Estou {passando meus contatos a limpo|organizando minha lista de contatos} e o seu está salvo aqui de quando a gente se falou sobre carro — compra, venda ou troca.',
      'Seu contato está guardado comigo de uma conversa nossa sobre veículo. {Já faz um tempo|Foi há um tempo} e nem sei dizer exatamente quando foi.',
      'Achei seu número aqui na minha agenda de trabalho: em algum momento a gente conversou sobre comprar, vender ou trocar de carro.',
      'Estou {retomando|reativando} os contatos de quem já falou comigo sobre veículo, e o seu apareceu na lista.',
      'A gente já trocou ideia sobre carro em algum momento — {compra, venda ou troca|comprar, vender ou trocar}. Seu contato ficou salvo comigo desde então.',
      'Estou revendo meus contatos antigos de trabalho e parei no seu: {em algum momento|uma vez} conversamos sobre veículo.',
    ],

    // Apresentar o trabalho. É a parte de prospecção — e é o que dá motivo para
    // a pessoa guardar seu contato mesmo quando hoje não é a hora dela.
    apresentacao: [
      'Continuo à frente disso aqui na loja: {avaliação de usado|avaliação de seminovo}, venda e troca. Quem quer trocar de carro, vender o que tem ou está procurando um modelo específico fala comigo direto.',
      'Hoje eu cuido de compra, venda e troca de seminovos por aqui. {Boa parte|A maioria} de quem me chama quer entender as possibilidades antes de decidir alguma coisa.',
      'Sigo trabalhando com isso: se você quiser vender o seu, estudar uma troca ou estiver atrás de um modelo específico, é comigo mesmo.',
      'Meu trabalho é esse: ajudar quem vai trocar, vender ou comprar um seminovo — {desde a avaliação até a documentação|da avaliação à entrega}.',
      'Cuido de compra e troca aqui na loja: avalio o usado, procuro o carro que a pessoa quer e acompanho o processo até o fim.',
      'Continuo na área. Faço avaliação de usado, venda e troca — e {quando aparece algo que combina|quando entra um carro do perfil} eu costumo avisar quem tem interesse.',
    ],

    // Pergunta que custa zero responder, com a porta de saída NA MESMA
    // mensagem: é o que converte "denunciar" em "responder que não quer".
    pergunta: [
      'Esse número ainda é o seu? Se preferir que eu não te chame mais, me diz que eu tiro daqui na hora.',
      'Ainda falo com você por aqui? E se não quiser receber minhas mensagens, é só falar — {eu paro na hora|paro por aqui, sem problema}.',
      'Posso te avisar quando aparecer algo do seu perfil, ou prefere que eu não te procure?',
      'Você ainda tem carro hoje? {Pergunto|Só pra eu entender} porque, se um dia pensar em trocar ou vender, eu te ajudo a entender as possibilidades. Se não fizer sentido, me avisa que eu paro por aqui.',
      'Faz sentido eu te chamar quando entrar algum carro do seu perfil, ou prefere que eu tire seu contato da lista?',
      'Me diz só uma coisa: quer que eu siga te avisando das novidades daqui, ou prefere que eu não te incomode mais?',
    ],
  }

  // Quem já respondeu numa campanha anterior e esfriou não recebe mensagem
  // fria: para essa pessoa isto é retomada de conversa — e conversa retomada
  // não carrega o mesmo risco de denúncia que um primeiro toque.
  const BLOCOS_RETOMADA = {
    abertura: [
      '{Oi|Olá}, {primeiroNome}! Aqui é o {vendedor}, {cargo} da {loja}.',
      '{primeiroNome}, {saudacaoMin}! É o {vendedor}, {cargo} da {loja} — {tudo bem por aí?|tudo certo?}',
      '{Oi|Olá}, {primeiroNome}! {vendedor} aqui, {cargo} da {loja}.',
    ],
    ponte: [
      'A gente chegou a conversar sobre carro um tempo atrás e acabou ficando pra depois.',
      'A gente trocou ideia sobre {troca|compra e troca} de carro naquela época e o assunto acabou parando.',
      'Ficamos de retomar aquela conversa sobre veículo e o tempo passou.',
    ],
    apresentacao: [
      'Continuo aqui na loja cuidando de avaliação, venda e troca de seminovos.',
      'Sigo à frente de compra, venda e troca — {mudou bastante coisa no pátio desde então|entrou bastante carro novo desde então}.',
      'Continuo por aqui com avaliação de usado, venda e troca.',
    ],
    pergunta: [
      'Faz sentido a gente retomar, ou hoje não é o momento? {Se não for, me avisa que eu não te chamo mais|Se não for a hora, é só dizer}.',
      'Quer que eu volte a te chamar quando aparecer algo do seu perfil, ou prefere que eu deixe quieto?',
      'Ainda faz sentido pra você olhar isso, ou prefere que eu te procure mais pra frente?',
    ],
  }

  const TEMPLATES_RESGATE = [
    {
      id: 'r1',
      nome: 'Reconexão — atualizando contatos',
      texto: [
        '{Oi|Olá}, {primeiroNome}! Aqui é o {vendedor}, {cargo} da {loja}, em {cidade}.',
        'Estou passando meus contatos a limpo e o seu está salvo aqui de quando a gente se falou sobre carro — compra, venda ou troca.',
        'Continuo à frente disso na loja: avaliação de usado, venda e troca. Quem quer trocar, vender o que tem ou está procurando um modelo específico fala comigo direto.',
        'Esse número ainda é o seu? Se preferir que eu não te chame mais, me diz que eu tiro daqui na hora.',
      ].join('\n\n'),
    },
    {
      id: 'r2',
      nome: 'Apresentação do trabalho — porta aberta',
      texto: [
        '{primeiroNome}, {saudacaoMin}! É o {vendedor}, {cargo} da {loja} ({cidade}).',
        'Seu contato está guardado comigo de uma conversa nossa sobre veículo — já faz um tempo e nem sei dizer quando foi.',
        'Hoje eu cuido de compra, venda e troca de seminovos por aqui. A maioria de quem me chama quer entender as possibilidades antes de decidir alguma coisa.',
        'Posso te avisar quando aparecer algo do seu perfil, ou prefere que eu não te procure?',
      ].join('\n\n'),
    },
    {
      id: 'r3',
      nome: 'Curta — confirma o número',
      texto: [
        '{Oi|Olá}, {primeiroNome}! {vendedor} aqui, {cargo} da {loja}, de {cidade}.',
        'Estou retomando os contatos de quem já falou comigo sobre carro e o seu apareceu na lista.',
        'Sigo trabalhando com avaliação, venda e troca de seminovos.',
        'Ainda falo com você por este número? Se não quiser receber minhas mensagens, é só falar que eu paro por aqui.',
      ].join('\n\n'),
    },
    {
      id: 'r4',
      nome: 'Prospecção — pergunta se ainda tem carro',
      texto: [
        '{primeiroNome}, {saudacao}. Quem fala é o {vendedor}, {cargo} da {loja}, aqui de {cidade}.',
        'A gente já trocou ideia sobre carro em algum momento — comprar, vender ou trocar — e seu contato ficou salvo comigo desde então.',
        'Meu trabalho é esse: ajudar quem vai trocar, vender ou comprar um seminovo, da avaliação à entrega.',
        'Você ainda tem carro hoje? Pergunto porque, se um dia pensar em trocar ou vender, eu te ajudo a entender as possibilidades. Se não fizer sentido, me avisa que eu paro por aqui.',
      ].join('\n\n'),
    },
    {
      id: 'r5',
      nome: 'Aviso de novidades — pede licença',
      texto: [
        '{Oi|Olá}, {primeiroNome}! Sou o {vendedor}, {cargo} da {loja}, em {cidade}.',
        'Estou revendo meus contatos antigos de trabalho e parei no seu: em algum momento conversamos sobre veículo.',
        'Continuo na área — faço avaliação de usado, venda e troca, e quando entra um carro de um perfil específico eu costumo avisar quem tem interesse.',
        'Faz sentido eu te chamar quando aparecer algo assim, ou prefere que eu tire seu contato da lista?',
      ].join('\n\n'),
    },
  ]

  const TEMPLATES_RETOMADA = [
    {
      id: 'rr1',
      nome: 'Retomada — conversa que ficou pra depois',
      texto: [
        '{Oi|Olá}, {primeiroNome}! Aqui é o {vendedor}, {cargo} da {loja}.',
        'A gente chegou a conversar sobre carro um tempo atrás e acabou ficando pra depois.',
        'Continuo aqui na loja cuidando de avaliação, venda e troca de seminovos.',
        'Faz sentido a gente retomar, ou hoje não é o momento? Se não for, me avisa que eu não te chamo mais.',
      ].join('\n\n'),
    },
    {
      id: 'rr2',
      nome: 'Retomada — mudou o pátio desde então',
      texto: [
        '{primeiroNome}, {saudacaoMin}! É o {vendedor}, {cargo} da {loja}.',
        'Ficamos de retomar aquela conversa sobre veículo e o tempo passou.',
        'Sigo à frente de compra, venda e troca — entrou bastante carro novo desde então.',
        'Quer que eu volte a te chamar quando aparecer algo do seu perfil, ou prefere que eu deixe quieto?',
      ].join('\n\n'),
    },
  ]

  // Objeções que praticamente não apareciam no feirão e passam a ser a maioria
  // aqui: a pessoa não lembra de você, estranha o contato, ou nem tem carro.
  const PLAYBOOK_RESGATE = [
    {
      grupo: 'Objeção', id: 'g_quemevoce', nome: 'Não lembra / quem é você',
      texto: [
        'Sem problema, {primeiroNome} — faz tempo mesmo.',
        'Sou o {vendedor}, {cargo} da {loja}, em {cidade}. Seu contato ficou salvo comigo de uma conversa sobre carro; guardo os contatos de quem já falou comigo para avisar quando aparece algo do perfil da pessoa.',
        'Se não fizer sentido pra você, me avisa que eu tiro daqui e não te chamo mais. E se um dia precisar avaliar ou trocar um carro, é só me chamar.',
      ].join('\n\n'),
    },
    {
      grupo: 'Objeção', id: 'g_ondepegou', nome: 'Como conseguiu meu número',
      texto: [
        '{primeiroNome}, seu número está na minha agenda de trabalho desde uma conversa nossa sobre veículo — não veio de lista comprada nem de terceiro.',
        'Se preferir, eu apago seu contato agora e você não recebe mais nada meu. É só me dizer.',
      ].join('\n\n'),
    },
    {
      grupo: 'Objeção', id: 'g_semcarro', nome: 'Não tenho mais carro',
      texto: [
        'Entendi, {primeiroNome}, obrigado por responder!',
        'Deixo meu contato salvo aqui. Se um dia for procurar um carro, ou se alguém da família precisar avaliar o que tem, é só me chamar — eu ajudo desde a avaliação até a documentação.',
      ].join('\n\n'),
    },
    {
      grupo: 'Objeção', id: 'g_outrocarro', nome: 'Troquei de carro / não é mais o mesmo',
      texto: [
        'Boa, {primeiroNome}! Então já está atualizado do meu lado.',
        'Me conta: qual carro você está hoje? Assim eu sei o que faz sentido te avisar — e se um dia pensar em trocar, já tenho o histórico aqui.',
      ].join('\n\n'),
    },
    {
      grupo: 'Objeção', id: 'g_naoconhecoloja', nome: 'Nunca comprei aí',
      texto: [
        'Pode ser que a conversa tenha sido só uma consulta mesmo, {primeiroNome} — nesse caso desculpa o incômodo.',
        'Já tiro seu contato da minha lista. Se um dia precisar de avaliação, compra ou troca, meu contato fica salvo aí. Abraço!',
      ].join('\n\n'),
    },
    {
      grupo: 'Canal', id: 'g_temalgo', nome: 'Respondeu perguntando o que você tem',
      texto: [
        'Boa, {primeiroNome}! Pra eu te mostrar o que faz sentido e não te encher de foto à toa:',
        'Você está procurando algo para trocar o que já tem, ou seria uma compra? E tem algum modelo ou faixa de parcela em mente?',
        'Com isso eu já separo duas ou três opções do pátio pra você olhar.',
      ].join('\n\n'),
    },
  ]

  // ===========================================================================
  // O CARRO ESCONDIDO NO NOME DO CONTATO
  //
  // A agenda guarda o que a memória perdeu. Contato salvo como "bruno uno 2019",
  // "Bruno quer uno" ou "José Junior · Feirão 08/2026 · Kwid" diz o nome da
  // pessoa E o carro que ela procurava na época — e citar isso é a diferença
  // entre "mensagem de lista" e "esse cara lembra de mim".
  //
  // O modelo é reconhecido por LISTA, não por posição: chutar que a segunda
  // palavra é o carro transformaria "Bruno Silva" em "seu Silva".
  // ===========================================================================
  const MODELOS = new Set(['118i', '2008', '208', '3008', '308', '320i', 'a3', 'a4', 'accord', 'aircross', 'amarok', 'argo', 'arrizo', 'asx', 'azera', 'berlingo', 'bongo', 'boxer', 'bravo', 'bronco', 'c180', 'c200', 'c3', 'c4', 'cactus', 'camry', 'captiva', 'captur', 'celer', 'celta', 'cerato', 'cherokee', 'cielo', 'city', 'civic', 'classic', 'clio', 'cobalt', 'commander', 'compass', 'corolla', 'corollacross', 'corsa', 'countryman', 'creta', 'cronos', 'crossfox', 'cruze', 'daily', 'doblo', 'dolphin', 'ducato', 'duster', 'eclipse', 'ecosport', 'edge', 'elantra', 'equinox', 'etios', 'face', 'fastback', 'fiesta', 'fiorino', 'fit', 'focus', 'fox', 'frontier', 'fusion', 'glc', 'gol', 'golf', 'haval', 'hb20', 'hb20s', 'hb20x', 'hilux', 'hrv', 'i30', 'idea', 'iveco', 'ix35', 'jac', 'jetta', 'jumpy', 'ka', 'kangoo', 'kicks', 'kombi', 'kwid', 'l200', 'lancer', 'linea', 'livina', 'logan', 'march', 'master', 'maverick', 'mobi', 'montana', 'nivus', 'onix', 'ora', 'oroch', 'outlander', 'pajero', 'palio', 'partner', 'passat', 'picanto', 'polo', 'prisma', 'pulse', 'punto', 'q3', 'q5', 'ranger', 'rav4', 'renegade', 's10', 'sandero', 'santafe', 'saveiro', 'seal', 'sentra', 'siena', 'sonata', 'song', 'sorento', 'soul', 'spacefox', 'spin', 'sportage', 'sprinter', 'stepway', 'strada', 'sw4', 't40', 't50', 't60', 't80', 'taos', 'tcross', 'territory', 'tiggo', 'tiggo2', 'tiggo3', 'tiggo5', 'tiggo7', 'tiggo8', 'tiguan', 'tiida', 'titano', 'toro', 'tracker', 'trailblazer', 'triton', 'tucson', 'uno', 'veloster', 'versa', 'virtus', 'voyage', 'wrangler', 'wrv', 'x1', 'x3', 'x5', 'xc40', 'xc60', 'xc90', 'yaris', 'yuan'])

  const semAcentoTxt = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const TITULO_MODELO = {
    hrv: 'HR-V', wrv: 'WR-V', hb20: 'HB20', hb20s: 'HB20S', hb20x: 'HB20X', tcross: 'T-Cross',
    sw4: 'SW4', s10: 'S10', ix35: 'iX35', xc40: 'XC40', xc60: 'XC60', xc90: 'XC90',
    x1: 'X1', x3: 'X3', x5: 'X5', jac: 'JAC', rav4: 'RAV4', corollacross: 'Corolla Cross',
    santafe: 'Santa Fe', i30: 'i30', l200: 'L200', c3: 'C3', c4: 'C4', glc: 'GLC',
  }
  const tituloModelo = (m) => TITULO_MODELO[m] || (m.charAt(0).toUpperCase() + m.slice(1))
  const VERBO_FINAL = /\s+(quer|queria|procura|procurava|busca|buscava|interesse|comprou|levou|viu)\s*$/i

  /**
   * Lê o nome salvo na agenda e separa o que dá para usar na conversa.
   * Devolve { nome, modelo, ano, campanha } — modelo já capitalizado.
   */
  function interpretarNomeAgenda(nomeSalvo) {
    const bruto = String(nomeSalvo == null ? '' : nomeSalvo)
    const partes = bruto.split('\u00b7').map((x) => x.trim()).filter(Boolean)
    const cabeca = partes[0] || bruto
    const resto = partes.slice(1).join(' ')

    // No padrão "Nome · Feirão 08/2026 · Kwid" o 2026 é da campanha, não do
    // carro: nesse formato o ano só vale se estiver no último segmento.
    const ondeProcurarAno = partes.length >= 2 ? partes[partes.length - 1] : bruto
    const mAno = ondeProcurarAno.match(/\b(19|20)\d{2}\b/)
    const ano = mAno ? mAno[0] : ''

    let modelo = ''
    const palavras = semAcentoTxt(bruto).replace(/[^a-z0-9+\- ]/g, ' ').split(/\s+/).filter(Boolean)
    for (const p of palavras) {
      if (MODELOS.has(p)) { modelo = p; break }
    }

    // "bruno uno" → o nome é o que vem ANTES do modelo, não a string toda.
    let nome = cabeca
    if (modelo && partes.length < 2) {
      const idx = semAcentoTxt(cabeca).split(/\s+/).indexOf(modelo)
      if (idx > 0) nome = cabeca.split(/\s+/).slice(0, idx).join(' ')
      nome = nome.replace(VERBO_FINAL, '').trim()
    }

    const mCamp = resto.match(/(feir[\u00e3a]o|resgate|campanha)[^\u00b7]*/i)
    return {
      nome: nome || cabeca,
      modelo: modelo ? tituloModelo(modelo) : '',
      ano,
      campanha: mCamp ? mCamp[0].trim() : '',
    }
  }

  // Quando o carro é conhecido, a ponte muda: dá para dizer que houve
  // atendimento no passado e sobre QUAL carro a conversa foi.
  const BLOCOS_RESGATE_CARRO = {
    abertura: BLOCOS_RESGATE.abertura,
    ponte: [
      'Te atendi aqui na loja em algum momento — pelo meu registro, na época você estava atrás de um {modeloBuscado}.',
      'Estou revendo meus atendimentos antigos e parei no seu: a gente conversou sobre um {modeloBuscado}.',
      'A gente já se falou por aqui sobre carro — {no meu registro|na minha anotação} você procurava um {modeloBuscado} na época.',
      'Seu contato está salvo comigo de um atendimento meu: você olhava um {modeloBuscado} naquele momento.',
      'Faz um tempo que te atendi aqui — {ficou anotado|guardei} que o {modeloBuscado} era o carro que te interessava.',
      'Quando a gente conversou, o {modeloBuscado} era o que você estava buscando. Guardei seu contato desde então.',
    ],
    apresentacao: [
      'Continuo à frente de compra, venda e troca aqui na loja — e {quando entra um carro desse perfil|quando aparece algo parecido} eu costumo avisar quem já procurou.',
      'Sigo trabalhando com avaliação, venda e troca. O pátio hoje está bem diferente daquela época.',
      'Meu trabalho é esse: avaliar o usado, achar o carro que a pessoa quer e acompanhar até a entrega.',
      'Continuo por aqui com avaliação, venda e troca de seminovos — {mudou muita coisa no estoque|entrou bastante carro} desde a nossa conversa.',
    ],
    pergunta: [
      'Você chegou a resolver o {modeloBuscado}, ou ainda está no seu radar?',
      'Conseguiu comprar naquela época? Se ainda estiver procurando, me diz que eu fico de olho pra você. E se preferir que eu não te chame mais, é só falar.',
      'O {modeloBuscado} ainda te interessa, ou hoje você procura outra coisa? Se não for o momento, me avisa que eu paro por aqui.',
      'Ainda faz sentido eu te avisar quando entrar um {modeloBuscado} bom, ou prefere que eu tire seu contato da lista?',
    ],
  }

  // A campanha entra como bloco OPCIONAL: só é usada quando a configuração tem
  // nome e data. Campanha sem prazo não é campanha, é enfeite — e prazo
  // inventado é promessa que a loja não cumpre.
  const BLOCOS_CAMPANHA = [
    'Estamos com o {campanhaAtual} até {campanhaAte} — é uma janela boa para avaliar o usado ou olhar uma troca com calma.',
    'Até {campanhaAte} estamos com o {campanhaAtual}, com condições de campanha para avaliação e troca.',
    'Agora até {campanhaAte} está rolando o {campanhaAtual} aqui na loja: vale a pena aproveitar a janela para avaliar seu carro.',
    'Aproveitando: o {campanhaAtual} vai até {campanhaAte}, e nesse período a agenda de avaliação fica aberta.',
  ]

  raiz.FEIRAO_RESGATE = {
    BLOCOS_RESGATE, BLOCOS_RETOMADA, BLOCOS_RESGATE_CARRO, BLOCOS_CAMPANHA,
    MODELOS, interpretarNomeAgenda,
    TEMPLATES_RESGATE, TEMPLATES_RETOMADA,
    PLAYBOOK_RESGATE,
  }
})(typeof globalThis !== 'undefined' ? globalThis : self)

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.FEIRAO_RESGATE
