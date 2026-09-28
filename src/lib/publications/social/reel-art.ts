// =============================================================================
// Reels que prendem a atenção — IMAGENS de cada cena (servidor, sharp).
//   base: a foto preparada para o movimento (panorâmica ou zoom);
//   texto: PNG transparente 720×1280 com o que aparece na cena (gancho,
//   informação da cena, preço). A chamada final reaproveita o quadro do WhatsApp.
// Fonte: Liberation Sans embutida (o servidor não tem fontes instaladas).
// =============================================================================

import { renderArt, textImage, type RenderArtInput } from './art'
import { safeColor } from './art-core'
import { hookTitle, type ReelFacts, type ReelSegment } from './reel-core'

const W = 720
const H = 1280

async function sharpLib() {
  return (await import('sharp')).default
}

const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/ /g, ' ')

/** Quadro 1440×2560: fundo = a foto desfocada; o carro inteiro por cima (maior no gancho). */
async function composition(photo: Buffer, opts: { scale?: number; dim?: number; top?: number; fgDim?: number } = {}): Promise<Buffer> {
  const sharp = await sharpLib()
  const bg = await sharp(photo, { failOn: 'none' }).rotate().resize(1440, 2560, { fit: 'cover' }).blur(40).modulate({ brightness: opts.dim ?? 0.55 }).toBuffer()
  const fgW = Math.round(1440 * (opts.scale ?? 1))
  const fg = await sharp(photo, { failOn: 'none' }).rotate().resize({ width: fgW, height: 2300, fit: 'inside' }).modulate({ brightness: opts.fgDim ?? 1 }).toBuffer({ resolveWithObject: true })
  const left = Math.round((1440 - fg.info.width) / 2)
  const top = opts.top ?? Math.round((2560 - fg.info.height) / 2) - 120
  // Foto maior que o quadro (gancho): recorta as sobras laterais.
  const piece = left < 0 ? await sharp(fg.data).extract({ left: -left, top: 0, width: 1440, height: fg.info.height }).toBuffer() : fg.data
  return sharp(bg).composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }]).jpeg({ quality: 88 }).toBuffer()
}

/** Base de cada cena, pronta para o filtro de movimento. */
export async function sceneBase(seg: ReelSegment, photo: Buffer, end: () => Promise<Buffer>): Promise<Buffer> {
  const sharp = await sharpLib()
  if (seg.kind === 'cta') return sharp(await end()).resize(1440, 2560, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer()
  if (seg.kind === 'hook') return composition(photo, { scale: 1.35, dim: 0.5 })
  if (seg.kind === 'price') return composition(photo, { scale: 0.9, dim: 0.3, top: 300, fgDim: 0.85 })
  if (seg.motion === 'panleft' || seg.motion === 'panright') {
    // Panorâmica: foto deitada ocupando a altura toda; o movimento percorre o carro.
    const meta = await sharp(photo, { failOn: 'none' }).rotate().metadata()
    const ratio = (meta.width ?? 4) / (meta.height ?? 3)
    const width = Math.round(H * ratio)
    if (width >= W + 160) return sharp(photo, { failOn: 'none' }).rotate().resize(width, H, { fit: 'fill' }).jpeg({ quality: 88 }).toBuffer()
  }
  // Zoom: o carro ocupa a tela toda, enquadrado automaticamente no que importa.
  return sharp(photo, { failOn: 'none' }).rotate().resize(1440, 2560, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 88 }).toBuffer()
}

type Layer = { input: Buffer; left: number; top: number }

async function text(t: { text: string; size: number; bold?: boolean; color?: string; maxWidth?: number; strike?: boolean }) {
  return textImage({ text: t.text, bold: t.bold ?? true, size: t.size, color: t.color ?? '#ffffff', maxWidth: t.maxWidth ?? W - 80, strike: t.strike })
}
const centered = (img: { info: { width: number } }, top: number) => ({ left: Math.max(0, Math.round((W - img.info.width) / 2)), top })

/** Encolhe a fonte até caber na largura. */
async function fit(t: { text: string; size: number; min: number; bold?: boolean; color?: string; strike?: boolean }, maxWidth = W - 80) {
  let size = t.size
  for (;;) {
    const img = await text({ ...t, size })
    if (img.info.width <= maxWidth || size <= t.min) return img
    size = Math.max(t.min, Math.round(size * 0.9))
  }
}

