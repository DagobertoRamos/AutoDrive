// =============================================================================
// Textos do Post avulso (PURO, testado): modelos prontos por OCASIÃO, com o
// nome, a cidade e os contatos da loja — os temas que mais funcionam para
// lojas de veículos (entregas, novidades, bastidores, promoções, prova social,
// conteúdo útil, institucional e convite de fim de semana). Sem IA; com IA,
// o pedido abaixo gera o texto só com as informações da loja + o que a pessoa
// escreveu. A pessoa também pode colar o próprio texto.
// =============================================================================

export const OCCASIONS = ['ENTREGA', 'NOVIDADES', 'BASTIDORES', 'PROMOCAO', 'DEPOIMENTO', 'DICA', 'INSTITUCIONAL', 'FIM_DE_SEMANA'] as const
export type Occasion = (typeof OCCASIONS)[number]
export const OCCASION_LABEL: Record<Occasion, string> = {
  ENTREGA: 'Entrega de veículo (cliente feliz)',
  NOVIDADES: 'Novidades no estoque',
  BASTIDORES: 'Bastidores / preparação dos carros',
  PROMOCAO: 'Promoção / feirão',
  DEPOIMENTO: 'Depoimento de cliente',
  DICA: 'Dica útil (compra e manutenção)',
  INSTITUCIONAL: 'Quem somos / onde estamos',
  FIM_DE_SEMANA: 'Convite para visitar',
}

export interface StoreInfo { storeName: string; city?: string | null; whatsapp?: string | null; instagram?: string | null; site?: string | null; address?: string | null }

const clean = (s?: string | null) => String(s ?? '').replace(/\s+/g, ' ').trim()
const tag = (s?: string | null) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase()

export function storeContacts(s: StoreInfo): string {
  return [
    clean(s.whatsapp) && `📲 WhatsApp: ${clean(s.whatsapp)}`,
    clean(s.instagram) && `📸 ${clean(s.instagram).startsWith('@') ? clean(s.instagram) : `@${clean(s.instagram)}`}`,
    clean(s.site) && `🌐 ${clean(s.site)}`,
    clean(s.address) && `📍 ${clean(s.address)}`,
  ].filter(Boolean).join('\n')
}

export function storeHashtags(s: StoreInfo, extra: string[] = []): string {
  return [...new Set([tag(s.storeName), 'seminovos', 'carros', tag(s.city) && `carros${tag(s.city)}`, ...extra].filter((x): x is string => !!x && x.length >= 3))].slice(0, 7).map((x) => `#${x}`).join(' ')
}

