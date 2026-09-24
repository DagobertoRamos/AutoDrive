// =============================================================================
// Site da loja — marca "auto-configurável". Núcleo PURO (testado): a partir
// dos pixels da logo, sugere as cores do site e o que gerar.
//   • paleta: quantiza os pixels opacos e ordena por presença;
//   • principal: a cor mais presente com saturação (ignora branco/cinza/preto);
//   • escura: a cor mais escura da logo (se for escura o bastante) ou a
//     principal escurecida — usada em rodapé e faixas;
//   • contraste WCAG do texto branco sobre a principal (botões);
//   • logo escura → gera versão branca para o rodapé escuro.
// =============================================================================

export type RGB = [number, number, number]

export function hex(rgb: RGB): string {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`
}

export function parseHex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [h * 60, s, l]
}

/** Luminância relativa (WCAG 2.x). */
export function luminance([r, g, b]: RGB): number {
  const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export function darkenRgb([r, g, b]: RGB, amount: number): RGB {
  return [r * (1 - amount), g * (1 - amount), b * (1 - amount)]
}

export interface Swatch { rgb: RGB; count: number }

/**
 * Quantiza pixels RGBA (Uint8ClampedArray do canvas) em baldes de 4 bits por
 * canal e devolve a paleta ordenada por presença. Ignora pixels transparentes.
 */
export function paletteFromPixels(px: ArrayLike<number>, step = 1): Swatch[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < px.length; i += 4 * step) {
    if (px[i + 3] < 128) continue
    const r = px[i], g = px[i + 1], b = px[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bk = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 }
    bk.r += r; bk.g += g; bk.b += b; bk.n++
    buckets.set(key, bk)
  }
  return [...buckets.values()].map((b) => ({ rgb: [b.r / b.n, b.g / b.n, b.b / b.n] as RGB, count: b.n })).sort((a, b) => b.count - a.count)
}

export interface BrandSuggestion {
  primary: string
  dark: string
  palette: string[]          // até 6 cores de destaque
  logoIsDark: boolean        // logo escura → precisa de versão clara no rodapé
  hasTransparency: boolean
  whiteOnPrimary: number     // contraste do texto branco nos botões
  warnings: string[]
}

const FALLBACK_PRIMARY: RGB = [7, 156, 166]

export function suggestBrand(px: ArrayLike<number>, opts: { hasTransparency: boolean }): BrandSuggestion {
  const pal = paletteFromPixels(px)
  const total = pal.reduce((s, x) => s + x.count, 0) || 1
  const vivid = pal.filter((s) => { const [, sat, l] = rgbToHsl(s.rgb); return sat >= 0.28 && l > 0.12 && l < 0.88 && s.count / total >= 0.004 })
  let primary = vivid[0]?.rgb ?? FALLBACK_PRIMARY
  const warnings: string[] = []
  if (!vivid.length) warnings.push('A logo não tem uma cor marcante; usamos a cor padrão. Você pode escolher outra.')

  // Botões com texto branco precisam de contraste ≥ 4.5 (WCAG AA): escurece até atingir.
  let tries = 0
  while (contrastRatio([255, 255, 255], primary) < 4.5 && tries++ < 12) primary = darkenRgb(primary, 0.08)
  if (tries > 0) warnings.push('Escurecemos um pouco a cor principal para o texto branco dos botões ficar legível.')

  const darkest = pal.find((s) => { const [, , l] = rgbToHsl(s.rgb); return l < 0.2 && s.count / total >= 0.01 })
  const dark = darkest && contrastRatio([255, 255, 255], darkest.rgb) >= 10 ? darkest.rgb : darkenRgb(primary, 0.62)

  // Luminância média ponderada dos pixels opacos → logo escura ou clara.
  const avgLum = pal.reduce((s, x) => s + luminance(x.rgb) * x.count, 0) / total
  return {
    primary: hex(primary), dark: hex(dark),
    palette: vivid.slice(0, 6).map((s) => hex(s.rgb)),
    logoIsDark: avgLum < 0.35,
    hasTransparency: opts.hasTransparency,
    whiteOnPrimary: Math.round(contrastRatio([255, 255, 255], primary) * 10) / 10,
    warnings: [
      ...warnings,
      ...(!opts.hasTransparency ? ['A logo tem fundo sólido. Para ficar bonita sobre qualquer cor, prefira PNG com fundo transparente.'] : []),
    ],
  }
}