function gradient(from: number, to: number, opacityTop: number, opacityBottom: number, color = '#000000'): Layer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${to - from}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="${opacityTop}"/><stop offset="1" stop-color="${color}" stop-opacity="${opacityBottom}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
  return { input: Buffer.from(svg), left: 0, top: from }
}
function pill(x: number, y: number, w: number, h: number, fill: string): Layer {
  return { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${Math.round(h / 2)}" fill="${fill}"/></svg>`), left: x, top: y }
}

export interface OverlayCtx { facts: ReelFacts; price: number | null; oldPrice: number | null; primaryColor?: string | null; darkColor?: string | null; logo?: Buffer | null; storeName: string }

/** Texto da cena (PNG transparente 720×1280). */
export async function sceneOverlay(seg: ReelSegment, c: OverlayCtx): Promise<Buffer> {
  const sharp = await sharpLib()
  const primary = safeColor(c.primaryColor, '#16a34a')
  const layers: Layer[] = []
  const f = c.facts
  if (seg.kind === 'hook') {
    layers.push(gradient(0, 260, 0.65, 0), gradient(760, H, 0, 0.92))
    if (c.logo) {
      try { const l = await sharp(c.logo, { failOn: 'none' }).resize({ width: 200, height: 110, fit: 'inside' }).png().toBuffer({ resolveWithObject: true }); layers.push({ input: l.data, left: W - 40 - l.info.width, top: 60 }) } catch { /* logo ilegível */ }
    }
    if (f.badge) {
      const b = await text({ text: f.badge, size: 34 })
      const bw = b.info.width + 56
      layers.push(pill(40, 70, bw, 72, primary), { input: b.data, left: 68, top: 70 + Math.round((72 - b.info.height) / 2) })
    }
    const title = await fit({ text: hookTitle(f), size: 84, min: 44 })
    layers.push({ input: title.data, ...centered(title, 950) })
    const y = f.year && f.modelYear && f.year !== f.modelYear ? `${f.year}/${f.modelYear}` : String(f.modelYear ?? f.year ?? '')
    const line = [y, f.km != null ? `${new Intl.NumberFormat('pt-BR').format(f.km)} km` : '', f.gear ?? ''].filter(Boolean).join('  •  ')
    if (line) { const l = await fit({ text: line, size: 40, min: 28, bold: false }); layers.push({ input: l.data, ...centered(l, 1060) }) }
  } else if (seg.kind === 'photo' && seg.chip) {
    layers.push(gradient(900, H, 0, 0.75))
    const t = await fit({ text: seg.chip, size: 50, min: 30 }, W - 140)
    const pw = t.info.width + 70
    const ph = t.info.height + 40
    const x = Math.round((W - pw) / 2)
    layers.push(pill(x, 1040, pw, ph, primary), { input: t.data, left: x + 35, top: 1040 + Math.round((ph - t.info.height) / 2) })
  } else if (seg.kind === 'price' && c.price != null) {
    const top = 820
    if (c.oldPrice && c.oldPrice > c.price) { const o = await fit({ text: `DE ${money(c.oldPrice)}`, size: 40, min: 28, bold: false, color: '#d1d5db', strike: true }); layers.push({ input: o.data, ...centered(o, top - 120) }) }
    const k = await text({ text: 'POR APENAS', size: 42 })
    layers.push({ input: k.data, ...centered(k, top - 50) })
    const p = await fit({ text: money(c.price), size: 124, min: 70, color: primary })
    layers.push({ input: p.data, ...centered(p, top + 20) })
    const cond = String(f.conditions ?? '').split(/\n|•|;/).map((x) => x.replace(/^[-–✅✔️\s]+/u, '').trim()).find((x) => x && x.length <= 40)
    if (cond) { const cl = await fit({ text: cond, size: 38, min: 26, bold: false }); layers.push({ input: cl.data, ...centered(cl, top + 190) }) }
  }
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer()
}

/** Quadro parado da cena (prévia na tela): base centralizada + texto. */
export async function sceneStill(seg: ReelSegment, photo: Buffer, end: () => Promise<Buffer>, c: OverlayCtx): Promise<Buffer> {
  const sharp = await sharpLib()
  const base = await sceneBase(seg, photo, end)
  const frame = await sharp(base).resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer()
  return sharp(frame).composite([{ input: await sceneOverlay(seg, c), left: 0, top: 0 }]).jpeg({ quality: 82 }).toBuffer()
}

/** Quadro final (chamada para o WhatsApp) — o mesmo desenho das artes. */
export const endCardOf = (i: Omit<RenderArtInput, 'format' | 'forVideo' | 'endCard'>) => () => renderArt({ ...i, format: 'REELS', forVideo: true, endCard: true }, { quality: 90 })
