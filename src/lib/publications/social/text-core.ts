// =============================================================================
// Textos do anúncio — modelos prontos (sem IA) e pedido à IA. PURO (testado).
// Só usa o que existe no sistema: ficha do veículo, opcionais, origem, laudo
// cautelar, condições comerciais configuradas pela loja, cidade e contatos.
// Nunca inventa opcional, garantia, financiamento, revisão ou dono único.
// =============================================================================

export const DESC_STYLES = ['EMOCIONAL', 'COMPLETO', 'DIRETO', 'OPORTUNIDADE', 'PERGUNTA', 'PREMIUM'] as const
export type DescStyle = (typeof DESC_STYLES)[number]
export const DESC_STYLE_LABEL: Record<DescStyle, string> = {
  EMOCIONAL: 'Emocional (vende o sonho)', COMPLETO: 'Completo (ficha + opcionais)', DIRETO: 'Direto e curto',
  OPORTUNIDADE: 'Oportunidade (urgência e preço)', PERGUNTA: 'Pergunta que prende (conversa)', PREMIUM: 'Premium (sofisticado)',
}

// ── Condições comerciais: 5 modelos ──────────────────────────────────────────
export const TERMS_STYLES = ['CONSULTIVO', 'DIRETO', 'FACILIDADE', 'CONFIANCA', 'OPORTUNIDADE'] as const
export type TermsStyle = (typeof TERMS_STYLES)[number]
export const TERMS_STYLE_LABEL: Record<TermsStyle, string> = {
  CONSULTIVO: 'Consultivo (completo, com avisos)', DIRETO: 'Direto (lista curta)', FACILIDADE: 'Facilidade de pagamento',
  CONFIANCA: 'Confiança e transparência', OPORTUNIDADE: 'Oportunidade (chamada para agir)',
}

/** Condições comerciais padrão da loja (Canais conectados › Contatos e regras). */
export interface StoreTerms {
  cash: boolean
  acceptsTrade: boolean
  financing: boolean
  /** Parcelas máximas do financiamento (ex.: 60). */
  financingMax: number | null
  cards: boolean
  /** Parcelas máximas no cartão (ex.: 24). */
  cardsMax: number | null
  consortium: boolean
  transferIncluded: boolean
  ipvaPaid: boolean
  warrantyMonths: number | null
  extra: string
}
export const EMPTY_TERMS: StoreTerms = { cash: false, acceptsTrade: false, financing: false, financingMax: null, cards: false, cardsMax: null, consortium: false, transferIncluded: false, ipvaPaid: false, warrantyMonths: null, extra: '' }
/** Sugestão para a loja começar (ela confirma antes de salvar). */
export const SUGGESTED_TERMS: StoreTerms = { ...EMPTY_TERMS, cash: true, acceptsTrade: true, financing: true, financingMax: 60, cards: true, cardsMax: 24 }

export const hasTerms = (t: StoreTerms) => t.cash || t.acceptsTrade || t.financing || t.cards || t.consortium || t.transferIncluded || t.ipvaPaid || !!t.warrantyMonths || !!t.extra

export function sanitizeTerms(x: unknown, fallback: StoreTerms = EMPTY_TERMS): StoreTerms {
  if (!x || typeof x !== 'object') return fallback
  const t = x as Record<string, unknown>
  const b = (k: keyof StoreTerms) => (typeof t[k] === 'boolean' ? (t[k] as boolean) : (fallback[k] as boolean))
  const w = Number(t.warrantyMonths)
  const n = (k: 'financingMax' | 'cardsMax', max: number) => { const v = Number(t[k]); return k in t ? (t[k] !== null && Number.isFinite(v) && v >= 2 && v <= max ? Math.round(v) : null) : fallback[k] }
  return {
    cash: b('cash'), acceptsTrade: b('acceptsTrade'), financing: b('financing'), financingMax: n('financingMax', 120), cards: b('cards'), cardsMax: n('cardsMax', 36), consortium: b('consortium'),
    transferIncluded: b('transferIncluded'), ipvaPaid: b('ipvaPaid'),
    warrantyMonths: 'warrantyMonths' in t ? (Number.isFinite(w) && w > 0 && w <= 60 ? Math.round(w) : null) : fallback.warrantyMonths,
    extra: typeof t.extra === 'string' ? t.extra.replace(/\s+/g, ' ').trim().slice(0, 300) : fallback.extra,
  }
}