/** Modelo pronto da ocasião, com o nome/cidade/contatos da loja. `notes` = detalhe opcional escrito pela pessoa. */
export function occasionTemplate(o: Occasion, s: StoreInfo, notes = ''): string {
  const loja = clean(s.storeName) || 'nossa loja'
  const em = clean(s.city) ? ` em ${clean(s.city)}` : ''
  const n = clean(notes)
  const body: Record<Occasion, string[]> = {
    ENTREGA: [
      '🔑 MAIS UMA CHAVE ENTREGUE! 🎉',
      n ? `${n}` : 'Hoje foi dia de realizar mais um sonho.',
      `Obrigado pela confiança! Ver cada cliente saindo feliz com o carro novo é o que move a ${loja}. 🤝`,
      'Quer ser o próximo? Fala com a gente!',
    ],
    NOVIDADES: [
      '🚗✨ CHEGOU NOVIDADE NO ESTOQUE!',
      n || 'Separamos opções selecionadas, revisadas e prontas para você.',
      `Corre para conferir na ${loja}${em} — os melhores costumam sair rápido.`,
      '💬 Chama no WhatsApp e peça as fotos e condições.',
    ],
    BASTIDORES: [
      '🔧 POR TRÁS DE CADA ENTREGA',
      n || 'Cada carro passa por vistoria, preparação e cuidado antes de chegar até você.',
      `É assim que a ${loja} trabalha: com transparência do começo ao fim. ✅`,
      'Quer conhecer nosso processo? Faça uma visita!',
    ],
    PROMOCAO: [
      '🔥 CONDIÇÃO ESPECIAL NA ' + loja.toLocaleUpperCase('pt-BR') + ' 🔥',
      n || 'Estoque selecionado com condições que valem a pena conferir.',
      '💳 Consulte formas de pagamento e avaliação do seu usado na troca.',
      '⏳ Por tempo limitado. Chama agora e garanta a sua condição!',
    ],
    DEPOIMENTO: [
      '⭐⭐⭐⭐⭐ QUEM COMPRA, RECOMENDA!',
      n ? `“${n}”` : '“Atendimento excelente do começo ao fim. Recomendo!”',
      `A opinião de quem já comprou na ${loja} é a nossa maior propaganda. 🙏`,
      'Venha viver essa experiência também!',
    ],
    DICA: [
      '💡 DICA RÁPIDA PARA QUEM VAI COMPRAR CARRO',
      n || 'Antes de fechar negócio, confira o histórico do veículo, a quilometragem compatível com o ano e peça o laudo cautelar.',
      `Na ${loja} a gente explica tudo com clareza — sem letra miúda.`,
      '💾 Salve este post e compartilhe com quem está procurando carro!',
    ],
    INSTITUCIONAL: [
      `🏁 PRAZER, SOMOS A ${loja.toLocaleUpperCase('pt-BR')}!`,
      n || `Loja de veículos${em} com estoque selecionado, atendimento próximo e condições que cabem no seu bolso.`,
      '🤝 Financiamento, avaliação do seu usado na troca e atendimento humano de verdade.',
      'Siga a gente para ver as novidades do estoque!',
    ],
    FIM_DE_SEMANA: [
      '☀️ BORA FAZER UM TEST DRIVE NESTE FIM DE SEMANA?',
      n || `Estamos te esperando na ${loja}${em} com o café pronto e o estoque renovado.`,
      '🚘 Traga seu usado para avaliação e saia com a proposta na mão.',
      '📲 Agende seu horário pelo WhatsApp!',
    ],
  }
  const extra: Record<Occasion, string[]> = { ENTREGA: ['entregadechaves', 'clientefeliz'], NOVIDADES: ['novidades', 'estoque'], BASTIDORES: ['bastidores'], PROMOCAO: ['promocao', 'oportunidade'], DEPOIMENTO: ['depoimento', 'clientesatisfeito'], DICA: ['dicas', 'comprarcarro'], INSTITUCIONAL: ['lojadecarros'], FIM_DE_SEMANA: ['testdrive', 'fimdesemana'] }
  return [body[o].join('\n\n'), storeContacts(s), storeHashtags(s, extra[o])].filter(Boolean).join('\n\n')
}

/** Pedido à IA: só as informações da loja e o que a pessoa escreveu (nada inventado). */
export function occasionPrompt(o: Occasion, s: StoreInfo, notes: string, format: string): string {
  return [
    'Você é o social media de uma loja de veículos seminovos no Brasil e escreve para Instagram e Facebook.',
    `Escreva a legenda de um post sobre: ${OCCASION_LABEL[o]}.${format === 'STORY' ? ' É um Story: no máximo 2 linhas.' : ''}`,
    'Estrutura: 1ª linha que prenda a atenção (com emoji), 2 a 4 linhas curtas, chamada final para chamar no WhatsApp.',
    'Regras: use SOMENTE as informações abaixo; não invente preços, promoções, prazos, garantias nem nomes de clientes;',
    'não coloque telefone, @, site nem hashtags (eu acrescento); não use markdown nem aspas. Responda só com a legenda.',
    '',
    `Loja: ${clean(s.storeName)}${clean(s.city) ? ` (${clean(s.city)})` : ''}`,
    clean(notes) ? `O que a loja quer dizer: ${clean(notes)}` : 'A loja não deu detalhes: escreva algo geral e verdadeiro para a ocasião.',
  ].join('\n')
}

/** Limpa a resposta da IA e acrescenta contatos e hashtags da loja. */
export function finishOccasion(raw: string, o: Occasion, s: StoreInfo, format: string): string {
  const t = String(raw ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1').replace(/^["“]|["”]$/g, '').replace(/\n{3,}/g, '\n\n').trim()
  if (format === 'STORY') return t.slice(0, 300)
  return [t, storeContacts(s), storeHashtags(s)].filter(Boolean).join('\n\n').slice(0, 2200)
}
