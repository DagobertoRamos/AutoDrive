// =============================================================================
// Estúdio social — legendas para Instagram/Facebook. PURO (testado).
//   • Pedido à IA: fatos da ficha (nunca inventar opcional, garantia ou
//     financiamento), formato, tom e contatos; chamada para o WhatsApp.
//   • Legenda de reserva (sem IA configurada): modelo pronto e bem escrito.
//   • Limpeza da resposta: sem markdown, até 2.200 caracteres (limite do
//     Instagram), contatos garantidos no fim.
// =============================================================================

import type { SocialFormat } from './formats'
import { vehicleName } from '../content-core'

export const CAPTION_TONES = ['VENDEDOR', 'DESCONTRAIDO', 'SOFISTICADO'] as const
export type CaptionTone = (typeof CAPTION_TONES)[number]
export const TONE_LABEL: Record<CaptionTone, string> = { VENDEDOR: 'Vendedor e direto', DESCONTRAIDO: 'Descontraído', SOFISTICADO: 'Sofisticado' }

export interface CaptionInput {
  format: SocialFormat
  tone: CaptionTone
  brand?: string | null
  model?: string | null
  version?: string | null
  year?: number | null
  modelYear?: number | null
  km?: number | null
  gear?: string | null
  fuel?: string | null
  color?: string | null
  price?: number | null
  oldPrice?: number | null
  options: string[]
  conditions?: string | null
  storeName: string
  city?: string | null
  whatsapp?: string | null
  instagram?: string | null
  site?: string | null
}

const MAX = 2200
const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/ /g, ' ')
const clean = (s?: string | null) => String(s ?? '').replace(/\s+/g, ' ').trim()
const tag = (s?: string | null) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase()

export function hashtags(i: CaptionInput): string[] {
  const list = ['seminovos', 'carrosusados', 'carros', tag(i.brand), tag(`${i.brand ?? ''}${i.model ?? ''}`), tag(i.model), tag(i.city) && `carros${tag(i.city)}`, tag(i.storeName)]
  return [...new Set(list.filter((x): x is string => !!x && x.length >= 3))].slice(0, 8).map((x) => `#${x}`)
}

export function contactBlock(i: CaptionInput): string {
  return [
    clean(i.whatsapp) ? `📲 WhatsApp: ${clean(i.whatsapp)}` : '',
    clean(i.instagram) ? `📸 ${clean(i.instagram).startsWith('@') ? clean(i.instagram) : `@${clean(i.instagram)}`}` : '',
    clean(i.site) ? `🌐 ${clean(i.site)}` : '',
  ].filter(Boolean).join('\n')
}

const title = (i: CaptionInput) => vehicleName(i.brand, i.model, i.version) || 'Seminovo'
const yearText = (i: CaptionInput) => (i.year && i.modelYear && i.year !== i.modelYear ? `${i.year}/${i.modelYear}` : i.modelYear ?? i.year ? String(i.modelYear ?? i.year) : '')

