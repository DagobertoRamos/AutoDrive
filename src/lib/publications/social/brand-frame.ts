// =============================================================================
// Identidade da loja nas fotos e vídeos do Post avulso (servidor, sharp).
//   ASSINATURA (padrão de agência): logo + @ pequenos, sem caixa, com sombra
//             suave (logo escuro vira branco para ler em cima do vídeo). No
//             vídeo deitado/quadrado, vão nas faixas acima e abaixo da imagem
//             — não cobrem nada; no vídeo vertical, no canto livre dos botões.
//             Vídeo ganha ainda um encerramento de 2,5 s com logo, @ e contato.
//   DISCRETO: o logo (ou o nome da loja) no canto inferior direito, ~16% da
//             largura, levemente transparente — marca sem atrapalhar a foto.
//   COMPLETO: logo no topo + faixa inferior com o nome da loja, WhatsApp e @,
//             na cor da loja (padrão das lojas que mais engajam).
// O Instagram confirma: o próprio logo no conteúdo não reduz o alcance.
// A camada é um PNG transparente do tamanho da mídia (foto) ou 1080×1920 (vídeo).
// =============================================================================

import { textImage } from './art'
import { safeColor } from './art-core'
import { loadBrand, type Brand } from './studio'

export const BRAND_STYLES = ['ASSINATURA', 'DISCRETO', 'COMPLETO'] as const
export type BrandStyle = (typeof BRAND_STYLES)[number]
export const BRAND_STYLE_LABEL: Record<BrandStyle, string> = { ASSINATURA: 'Assinatura — logo e @ limpos, sem cobrir o vídeo (recomendado)', DISCRETO: 'Discreto — só o logo no canto', COMPLETO: 'Completo — logo + faixa com nome e WhatsApp' }
export const isBrandStyle = (x: unknown): x is BrandStyle => x === 'ASSINATURA' || x === 'DISCRETO' || x === 'COMPLETO'

async function sharpLib() {
  return (await import('sharp')).default
}

type Layer = { input: Buffer; left: number; top: number }

/** Onde a imagem do vídeo fica dentro do quadro 9:16 (o resto é fundo desfocado). */
export interface ContentBox { x: number; y: number; w: number; h: number }

/** Caixa do vídeo VW×VH encaixado (sem cortar) num quadro FW×FH — igual ao filtro do ffmpeg. */
export function fitBox(vw: number, vh: number, fw = 1080, fh = 1920): ContentBox {
  if (!(vw > 0 && vh > 0)) return { x: 0, y: 0, w: fw, h: fh }
  const k = Math.min(fw / vw, fh / vh)
  const w = Math.round(vw * k); const h = Math.round(vh * k)
  return { x: Math.round((fw - w) / 2), y: Math.round((fh - h) / 2), w, h }
}

const handle = (b: Brand) => (b.instagram ? (b.instagram.startsWith('@') ? b.instagram : `@${b.instagram}`) : '')
const siteText = (s: string) => s.replace(/^https?:\/\//i, '').replace(/\/$/, '')

type Img = { data: Buffer; info: { width: number; height: number } }

/** Logo pronto para ir sobre imagem/fundo escuro: escuro com transparência → branco; sem transparência → cantos arredondados. */
async function logoOnDark(brand: Brand, maxW: number, maxH: number): Promise<Img | null> {
  if (!brand.logo) return null
  const sharp = await sharpLib()
  try {
    const { data, info } = await sharp(brand.logo, { failOn: 'none' }).ensureAlpha().resize({ width: Math.max(1, Math.round(maxW)), height: Math.max(1, Math.round(maxH)), fit: 'inside' }).raw().toBuffer({ resolveWithObject: true })
    let opaque = 0; let lum = 0; let clear = 0
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]
      if (a < 250) clear++
      if (a > 128) { opaque++; lum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255 }
    }
    const transparent = clear / (info.width * info.height) > 0.08
    const dark = opaque ? lum / opaque < 0.42 : false
    const raw = { raw: { width: info.width, height: info.height, channels: 4 as const } }
    if (transparent && dark) {
      // Silhueta branca (a forma vem do canal alfa).
      const out = Buffer.alloc(data.length)
      for (let i = 0; i < data.length; i += 4) { out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = data[i + 3] }
      return { data: await sharp(out, raw).png().toBuffer(), info }
    }
    if (!transparent) {
      const r = Math.round(Math.min(info.width, info.height) * 0.14)
      const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}"><rect width="100%" height="100%" rx="${r}" fill="#fff"/></svg>`)
      return { data: await sharp(data, raw).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer(), info }
    }
    return { data: await sharp(data, raw).png().toBuffer(), info }
  } catch { return null }
}

