// =============================================================================
// Site da loja — tema a partir da marca. Núcleo PURO (testado). TODA cor do
// template sai daqui (nada de cor fixa no CSS) e cada par usado tem contraste
// WCAG AA garantido:
//   brand        fundo de botão com texto branco (≥ 4.5) e texto/ícone no branco
//   dark         superfícies escuras (rodapé, faixas) — da mesma família da marca
//   brandSoft    destaque sobre o escuro (≥ 4.5 contra dark)
//   tint/tint2   superfícies claras tingidas (cartões, faixas claras)
//   ink/muted    textos sobre branco e sobre tint (≥ 12 / ≥ 4.5)
//   footerText/footerMuted  textos do rodapé (≥ 7 / ≥ 4.5)
// Também trata a logo: tom (clara/escura), sobras de recorte e versão p/ fundo
// escuro.
// =============================================================================

import { contrastRatio, darkenRgb, hex, luminance, parseHex, rgbToHsl, type RGB } from './brand-core'

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]

/** Aproxima `c` de `toward` em passos até `ok` valer. */
function nudge(c: RGB, toward: RGB, ok: (x: RGB) => boolean): RGB {
  let x = c
  for (let i = 0; i < 60 && !ok(x); i++) x = mixRgb(x, toward, 0.06)
  return x
}

const hueDist = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

export interface SiteTheme {
  brand: string; brandHover: string; brandBright: string; brandSoft: string
  dark: string; darkHover: string; tint: string; tint2: string; line: string
  ink: string; muted: string; footerText: string; footerMuted: string
}

/**
 * Paleta completa a partir da cor principal (e da escura, se for da mesma
 * família). Escura "estrangeira" — outro matiz (ex.: o azul-petróleo padrão numa
 * marca rosa) ou quase preta sem tom — vira um tom profundo da própria marca.
 */
export function buildSiteTheme(primaryHex: string, darkHex?: string): SiteTheme {
  const raw = /^#[0-9a-f]{6}$/i.test(primaryHex) ? parseHex(primaryHex) : [7, 156, 166] as RGB
  const [h, s] = rgbToHsl(raw)
  const neutral = s < 0.12
  const brand = nudge(raw, BLACK, (x) => contrastRatio(WHITE, x) >= 4.5)
  const brandHover = nudge(darkenRgb(brand, 0.12), BLACK, (x) => contrastRatio(WHITE, x) >= 5.5)

  let dark: RGB | null = null
  if (darkHex && /^#[0-9a-f]{6}$/i.test(darkHex)) {
    const d = parseHex(darkHex)
    const [dh, ds] = rgbToHsl(d)
    const sameFamily = neutral ? ds < 0.25 : ds >= 0.25 && hueDist(dh, h) <= 35
    if (sameFamily && contrastRatio(WHITE, d) >= 9) dark = d
  }
  if (!dark) dark = hslToRgb(h, neutral ? s : Math.min(0.62, Math.max(0.38, s * 0.7)), 0.15)
  dark = nudge(dark, BLACK, (x) => contrastRatio(WHITE, x) >= 12)
  const darkHover = mixRgb(dark, brand, 0.22)

  const brandSoft = nudge(mixRgb(raw, WHITE, 0.25), WHITE, (x) => contrastRatio(x, darkHover) >= 4.5)
  const tint = mixRgb(brand, WHITE, 0.94)
  const tint2 = mixRgb(brand, WHITE, 0.86)
  const line = mixRgb(mixRgb(brand, [223, 227, 233], 0.82), WHITE, 0.15)
  const ink = nudge(mixRgb(dark, [20, 24, 32], 0.55), BLACK, (x) => contrastRatio(x, tint2) >= 12)
  const muted = nudge(mixRgb([96, 102, 114], dark, 0.12), BLACK, (x) => contrastRatio(x, tint2) >= 4.5)
  const footerText = nudge(mixRgb(WHITE, dark, 0.2), WHITE, (x) => contrastRatio(x, darkHover) >= 7)
  const footerMuted = nudge(mixRgb(WHITE, dark, 0.42), WHITE, (x) => contrastRatio(x, darkHover) >= 4.5)

  return {
    brand: hex(brand), brandHover: hex(brandHover), brandBright: hex(neutral ? brand : raw), brandSoft: hex(brandSoft),
    dark: hex(dark), darkHover: hex(darkHover), tint: hex(tint), tint2: hex(tint2), line: hex(line),
    ink: hex(ink), muted: hex(muted), footerText: hex(footerText), footerMuted: hex(footerMuted),
  }
}

