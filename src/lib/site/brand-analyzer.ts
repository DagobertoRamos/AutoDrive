// =============================================================================
// Site da loja — analisador da logo (SÓ NAVEGADOR, usa canvas). Ao escolher a
// imagem, prepara tudo sozinho:
//   1. remove fundo branco sólido (preenchimento a partir das bordas — não
//      apaga partes brancas internas da logo);
//   2. recorta as sobras e redimensiona;
//   3. sugere cores (brand-core) com contraste garantido;
//   4. tira sobras de recorte (ícones de rede social, faixas cortadas na borda);
//   5. decide a logo do rodapé escuro: a própria (se já tem contraste), uma
//      versão com o texto preto/cinza em branco (cores ficam), ou selo branco;
//   6. detecta logo clara (cabeçalho passa a ser escuro);
//   7. gera o favicon (logo no quadrado, ou monograma se ela for muito larga).
// Tudo sai como PNG: SVG vira PNG aqui (o servidor não aceita SVG).
// =============================================================================

import { hex, parseHex, suggestBrand, type BrandSuggestion } from './brand-core'
import { buildSiteTheme, logoContrastOn, logoTone, removeStrayElements, whitenNeutralDarks, type LogoTone } from './theme-core'

export interface AnalyzedBrand {
  logo: Blob; logoPreview: string
  light: Blob | null; lightPreview: string | null
  /** 'logo' = a própria logo serve no rodapé; 'light' = usar a versão clara; 'badge' = selo branco */
  footer: 'logo' | 'light' | 'badge'
  tone: LogoTone
  removedStrays: number
  favicon: Blob; faviconPreview: string
  suggestion: BrandSuggestion
  removedBackground: boolean
  width: number; height: number
}

const MAX_INPUT_SIDE = 1600
const LOGO_MAX_W = 640, LOGO_MAX_H = 240

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler esta imagem.')) }
    img.src = url
  })
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Seu navegador não permite processar imagens.')
  return { c, ctx }
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Falha ao gerar a imagem.'))), 'image/png'))

/** Fundo sólido quase branco ligado às bordas → transparente. */
function removeEdgeBackground(data: ImageData): boolean {
  const { width: w, height: h, data: px } = data
  const near = (i: number) => px[i + 3] > 200 && px[i] > 238 && px[i + 1] > 238 && px[i + 2] > 238
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4]
  if (corners.filter(near).length < 3) return false
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  let cleared = 0
  while (stack.length) {
    const p = stack.pop()!
    if (seen[p]) continue
    seen[p] = 1
    if (!near(p * 4)) continue
    px[p * 4 + 3] = 0; cleared++
    const x = p % w, y = (p - x) / w
    if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w)
  }
  return cleared > w * h * 0.05
}