export interface TextInput {
  brand?: string | null; model?: string | null; version?: string | null
  year?: number | null; modelYear?: number | null; km?: number | null
  gear?: string | null; fuel?: string | null; color?: string | null; doors?: number | null; engine?: string | null
  price?: number | null; oldPrice?: number | null
  options: string[]
  origin: 'OWN' | 'PARTNER' | 'PRIVATE'
  inspected: boolean
  isNew: boolean
  storeName: string
  city?: string | null
  terms: StoreTerms
  /** MOTORCYCLE = moto; carroceria define SUV/picape. */
  vehicleType?: string | null
  bodyType?: string | null
  /** Semente para variar o modelo entre carros (id do veículo). */
  seed?: string
}

const clean = (s?: string | null) => String(s ?? '').replace(/\s+/g, ' ').trim()
const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/ /g, ' ')
const low = (s: string) => s.toLocaleLowerCase('pt-BR')

/** "HONDA ADV" → "Honda ADV": palavra toda em maiúsculas com mais de 3 letras vira Capitalizada; siglas ficam. */
export function smartCase(t: string): string {
  return t.split(' ').map((w) => (/^[A-ZÀ-Ý]{4,}$/.test(w) ? w[0] + w.slice(1).toLocaleLowerCase('pt-BR') : w)).join(' ')
}
/** Marca + modelo sem repetir a marca (ex.: "HONDA" + "HONDA ADV" → "Honda ADV"). */
function name(i: TextInput): string {
  const b = clean(i.brand); const m = clean(i.model)
  if (!m) return smartCase(b) || 'Veículo'
  return smartCase(b && !low(m).startsWith(low(b)) ? `${b} ${m}` : m)
}
/** Nome + versão sem repetir o que já está no nome. */
function full(i: TextInput): string {
  const n = name(i)
  let v = clean(i.version)
  for (const part of [clean(i.brand), clean(i.model)]) if (part && low(v).startsWith(low(part))) v = clean(v.slice(part.length))
  return v && !low(n).includes(low(v)) ? `${n} ${smartCase(v)}` : n
}
const yearText = (i: TextInput) => (i.year && i.modelYear && i.year !== i.modelYear ? `${i.year}/${i.modelYear}` : i.modelYear ?? i.year ? String(i.modelYear ?? i.year) : '')

type Kind = 'CARRO' | 'SUV' | 'PICAPE' | 'MOTO'
export function vehicleKind(i: Pick<TextInput, 'vehicleType' | 'bodyType'>): Kind {
  if (/^moto/i.test(clean(i.vehicleType)) || /motorcycle/i.test(clean(i.vehicleType))) return 'MOTO'
  const b = low(clean(i.bodyType))
  if (/pick|picape|cabine|ca[cç]amba/.test(b)) return 'PICAPE'
  if (/suv|utilit/.test(b)) return 'SUV'
  return 'CARRO'
}
const NOUN: Record<Kind, { n: string; este: string; do: string; drive: string; test: string }> = {
  CARRO: { n: 'carro', este: 'Este', do: 'do', drive: 'ao volante', test: 'test drive' },
  SUV: { n: 'SUV', este: 'Este', do: 'do', drive: 'ao volante', test: 'test drive' },
  PICAPE: { n: 'picape', este: 'Esta', do: 'da', drive: 'ao volante', test: 'test drive' },
  MOTO: { n: 'moto', este: 'Esta', do: 'da', drive: 'em cima', test: 'test ride' },
}
const pick = <T,>(list: T[], seed = ''): T => { let h = 7; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return list[h % list.length] }

/** Opcional cadastrado → frase de benefício (desconhecido = o próprio nome). */
const BENEFITS: Array<[RegExp, string, string]> = [
  [/\babs\b/i, '🛡️', 'Freios com ABS para auxiliar nas frenagens.'],
  [/teto solar|panor[aâ]mico/i, '☀️', 'Teto solar para curtir cada viagem de um jeito diferente.'],
  [/couro/i, '🪑', 'Bancos em couro que elevam o conforto e o requinte.'],
  [/multim[ií]dia|carplay|android auto/i, '📱', 'Central multimídia com música, mapas e chamadas na palma da mão.'],
  [/c[aâ]mera de r[ée]/i, '📷', 'Câmera de ré que deixa as manobras muito mais fáceis.'],
  [/sensor de (estacionamento|r[ée])|sensor traseiro/i, '🔔', 'Sensor de estacionamento para estacionar sem sustos.'],
  [/ar[- ]condicionado|climatiza/i, '❄️', 'Ar-condicionado para encarar os dias quentes com conforto.'],
  [/liga leve/i, '✨', 'Rodas de liga leve que valorizam o visual.'],
  [/piloto autom[aá]tico|controle de cruzeiro/i, '🛣️', 'Piloto automático para viagens mais tranquilas.'],
  [/air ?bag/i, '🛡️', 'Airbags para mais segurança para você e sua família.'],
  [/dire[cç][aã]o (el[ée]trica|hidr[aá]ulica|assistida)/i, '🎯', 'Direção leve e precisa nas manobras.'],
  [/4x4|tra[cç][aã]o integral|awd/i, '⛰️', 'Tração 4x4 para ir além do asfalto.'],
  [/partida (sem chave|por bot[aã]o)|keyless/i, '🔑', 'Partida sem chave, prática no dia a dia.'],
  [/vidros? el[ée]tricos?/i, '🪟', 'Vidros elétricos para mais praticidade.'],
  [/trava el[ée]trica|alarme/i, '🔒', 'Travas e alarme para mais segurança.'],
  [/farol de led|led/i, '💡', 'Iluminação em LED que ilumina melhor e deixa o visual moderno.'],
]
export function benefitLines(options: string[], max = 6): string[] {
  const out: string[] = []; const used = new Set<string>()
  for (const o of options) {
    const hit = BENEFITS.find(([re]) => re.test(o))
    const line = hit ? `${hit[1]} ${hit[2]}` : `✔ ${o}.`
    if (!used.has(line)) { used.add(line); out.push(line) }
    if (out.length >= max) break
  }
  return out
}