/** Variáveis CSS do template (nomes antigos mantidos: --blue = cor de ação). */
export function siteThemeVars(t: SiteTheme): Record<string, string> {
  return {
    '--brand': t.brand, '--brand-hover': t.brandHover, '--brand-bright': t.brandBright, '--brand-soft': t.brandSoft,
    '--blue': t.brand, '--blue-dark': t.dark, '--dark': t.dark, '--dark-hover': t.darkHover,
    '--tint': t.tint, '--tint-2': t.tint2, '--soft': t.tint, '--line': t.line, '--ink': t.ink, '--muted': t.muted,
    '--footer-text': t.footerText, '--footer-muted': t.footerMuted,
  }
}

// ── Logo ─────────────────────────────────────────────────────────────────────

export type LogoTone = 'light' | 'dark'

/** Contraste "típico" da logo sobre um fundo: mediana dos pixels opacos. */
export function logoContrastOn(px: ArrayLike<number>, bg: RGB): number {
  const vals: number[] = []
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] >= 128) vals.push(contrastRatio([px[i], px[i + 1], px[i + 2]], bg))
  if (!vals.length) return 21
  vals.sort((a, b) => a - b)
  return vals[Math.floor(vals.length / 2)]
}

/** Logo clara (some no branco do cabeçalho → cabeçalho escuro) ou escura. */
export function logoTone(px: ArrayLike<number>): LogoTone {
  return logoContrastOn(px, WHITE) < 1.9 ? 'light' : 'dark'
}

/**
 * Versão para fundo escuro: só o que é ESCURO E SEM COR (texto preto/cinza)
 * vira branco; partes coloridas ficam (antes o rosa/vermelho também virava
 * branco). Devolve a fração dos pixels opacos que mudou.
 */
export function whitenNeutralDarks(px: Uint8ClampedArray): number {
  let opaque = 0, changed = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 40) continue
    opaque++
    const r = px[i], g = px[i + 1], b = px[i + 2]
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    if ((chroma < 40 && lum < 0.62) || (chroma < 70 && lum < 0.16)) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; changed++ }
  }
  return opaque ? changed / opaque : 0
}

interface Comp { area: number; x0: number; y0: number; x1: number; y1: number; edge: { t: number; b: number; l: number; r: number }; pixels: number[] }

function components(solid: (i: number) => boolean, w: number, h: number): Comp[] {
  const seen = new Uint8Array(w * h)
  const out: Comp[] = []
  for (let p0 = 0; p0 < w * h; p0++) {
    if (seen[p0] || !solid(p0)) continue
    const c: Comp = { area: 0, x0: w, y0: h, x1: -1, y1: -1, edge: { t: 0, b: 0, l: 0, r: 0 }, pixels: [] }
    const stack = [p0]
    seen[p0] = 1
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w, y = (p - x) / w
      c.area++; c.pixels.push(p)
      if (x < c.x0) c.x0 = x
      if (x > c.x1) c.x1 = x
      if (y < c.y0) c.y0 = y
      if (y > c.y1) c.y1 = y
      if (y === 0) c.edge.t++
      if (y === h - 1) c.edge.b++
      if (x === 0) c.edge.l++
      if (x === w - 1) c.edge.r++
      // vizinhança 8: traços finos na diagonal continuam juntos
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) {
          const q = ny * w + nx
          if (!seen[q] && solid(q)) { seen[q] = 1; stack.push(q) }
        }
      }
    }
    out.push(c)
  }
  return out
}

/**
 * Remove sobras de recorte que não são da marca (logo tirada de um banner):
 *  (a) forma cortada pela borda — contato longo com dois lados vizinhos da
 *      imagem (faixa diagonal, pedaço de fundo);
 *  (b) grupinho de ícones miúdos (< 3% cada) num canto, separado da logo (redes sociais).
 * Conservador: nunca mexe na maior peça nem em peça com ≥ 35% da logo.
 * Altera `px` (alfa = 0) e devolve quantas peças saíram.
 */
