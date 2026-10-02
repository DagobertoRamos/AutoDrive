// =============================================================================
// Biblioteca de legendas por TIPO DE CARRO (PURO, testado).
//   8 tipos — do carro do dia a dia ao superluxo/exótico (R$ 1 milhão+). Cada
//   tipo tem 12 aberturas × 10 textos × 5 chamadas = 600 legendas diferentes,
//   no tom certo (economia e parcela no popular; exclusividade e atendimento
//   reservado no superluxo — nada de "corre que acaba" num carro de 3 milhões).
//   A variação `n` escolhe a combinação (n e n+1 trocam a abertura).
// Identificação do conteúdo: palavras do nome do arquivo/título/observação
// (marca e modelo → tipo) e, com IA de visão, os quadros do vídeo. A tabela de
// marcas/modelos tem a palavra final sobre o tipo (preço manda mais que estilo).
// Sem preço, prazo ou promoção inventados.
// =============================================================================

import { storeContacts, storeHashtags, type StoreInfo } from './avulsa-text-core'

export const CAR_KINDS = ['DIA_A_DIA', 'SEDA', 'SUV', 'PICAPE', 'ELETRICO', 'PREMIUM', 'ESPORTIVO', 'SUPERLUXO'] as const
export type CarKind = (typeof CAR_KINDS)[number]
export const isCarKind = (x: unknown): x is CarKind => (CAR_KINDS as readonly unknown[]).includes(x)

export const CAR_KIND_LABEL: Record<CarKind, string> = {
  DIA_A_DIA: 'Dia a dia (compactos e populares)',
  SEDA: 'Sedã / carro de família',
  SUV: 'SUV e crossover',
  PICAPE: 'Picape e utilitário',
  ELETRICO: 'Elétrico e híbrido',
  PREMIUM: 'Premium (BMW, Audi, Mercedes, Volvo…)',
  ESPORTIVO: 'Esportivo / performance',
  SUPERLUXO: 'Superluxo e exóticos (R$ 1 milhão+)',
}

interface Bank { hooks: string[]; bodies: string[]; closers: string[]; tags: string[]; emoji: string }