/** Pedido à IA. Só fatos da ficha; nada de inventar. */
export function captionPrompt(i: CaptionInput): string {
  const facts = [
    `Veículo: ${title(i)}`,
    yearText(i) && `Ano: ${yearText(i)}`,
    i.km != null && `Quilometragem: ${i.km.toLocaleString('pt-BR')} km`,
    i.gear && `Câmbio: ${i.gear}`,
    i.fuel && `Combustível: ${i.fuel}`,
    i.color && `Cor: ${i.color}`,
    i.price != null && `Preço: ${money(i.price)}${i.oldPrice && i.oldPrice > i.price ? ` (antes ${money(i.oldPrice)})` : ''}`,
    i.options.length ? `Opcionais (use só estes): ${i.options.slice(0, 25).join(', ')}` : 'Opcionais: não informados (não cite nenhum)',
    clean(i.conditions) && `Condições da loja: ${clean(i.conditions)}`,
    `Loja: ${i.storeName}${i.city ? ` (${i.city})` : ''}`,
  ].filter(Boolean).join('\n')
  const how: Record<SocialFormat, string> = {
    POST: 'legenda de post no feed: 1ª linha que prenda a atenção, 3 a 5 linhas curtas com os destaques e chamada final',
    CARROSSEL: 'legenda de carrossel: convide a deslizar as fotos, destaques em tópicos curtos com emoji e chamada final',
    STORY: 'texto curtíssimo (até 2 linhas) para story',
    REELS: 'legenda de Reels: gancho forte na 1ª linha, 2 a 4 linhas curtas e chamada final',
    VIDEO: 'legenda de vídeo (Reels) do carro filmado: gancho forte na 1ª linha, 2 a 4 linhas curtas e chamada final',
  }
  const tone: Record<CaptionTone, string> = { VENDEDOR: 'vendedor, direto e confiante', DESCONTRAIDO: 'descontraído e próximo', SOFISTICADO: 'sofisticado e elegante' }
  return [
    'Você é redator de uma loja de carros seminovos no Brasil e escreve para Instagram e Facebook.',
    `Escreva uma ${how[i.format]}, em português do Brasil, tom ${tone[i.tone]}.`,
    'Regras: use SOMENTE os fatos abaixo; não invente opcionais, garantia, revisões, financiamento, laudo ou dono único;',
    'não coloque telefone, @ nem site (eu acrescento depois); não use hashtags (eu acrescento); não use markdown nem aspas;',
    'termine convidando a chamar no WhatsApp. Responda só com a legenda.',
    ...(i.format === 'STORY' ? [] : ['Estrutura que funciona (siga): 1) título em MAIÚSCULAS com emoji, nome e ano + uma chamada curta; 2) um parágrafo "Imagine..." que coloque a pessoa usando o veículo no dia a dia; 3) um parágrafo de personalidade que termine com o orgulho de pensar "esse é meu"/"essa é minha"; 4) lista de benefícios, uma por linha com emoji, explicando para que serve cada item (só itens informados); 5) uma linha de confiança na loja (atendimento próximo e transparente); 6) pergunta final "Já se imaginou..." convidando a chamar no WhatsApp e agendar a visita.',]),
    '',
    facts,
  ].join('\n')
}

/** Limpa a resposta da IA e garante contatos e hashtags no fim. */
export function finishCaption(raw: string, i: CaptionInput): string {
  let t = String(raw ?? '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*/g, ''))
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^["“]|["”]$/g, '')
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const tail = [contactBlock(i), i.format === 'STORY' ? '' : hashtags(i).join(' ')].filter(Boolean).join('\n\n')
  const room = MAX - (tail ? tail.length + 2 : 0)
  if (t.length > room) t = `${t.slice(0, Math.max(0, room - 1)).trimEnd()}…`
  return [t, tail].filter(Boolean).join('\n\n')
}

/** Legenda de reserva (sem IA): modelo pronto por formato. */
export function fallbackCaption(i: CaptionInput): string {
  const t = title(i)
  const hook: Record<SocialFormat, string> = {
    POST: `🚗 ${t}${yearText(i) ? ` ${yearText(i)}` : ''} esperando por você!`,
    CARROSSEL: `👉 Arrasta para o lado e confere cada detalhe deste ${t}!`,
    STORY: `🔥 ${t} disponível agora!`,
    REELS: `🔥 Olha só o que acabou de chegar: ${t}!`,
    VIDEO: `🎬 Dá o play e confere cada detalhe deste ${t}!`,
  }
  const lines = [
    yearText(i) && `📅 Ano ${yearText(i)}`,
    i.km != null && `🛣️ ${i.km === 0 ? '0 km' : `${i.km.toLocaleString('pt-BR')} km`}`,
    i.gear && `⚙️ Câmbio ${i.gear.toLowerCase()}`,
    i.fuel && `⛽ ${i.fuel}`,
    i.options.length ? `✅ ${i.options.slice(0, 4).join(' • ')}` : '',
  ].filter(Boolean) as string[]
  const price = i.price != null ? (i.oldPrice && i.oldPrice > i.price ? `💰 De ${money(i.oldPrice)} por ${money(i.price)}` : `💰 ${money(i.price)}`) : ''
  const body = i.format === 'STORY'
    ? [hook.STORY, price].filter(Boolean).join('\n')
    : [hook[i.format], lines.join('\n'), price, clean(i.conditions), '💬 Chama no WhatsApp e agende sua visita!'].filter(Boolean).join('\n\n')
  return finishCaption(body, i)
}