export function removeStrayElements(px: Uint8ClampedArray, w: number, h: number): number {
  const comps = components((i) => px[i * 4 + 3] > 40, w, h)
  if (comps.length < 2) return 0
  const total = comps.reduce((s, c) => s + c.area, 0)
  const biggest = comps.reduce((a, c) => (c.area > a.area ? c : a))
  const drop = new Set<Comp>()
  for (const c of comps) {
    if (c === biggest || c.area / total >= 0.35) continue
    const cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1
    const longTB = c.edge.t >= cw * 0.3 || c.edge.b >= cw * 0.3
    const longLR = c.edge.l >= ch * 0.3 || c.edge.r >= ch * 0.3
    if (longTB && longLR) drop.add(c)
  }
  const gap = Math.max(4, Math.round(Math.max(w, h) * 0.03))
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const inX = (c: Comp) => (cx === 0 ? c.x1 < w * 0.25 : c.x0 > w * 0.75)
    const inY = (c: Comp) => (cy === 0 ? c.y1 < h * 0.3 : c.y0 > h * 0.7)
    const group = comps.filter((c) => !drop.has(c) && c !== biggest && c.area / total < 0.03 && inX(c) && inY(c))
    if (!group.length || group.reduce((s, c) => s + c.area, 0) / total > 0.1) continue
    const gx0 = Math.min(...group.map((c) => c.x0)), gx1 = Math.max(...group.map((c) => c.x1))
    const gy0 = Math.min(...group.map((c) => c.y0)), gy1 = Math.max(...group.map((c) => c.y1))
    const atEdge = (cx === 0 ? gx0 <= 2 : gx1 >= w - 3) || (cy === 0 ? gy0 <= 2 : gy1 >= h - 3)
    if (!atEdge) continue
    const isolated = comps.every((c) => group.includes(c) || drop.has(c)
      || c.x1 < gx0 - gap || c.x0 > gx1 + gap || c.y1 < gy0 - gap || c.y0 > gy1 + gap)
    // Fileira de ícones (redes sociais): ≥ 2 peças quase quadradas, do mesmo
    // tamanho, alinhadas — mesmo encostadas na logo.
    const icons = group.filter((c) => { const r = (c.x1 - c.x0 + 1) / (c.y1 - c.y0 + 1); return r > 0.75 && r < 1.33 && c.area >= 30 })
    const ref = icons[0]
    const iconRow = icons.length >= 2 && icons.every((c) => Math.abs(c.area - ref.area) <= ref.area * 0.3
      && (Math.abs(c.y0 - ref.y0) <= 3 || Math.abs(c.x0 - ref.x0) <= 3))
    if (isolated) group.forEach((c) => drop.add(c))
    else if (iconRow) icons.forEach((c) => drop.add(c))
  }
  for (const c of drop) for (const p of c.pixels) px[p * 4 + 3] = 0
  return drop.size
}

// ── Logo do rodapé escuro — decidida pelos pixels (vale p/ toda loja) ────────
//   original  a logo já tem contraste no escuro (até os traços finos)
//   mono      logo de uma cor só com pouco contraste → versão branca (nítida)
//   card      logo colorida com pouco contraste → vai num cartão branco
//   asis      imagem sem transparência (tem fundo próprio) → como está
export type FooterLogoPlan = 'original' | 'mono' | 'card' | 'asis'

export function footerLogoPlan(px: ArrayLike<number>, bg: RGB): FooterLogoPlan {
  let total = 0, clear = 0
  const contrasts: number[] = []
  const buckets = new Map<string, number>()
  for (let i = 0; i < px.length; i += 4) {
    total++
    if (px[i + 3] < 200) { clear++; continue }
    const rgb: RGB = [px[i], px[i + 1], px[i + 2]]
    contrasts.push(contrastRatio(rgb, bg))
    const chroma = Math.max(...rgb) - Math.min(...rgb)
    const key = chroma < 30 ? `n${Math.round(luminance(rgb) * 3)}` : `h${Math.floor(rgbToHsl(rgb)[0] / 30) % 12}`
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  if (!contrasts.length) return 'original'
  if (clear / total < 0.02) return 'asis'
  contrasts.sort((a, b) => a - b)
  // percentil 20: os traços finos/claros-escuros também têm de aparecer
  if (contrasts[Math.floor(contrasts.length * 0.2)] >= 4.5) return 'original'
  // matizes vizinhos contam juntos (rosa/magenta, vermelho/laranja…)
  let top = 0
  for (const [k, n] of buckets) {
    let sum = n
    if (k[0] === 'h') { const h = Number(k.slice(1)); sum += (buckets.get(`h${(h + 1) % 12}`) ?? 0) + (buckets.get(`h${(h + 11) % 12}`) ?? 0) }
    top = Math.max(top, sum)
  }
  return top / contrasts.length >= 0.85 ? 'mono' : 'card'
}

/** Versão monocromática branca (mantém o alfa → contornos suaves). */
export function toWhiteMono(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255 }
}