const BANK: Record<CarKind, Bank> = {
  DIA_A_DIA: {
    emoji: '🚗',
    tags: ['carroeconomico', 'primeirocarro'],
    hooks: [
      '🚗 O carro certo para a sua rotina chegou!',
      '💸 Economia de verdade no dia a dia começa aqui.',
      '🔑 Seu primeiro carro pode estar neste vídeo.',
      '⛽ Gasta pouco, anda muito e não te deixa na mão.',
      '🙌 Praticidade para ir ao trabalho, à faculdade e aonde mais você quiser.',
      '✨ Simples, econômico e do jeito que você precisa.',
      '🚦 Chega de depender de ônibus e aplicativo!',
      '📍 Para o trânsito da cidade, não tem escolha mais inteligente.',
      '🛒 Mercado, escola, trabalho: ele dá conta de tudo.',
      '💚 Carro bom é carro que cabe no bolso e na rotina.',
      '👀 Olha que oportunidade boa para conquistar o seu carro.',
      '🏁 Do primeiro carro à troca inteligente: comece por aqui.',
    ],
    bodies: [
      'Fácil de estacionar, leve de dirigir e com manutenção que não assusta — exatamente o que o dia a dia pede.',
      'Revisado, com procedência e pronto para rodar: é só pegar a chave e seguir a vida.',
      'Consumo baixo, peças acessíveis e seguro em conta. A conta fecha no fim do mês.',
      'Ideal para quem quer independência sem complicação: liga, sai e chega.',
      'Um carro honesto, com tudo o que importa para o uso diário e sem gasto desnecessário.',
      'Perfeito para quem roda na cidade todos os dias e quer economia sem abrir mão do conforto.',
      'Do primeiro carro da família ao carro de apoio: ele é a escolha certa.',
      'Pequeno por fora, esperto por dentro — e muito mais barato de manter do que você imagina.',
      'Aqui o carro passa por avaliação antes de chegar até você. Comprar bem é comprar tranquilo.',
      'A liberdade de ir e vir no seu horário, com condições pensadas para o seu orçamento.',
    ],
    closers: [
      '📲 Chama no WhatsApp e faça uma simulação sem compromisso.',
      '💳 Consulte condições de financiamento e avaliação do seu usado na troca.',
      '👉 Manda um "EU QUERO" no direct que a gente te passa todos os detalhes.',
      '🚀 Carros assim saem rápido — garanta a sua visita hoje.',
      '🤝 Venha fazer um test drive e sinta a diferença.',
    ],
  },
  SEDA: {
    emoji: '🚘',
    tags: ['sedan', 'carrodefamilia'],
    hooks: [
      '🚘 Conforto para a família inteira, do jeito que vocês merecem.',
      '🧳 Porta-malas grande, viagem tranquila.',
      '👨‍👩‍👧 Espaço de sobra para quem você mais ama.',
      '✨ Elegância que não sai de moda.',
      '🛣️ Feito para a estrada — e para o dia a dia também.',
      '🤫 Silêncio a bordo, suavidade no rodar.',
      '💼 Do trabalho ao passeio de domingo: sempre bem apresentado.',
      '🏆 O sedã que une conforto, espaço e economia.',
      '🌙 Viajar à noite nunca foi tão tranquilo.',
      '🔒 Segurança e conforto em cada quilômetro.',
      '📏 Mais espaço, mais conforto, mais presença.',
      '🙌 O carro que agrada quem dirige e quem vai junto.',
    ],
    bodies: [
      'Bancos confortáveis, espaço para as pernas no banco de trás e porta-malas que engole a bagagem das férias.',
      'Rodar macio, cabine silenciosa e consumo equilibrado na estrada: o parceiro ideal para viajar.',
      'Um carro sóbrio e bonito, que passa credibilidade no trabalho e tranquilidade em família.',
      'Com procedência e revisado, ele está pronto para levar a sua família a muitos destinos.',
      'Espaço interno de verdade, para ninguém viajar apertado — nem as malas.',
      'O equilíbrio perfeito entre conforto de carro grande e custo de manutenção sensato.',
      'Estabilidade na estrada e suavidade na cidade: é o tipo de carro que você não quer mais trocar.',
      'Para quem leva a família a sério e não abre mão de um carro bem cuidado.',
      'Design elegante por fora, conforto e praticidade por dentro.',
      'Feito para quem roda bastante e quer chegar descansado.',
    ],
    closers: [
      '📲 Agende sua visita pelo WhatsApp e traga a família para conhecer.',
      '💳 Consulte condições de financiamento e avaliação do seu usado na troca.',
      '👉 Comenta "QUERO" que a gente te chama com todos os detalhes.',
      '🗓️ Que tal um test drive neste fim de semana? Chama a gente!',
      '🤝 Estamos prontos para te atender — é só chamar no direct.',
    ],
  },
  SUV: {
    emoji: '🚙',
    tags: ['suv', 'suvbrasil'],
    hooks: [
      '🏙️ Posição alta, presença forte e conforto em qualquer caminho.',
      '💪 SUV de verdade para quem não aceita limites.',
      '🔥 O tipo de carro mais desejado do Brasil está aqui.',
      '🛣️ Cidade, estrada ou terra: ele vai.',
      '👑 Visual imponente que chama atenção por onde passa.',
      '✨ Espaço, tecnologia e segurança em um só carro.',
      '🚙 Seu próximo SUV acabou de chegar.',
      '🌄 Feito para o dia a dia e pronto para a aventura.',
      '😍 Difícil olhar uma vez só.',
      '🧭 Para quem gosta de enxergar o trânsito de cima.',
      '🏁 Conforto de carro de passeio, robustez de SUV.',
      '👀 Repara nos detalhes deste SUV.',
    ],
    bodies: [
      'Dirigir no alto dá outra visão da estrada — e outra sensação de segurança para toda a família.',
      'Porta-malas generoso, cabine espaçosa e aquela presença que só um SUV tem.',
      'Robusto para encarar buraco, lombada e estrada de chão sem perder o conforto.',
      'Tecnologia a bordo, acabamento caprichado e o estilo que todo mundo quer.',
      'Versátil de verdade: leva as crianças na escola de manhã e encara a viagem no fim de semana.',
      'Procedência conferida e revisão em dia: é só escolher o destino.',
      'Um SUV que entrega muito pelo que custa — e é dos mais procurados na revenda.',
      'Altura do solo, conforto ao rodar e espaço interno que surpreende.',
      'Para quem quer sair do comum e dirigir um carro com personalidade.',
      'O carro que combina com a sua rotina e com os seus planos.',
    ],
    closers: [
      '📲 Chama no WhatsApp e agende seu test drive.',
      '💳 Consulte condições de financiamento e avaliação do seu usado na troca.',
      '👉 Manda "SUV" no direct que a gente te passa tudo.',
      '⏳ SUV bom não fica parado no pátio. Garanta o seu!',
      '🤝 Venha conhecer de perto — o café é por nossa conta.',
    ],
  },
  PICAPE: {
    emoji: '🛻',
    tags: ['picape', 'pickup'],
    hooks: [
      '💪 Força bruta para o trabalho pesado.',
      '🤠 Picape de respeito para quem não para.',
      '🌾 Do campo à cidade sem perder a pose.',
      '⚙️ Robustez que você sente no primeiro quilômetro.',
      '🛻 A parceira certa para o seu trabalho e o seu lazer.',
      '🏞️ Estrada de terra? Pode mandar.',
      '🔧 Feita para aguentar o tranco.',
      '🚧 Trabalho pesado durante a semana, aventura no fim de semana.',
      '🔥 Picape boa é picape que resolve.',
      '📦 Caçamba pronta para carregar os seus projetos.',
      '🏆 Quem conhece sabe: picape é investimento.',
      '👊 Presença forte, motor valente.',
    ],
    bodies: [
      'Caçamba para a carga, cabine para a família e disposição para encarar qualquer terreno.',
      'Ideal para o agro, para a obra e para quem precisa de um carro que não escolhe caminho.',
      'Valente na terra, confortável no asfalto: o melhor dos dois mundos.',
      'Picape segura bem o valor, aguenta o uso pesado e ainda impõe respeito por onde passa.',
      'Robusta, confiável e pronta para trabalhar todos os dias.',
      'Para quem leva ferramenta, equipamento, bicicleta, barraca — e ainda quer conforto.',
      'Revisada e com procedência: pode colocar para trabalhar sem medo.',
      'Altura do solo e força para chegar aonde os outros não chegam.',
      'Uma picape que serve ao trabalho e ao lazer com a mesma disposição.',
      'Do sítio à cidade, ela é a escolha de quem precisa de força de verdade.',
    ],
    closers: [
      '📲 Chama no WhatsApp e venha ver de perto.',
      '💳 Consulte condições de financiamento e avaliação do seu usado na troca.',
      '👉 Manda "PICAPE" no direct que a gente te passa tudo.',
      '⏳ Picape assim sai rápido. Garanta a sua!',
      '🤝 Faça um test drive e sinta a força.',
    ],
  },
  ELETRICO: {
    emoji: '⚡',
    tags: ['carroeletrico', 'mobilidadeeletrica'],
    hooks: [
      '⚡ O futuro chegou — e ele é silencioso.',
      '🔌 Menos posto de combustível, mais liberdade.',
      '🌱 Tecnologia, economia e muito menos emissão.',
      '⚡ Torque instantâneo, emoção imediata.',
      '🤫 Silêncio absoluto, desempenho surpreendente.',
      '💡 Mobilidade inteligente para quem pensa à frente.',
      '🔋 Carregue em casa e esqueça a bomba de gasolina.',
      '🚀 Acelera forte e custa pouco por quilômetro.',
      '📱 Tecnologia de ponta sobre rodas.',
      '🌎 Dirigir pode ser mais leve para o bolso e para o planeta.',
      '✨ Uma experiência ao volante que você ainda não conhece.',
      '⚡ A eletrificação chegou à sua garagem.',
    ],
    bodies: [
      'Custo por quilômetro bem menor, manutenção mais simples e um rodar suave que vicia.',
      'Tecnologia de ponta, conectividade e aquele silêncio que transforma o trânsito em calmaria.',
      'Arrancadas imediatas, cabine moderna e economia que aparece no fim do mês.',
      'Menos peças para desgastar, menos idas à oficina e muito mais tempo para você.',
      'Para quem quer economizar de verdade e ainda dirigir um carro moderno e cheio de tecnologia.',
      'Recarga em casa, no trabalho ou nos carregadores da cidade: a rotina fica mais simples.',
      'Design moderno, painel digital e assistentes de condução que deixam tudo mais fácil.',
      'Um carro com a cara do futuro — disponível hoje.',
      'Conforto, silêncio e respostas rápidas: dirigir vira prazer de novo.',
      'A escolha de quem pensa no bolso, no conforto e no amanhã.',
    ],
    closers: [
      '📲 Chama no WhatsApp e tire suas dúvidas sobre recarga e autonomia.',
      '💳 Consulte condições de financiamento e avaliação do seu usado na troca.',
      '👉 Manda "ELÉTRICO" no direct que a gente te explica tudo.',
      '🔋 Venha fazer um test drive e sinta o torque instantâneo.',
      '🤝 Nossa equipe te ajuda a dar o passo para o elétrico.',
    ],
  },
  PREMIUM: {
    emoji: '🖤',
    tags: ['carrospremium', 'carrosdeluxo'],
    hooks: [
      '🖤 Sofisticação em cada detalhe.',
      '✨ Para quem não aceita nada menos que o melhor.',
      '🏛️ Engenharia refinada, prazer ao dirigir.',
      '🥂 Conforto premium para a sua rotina.',
      '💎 Acabamento impecável, presença inconfundível.',
      '🔑 O upgrade que você merece.',
      '🌃 Elegância que chega antes de você.',
      '🎯 Tecnologia, conforto e status na medida certa.',
      '👔 Para quem valoriza qualidade em tudo o que faz.',
      '🛋️ Um interior que parece uma sala VIP.',
      '⭐ Marca forte, experiência à altura.',
      '🚘 Dirigir pode — e deve — ser um prazer.',
    ],
    bodies: [
      'Materiais nobres, isolamento acústico de primeira e tecnologia que trabalha a seu favor.',
      'Desempenho refinado, conforto de alto nível e um prazer ao volante que não se explica — se sente.',
      'Cada detalhe foi pensado para quem é exigente: do couro dos bancos ao som da porta fechando.',
      'Um carro que transmite quem você é, sem precisar dizer uma palavra.',
      'Procedência conferida, histórico transparente e estado impecável. Como deve ser.',
      'Assistentes de condução, conectividade e conforto que fazem cada trajeto valer a pena.',
      'Elegância discreta para o dia a dia e potência de sobra quando você pedir.',
      'A experiência premium que transforma o trânsito em um momento seu.',
      'Design marcante, cabine sofisticada e dirigibilidade precisa.',
      'Para quem já entendeu que qualidade não é luxo — é escolha.',
    ],
    closers: [
      '📲 Agende um atendimento exclusivo pelo WhatsApp.',
      '🥂 Venha conhecer pessoalmente — preparamos um atendimento reservado para você.',
      '💳 Consulte condições especiais e avaliação do seu veículo na troca.',
      '👉 Envie "PREMIUM" no direct e receba todos os detalhes.',
      '🔑 Test drive com hora marcada. Fale com a nossa equipe.',
    ],
  },
  ESPORTIVO: {
    emoji: '🏁',
    tags: ['esportivo', 'carrosesportivos'],
    hooks: [
      '🏁 Adrenalina pura em forma de carro.',
      '🔥 Ouça esse ronco e tente não se apaixonar.',
      '⚡ Feito para quem sente o carro, não só dirige.',
      '🏎️ Performance de verdade, emoção garantida.',
      '😈 Nada de discreto aqui.',
      '🎯 Precisão em cada curva.',
      '💥 Potência que arrepia.',
      '🔊 Aumenta o som deste vídeo.',
      '🏆 Para quem leva a direção a sério.',
      '🚀 De zero à emoção em segundos.',
      '👊 Esportivo de alma e de nome.',
      '🌪️ Cada aceleração é um evento.',
    ],
    bodies: [
      'Motor valente, câmbio afiado e um acerto de suspensão que transforma qualquer estrada em pista.',
      'Não é só um carro: é a sensação de cada troca de marcha, de cada curva, de cada ronco.',
      'Design agressivo, desempenho de sobra e aquela presença que faz todo mundo olhar.',
      'Feito para quem gosta de dirigir de verdade e sente prazer em cada quilômetro.',
      'Potência, aderência e respostas imediatas: é o carro que você leva para passear sem destino.',
      'Procedência conferida e estado de colecionador: pronto para acelerar.',
      'Uma máquina que entrega emoção no dia a dia e brilha em qualquer encontro de carros.',
      'Cada detalhe foi desenhado para o desempenho — e o resultado se sente no banco do motorista.',
      'O equilíbrio perfeito entre esportividade e uso no dia a dia.',
      'Para realizar o sonho que você guarda desde criança.',
    ],
    closers: [
      '📲 Chama no WhatsApp e agende o seu test drive.',
      '🔥 Comenta "🏁" se este carro é o seu sonho.',
      '💳 Consulte condições e avaliação do seu veículo na troca.',
      '👉 Envie "QUERO" no direct e receba todos os detalhes.',
      '⏳ Esportivo assim não espera. Fale com a gente hoje.',
    ],
  },
  SUPERLUXO: {
    emoji: '👑',
    tags: ['superluxo', 'supercarros', 'luxurycars'],
    hooks: [
      '👑 Luxo em sua forma mais pura.',
      '💎 Raro. Exclusivo. Inesquecível.',
      '🖤 Alguns carros se dirigem. Este se vive.',
      '✨ Onde a engenharia encontra a arte.',
      '🥂 Para poucos. Para quem sabe exatamente o que quer.',
      '🏛️ Uma obra-prima sobre rodas.',
      '🌟 O ápice do mundo automotivo está aqui.',
      '🔱 Exclusividade não se explica. Se sente.',
      '🎩 Elegância absoluta, desempenho extraordinário.',
      '💫 Quando o extraordinário vira padrão.',
      '🗝️ Uma chave. Um universo à parte.',
      '🌌 Não é sobre chegar. É sobre como você chega.',
    ],
    bodies: [
      'Cada costura, cada linha e cada detalhe foi pensado para quem não aceita concessões.',
      'Desempenho de outro nível, acabamento artesanal e uma presença que silencia qualquer ambiente.',
      'Mais do que um automóvel: um patrimônio, uma conquista, um símbolo de quem você se tornou.',
      'Uma exclusividade que pouquíssimas pessoas no país terão o privilégio de viver.',
      'Materiais nobres, engenharia de ponta e um som que é pura sinfonia mecânica.',
      'Um carro que transforma qualquer trajeto em um momento memorável.',
      'Procedência impecável, histórico transparente e estado de exposição.',
      'Para colecionadores, apaixonados e para quem merece o melhor que o mundo automotivo oferece.',
      'Não se trata de luxo, mas de excelência levada ao limite.',
      'Uma experiência completa: o toque, o som, a aceleração e o olhar de quem vê passar.',
    ],
    closers: [
      '🥂 Atendimento exclusivo e reservado. Agende pelo WhatsApp.',
      '🔒 Discrição total: fale diretamente com a nossa equipe pelo direct.',
      '🗝️ Visitas somente com hora marcada. Reserve a sua.',
      '✉️ Para mais informações, envie uma mensagem — atendimento personalizado.',
      '👑 Uma oportunidade rara. Converse com a nossa equipe.',
    ],
  },
}