/** Destaques objetivos que dá para afirmar só com os dados. */
export function highlights(i: TextInput, now = new Date()): string[] {
  const out: string[] = []
  const age = i.modelYear ?? i.year ? Math.max(1, now.getFullYear() - Number(i.modelYear ?? i.year) + 1) : null
  const perYear = vehicleKind(i) === 'MOTO' ? 6_000 : 12_000
  if (i.isNew) out.push('zero quilômetro')
  else if (i.km != null && age && i.km / age < perYear) out.push('baixa quilometragem para o ano')
  if (i.inspected) out.push('laudo cautelar aprovado')
  if (i.gear && /autom|cvt/i.test(i.gear)) out.push('câmbio automático')
  if (i.oldPrice && i.price && i.oldPrice > i.price) out.push(`preço reduzido (de ${money(i.oldPrice)} por ${money(i.price)})`)
  return out
}

const ORIGIN_TEXT: Record<TextInput['origin'], string> = {
  OWN: 'Veículo do nosso estoque próprio',
  PARTNER: 'Veículo de loja parceira, com atendimento e negociação pela nossa equipe',
  PRIVATE: 'Veículo de particular intermediado pela nossa loja',
}

/** Condições comerciais em texto, a partir da configuração da loja + ficha. */
export function termsText(i: Pick<TextInput, 'terms' | 'inspected'>, style: 'LISTA' | 'FRASE' = 'LISTA'): string {
  const t = i.terms
  const items = [
    t.cash && 'Pagamento à vista',
    t.financing && `Financiamento${t.financingMax ? ` em até ${t.financingMax}x` : ''} (sujeito à aprovação de crédito)`,
    t.cards && `Cartão de crédito${t.cardsMax ? ` em até ${t.cardsMax}x` : ''}`,
    t.consortium && 'Consórcio',
    t.acceptsTrade && 'Aceitamos seu veículo na troca',
    t.transferIncluded && 'Transferência inclusa',
    t.ipvaPaid && 'IPVA pago',
    t.warrantyMonths && `Garantia de ${t.warrantyMonths} ${t.warrantyMonths === 1 ? 'mês' : 'meses'} (conforme termo da loja)`,
    i.inspected && 'Laudo cautelar aprovado',
    clean(t.extra),
  ].filter(Boolean) as string[]
  if (!items.length) return ''
  return style === 'LISTA' ? items.map((x) => `✔ ${x}`).join('\n') : `${items.join('. ')}.`
}

function specLines(i: TextInput): string[] {
  return [
    yearText(i) && `Ano/modelo: ${yearText(i)}`,
    i.km != null && `Quilometragem: ${i.isNew ? '0 km' : `${i.km.toLocaleString('pt-BR')} km`}`,
    i.gear && `Câmbio: ${i.gear}`,
    i.fuel && `Combustível: ${i.fuel}`,
    i.engine && `Motor: ${clean(i.engine)}`,
    i.color && `Cor: ${clean(i.color)}`,
    i.doors && `${i.doors} portas`,
  ].filter(Boolean) as string[]
}

