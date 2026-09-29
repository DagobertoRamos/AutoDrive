// =============================================================================
// Identidade da loja nas fotos e vídeos do Post avulso (servidor, sharp).
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

export const BRAND_STYLES = ['DISCRETO', 'COMPLETO'] as const
export type BrandStyle = (typeof BRAND_STYLES)[number]
export const BRAND_STYLE_LABEL: Record<BrandStyle, string> = { DISCRETO: 'Discreto — só o logo no canto', COMPLETO: 'Completo — logo + faixa com nome e WhatsApp' }
export const isBrandStyle = (x: unknown): x is BrandStyle => x === 'DISCRETO' || x === 'COMPLETO'

async function sharpLib() {
  return (await import('sharp')).default
}

type Layer = { input: Buffer; left: number; top: number }

/** Camada transparente com a identidade da loja para uma mídia W×H. */
export async function brandOverlay(w: number, h: number, brand: Brand, style: BrandStyle): Promise<Buffer> {
  const sharp = await sharpLib()
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
