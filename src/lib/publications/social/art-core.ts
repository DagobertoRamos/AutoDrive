// =============================================================================
// Estúdio social — LAYOUT das artes. PURO (testado): decide onde vai cada
// coisa; o desenho (sharp) fica em art.ts.
//   Camadas: fundo = a própria foto desfocada e escurecida; a foto do carro
//   INTEIRA por cima (nunca recortada); faixa escura embaixo com modelo,
//   versão, ano/km/câmbio, preço e contato; selo do modelo de arte no topo e
//   espaço para o logo da loja. Tudo em proporção ao tamanho do quadro.
// =============================================================================

import { canvasSize, FORMAT_INFO, TEMPLATE_INFO, type ArtTemplate, type SocialFormat } from './formats'
import { vehicleName } from '../content-core'

export interface ArtInput {
  format: SocialFormat
  template: ArtTemplate
  forVideo?: boolean
  brand?: string | null
  model?: string | null
  version?: string | null
  year?: number | null
  modelYear?: number | null
  km?: number | null
  gear?: string | null
  price?: number | null
  oldPrice?: number | null
  storeName: string
  whatsapp?: string | null
  instagram?: string | null
  primaryColor?: string | null
  darkColor?: string | null
  hasLogo?: boolean
  /** Quadro final do Reels: chamada grande para o WhatsApp. */
  endCard?: boolean
}

export interface Box { x: number; y: number; w: number; h: number }
export interface TextBlock {
  text: string; bold: boolean; size: number; color: string; x: number; y: number; maxWidth: number; align: 'left' | 'center'; strike?: boolean
  /** Texto dentro de uma pílula (índice em `shapes`): o desenho centraliza pela altura real e, com `grow`, ajusta a largura da pílula ao texto medido. */
  pill?: { index: number; padX: number; grow: boolean }
}
export type Shape =
  | { kind: 'gradient'; box: Box; from: string; to: string; fromOpacity: number; toOpacity: number }
  | { kind: 'pill'; box: Box; fill: string; radius: number }

export interface ArtLayout { w: number; h: number; photoBox: Box; logoBox: Box | null; shapes: Shape[]; texts: TextBlock[] }

const HEX = /^#[0-9a-f]{6}$/i
export const safeColor = (c: string | null | undefined, fallback: string) => (c && HEX.test(c.trim()) ? c.trim() : fallback)