/** Quantas legendas diferentes o tipo tem. */
export const librarySize = (k: CarKind): number => BANK[k].hooks.length * BANK[k].bodies.length * BANK[k].closers.length

const clean = (s?: string | null) => String(s ?? '').replace(/\s+/g, ' ').trim()
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Legenda `n` do tipo (0 … librarySize-1; fora disso dá a volta).
 * `model` (ex.: "Ferrari SF90") vira a 1ª linha. Story: só abertura + chamada.
 */
export function libraryCaption(k: CarKind, n: number, s: StoreInfo, opts: { model?: string | null; brand?: string | null; format?: string } = {}): string {
  const b = BANK[k]
  const size = librarySize(k)
  const v = ((Math.trunc(n) % size) + size) % size
  const hook = b.hooks[v % b.hooks.length]
  const body = b.bodies[Math.floor(v / b.hooks.length) % b.bodies.length]
  const closer = b.closers[Math.floor(v / (b.hooks.length * b.bodies.length)) % b.closers.length]
  const model = clean(opts.model).slice(0, 60)
  const title = model ? `${b.emoji} ${model.toLocaleUpperCase('pt-BR')}` : ''
  if (opts.format === 'STORY') return [title, hook, closer].filter(Boolean).join('\n')
  const brandTag = fold(clean(opts.brand)).replace(/[^a-z0-9]/g, '')
  return [title, hook, body, closer, storeContacts(s), storeHashtags(s, [brandTag, ...b.tags].filter((t) => t.length >= 3))].filter(Boolean).join('\n\n').slice(0, 2200)
}