/** Caixa dos pixels visíveis (para recortar as sobras). */
function contentBox(data: ImageData) {
  const { width: w, height: h, data: px } = data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

export async function analyzeLogo(file: File, storeName: string): Promise<AnalyzedBrand> {
  if (!/^image\/(png|jpe?g|webp|svg\+xml|gif)$/.test(file.type)) throw new Error('Envie a logo em PNG, JPG, WebP ou SVG.')
  if (file.size > 8 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 8 MB).')
  const img = await loadImage(file)
  const iw = img.naturalWidth || 800, ih = img.naturalHeight || 300
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(iw, ih))
  const src = canvas(iw * scale, ih * scale)
  src.ctx.drawImage(img, 0, 0, src.c.width, src.c.height)
  const data = src.ctx.getImageData(0, 0, src.c.width, src.c.height)

  let hasTransparency = false
  for (let i = 3; i < data.data.length; i += 4 * 7) if (data.data[i] < 250) { hasTransparency = true; break }
  const removedBackground = !hasTransparency && removeEdgeBackground(data)
  if (removedBackground) { src.ctx.putImageData(data, 0, 0); hasTransparency = true }

  // Recorta as sobras transparentes, tira as sobras de recorte (ícones, faixas
  // cortadas na borda — só dá para ver depois do recorte) e recorta de novo.
  const box0 = contentBox(data)
  const crop = canvas(box0.w, box0.h)
  crop.ctx.drawImage(src.c, box0.x, box0.y, box0.w, box0.h, 0, 0, box0.w, box0.h)
  const cropData = crop.ctx.getImageData(0, 0, box0.w, box0.h)
  const removedStrays = removeStrayElements(cropData.data, cropData.width, cropData.height)
  if (removedStrays) crop.ctx.putImageData(cropData, 0, 0)

  // Redimensiona a logo final.
  const box = contentBox(cropData)
  const fit = Math.min(1, LOGO_MAX_W / box.w, LOGO_MAX_H / box.h)
  const out = canvas(box.w * fit, box.h * fit)
  out.ctx.imageSmoothingQuality = 'high'
  out.ctx.drawImage(crop.c, box.x, box.y, box.w, box.h, 0, 0, out.c.width, out.c.height)
  const finalPx = out.ctx.getImageData(0, 0, out.c.width, out.c.height)
  const suggestion = suggestBrand(finalPx.data, { hasTransparency })
  const tone = logoTone(finalPx.data)

  // Logo do rodapé (fundo escuro da marca). Só com transparência dá para pôr a
  // logo direto no escuro; senão vai num selo branco.
  const footerBg = parseHex(buildSiteTheme(suggestion.primary, suggestion.dark).dark)
  let light: Blob | null = null
  let lightPreview: string | null = null
  let footer: AnalyzedBrand['footer'] = 'badge'
  if (hasTransparency) {
    const lp = new ImageData(new Uint8ClampedArray(finalPx.data), finalPx.width, finalPx.height)
    const changed = whitenNeutralDarks(lp.data)
    if (changed > 0.04 && logoContrastOn(lp.data, footerBg) >= 3) {
      const l = canvas(out.c.width, out.c.height)
      l.ctx.putImageData(lp, 0, 0)
      light = await toBlob(l.c); lightPreview = l.c.toDataURL('image/png'); footer = 'light'
    } else if (logoContrastOn(finalPx.data, footerBg) >= 3) footer = 'logo'
  }

  // Favicon 256×256: logo no quadrado; muito larga → monograma na cor da marca.
  const fav = canvas(256, 256)
  const aspect = out.c.width / out.c.height
  if (aspect > 2.2) {
    fav.ctx.fillStyle = suggestion.primary
    fav.ctx.beginPath(); fav.ctx.roundRect(0, 0, 256, 256, 56); fav.ctx.fill()
    fav.ctx.fillStyle = '#ffffff'
    fav.ctx.font = 'bold 150px Arial, Helvetica, sans-serif'
    fav.ctx.textAlign = 'center'; fav.ctx.textBaseline = 'middle'
    fav.ctx.fillText((storeName.trim()[0] ?? 'A').toUpperCase(), 128, 140)
  } else {
    const pad = 20, s = Math.min((256 - pad * 2) / out.c.width, (256 - pad * 2) / out.c.height)
    if (!hasTransparency) { fav.ctx.fillStyle = '#ffffff'; fav.ctx.fillRect(0, 0, 256, 256) }
    fav.ctx.drawImage(out.c, (256 - out.c.width * s) / 2, (256 - out.c.height * s) / 2, out.c.width * s, out.c.height * s)
  }

  return {
    logo: await toBlob(out.c), logoPreview: out.c.toDataURL('image/png'),
    light, lightPreview, footer, tone, removedStrays,
    favicon: await toBlob(fav.c), faviconPreview: fav.c.toDataURL('image/png'),
    suggestion, removedBackground, width: out.c.width, height: out.c.height,
  }
}

/** Reexporta p/ a tela mostrar o contraste ao editar a cor na mão. */
export { hex, parseHex }