const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/ /g, ' ')
const clean = (s?: string | null) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** Largura aproximada de um texto (Liberation Sans): média de 0,56 em (negrito 0,60). */
export function textWidth(text: string, size: number, bold: boolean): number {
  let em = 0
  for (const ch of text) em += ch === ' ' ? 0.28 : /[A-ZÀ-Ý@&%]/.test(ch) ? (bold ? 0.72 : 0.67) : /[0-9]/.test(ch) ? 0.56 : /[.,:;!|'•-]/.test(ch) ? 0.3 : (bold ? 0.58 : 0.53)
  return em * size
}

/** Maior tamanho (até `max`) que cabe em uma linha na largura dada; nunca menor que `min`. */
export function fitSize(text: string, maxWidth: number, max: number, min: number, bold: boolean): number {
  let s = max
  while (s > min && textWidth(text, s, bold) > maxWidth) s -= 2
  return s
}

/** Corta com reticências para caber em `maxWidth` no tamanho `size`. */
export function ellipsize(text: string, maxWidth: number, size: number, bold: boolean): string {
  if (textWidth(text, size, bold) <= maxWidth) return text
  let t = text
  while (t.length > 1 && textWidth(`${t}…`, size, bold) > maxWidth) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

export function factsLine(i: Pick<ArtInput, 'year' | 'modelYear' | 'km' | 'gear'>): string {
  const parts: string[] = []
  if (i.year || i.modelYear) parts.push(i.year && i.modelYear && i.year !== i.modelYear ? `${i.year}/${i.modelYear}` : String(i.modelYear ?? i.year))
  if (i.km != null) parts.push(i.km === 0 ? '0 km' : `${i.km.toLocaleString('pt-BR')} km`)
  if (i.gear) parts.push(i.gear)
  return parts.join('  •  ')
}

export function contactLine(i: Pick<ArtInput, 'whatsapp' | 'instagram'>): string {
  const ig = clean(i.instagram)
  return [clean(i.whatsapp) ? `WhatsApp ${clean(i.whatsapp)}` : '', ig ? (ig.startsWith('@') ? ig : `@${ig}`) : ''].filter(Boolean).join('   ')
}

export function artLayout(i: ArtInput): ArtLayout {
  const { w, h } = canvasSize(i.format, i.forVideo)
  const s = w / 1080 // tudo foi desenhado para 1080 de largura
  const px = (n: number) => Math.round(n * s)
  const primary = safeColor(i.primaryColor, '#16a34a')
  const dark = safeColor(i.darkColor, '#0b1220')
  const vertical = FORMAT_INFO[i.format].canvas === 'VERTICAL'
  const margin = px(56)
  const inner = w - margin * 2
  const shapes: Shape[] = []
  const texts: TextBlock[] = []
  const title = vehicleName(i.brand, i.model) || 'Seminovo'
  const version = clean(i.version)
  const facts = factsLine(i)
  const contact = contactLine(i)
  const badge = TEMPLATE_INFO[i.template].badge

  // Quadro final do Reels: logo, carro pequeno e chamada.
  if (i.endCard) {
    const photoBox = { x: margin, y: px(420), w: inner, h: px(620) }
    shapes.push({ kind: 'gradient', box: { x: 0, y: photoBox.y + photoBox.h, w, h: h - photoBox.y - photoBox.h }, from: dark, to: dark, fromOpacity: 0.4, toOpacity: 0.95 })
    const t1 = fitSize(title, inner, px(80), px(44), true)
    texts.push({ text: ellipsize(title, inner, t1, true), bold: true, size: t1, color: '#ffffff', x: w / 2, y: px(1120), maxWidth: inner, align: 'center' })
    if (i.price != null) texts.push({ text: money(i.price), bold: true, size: px(104), color: primary, x: w / 2, y: px(1230), maxWidth: inner, align: 'center' })
    const cta = clean(i.whatsapp) ? `Chame no WhatsApp ${clean(i.whatsapp)}` : 'Chame a gente no direct'
    shapes.push({ kind: 'pill', box: { x: margin, y: px(1440), w: inner, h: px(120) }, fill: primary, radius: px(60) })
    const cs = fitSize(cta, inner - px(60), px(46), px(28), true)
    texts.push({ text: cta, bold: true, size: cs, color: '#ffffff', x: w / 2, y: px(1500) - cs / 2, maxWidth: inner, align: 'center', pill: { index: shapes.length - 1, padX: px(30), grow: false } })
    texts.push({ text: ellipsize(i.storeName, inner, px(40), true), bold: true, size: px(40), color: '#ffffff', x: w / 2, y: px(1640), maxWidth: inner, align: 'center' })
    return { w, h, photoBox, logoBox: i.hasLogo ? { x: (w - px(360)) / 2, y: px(170), w: px(360), h: px(170) } : null, shapes, texts }
  }

  const photoBox = vertical ? { x: 0, y: px(300), w, h: px(900) } : { x: 0, y: px(120), w, h: px(740) }
  const panelTop = vertical ? px(1080) : px(860)
  shapes.push({ kind: 'gradient', box: { x: 0, y: panelTop, w, h: h - panelTop }, from: dark, to: dark, fromOpacity: 0, toOpacity: 0.96 })
  // Faixa sutil no topo para o selo e o logo lerem sobre qualquer foto.
  shapes.push({ kind: 'gradient', box: { x: 0, y: 0, w, h: vertical ? px(300) : px(200) }, from: dark, to: dark, fromOpacity: 0.7, toOpacity: 0 })

  const logoBox = i.hasLogo ? { x: w - margin - px(240), y: vertical ? px(110) : px(28), w: px(240), h: vertical ? px(130) : px(100) } : null
  if (badge) {
    const bs = px(vertical ? 34 : 30)
    const bw = Math.round(textWidth(badge, bs, true) + px(56))
    const bh = px(vertical ? 76 : 66)
    const by = vertical ? px(130) : px(44)
    shapes.push({ kind: 'pill', box: { x: margin, y: by, w: bw, h: bh }, fill: primary, radius: Math.round(bh / 2) })
    texts.push({ text: badge, bold: true, size: bs, color: '#ffffff', x: margin + px(28), y: by + Math.round((bh - bs) / 2), maxWidth: inner, align: 'left', pill: { index: shapes.length - 1, padX: px(28), grow: true } })
  }

  // Bloco de texto de baixo para cima, para sempre caber no quadro.
  let y = h - (vertical ? px(96) : px(52))
  const push = (text: string, size: number, bold: boolean, color: string, gap: number, extra: Partial<TextBlock> = {}) => {
    y -= size
    texts.push({ text: ellipsize(text, inner, size, bold), bold, size, color, x: margin, y, maxWidth: inner, align: 'left', ...extra })
    y -= gap
  }

  if (vertical) {
    const cta = clean(i.whatsapp) ? `Chame no WhatsApp ${clean(i.whatsapp)}` : contact || i.storeName
    const ph = px(112)
    y -= ph
    shapes.push({ kind: 'pill', box: { x: margin, y, w: inner, h: ph }, fill: primary, radius: Math.round(ph / 2) })
    const cs = fitSize(cta, inner - px(60), px(44), px(26), true)
    texts.push({ text: cta, bold: true, size: cs, color: '#ffffff', x: w / 2, y: y + Math.round((ph - cs) / 2), maxWidth: inner, align: 'center', pill: { index: shapes.length - 1, padX: px(30), grow: false } })
    y -= px(44)
  } else if (contact) {
    push(contact, px(30), false, '#e5e7eb', px(26))
  }

  if (i.price != null) {
    push(money(i.price), px(vertical ? 112 : 88), true, primary, px(10))
    if (i.oldPrice != null && i.oldPrice > i.price) push(`de ${money(i.oldPrice)} por`, px(vertical ? 36 : 30), false, '#d1d5db', px(12))
  }
  if (facts) push(facts, px(vertical ? 40 : 34), false, '#f3f4f6', px(14))
  if (version) push(version, px(vertical ? 42 : 36), false, '#e5e7eb', px(10))
  const ts = fitSize(title, inner, px(vertical ? 84 : 68), px(46), true)
  push(title, ts, true, '#ffffff', 0)

  return { w, h, photoBox, logoBox, shapes, texts }
}

/** SVG só com as formas (o texto vai por cima, desenhado com a fonte embutida). */
export function shapesSvg(l: ArtLayout): string {
  const defs: string[] = []
  const body: string[] = []
  l.shapes.forEach((sh, n) => {
    if (sh.kind === 'gradient') {
      defs.push(`<linearGradient id="g${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh.from}" stop-opacity="${sh.fromOpacity}"/><stop offset="1" stop-color="${sh.to}" stop-opacity="${sh.toOpacity}"/></linearGradient>`)
      body.push(`<rect x="${sh.box.x}" y="${sh.box.y}" width="${sh.box.w}" height="${sh.box.h}" fill="url(#g${n})"/>`)
    } else {
      body.push(`<rect x="${sh.box.x}" y="${sh.box.y}" width="${sh.box.w}" height="${sh.box.h}" rx="${sh.radius}" fill="${sh.fill}"/>`)
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${l.w}" height="${l.h}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`
}

/** Escapa texto para a marcação do Pango (usada pelo sharp para desenhar texto). */
export function pangoEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