/** Variação aleatória (para a 1ª sugestão não sair sempre igual). */
export const randomVariant = (k: CarKind, rnd = Math.random): number => Math.floor(rnd() * librarySize(k))

const TONE: Record<CarKind, string> = {
  DIA_A_DIA: 'tom próximo e animado: economia, praticidade, primeiro carro, cabe no bolso',
  SEDA: 'tom acolhedor: conforto, espaço, família, viagem tranquila',
  SUV: 'tom confiante: presença, posição alta, versatilidade, segurança',
  PICAPE: 'tom forte e direto: robustez, trabalho, campo e lazer',
  ELETRICO: 'tom moderno: tecnologia, silêncio, economia por quilômetro, futuro',
  PREMIUM: 'tom sofisticado e contido: acabamento, tecnologia, prazer ao dirigir, atendimento exclusivo',
  ESPORTIVO: 'tom vibrante: emoção, ronco, desempenho, paixão por carros',
  SUPERLUXO: 'tom de alto luxo, frases curtas e elegantes: exclusividade, raridade, arte, atendimento reservado; NADA de urgência, desconto ou "corre que acaba"',
}

/** Pedido à IA para o tipo de carro (com o modelo, se identificado). */
export function kindPrompt(k: CarKind, s: StoreInfo, opts: { model?: string | null; notes?: string; format?: string } = {}): string {
  return [
    'Você é o social media de uma loja de veículos no Brasil e escreve legendas de vídeo para Instagram e Facebook, no nível de uma grande agência.',
    `Veículo: ${CAR_KIND_LABEL[k]}${clean(opts.model) ? ` — ${clean(opts.model)}` : ''}. Use ${TONE[k]}.`,
    opts.format === 'STORY' ? 'É um Story: no máximo 2 linhas.' : 'Estrutura: 1ª linha que prenda a atenção (com 1 emoji), 2 a 3 linhas curtas, chamada final para falar com a loja.',
    'Regras: não invente preço, ano, quilometragem, opcionais, promoções nem garantias; não coloque telefone, @, site nem hashtags (eu acrescento); sem markdown e sem aspas. Responda só com a legenda.',
    `Loja: ${clean(s.storeName)}${clean(s.city) ? ` (${clean(s.city)})` : ''}`,
    clean(opts.notes) ? `O que a loja quer dizer: ${clean(opts.notes)}` : '',
  ].filter(Boolean).join('\n')
}

