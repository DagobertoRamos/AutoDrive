// =============================================================================
// Estúdio social — DESENHO das artes (servidor, sharp + fonte embutida).
// O texto é desenhado com a Liberation Sans do próprio projeto: o servidor da
// Vercel não tem fontes instaladas (SVG com texto sairia em quadradinhos).
// =============================================================================

import path from 'node:path'
import { artLayout, pangoEscape, shapesSvg, type ArtInput, type Box } from './art-core'

const FONT_DIR = path.join(process.cwd(), 'src', 'lib', 'publications', 'social', 'fonts')
const FONT = { regular: path.join(FONT_DIR, 'LiberationSans-Regular.ttf'), bold: path.join(FONT_DIR, 'LiberationSans-Bold.ttf') }

async function sharpLib() {
  return (await import('sharp')).default
}

/** Foto inteira dentro da caixa (sem cortar o carro), centralizada. */
async function fitPhoto(photo: Buffer, box: Box) {
  const sharp = await sharpLib()
  const img = await sharp(photo, { failOn: 'none' }).rotate().resize({ width: box.w, height: box.h, fit: 'inside', withoutEnlargement: false }).png().toBuffer({ resolveWithObject: true })
  return { input: img.data, left: box.x + Math.round((box.w - img.info.width) / 2), top: box.y + Math.round((box.h - img.info.height) / 2) }
}

async function textImage(t: { text: string; bold: boolean; size: number; color: string; maxWidth: number; strike?: boolean }) {
  const sharp = await sharpLib()
  const markup = `<span foreground="${t.color}"${t.strike ? ' strikethrough="true"' : ''}>${pangoEscape(t.text)}</span>`
  return sharp({ text: { text: markup, font: `Liberation Sans ${t.bold ? 'Bold ' : ''}${t.size}`, fontfile: t.bold ? FONT.bold : FONT.regular, rgba: true, width: Math.max(1, Math.round(t.maxWidth)), dpi: 72, wrap: 'none' } })
    .png().toBuffer({ resolveWithObject: true })
}

export interface RenderArtInput extends ArtInput { photo: Buffer; logo?: Buffer | null }

/** Arte final em JPEG (feed 1080×1350; vertical 1080×1920 ou 720×1280 para vídeo). */
export async function renderArt(i: RenderArtInput, opts: { quality?: number } = {}): Promise<Buffer> {
  const sharp = await sharpLib()
  const l = artLayout({ ...i, hasLogo: !!i.logo })
  // Fundo: a própria foto ampliada, desfocada e escurecida.
  const bg = await sharp(i.photo, { failOn: 'none' }).rotate().resize({ width: l.w, height: l.h, fit: 'cover' }).blur(28).modulate({ brightness: 0.55 }).png().toBuffer()
  // Textos primeiro: a medida real ajusta as pílulas antes de desenhá-las.
  const textLayers: Array<{ input: Buffer; left: number; top: number }> = []
  for (const t of l.texts) {
    const img = await textImage(t)
    let left = t.align === 'center' ? Math.round(t.x - img.info.width / 2) : Math.round(t.x)
    let top = Math.round(t.y)
    const sh = t.pill ? l.shapes[t.pill.index] : null
    if (t.pill && sh?.kind === 'pill') {
      if (t.pill.grow) sh.box.w = Math.min(l.w - sh.box.x * 2, img.info.width + t.pill.padX * 2)
      top = sh.box.y + Math.round((sh.box.h - img.info.height) / 2)
      left = t.align === 'center' ? sh.box.x + Math.round((sh.box.w - img.info.width) / 2) : sh.box.x + t.pill.padX
    }
    textLayers.push({ input: img.data, left: Math.max(0, left), top: Math.max(0, top) })
  }
  const layers: Array<{ input: Buffer; left: number; top: number }> = []
  layers.push(await fitPhoto(i.photo, l.photoBox))
  layers.push({ input: Buffer.from(shapesSvg(l)), left: 0, top: 0 })
  if (i.logo && l.logoBox) {
    try {
      const logo = await sharp(i.logo, { failOn: 'none' }).resize({ width: l.logoBox.w, height: l.logoBox.h, fit: 'inside' }).png().toBuffer({ resolveWithObject: true })
      layers.push({ input: logo.data, left: l.logoBox.x + (l.logoBox.w - logo.info.width), top: l.logoBox.y + Math.round((l.logoBox.h - logo.info.height) / 2) })
    } catch { /* logo ilegível: segue sem logo */ }
  }
  layers.push(...textLayers)
  return sharp(bg).composite(layers).flatten({ background: '#000000' }).jpeg({ quality: opts.quality ?? 88, mozjpeg: true }).toBuffer()
}