/** Sombra suave atrás (lê em qualquer fundo, sem caixa). Devolve a imagem com margem `pad`. */
async function withShadow(img: Img, u: number): Promise<{ data: Buffer; pad: number }> {
  const sharp = await sharpLib()
  const { width: w, height: h } = img.info
  const pad = Math.max(6, Math.round(14 * u)); const blur = Math.max(2, Math.round(6 * u)); const dy = Math.max(1, Math.round(2 * u))
  const b64 = img.data.toString('base64')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w + pad * 2}" height="${h + pad * 2}"><defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="${blur}"/><feOffset dy="${dy}" result="b"/><feComponentTransfer in="b" result="c"><feFuncA type="linear" slope="0.6"/></feComponentTransfer><feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><image x="${pad}" y="${pad}" width="${w}" height="${h}" xlink:href="data:image/png;base64,${b64}" filter="url(#s)"/></svg>`
  return { data: await sharp(Buffer.from(svg)).png().toBuffer(), pad }
}

/** Camadas da ASSINATURA: logo + @ (com sombra, sem caixa). */
async function signatureLayers(w: number, h: number, brand: Brand, content?: ContentBox): Promise<Layer[]> {
  const u = Math.min(w, h) / 1080
  const vertical = h / w > 1.5
  const layers: Layer[] = []
  const at = handle(brand) || brand.storeName
  const pad = Math.round(40 * u)
  // Reels/Story: a rede cobre ~10% em cima e ~17% embaixo (legenda e botões).
  const safeTop = vertical ? Math.round(h * 0.1) : 0
  const safeBottom = vertical ? Math.round(h * 0.17) : 0
  const place = async (img: Img, x: number, y: number) => {
    const s = await withShadow(img, u)
    layers.push({ input: s.data, left: Math.round(x - s.pad), top: Math.round(y - s.pad) })
  }
  const center = (img: Img) => (w - img.info.width) / 2
  const txt = (size: number, maxW: number) => textImage({ text: at, bold: true, size: Math.round(size * u), color: '#ffffff', maxWidth: maxW })

  const topSpace = content ? content.y - safeTop : 0
  const bottomSpace = content ? h - safeBottom - (content.y + content.h) : 0
  if (vertical && content && topSpace >= h * 0.08 && bottomSpace >= h * 0.05) {
    // Vídeo deitado/quadrado: logo na faixa de cima e @ na de baixo — nada sobre a imagem.
    const lg = await logoOnDark(brand, w * 0.46, Math.min(h * 0.1, topSpace * 0.62))
    if (lg) await place(lg, center(lg), safeTop + (topSpace - lg.info.height) / 2)
    const t = await txt(lg ? 40 : 46, w - pad * 2)
    await place(t, center(t), content.y + content.h + (bottomSpace - t.info.height) / 2)
    return layers
  }
  if (vertical) {
    // Vídeo em pé: assinatura pequena no alto à esquerda (livre dos botões da rede).
    const lg = await logoOnDark(brand, w * 0.24, h * 0.055)
    let y = safeTop
    if (lg) { await place(lg, pad, y); y += lg.info.height + Math.round(10 * u) }
    await place(await txt(lg ? 28 : 34, w * 0.6), pad, y)
    return layers
  }
  // Foto (feed): canto inferior direito, logo com o @ embaixo, alinhados à direita.
  const lg = await logoOnDark(brand, w * 0.17, h * 0.09)
  const t = await txt(26, w * 0.5)
  const ty = h - pad - t.info.height
  await place(t, w - pad - t.info.width, ty)
  if (lg) await place(lg, w - pad - lg.info.width, ty - Math.round(8 * u) - lg.info.height)
  return layers
}