/** Limpa a resposta da IA e acrescenta contatos e hashtags do tipo. */
export function finishKind(raw: string, k: CarKind, s: StoreInfo, opts: { brand?: string | null; format?: string } = {}): string {
  const t = String(raw ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1').replace(/^["“]|["”]$/g, '').replace(/\n{3,}/g, '\n\n').trim()
  if (opts.format === 'STORY') return t.slice(0, 300)
  const brandTag = fold(clean(opts.brand)).replace(/[^a-z0-9]/g, '')
  return [t, storeContacts(s), storeHashtags(s, [brandTag, ...BANK[k].tags].filter((x) => x.length >= 3))].filter(Boolean).join('\n\n').slice(0, 2200)
}

// ── Identificação pelo texto (marca/modelo) ─────────────────────────────────

/** [palavras, tipo, nome exibido]. Mais específico primeiro (ex.: "corolla cross" antes de "corolla"). */
const RULES: Array<[string, CarKind, string]> = [
  // Superluxo / exóticos (R$ 1 milhão+)
  ['ferrari', 'SUPERLUXO', 'Ferrari'], ['lamborghini', 'SUPERLUXO', 'Lamborghini'], ['lambo', 'SUPERLUXO', 'Lamborghini'], ['mclaren', 'SUPERLUXO', 'McLaren'],
  ['rolls royce', 'SUPERLUXO', 'Rolls-Royce'], ['rolls', 'SUPERLUXO', 'Rolls-Royce'], ['bentley', 'SUPERLUXO', 'Bentley'], ['aston martin', 'SUPERLUXO', 'Aston Martin'],
  ['bugatti', 'SUPERLUXO', 'Bugatti'], ['pagani', 'SUPERLUXO', 'Pagani'], ['koenigsegg', 'SUPERLUXO', 'Koenigsegg'], ['maybach', 'SUPERLUXO', 'Mercedes-Maybach'],
  ['maserati', 'SUPERLUXO', 'Maserati'], ['g63', 'SUPERLUXO', 'Mercedes-AMG G 63'], ['g 63', 'SUPERLUXO', 'Mercedes-AMG G 63'], ['amg gt', 'SUPERLUXO', 'Mercedes-AMG GT'],
  ['audi r8', 'SUPERLUXO', 'Audi R8'], ['r8', 'SUPERLUXO', 'Audi R8'], ['911 turbo', 'SUPERLUXO', 'Porsche 911 Turbo'], ['gt3', 'SUPERLUXO', 'Porsche 911 GT3'], ['gt2', 'SUPERLUXO', 'Porsche 911 GT2'],
  ['bmw m8', 'SUPERLUXO', 'BMW M8'], ['bmw xm', 'SUPERLUXO', 'BMW XM'], ['range rover evoque', 'PREMIUM', 'Range Rover Evoque'], ['evoque', 'PREMIUM', 'Range Rover Evoque'],
  ['range rover velar', 'PREMIUM', 'Range Rover Velar'], ['velar', 'PREMIUM', 'Range Rover Velar'], ['range rover', 'SUPERLUXO', 'Range Rover'], ['cullinan', 'SUPERLUXO', 'Rolls-Royce Cullinan'], ['urus', 'SUPERLUXO', 'Lamborghini Urus'],
  ['corvette', 'SUPERLUXO', 'Chevrolet Corvette'],
  // Esportivos
  ['porsche 911', 'ESPORTIVO', 'Porsche 911'], ['911', 'ESPORTIVO', 'Porsche 911'], ['boxster', 'ESPORTIVO', 'Porsche Boxster'], ['cayman', 'ESPORTIVO', 'Porsche Cayman'],
  ['mustang', 'ESPORTIVO', 'Ford Mustang'], ['camaro', 'ESPORTIVO', 'Chevrolet Camaro'], ['golf gti', 'ESPORTIVO', 'Golf GTI'], ['gti', 'ESPORTIVO', 'GTI'], ['golf r', 'ESPORTIVO', 'Golf R'],
  ['gr corolla', 'ESPORTIVO', 'GR Corolla'], ['gr yaris', 'ESPORTIVO', 'GR Yaris'], ['type r', 'ESPORTIVO', 'Civic Type R'], ['polo gts', 'ESPORTIVO', 'Polo GTS'], ['jetta gli', 'ESPORTIVO', 'Jetta GLI'],
  ['bmw m2', 'ESPORTIVO', 'BMW M2'], ['bmw m3', 'ESPORTIVO', 'BMW M3'], ['bmw m4', 'ESPORTIVO', 'BMW M4'], ['bmw m5', 'ESPORTIVO', 'BMW M5'], ['m3', 'ESPORTIVO', 'BMW M3'], ['m4', 'ESPORTIVO', 'BMW M4'],
  ['c63', 'ESPORTIVO', 'Mercedes-AMG C 63'], ['a45', 'ESPORTIVO', 'Mercedes-AMG A 45'], ['amg', 'ESPORTIVO', 'Mercedes-AMG'], ['audi rs', 'ESPORTIVO', 'Audi RS'], ['rs3', 'ESPORTIVO', 'Audi RS3'], ['rs6', 'ESPORTIVO', 'Audi RS6'],
  ['gt r', 'ESPORTIVO', 'Nissan GT-R'], ['supra', 'ESPORTIVO', 'Toyota Supra'], ['wrx', 'ESPORTIVO', 'Subaru WRX'], ['z4', 'ESPORTIVO', 'BMW Z4'],
  // Elétricos / híbridos
  ['tesla', 'ELETRICO', 'Tesla'], ['byd seal', 'ELETRICO', 'BYD Seal'], ['byd song', 'ELETRICO', 'BYD Song'], ['dolphin', 'ELETRICO', 'BYD Dolphin'], ['byd', 'ELETRICO', 'BYD'], ['yuan', 'ELETRICO', 'BYD Yuan'],
  ['gwm', 'ELETRICO', 'GWM'], ['ora 03', 'ELETRICO', 'GWM Ora 03'], ['haval', 'ELETRICO', 'GWM Haval'], ['leaf', 'ELETRICO', 'Nissan Leaf'], ['ioniq', 'ELETRICO', 'Hyundai Ioniq'],
  ['zeekr', 'ELETRICO', 'Zeekr'], ['taycan', 'ELETRICO', 'Porsche Taycan'], ['e tron', 'ELETRICO', 'Audi e-tron'], ['ex30', 'ELETRICO', 'Volvo EX30'], ['bolt', 'ELETRICO', 'Chevrolet Bolt'],
  // Premium
  ['cayenne', 'PREMIUM', 'Porsche Cayenne'], ['macan', 'PREMIUM', 'Porsche Macan'], ['panamera', 'PREMIUM', 'Porsche Panamera'], ['porsche', 'PREMIUM', 'Porsche'],
  ['bmw', 'PREMIUM', 'BMW'], ['audi', 'PREMIUM', 'Audi'], ['mercedes', 'PREMIUM', 'Mercedes-Benz'], ['volvo', 'PREMIUM', 'Volvo'], ['land rover', 'PREMIUM', 'Land Rover'],
  ['defender', 'PREMIUM', 'Land Rover Defender'], ['discovery', 'PREMIUM', 'Land Rover Discovery'], ['lexus', 'PREMIUM', 'Lexus'], ['jaguar', 'PREMIUM', 'Jaguar'], ['mini cooper', 'PREMIUM', 'Mini Cooper'],
  ['grand cherokee', 'PREMIUM', 'Jeep Grand Cherokee'],
  // Picapes
  ['hilux', 'PICAPE', 'Toyota Hilux'], ['s10', 'PICAPE', 'Chevrolet S10'], ['ranger', 'PICAPE', 'Ford Ranger'], ['amarok', 'PICAPE', 'VW Amarok'], ['toro', 'PICAPE', 'Fiat Toro'],
  ['strada', 'PICAPE', 'Fiat Strada'], ['saveiro', 'PICAPE', 'VW Saveiro'], ['montana', 'PICAPE', 'Chevrolet Montana'], ['frontier', 'PICAPE', 'Nissan Frontier'], ['l200', 'PICAPE', 'Mitsubishi L200'],
  ['triton', 'PICAPE', 'Mitsubishi Triton'], ['dodge ram', 'PICAPE', 'RAM'], ['ram 1500', 'PICAPE', 'RAM 1500'], ['ram 2500', 'PICAPE', 'RAM 2500'], ['rampage', 'PICAPE', 'RAM Rampage'], ['maverick', 'PICAPE', 'Ford Maverick'],
  ['oroch', 'PICAPE', 'Renault Oroch'], ['f 250', 'PICAPE', 'Ford F-250'], ['f 150', 'PICAPE', 'Ford F-150'], ['silverado', 'PICAPE', 'Chevrolet Silverado'], ['titano', 'PICAPE', 'Fiat Titano'],
  // SUVs
  ['corolla cross', 'SUV', 'Toyota Corolla Cross'], ['compass', 'SUV', 'Jeep Compass'], ['renegade', 'SUV', 'Jeep Renegade'], ['commander', 'SUV', 'Jeep Commander'], ['t cross', 'SUV', 'VW T-Cross'],
  ['tcross', 'SUV', 'VW T-Cross'], ['nivus', 'SUV', 'VW Nivus'], ['taos', 'SUV', 'VW Taos'], ['tiguan', 'SUV', 'VW Tiguan'], ['creta', 'SUV', 'Hyundai Creta'], ['tucson', 'SUV', 'Hyundai Tucson'],
  ['tracker', 'SUV', 'Chevrolet Tracker'], ['equinox', 'SUV', 'Chevrolet Equinox'], ['trailblazer', 'SUV', 'Chevrolet Trailblazer'], ['hr v', 'SUV', 'Honda HR-V'], ['hrv', 'SUV', 'Honda HR-V'],
  ['wr v', 'SUV', 'Honda WR-V'], ['cr v', 'SUV', 'Honda CR-V'], ['zr v', 'SUV', 'Honda ZR-V'], ['kicks', 'SUV', 'Nissan Kicks'], ['duster', 'SUV', 'Renault Duster'], ['captur', 'SUV', 'Renault Captur'],
  ['ecosport', 'SUV', 'Ford EcoSport'], ['territory', 'SUV', 'Ford Territory'], ['bronco', 'SUV', 'Ford Bronco'], ['peugeot 2008', 'SUV', 'Peugeot 2008'], ['peugeot 3008', 'SUV', 'Peugeot 3008'], ['2008', 'SUV', 'Peugeot 2008'], ['3008', 'SUV', 'Peugeot 3008'],
  ['c4 cactus', 'SUV', 'Citroën C4 Cactus'], ['fiat pulse', 'SUV', 'Fiat Pulse'], ['fastback', 'SUV', 'Fiat Fastback'], ['rav4', 'SUV', 'Toyota RAV4'], ['sw4', 'SUV', 'Toyota SW4'], ['outlander', 'SUV', 'Mitsubishi Outlander'],
  ['eclipse cross', 'SUV', 'Mitsubishi Eclipse Cross'], ['pajero', 'SUV', 'Mitsubishi Pajero'], ['kona', 'SUV', 'Hyundai Kona'], ['sportage', 'SUV', 'Kia Sportage'], ['sorento', 'SUV', 'Kia Sorento'], ['seltos', 'SUV', 'Kia Seltos'],
  ['tiggo', 'SUV', 'Caoa Chery Tiggo'], ['aircross', 'SUV', 'Citroën Aircross'], ['basalt', 'SUV', 'Citroën Basalt'],
  // Sedãs / família
  ['onix plus', 'SEDA', 'Chevrolet Onix Plus'], ['hb20s', 'SEDA', 'Hyundai HB20S'], ['corolla', 'SEDA', 'Toyota Corolla'], ['civic', 'SEDA', 'Honda Civic'], ['cruze', 'SEDA', 'Chevrolet Cruze'],
  ['sentra', 'SEDA', 'Nissan Sentra'], ['virtus', 'SEDA', 'VW Virtus'], ['jetta', 'SEDA', 'VW Jetta'], ['versa', 'SEDA', 'Nissan Versa'], ['cronos', 'SEDA', 'Fiat Cronos'], ['honda city', 'SEDA', 'Honda City'],
  ['logan', 'SEDA', 'Renault Logan'], ['voyage', 'SEDA', 'VW Voyage'], ['fusion', 'SEDA', 'Ford Fusion'], ['accord', 'SEDA', 'Honda Accord'], ['camry', 'SEDA', 'Toyota Camry'], ['chevrolet spin', 'SEDA', 'Chevrolet Spin'],
  ['spin', 'SEDA', 'Chevrolet Spin'], ['grand siena', 'SEDA', 'Fiat Grand Siena'], ['prisma', 'SEDA', 'Chevrolet Prisma'], ['fluence', 'SEDA', 'Renault Fluence'],
  // Dia a dia
  ['onix', 'DIA_A_DIA', 'Chevrolet Onix'], ['hb20', 'DIA_A_DIA', 'Hyundai HB20'], ['mobi', 'DIA_A_DIA', 'Fiat Mobi'], ['kwid', 'DIA_A_DIA', 'Renault Kwid'], ['gol', 'DIA_A_DIA', 'VW Gol'],
  ['polo', 'DIA_A_DIA', 'VW Polo'], ['argo', 'DIA_A_DIA', 'Fiat Argo'], ['uno', 'DIA_A_DIA', 'Fiat Uno'], ['palio', 'DIA_A_DIA', 'Fiat Palio'], ['ford ka', 'DIA_A_DIA', 'Ford Ka'], ['fiesta', 'DIA_A_DIA', 'Ford Fiesta'],
  ['sandero', 'DIA_A_DIA', 'Renault Sandero'], ['march', 'DIA_A_DIA', 'Nissan March'], ['fox', 'DIA_A_DIA', 'VW Fox'], ['celta', 'DIA_A_DIA', 'Chevrolet Celta'], ['c3', 'DIA_A_DIA', 'Citroën C3'],
  ['peugeot 208', 'DIA_A_DIA', 'Peugeot 208'], ['208', 'DIA_A_DIA', 'Peugeot 208'], ['etios', 'DIA_A_DIA', 'Toyota Etios'], ['yaris', 'DIA_A_DIA', 'Toyota Yaris'], ['honda fit', 'DIA_A_DIA', 'Honda Fit'],
  ['picanto', 'DIA_A_DIA', 'Kia Picanto'], ['up tsi', 'DIA_A_DIA', 'VW up!'], ['fiat 500', 'DIA_A_DIA', 'Fiat 500'], ['agile', 'DIA_A_DIA', 'Chevrolet Agile'], ['clio', 'DIA_A_DIA', 'Renault Clio'],
  // Palavras genéricas (só quando nenhum modelo bateu)
  ['hibrido', 'ELETRICO', ''], ['eletrico', 'ELETRICO', ''], ['picape', 'PICAPE', ''], ['pickup', 'PICAPE', ''], ['suv', 'SUV', ''], ['sedan', 'SEDA', ''], ['seda', 'SEDA', ''], ['popular', 'DIA_A_DIA', ''],
]

const normalize = (s: string) => ` ${fold(s).replace(/[^a-z0-9]+/g, ' ').trim()} `

/** Marca a partir do nome exibido ("Range Rover Velar" → "Land Rover"). */
function brandOf(label: string): string | null {
  if (!label) return null
  for (const b of ['Land Rover', 'Aston Martin', 'Rolls-Royce', 'Mercedes-Maybach', 'Mercedes-AMG', 'Mercedes-Benz', 'Caoa Chery']) if (label.startsWith(b)) return b
  if (label.startsWith('Range Rover')) return 'Land Rover'
  return label.split(' ')[0]
}

export interface KindGuess { kind: CarKind; model: string | null; brand: string | null; source: 'texto' | 'ia'; confidence: number; scene?: string | null }

/** Tipo pelo texto (nome do arquivo, título, observação, resposta da IA). Null se nada bater. */
export function kindFromText(text: string): KindGuess | null {
  const t = normalize(text)
  if (t.trim().length < 2) return null
  for (const [key, kind, label] of RULES) {
    if (!t.includes(` ${key} `)) continue
    // Só a marca (ex.: "ferrari-sf90-stradale.mp4"): as palavras seguintes completam o modelo.
    const model = label && !label.includes(' ') ? [label, ...modelWords(t.slice(t.indexOf(` ${key} `) + key.length + 2))].join(' ') : label
    return { kind, model: model || null, brand: brandOf(label), source: 'texto', confidence: label ? 0.9 : 0.6 }
  }
  return null
}

const NOT_MODEL = new Set(['mp4', 'mov', 'm4v', 'webm', 'video', 'videos', 'final', 'teste', 'entrega', 'de', 'do', 'da', 'dos', 'das', 'para', 'pra', 'com', 'cliente', 'novo', 'nova', 'whatsapp', 'img', 'vid', 'reels', 'story', 'edit', 'editado', 'copia', 'copy', 'hd', '4k', 'loja', 'estoque', 'e', 'o', 'a'])

/** Até 2 palavras de modelo depois da marca ("sf90 stradale" → "SF90 Stradale"); para em data, número longo ou palavra comum. */
function modelWords(rest: string): string[] {
  const out: string[] = []
  for (const w of rest.trim().split(' ')) {
    if (out.length >= 2 || !w || NOT_MODEL.has(w) || /^\d{5,}$/.test(w) || /^(19|20)\d\d$/.test(w) || w.length > 12) break
    out.push(/\d/.test(w) || w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
  }
  return out
}

// ── IA de visão ─────────────────────────────────────────────────────────────

export function visionPrompt(): string {
  return [
    'Você é especialista em carros no mercado brasileiro. A imagem tem quadros de um vídeo (ou uma foto) que uma loja de veículos vai postar no Instagram.',
    'Identifique o veículo principal e classifique pelo POSICIONAMENTO/PREÇO no Brasil:',
    '- DIA_A_DIA: compactos/populares até ~R$ 100 mil (Onix, HB20, Mobi, Kwid, Gol, Polo, Argo).',
    '- SEDA: sedãs e minivans de família (Corolla, Civic, Virtus, Cruze, Spin).',
    '- SUV: SUVs e crossovers de marcas generalistas (Compass, T-Cross, Creta, Tracker, HR-V, Kicks).',
    '- PICAPE: picapes e utilitários (Hilux, S10, Ranger, Toro, Strada, Amarok).',
    '- ELETRICO: elétricos e híbridos (BYD, GWM, Tesla).',
    '- PREMIUM: marcas premium de ~R$ 200 mil a R$ 1 milhão (BMW, Audi, Mercedes, Volvo, Land Rover, Porsche Cayenne/Macan).',
    '- ESPORTIVO: foco em desempenho (Mustang, Camaro, Porsche 911, GTI, BMW M).',
    '- SUPERLUXO: exóticos e superluxo acima de R$ 1 milhão (Ferrari, Lamborghini, McLaren, Rolls-Royce, Bentley, Aston Martin, Maybach, G 63, Range Rover).',
    'Responda APENAS um JSON, sem markdown: {"veiculo": true|false, "categoria": "<uma das categorias>", "marca": "<marca ou vazio>", "modelo": "<modelo ou vazio>", "confianca": <0 a 1>, "cena": "<o que aparece, até 12 palavras>"}',
    'Se não tiver certeza do modelo, deixe "modelo" vazio — não invente. Se não houver carro, "veiculo": false.',
  ].join('\n')
}

/** Lê a resposta da IA. A tabela de marcas/modelos corrige o tipo quando reconhece o carro. */
export function parseVision(raw: string): KindGuess | null {
  const m = /\{[\s\S]*\}/.exec(String(raw ?? ''))
  if (!m) return null
  let j: Record<string, unknown>
  try { j = JSON.parse(m[0]) as Record<string, unknown> } catch { return null }
  if (j.veiculo === false) return null
  const brand = clean(typeof j.marca === 'string' ? j.marca : '').slice(0, 40)
  const model = clean(typeof j.modelo === 'string' ? j.modelo : '').slice(0, 60)
  const conf = Math.max(0, Math.min(1, Number(j.confianca) || 0.5))
  const scene = clean(typeof j.cena === 'string' ? j.cena : '').slice(0, 120) || null
  const full = clean(model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`)
  const byTable = full ? kindFromText(full) : null
  const cat = String(j.categoria ?? '').toUpperCase().replace(/[^A-Z_]/g, '')
  const kind = byTable?.kind ?? (isCarKind(cat) ? cat : null)
  if (!kind) return null
  return { kind, model: full || byTable?.model || null, brand: brand || byTable?.brand || null, source: 'ia', confidence: conf, scene }
}