/** Descrição pronta (modelo gravado), sem IA. Varia entre carros pela semente. */
export function descriptionTemplate(i: TextInput, style: DescStyle, now = new Date()): string {
  const k = vehicleKind(i); const N = NOUN[k]
  const h = highlights(i, now)
  // O laudo já aparece nos destaques/segurança: não repete nas condições.
  const terms = termsText({ terms: i.terms, inspected: false }, 'LISTA')
  const opts = i.options.slice(0, 30)
  const local = i.city ? ` em ${clean(i.city)}` : ''
  const yr = yearText(i) ? ` ${yearText(i)}` : ''
  const auto = !!i.gear && /autom|cvt/i.test(i.gear)
  const lowKm = h.includes('baixa quilometragem para o ano')
  const seed = i.seed ?? full(i)
  const priceLine = i.price != null ? (i.oldPrice && i.oldPrice > i.price ? `💰 Oportunidade: de ${money(i.oldPrice)} por apenas ${money(i.price)}.` : `💰 Tudo isso por ${money(i.price)}.`) : ''
  const cta = pick([
    `Oportunidades assim não ficam muito tempo no pátio. Agende agora sua visita ou ${N.test} na ${i.storeName}${local} e venha sentir de perto! 📲`,
    `Não deixe para depois: chame a gente, agende seu ${N.test} na ${i.storeName}${local} e saia com a chave na mão. 🔑`,
    `Venha conhecer pessoalmente na ${i.storeName}${local}. ${N.este} pode ser ${k === 'MOTO' || k === 'PICAPE' ? 'a sua próxima' : 'o seu próximo'} ${N.n} — e a gente facilita tudo para isso acontecer. 🤝`,
  ], seed + 'cta')

  if (style === 'DIRETO') {
    return [
      `🔥 ${full(i)}${yr}${i.km != null && !i.isNew ? ` • ${i.km.toLocaleString('pt-BR')} km` : ''}${i.gear ? ` • ${i.gear}` : ''}`,
      h.filter((x) => !x.startsWith('preço')).slice(0, 4).map((x) => `✔ ${x[0].toUpperCase()}${x.slice(1)}`).join('\n'),
      opts.length ? `✅ Itens: ${opts.slice(0, 8).join(', ')}${opts.length > 8 ? ' e mais' : ''}.` : '',
      priceLine,
      terms,
      `📲 Chame agora e agende seu ${N.test} na ${i.storeName}${local}.`,
    ].filter(Boolean).join('\n')
  }

  if (style === 'EMOCIONAL') {
    const fem = k === 'MOTO' || k === 'PICAPE'
    const model = smartCase(clean(i.model).replace(new RegExp(`^${clean(i.brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '')) || name(i)
    const tag = pick(k === 'MOTO'
      ? ['SUA ROTINA COM MAIS LIBERDADE', 'LIBERDADE SOBRE DUAS RODAS', 'O CAMINHO FICA MAIS LEVE']
      : k === 'SUV' ? ['ESPAÇO, CONFORTO E PRESENÇA', 'PRONTO PARA A PRÓXIMA AVENTURA', 'A FAMÍLIA TODA MAIS CONFORTÁVEL']
      : k === 'PICAPE' ? ['FORÇA PARA O TRABALHO E PARA O LAZER', 'PRONTA PARA QUALQUER DESAFIO']
      : ['O CARRO QUE VAI MUDAR SUA ROTINA', 'CONFORTO PARA O DIA A DIA', 'SEU PRÓXIMO CAPÍTULO COMEÇA AQUI'], seed + 't')
    const scene = pick(k === 'MOTO' ? [
      'Imagine começar o dia com vontade de sair de casa. Assumir o guidão, sentir o vento e aproveitar o caminho — seja para o trabalho, para encontrar alguém especial ou para tomar um café sem pressa no fim de semana. ☀️🍃',
      'Imagine deixar o trânsito para trás, chegar mais rápido onde importa e ainda ter tempo de sobra para o que você gosta. É isso que uma moto certa faz pela sua rotina. 🏍️💨',
    ] : k === 'PICAPE' ? [
      'Imagine encarar a semana de trabalho com força de sobra e, no fim de semana, pegar a estrada rumo ao sítio, à praia ou à trilha — levando tudo o que precisa. 🌄',
    ] : [
      'Imagine sair de casa pela manhã, ligar o ar, colocar sua música preferida e aproveitar o caminho com conforto — para o trabalho, para buscar quem você ama ou para aquela viagem que está nos planos há tempos. ☀️🎶',
      'Imagine a família toda acomodada, as malas no porta-malas e a estrada pela frente. Cada viagem vira uma lembrança boa quando o carro acompanha você de verdade. 🛣️👨‍👩‍👧',
      'Imagine chegar aos lugares com mais conforto, segurança e aquele orgulho de estacionar e olhar para trás antes de entrar. ✨',
    ], seed + 's')
    const trait = auto ? `a praticidade do câmbio automático` : lowKm ? `a tranquilidade de ${fem ? 'uma' : 'um'} ${N.n} pouco ${fem ? 'rodada' : 'rodado'}` : `um conjunto pensado para o dia a dia`
    const persona = `${fem ? 'A' : 'O'} ${name(i)}${yr} combina ${k === 'MOTO' ? 'um visual cheio de personalidade' : k === 'SUV' ? 'presença e espaço' : 'estilo e conforto'} com ${trait}. ${fem ? 'Uma' : 'Um'} ${N.n} para quem quer facilitar a rotina e sentir aquele orgulho de olhar para a garagem e pensar: “${fem ? 'essa é minha' : 'esse é meu'}”. ✨`
    const bullets = [
      auto && `⚙️ Câmbio automático para tornar a ${k === 'MOTO' ? 'pilotagem' : 'direção'} mais prática.`,
      ...benefitLines(opts, 5),
      lowKm && `📉 Baixa quilometragem para o ano: pouco ${fem ? 'rodada' : 'rodado'}, muito para rodar ainda.`,
      i.inspected && '✅ Laudo cautelar aprovado para você comprar com tranquilidade.',
      (i.modelYear ?? i.year) && Number(i.modelYear ?? i.year) >= now.getFullYear() - 2 && `📅 Modelo ${i.modelYear ?? i.year} para acompanhar seus próximos planos.`,
      i.oldPrice && i.price && i.oldPrice > i.price && `💰 De ${money(i.oldPrice)} por apenas ${money(i.price)}.`,
    ].filter(Boolean) as string[]
    return [
      `${k === 'MOTO' ? '🛵' : k === 'PICAPE' ? '🛻' : '🚗'} ${name(i).toLocaleUpperCase('pt-BR')}${yr} — ${tag}.`,
      scene,
      persona,
      bullets.join('\n'),
      `🤝 Na ${i.storeName}, você recebe atendimento próximo e transparente para conhecer ${fem ? 'a' : 'o'} ${N.n} e escolher com confiança.`,
      terms ? `Facilitamos tudo para você:\n${terms}` : '',
      `📲 Já se imaginou ${k === 'MOTO' ? 'no guidão' : 'ao volante'} ${fem ? 'dessa' : 'desse'} ${model}? Chame no WhatsApp, consulte a disponibilidade e agende sua visita${i.city ? ` em ${clean(i.city)}` : ''}. Sua próxima conquista merece ser vista de perto!`,
    ].filter(Boolean).join('\n\n')
  }

  if (style === 'OPORTUNIDADE') {
    return [
      `⚡ OPORTUNIDADE: ${full(i)}${yr}`,
      i.oldPrice && i.price && i.oldPrice > i.price ? `💥 Preço reduzido: de ${money(i.oldPrice)} por ${money(i.price)}. Diferença de ${money(i.oldPrice - i.price)} no seu bolso.` : priceLine,
      `Esse é ${k === 'MOTO' || k === 'PICAPE' ? 'daquelas' : 'daqueles'} que não costumam ficar muito tempo no pátio. Motivos não faltam:`,
      [...h.filter((x) => !x.startsWith('preço')).map((x) => `✔ ${x[0].toUpperCase()}${x.slice(1)}`), ...opts.slice(0, 5).map((o) => `✔ ${o}`)].slice(0, 8).join('\n'),
      terms ? `Para facilitar:\n${terms}` : '',
      `⏳ Garanta antes que outra pessoa leve. Chame agora no WhatsApp e reserve seu horário para ver ${k === 'MOTO' || k === 'PICAPE' ? 'a' : 'o'} ${N.n} na ${i.storeName}${local}.`,
    ].filter(Boolean).join('\n\n')
  }

  if (style === 'PERGUNTA') {
    const fem = k === 'MOTO' || k === 'PICAPE'
    const q = pick(k === 'MOTO'
      ? ['Cansado de perder tempo no trânsito?', 'Procurando economia sem abrir mão de estilo?', 'Que tal chegar mais rápido e gastar menos?']
      : k === 'SUV' ? ['Procurando espaço, conforto e segurança para a família?', 'Quer um carro que encare cidade e estrada com o mesmo conforto?']
      : ['Procurando um carro confiável para o dia a dia?', 'Quer trocar de carro sem dor de cabeça?', 'Que tal dirigir com mais conforto a partir desta semana?'], seed + 'q')
    return [
      `🤔 ${q}`,
      `Então conheça ${fem ? 'a' : 'o'} ${full(i)}${yr}. 👇`,
      [...specLines(i).slice(0, 4).map((l) => `• ${l}`), ...h.filter((x) => !x.startsWith('preço')).slice(0, 3).map((x) => `• ${x[0].toUpperCase()}${x.slice(1)}`)].join('\n'),
      opts.length ? `E ainda vem com: ${opts.slice(0, 6).join(', ')}${opts.length > 6 ? ' e mais' : ''}.` : '',
      priceLine,
      terms ? `Como você prefere pagar?\n${terms}` : '',
      `💬 Ficou com alguma dúvida? Pergunta pra gente! Chame no WhatsApp e agende seu ${N.test} na ${i.storeName}${local}.`,
    ].filter(Boolean).join('\n\n')
  }

  if (style === 'PREMIUM') {
    return [
      `${full(i)}${yr}`,
      pick(['Elegância, conforto e procedência reunidos em um só veículo.', 'Para quem valoriza cada detalhe — e não abre mão de qualidade.', 'Um veículo à altura das suas escolhas.'], seed + 'p'),
      specLines(i).join(' · '),
      opts.length ? `Destaques de equipamento: ${opts.slice(0, 10).join(', ')}${opts.length > 10 ? ', entre outros' : ''}.` : '',
      h.filter((x) => !x.startsWith('preço')).length ? `Diferenciais: ${h.filter((x) => !x.startsWith('preço')).join(', ')}.` : '',
      i.price != null ? `Valor: ${money(i.price)}${i.oldPrice && i.oldPrice > i.price ? ` (anteriormente ${money(i.oldPrice)})` : ''}.` : '',
      terms ? `Condições:\n${terms}` : '',
      `${ORIGIN_TEXT[i.origin]}. Atendimento personalizado na ${i.storeName}${local} — agende uma visita reservada.`,
    ].filter(Boolean).join('\n\n')
  }

  // COMPLETO
  return [
    `🚗 ${full(i)}${yr}`.replace('🚗', k === 'MOTO' ? '🏍️' : '🚗'),
    pick(k === 'MOTO'
      ? ['Pronta para te levar mais longe, com economia e liberdade.', 'Agilidade no dia a dia e diversão no fim de semana.']
      : ['Conforto, segurança e procedência para o seu dia a dia.', 'O equilíbrio certo entre conforto, economia e estilo.', 'Pronto para acompanhar você e sua família em cada momento.'], seed),
    h.length ? `✨ Destaques\n${h.map((x) => `• ${x[0].toUpperCase()}${x.slice(1)}`).join('\n')}` : '',
    `📋 Ficha técnica\n${specLines(i).map((l) => `• ${l}`).join('\n')}`,
    opts.length ? `✅ Opcionais\n${opts.map((o) => `• ${o}`).join('\n')}` : '',
    priceLine,
    terms ? `💳 Condições\n${terms}` : '',
    `📍 ${ORIGIN_TEXT[i.origin]}.`,
    cta,
  ].filter(Boolean).join('\n\n')
}

/** Pedido à IA para a descrição (só fatos; o texto das condições vai pronto). */
export function descriptionPrompt(i: TextInput, style: DescStyle, now = new Date()): string {
  const tone: Record<DescStyle, string> = {
    COMPLETO: 'completo e organizado em blocos curtos com emojis de título (destaques, ficha, opcionais, condições), abrindo com uma frase que valorize o veículo',
    DIRETO: 'direto e curto (até 7 linhas), com emojis no início das linhas',
    EMOCIONAL: 'emocional e envolvente, que desperte o sonho e a vontade de ter o veículo: abra com um gancho que faça a pessoa se imaginar usando-o, descreva a experiência (conforto, liberdade, família, viagens), traga os destaques como provas, crie senso de oportunidade e feche com chamada para visita',
    OPORTUNIDADE: 'de oportunidade e urgência: destaque o preço (e a redução, se houver), liste os motivos em tópicos curtos com ✔ e feche pedindo para chamar agora antes que outra pessoa leve',
    PERGUNTA: 'conversado, abrindo com uma pergunta que toque numa dor ou desejo do comprador, respondendo com o veículo e fechando com convite para tirar dúvidas no WhatsApp',
    PREMIUM: 'sofisticado e elegante, frases curtas, poucos ou nenhum emoji, valorizando procedência, detalhes e atendimento personalizado',
  }
  const k = vehicleKind(i)
  return [
    'Você é um redator publicitário experiente de uma loja de veículos seminovos no Brasil (portais e redes sociais).',
    `Tipo do veículo: ${NOUN[k].n}${k === 'MOTO' ? ' (use "test ride", não "test drive")' : ''}.`,
    `Escreva a DESCRIÇÃO do anúncio em português do Brasil, estilo ${tone[style]}.`,
    'Regras: use SOMENTE os fatos abaixo; não invente opcionais, garantia, revisões, financiamento, dono único, laudo ou histórico;',
    'não coloque telefone, e-mail, @ nem site; não use markdown (sem **, sem #); pode usar poucos emojis; termine convidando para visita ou test drive.',
    'Responda só com o texto.',
    ...(style === 'EMOCIONAL' ? ['Estrutura que funciona (siga): 1) título em MAIÚSCULAS com emoji, nome e ano + uma chamada curta; 2) um parágrafo "Imagine..." que coloque a pessoa usando o veículo no dia a dia; 3) um parágrafo de personalidade que termine com o orgulho de pensar "esse é meu"/"essa é minha"; 4) lista de benefícios, uma por linha com emoji, explicando para que serve cada item (só itens informados); 5) uma linha de confiança na loja (atendimento próximo e transparente); 6) pergunta final "Já se imaginou..." convidando a chamar no WhatsApp e agendar a visita.',] : []),
    '',
    `Veículo: ${full(i)}`,
    ...specLines(i),
    `Origem: ${ORIGIN_TEXT[i.origin]}`,
    highlights(i, now).length ? `Destaques confirmados: ${highlights(i, now).join('; ')}` : '',
    i.options.length ? `Opcionais (use só estes): ${i.options.slice(0, 30).join(', ')}` : 'Opcionais: não informados (não cite nenhum)',
    i.price != null ? `Preço: ${money(i.price)}` : '',
    termsText(i, 'FRASE') ? `Condições da loja (use exatamente): ${termsText(i, 'FRASE')}` : 'Condições da loja: não informadas (não cite nenhuma)',
    `Loja: ${i.storeName}${i.city ? `, ${clean(i.city)}` : ''}`,
  ].filter((x) => x !== '').join('\n')
}

/** Limpa a resposta da IA (sem markdown, sem contato), até 4.000 caracteres. */
export function finishDescription(raw: string): string {
  return String(raw ?? '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*/g, ''))
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '')
    .replace(/\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000)
}

/**
 * Condições comerciais completas (campo "Condições" do anúncio): blocos por
 * forma de pagamento marcada pela loja, com os avisos obrigatórios (crédito,
 * taxas, consórcio). Contatos ficam de fora — cada canal acrescenta os seus.
 */
export function termsBlock(i: { terms: StoreTerms; inspected: boolean; storeName: string }, style: TermsStyle = 'CONSULTIVO'): string {
  const t = i.terms
  if (!hasTerms(t) && !i.inspected) return ''
  const store = clean(i.storeName) || 'nossa loja'
  if (style !== 'CONSULTIVO') return termsVariant(i, style, store)
  const blocks: string[] = [
    '💎 SUA PRÓXIMA CONQUISTA MERECE UM ATENDIMENTO À ALTURA.',
    `Na ${store}, unimos experiência no mercado, atendimento personalizado e transparência para ajudar você a escolher a melhor forma de comprar. Nosso compromisso é acompanhar cada etapa da negociação. 🤝`,
  ]
  if (t.cash) blocks.push('💰 À VISTA\nPrefere comprar à vista? Fale com nossa equipe e conheça a proposta para o veículo que você escolheu.')
  if (t.financing) blocks.push(`🏦 FINANCIAMENTO${t.financingMax ? ` EM ATÉ ${t.financingMax}X` : ''}\nSolicite uma simulação personalizada e avalie as opções de entrada e parcelas de acordo com seu perfil e orçamento. Sujeito à análise e aprovação de crédito.`)
  if (t.cards) blocks.push(`💳 CARTÃO DE CRÉDITO${t.cardsMax ? ` EM ATÉ ${t.cardsMax}X` : ''}\nFacilite sua entrada ou consulte a possibilidade de pagar o veículo no cartão, conforme o limite disponível. Consulte taxas e condições.`)
  if (t.consortium) blocks.push('🎯 CONSÓRCIO PARA PLANEJAR SUA CONQUISTA\nConheça os planos disponíveis e escolha com orientação e clareza. A contemplação ocorre por sorteio ou lance, conforme as regras do grupo, sem garantia de prazo. Quando permitido, o lance embutido pode compor sua oferta, reduzindo o crédito disponível para a compra. Há taxa de administração e demais encargos previstos em contrato.')
  if (t.acceptsTrade) blocks.push('🔄 ACEITAMOS SEU VEÍCULO NA TROCA\nSeu carro ou sua moto pode fazer parte da negociação, mediante avaliação.')
  const extras = [
    t.transferIncluded && '📄 Transferência inclusa.',
    t.ipvaPaid && '✅ IPVA pago.',
    t.warrantyMonths && `🛡️ Garantia de ${t.warrantyMonths} ${t.warrantyMonths === 1 ? 'mês' : 'meses'}, conforme termo da loja.`,
    i.inspected && '🔍 Laudo cautelar aprovado.',
    clean(t.extra) && `✔ ${clean(t.extra)}`,
  ].filter(Boolean) as string[]
  if (extras.length) blocks.push(extras.join('\n'))
  blocks.push(`✨ Você traz seus planos. A ${store} ajuda a encontrar o caminho para realizá-los, com atenção e condições explicadas antes de fechar negócio.`)
  if (t.financing || t.cards || t.consortium) blocks.push('📌 Prazos e condições variam conforme o veículo, a instituição financeira, a administradora ou a operadora do cartão. Consulte disponibilidade, taxas e custo total da operação.')
  blocks.push('📲 Qual opção combina mais com você? Fale conosco e receba uma proposta personalizada!')
  return blocks.join('\n\n')
}

/** Os outros 4 modelos de condições comerciais (mesmos fatos, jeitos diferentes de dizer). */
function termsVariant(i: { terms: StoreTerms; inspected: boolean }, style: Exclude<TermsStyle, 'CONSULTIVO'>, store: string): string {
  const t = i.terms
  const fin = t.financing ? `Financiamento${t.financingMax ? ` em até ${t.financingMax}x` : ''}` : ''
  const card = t.cards ? `Cartão de crédito${t.cardsMax ? ` em até ${t.cardsMax}x` : ''}` : ''
  const extras = [
    t.transferIncluded && 'Transferência inclusa',
    t.ipvaPaid && 'IPVA pago',
    t.warrantyMonths && `Garantia de ${t.warrantyMonths} ${t.warrantyMonths === 1 ? 'mês' : 'meses'} (conforme termo da loja)`,
    i.inspected && 'Laudo cautelar aprovado',
    clean(t.extra),
  ].filter(Boolean) as string[]
  const legal = t.financing || t.cards || t.consortium ? 'Crédito sujeito a análise e aprovação. Consulte taxas, prazos e custo total.' : ''
  if (style === 'DIRETO') {
    return [
      '💳 FORMAS DE PAGAMENTO',
      [t.cash && '✔ À vista', fin && `✔ ${fin}`, card && `✔ ${card}`, t.consortium && '✔ Consórcio', t.acceptsTrade && '✔ Aceitamos seu veículo na troca', ...extras.map((x) => `✔ ${x}`)].filter(Boolean).join('\n'),
      legal,
    ].filter(Boolean).join('\n\n')
  }
  if (style === 'FACILIDADE') {
    return [
      '🙌 A GENTE FACILITA PARA VOCÊ SAIR DE CHAVE NA MÃO',
      [t.acceptsTrade && '🔄 Aceitamos seu usado na troca, como parte do pagamento (mediante avaliação).', fin && `🏦 ${fin}: simulação rápida e sem compromisso, com entrada e parcelas que cabem no seu bolso.`, card && `💳 ${card}: use o limite para a entrada ou para o valor todo.`, t.consortium && '🎯 Consórcio: planeje sua próxima conquista (contemplação por sorteio ou lance).', t.cash && '💰 À vista: condição especial — pergunte!'].filter(Boolean).join('\n'),
      extras.length ? extras.map((x) => `✅ ${x}`).join('\n') : '',
      legal,
      '📲 Mande uma mensagem e receba a simulação na hora.',
    ].filter(Boolean).join('\n\n')
  }
  if (style === 'CONFIANCA') {
    return [
      `🤝 NA ${store.toLocaleUpperCase('pt-BR')}, TUDO É EXPLICADO ANTES DE FECHAR`,
      'Sem letra miúda: você conhece as condições, as taxas e o valor total antes de decidir.',
      [t.cash && '• À vista', fin && `• ${fin}`, card && `• ${card}`, t.consortium && '• Consórcio', t.acceptsTrade && '• Seu veículo na troca, com avaliação justa'].filter(Boolean).join('\n'),
      extras.length ? `Garantias de uma compra tranquila:\n${extras.map((x) => `• ${x}`).join('\n')}` : '',
      legal,
    ].filter(Boolean).join('\n\n')
  }
  // OPORTUNIDADE
  return [
    '⚡ CONDIÇÕES PARA FECHAR AINDA HOJE',
    [fin && `🔥 ${fin}`, card && `🔥 ${card}`, t.acceptsTrade && '🔥 Pegamos seu usado na troca', t.cash && '🔥 Condição especial à vista', t.consortium && '🔥 Consórcio'].filter(Boolean).join('\n'),
    extras.length ? extras.map((x) => `✅ ${x}`).join('\n') : '',
    legal,
    '⏳ Condições sujeitas à disponibilidade do veículo. Chame agora e garanta a sua!',
  ].filter(Boolean).join('\n\n')
}