/**
 * Encerramento do vídeo (1080×1920): fundo na cor escura da loja com brilho
 * suave da cor principal, logo no centro, fio na cor da loja, @, WhatsApp e site.
 */
export async function brandEndCard(brand: Brand, w = 1080, h = 1920): Promise<Buffer> {
  const sharp = await sharpLib()
  const u = w / 1080
  const primary = safeColor(brand.primaryColor, '#16a34a')
  const dark = safeColor(brand.darkColor, '#061b29')
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="g" cx="50%" cy="44%" r="62%"><stop offset="0" stop-color="${primary}" stop-opacity="0.28"/><stop offset="1" stop-color="${primary}" stop-opacity="0"/></radialGradient><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.15"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient></defs><rect width="100%" height="100%" fill="${dark}"/><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#v)"/></svg>`)
  const layers: Layer[] = []
  const lg = await logoOnDark(brand, w * 0.62, h * 0.2)
  const at = handle(brand)
  const lines: Array<{ text: string; size: number; bold: boolean; color: string }> = []
  if (!lg) lines.push({ text: brand.storeName, size: 64, bold: true, color: '#ffffff' })
  if (at) lines.push({ text: at, size: 50, bold: true, color: '#ffffff' })
  if (brand.whatsapp) lines.push({ text: `WhatsApp ${brand.whatsapp}`, size: 34, bold: false, color: '#d1d5db' })
  if (brand.site) lines.push({ text: siteText(brand.site), size: 30, bold: false, color: '#9ca3af' })
  const imgs = await Promise.all(lines.map((l) => textImage({ text: l.text, bold: l.bold, size: Math.round(l.size * u), color: l.color, maxWidth: w - 120 * u })))
  const gap = Math.round(18 * u)
  const rule = Math.max(3, Math.round(5 * u))
  const block = (lg ? lg.info.height + Math.round(100 * u) + rule : 0) + imgs.reduce((a, i) => a + i.info.height + gap, 0)
  let y = Math.round(h * 0.46 - block / 2)
  if (lg) {
    layers.push({ input: lg.data, left: Math.round((w - lg.info.width) / 2), top: y })
    y += lg.info.height + Math.round(56 * u)
    const rw = Math.round(120 * u)
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${rw}" height="${rule}"><rect width="100%" height="100%" rx="${rule / 2}" fill="${primary}"/></svg>`), left: Math.round((w - rw) / 2), top: y })
    y += rule + Math.round(44 * u)
  }
  for (const i of imgs) { layers.push({ input: i.data, left: Math.round((w - i.info.width) / 2), top: y }); y += i.info.height + gap }
  return sharp(bg).composite(layers).png().toBuffer()
}

/**
 * Camada transparente com a identidade da loja para uma mídia W×H.
 * `content` = onde a imagem do vídeo fica no quadro (a ASSINATURA usa as faixas livres).
 */
