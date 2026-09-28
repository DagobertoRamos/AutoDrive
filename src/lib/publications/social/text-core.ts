// =============================================================================
// Textos do anúncio — modelos prontos (sem IA) e pedido à IA. PURO (testado).
// Só usa o que existe no sistema: ficha do veículo, opcionais, origem, laudo
// cautelar, condições comerciais configuradas pela loja, cidade e contatos.
// Nunca inventa opcional, garantia, financiamento, revisão ou dono único.
// =============================================================================

export const DESC_STYLES = ['COMPLETO', 'DIRETO', 'EMOCIONAL'] as const
export type DescStyle = (typeof DESC_STYLES)[number]
export const DESC_STYLE_LABEL: Record<DescStyle, string> = { COMPLETO: 'Completo (ficha + opcionais)', DIRETO: 'Direto e curto', EMOCIONAL: 'Emocional (vende o sonho)' }

/** Condições comerciais padrão da loja (Canais conectados › Contatos e regras). */
export interface StoreTerms {
  acceptsTrade: boolean
  financing: boolean
  cards: boolean
  transferIncluded: boolean
  ipvaPaid: boolean
  warrantyMonths: number | null
  extra: string
}
export const EMPTY_TERMS: StoreTerms = { acceptsTrade: false, financing: false, cards: false, transferIncluded: false, ipvaPaid: false, warrantyMonths: null, extra: '' }

export function sanitizeTerms(x: unknown, fallback: StoreTerms = EMPTY_TERMS): StoreTerms {
  if (!x || typeof x !== 'object') return fallback
  const t = x as Record<string, unknown>
  const b = (k: keyof StoreTerms) => (typeof t[k] === 'boolean' ? (t[k] as boolean) : (fallback[k] as boolean))
  const w = Number(t.warrantyMonths)
  return {
    acceptsTrade: b('acceptsTrade'), financing: b('financing'), cards: b('cards'), transferIncluded: b('transferIncluded'), ipvaPaid: b('ipvaPaid'),
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
}

const clean = (s?: string | null) => String(s ?? '').replace(/\s+/g, ' ').trim()
const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/ /g, ' ')
const name = (i: TextInput) => clean([i.brand, i.model].filter(Boolean).join(' ')) || 'Veículo'
const full = (i: TextInput) => clean([i.brand, i.model, i.version].filter(Boolean).join(' ')) || 'Veículo'
const yearText = (i: TextInput) => (i.year && i.modelYear && i.year !== i.modelYear ? `${i.year}/${i.modelYear}` : i.modelYear ?? i.year ? String(i.modelYear ?? i.year) : '')

/** Destaques objetivos que dá para afirmar só com os dados. */
export function highlights(i: TextInput, now = new Date()): string[] {
  const out: string[] = []
  const age = i.modelYear ?? i.year ? Math.max(1, now.getFullYear() - Number(i.modelYear ?? i.year) + 1) : null
  if (i.isNew) out.push('zero quilômetro')
  else if (i.km != null && age && i.km / age < 12_000) out.push('baixa quilometragem para o ano')
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
    t.acceptsTrade && 'Aceitamos seu usado na troca',
    t.financing && 'Financiamento com as principais financeiras (sujeito à aprovação de crédito)',
    t.cards && 'Parcelamento no cartão',
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

/** Descrição pronta (modelo gravado), sem IA. */
export function descriptionTemplate(i: TextInput, style: DescStyle, now = new Date()): string {
  const h = highlights(i, now)
  const terms = termsText(i, 'LISTA')
  const opts = i.options.slice(0, 30)
  const local = i.city ? ` em ${clean(i.city)}` : ''
  if (style === 'DIRETO') {
    return [
      `${full(i)}${yearText(i) ? ` ${yearText(i)}` : ''}${i.km != null && !i.isNew ? ` • ${i.km.toLocaleString('pt-BR')} km` : ''}${i.gear ? ` • ${i.gear}` : ''}.`,
      h.length ? `Destaques: ${h.join(', ')}.` : '',
      opts.length ? `Itens: ${opts.slice(0, 10).join(', ')}.` : '',
      terms ? terms.replace(/\n/g, ' ') : '',
      `Agende sua visita na ${i.storeName}${local}.`,
    ].filter(Boolean).join('\n')
  }
  if (style === 'EMOCIONAL') {
    return [
      `Imagine você ao volante deste ${name(i)}${yearText(i) ? ` ${yearText(i)}` : ''}. ${i.gear && /autom|cvt/i.test(i.gear) ? 'Conforto do câmbio automático no dia a dia' : 'Prazer de dirigir em cada trajeto'}${h.includes('baixa quilometragem para o ano') ? ', com baixa quilometragem para o ano' : ''}.`,
      opts.length ? `Vem equipado com ${opts.slice(0, 6).join(', ')}${opts.length > 6 ? ' e muito mais' : ''}.` : '',
      i.inspected ? 'E o melhor: laudo cautelar aprovado, para você comprar com tranquilidade.' : '',
      terms ? `Facilitamos para você:\n${terms}` : '',
      `Venha conhecer pessoalmente na ${i.storeName}${local} — este pode ser o seu próximo carro.`,
    ].filter(Boolean).join('\n\n')
  }
  // COMPLETO
  return [
    `${full(i)}${yearText(i) ? ` ${yearText(i)}` : ''}`,
    ORIGIN_TEXT[i.origin] + '.',
    h.length ? `Destaques: ${h.join(' • ')}.` : '',
    `Ficha técnica:\n${specLines(i).map((l) => `• ${l}`).join('\n')}`,
    opts.length ? `Opcionais:\n${opts.map((o) => `• ${o}`).join('\n')}` : '',
    terms ? `Condições:\n${terms}` : '',
    `Agende sua visita ou test drive na ${i.storeName}${local}.`,
  ].filter(Boolean).join('\n\n')
}

/** Pedido à IA para a descrição (só fatos; o texto das condições vai pronto). */
export function descriptionPrompt(i: TextInput, style: DescStyle, now = new Date()): string {
  const tone: Record<DescStyle, string> = { COMPLETO: 'completo e organizado em blocos curtos (destaques, ficha, opcionais, condições)', DIRETO: 'direto e curto (até 6 linhas)', EMOCIONAL: 'emocional e envolvente, que desperte o desejo, sem exageros' }
  return [
    'Você é redator de anúncios de uma loja de carros seminovos no Brasil (portais e redes sociais).',
    `Escreva a DESCRIÇÃO do anúncio em português do Brasil, estilo ${tone[style]}.`,
    'Regras: use SOMENTE os fatos abaixo; não invente opcionais, garantia, revisões, financiamento, dono único, laudo ou histórico;',
    'não coloque telefone, e-mail, @ nem site; não use markdown (sem **, sem #); pode usar poucos emojis; termine convidando para visita ou test drive.',
    'Responda só com o texto.',
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