export async function brandOverlay(w: number, h: number, brand: Brand, style: BrandStyle, content?: ContentBox): Promise<Buffer> {
  const sharp = await sharpLib()
  if (style === 'ASSINATURA') {
    const layers = await signatureLayers(w, h, brand, content)
    return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer()
  }
  const u = Math.min(w, h) / 1080 // escala (1080 = referência)
  const primary = safeColor(brand.primaryColor, '#16a34a')
  const dark = safeColor(brand.darkColor, '#061b29')
  const layers: Layer[] = []
  const logoImg = async (maxW: number, maxH: number) => {
    if (!brand.logo) return null
    try { return await sharp(brand.logo, { failOn: 'none' }).resize({ width: Math.round(maxW), height: Math.round(maxH), fit: 'inside' }).png().toBuffer({ resolveWithObject: true }) } catch { return null }
  }
  const pad = Math.round(36 * u)
  // Reels/Story (vertical): a rede cobre ~17% embaixo (legenda/botões), ~10% em cima e a lateral direita.
  const vertical = h / w > 1.5
  const safeTop = vertical ? Math.round(h * 0.1) : 0
  const safeBottom = vertical ? Math.round(h * 0.17) : 0

  if (style === 'DISCRETO') {
    const lg = await logoImg(w * (vertical ? 0.32 : 0.18), h * (vertical ? 0.07 : 0.1))
    if (lg) {
      // Fundo suave atrás do logo para ler em qualquer foto.
      const bw = lg.info.width + Math.round(28 * u); const bh = lg.info.height + Math.round(20 * u)
      // Vertical: canto superior esquerdo (livre dos botões); feed: canto inferior direito.
      const x = vertical ? pad : w - pad - bw
      const y = vertical ? safeTop : h - pad - bh
      layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${Math.round(14 * u)}" fill="#000" fill-opacity="${vertical ? 0.5 : 0.28}"/></svg>`), left: x, top: y })
      layers.push({ input: lg.data, left: x + Math.round(14 * u), top: y + Math.round(10 * u) })
    } else {
      const t = await textImage({ text: brand.storeName, bold: true, size: Math.round(34 * u), color: '#ffffff', maxWidth: w * 0.5 })
      const bw = t.info.width + Math.round(40 * u); const bh = t.info.height + Math.round(22 * u)
      const x = vertical ? pad : w - pad - bw
      const y = vertical ? safeTop : h - pad - bh
      layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${Math.round(bh / 2)}" fill="${primary}" fill-opacity="0.9"/></svg>`), left: x, top: y })
      layers.push({ input: t.data, left: x + Math.round(20 * u), top: y + Math.round((bh - t.info.height) / 2) })
    }
  } else {
    // Topo: logo com leve sombreado.
    const topH = Math.round(h * 0.13) + safeTop
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${topH}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`), left: 0, top: 0 })
    const lg = await logoImg(w * (vertical ? 0.36 : 0.26), (topH - safeTop) * 0.7)
    if (lg) {
      const bw = lg.info.width + Math.round(28 * u); const bh = lg.info.height + Math.round(20 * u)
      layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}"><rect width="${bw}" height="${bh}" rx="${Math.round(14 * u)}" fill="${dark}" fill-opacity="0.75"/></svg>`), left: pad, top: safeTop + Math.round(pad * 0.6) })
      layers.push({ input: lg.data, left: pad + Math.round(14 * u), top: safeTop + Math.round(pad * 0.6) + Math.round(10 * u) })
    }
    // Faixa inferior: nome da loja + contato, com barra na cor da loja.
    const bandH = Math.round(Math.max(120 * u, h * 0.11))
    const top = h - bandH - safeBottom
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${bandH}"><rect width="100%" height="100%" rx="${vertical ? Math.round(18 * u) : 0}" fill="${dark}" fill-opacity="0.88"/><rect width="100%" height="${Math.max(4, Math.round(8 * u))}" fill="${primary}"/></svg>`), left: 0, top })
    const name = await textImage({ text: brand.storeName, bold: true, size: Math.round(38 * u), color: '#ffffff', maxWidth: w - pad * 2 })
    const contact = [brand.whatsapp && `WhatsApp ${brand.whatsapp}`, brand.instagram && (brand.instagram.startsWith('@') ? brand.instagram : `@${brand.instagram}`)].filter(Boolean).join('   •   ')
    const line = contact ? await textImage({ text: contact, bold: false, size: Math.round(28 * u), color: '#e5e7eb', maxWidth: w - pad * 2 }) : null
    const block = name.info.height + (line ? line.info.height + Math.round(6 * u) : 0)
    const y0 = top + Math.round((bandH - block) / 2) + Math.round(4 * u)
    layers.push({ input: name.data, left: Math.round((w - name.info.width) / 2), top: y0 })
    if (line) layers.push({ input: line.data, left: Math.round((w - line.info.width) / 2), top: y0 + name.info.height + Math.round(6 * u) })
  }
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer()
}

/** Foto com a identidade da loja (mesmo enquadramento; lado maior até 1440 px). */
export async function brandPhoto(photo: Buffer, brand: Brand, style: BrandStyle): Promise<Buffer> {
  const sharp = await sharpLib()
  const base = await sharp(photo, { failOn: 'none' }).rotate().resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true })
  const over = await brandOverlay(base.info.width, base.info.height, brand, style)
  return sharp(base.data).composite([{ input: over, left: 0, top: 0 }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
}

export async function tenantBrand(tenantId: string): Promise<Brand> {
  return loadBrand(tenantId)
}
