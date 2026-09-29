// =============================================================================
// Motor de design (servidor, sharp): desenha os 12 modelos visuais.
//   designBase    → fundo do estilo + o CARRO INTEIRO (nunca cortado)
//   designOverlay → textos e elementos da cena do vídeo (gancho, informação,
//                   preço, chamada) em PNG transparente 720×1280
//   designArt     → arte pronta (Post/Carrossel 1080×1350, Story 1080×1920)
// Texto com as fontes embutidas (o servidor não tem fontes instaladas).
// O logo vai sempre sobre uma placa que contrasta (logo escuro → placa clara).
// =============================================================================

import path from 'node:path'
import { DESIGNS, FONTS, type DesignSpec, type DesignStyle, type FontKey } from './design-styles'
import { safeColor } from './art-core'

const FONT_DIR = path.join(process.cwd(), 'src', 'lib', 'publications', 'social', 'fonts')
type Img = { data: Buffer; info: { width: number; height: number }; size?: number; wrap?: number }
type Layer = { input: Buffer; left: number; top: number }

async function sharpLib() { return (await import('sharp')).default }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v).replace(/ /g, ' ')

export interface DesignCtx {
  spec: DesignSpec
  brandColor: string
  darkColor: string
  storeName: string
  whatsapp: string
  instagram: string
  logo: Buffer | null
  title: string
  year: string
  km: number | null
  gear: string | null
  price: number | null
  oldPrice: number | null
  chips: string[]
  condition: string | null
}

const accentOf = (c: DesignCtx) => (c.spec.accent === 'brand' ? safeColor(c.brandColor, '#16a34a') : c.spec.accent)
const caseOf = (c: DesignCtx, s: string) => (c.spec.uppercase ? s.toLocaleUpperCase('pt-BR') : s)

// ── Texto ──────────────────────────────────────────────────────────────────

async function text(t: string, font: FontKey, size: number, color: string, maxWidth?: number): Promise<Img> {
  const sharp = await sharpLib()
  const f = FONTS[font]
  const r = await sharp({ text: { text: `<span foreground="${color}">${esc(t)}</span>`, font: `${f.family} ${Math.max(6, Math.round(size))}`, fontfile: path.join(FONT_DIR, f.file), rgba: true, dpi: 72, ...(maxWidth ? { width: Math.round(maxWidth), align: 'centre' as const } : { wrap: 'none' as const }) } }).png().toBuffer({ resolveWithObject: true })
  return { data: r.data, info: { width: r.info.width, height: r.info.height } }
}

/** Texto que cabe na largura (reduz a fonte até caber em 1 linha; senão quebra em 2). */
async function fit(t: string, font: FontKey, size: number, color: string, maxWidth: number, min = 0.45): Promise<Img> {
  let s = size
  for (let i = 0; i < 8; i++) {
    const img = await text(t, font, s, color)
    if (img.info.width <= maxWidth) return { ...img, size: s }
    if (s <= size * min) break
    s = Math.round(s * 0.88)
  }
  return { ...(await text(t, font, s, color, maxWidth)), size: s, wrap: maxWidth }
}

/** Contorno escuro (legenda de TikTok) ou brilho neon atrás do texto. */
async function styled(img: Img, t: string, font: FontKey, size: number, maxWidth: number | undefined, fx: 'outline' | 'glow' | 'shadow' | 'none', fxColor = '#000000'): Promise<Img> {
  if (fx === 'none') return img
  const sharp = await sharpLib()
  const pad = Math.round(size * 0.18)
  const back = await text(t, font, size, fxColor, maxWidth ? maxWidth : undefined)
  // Mesmo texto, mesma medida; a folga cobre qualquer diferença de arredondamento.
  const W = Math.max(img.info.width, back.info.width) + pad * 2; const H = Math.max(img.info.height, back.info.height) + pad * 2
  const layers: Layer[] = []
  if (fx === 'outline') {
    const o = Math.max(2, Math.round(size * 0.07))
    for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) layers.push({ input: back.data, left: pad + dx, top: pad + dy })
  } else if (fx === 'shadow') {
    const o = Math.max(2, Math.round(size * 0.06))
    layers.push({ input: back.data, left: pad + o, top: pad + o })
  } else {
    const glow = await sharp(back.data).blur(Math.max(3, size * 0.12)).png().toBuffer()
    layers.push({ input: glow, left: pad, top: pad }, { input: glow, left: pad, top: pad })
  }
  layers.push({ input: img.data, left: pad, top: pad })
  const out = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer()
  return { data: out, info: { width: W, height: H } }
}

async function word(c: DesignCtx, t: string, font: FontKey, size: number, color: string, maxWidth: number, fx?: 'outline' | 'glow' | 'shadow' | 'none'): Promise<Img> {
  const tt = font === 'neon' ? caseOf(c, t).replace(/ /g, '   ') : caseOf(c, t)
  const img = await fit(tt, font, size, color, maxWidth)
  const effect = fx ?? (c.spec.outline ? 'outline' : 'none')
  return styled(img, tt, font, img.size ?? size, img.wrap, effect)
}

/** Junta as camadas num quadro W×H recortando o que passar da borda (nunca quebra). */
async function compose(W: number, H: number, layers: Layer[], base?: Buffer): Promise<Buffer> {
  const sharp = await sharpLib()
  const ok: Layer[] = []
  for (const l of layers) {
    const m = await sharp(l.input).metadata()
    const w = m.width ?? 0; const h = m.height ?? 0
    const left = Math.round(l.left); const top = Math.round(l.top)
    const x0 = Math.max(0, -left); const y0 = Math.max(0, -top)
    const cw = Math.min(w - x0, W - Math.max(0, left)); const ch = Math.min(h - y0, H - Math.max(0, top))
    if (cw <= 0 || ch <= 0) continue
    const input = x0 || y0 || cw < w || ch < h ? await sharp(l.input).extract({ left: x0, top: y0, width: cw, height: ch }).png().toBuffer() : l.input
    ok.push({ input, left: Math.max(0, left), top: Math.max(0, top) })
  }
  return (base ? sharp(base) : sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })).composite(ok).png().toBuffer()
}

const svg = (w: number, h: number, body: string): Buffer => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)
const at = (img: Img, left: number, top: number): Layer => ({ input: img.data, left: Math.round(left), top: Math.round(top) })
const centerX = (img: Img, W: number) => Math.round((W - img.info.width) / 2)

/** Logo sobre placa que contrasta: logo escuro → placa clara; logo claro → placa escura. */
async function plated(logo: Buffer, maxW: number, maxH: number, radius: number): Promise<Img | null> {
  const sharp = await sharpLib()
  try {
    const lg = await sharp(logo, { failOn: 'none' }).resize({ width: Math.round(maxW), height: Math.round(maxH), fit: 'inside' }).png().toBuffer({ resolveWithObject: true })
    const { data } = await sharp(lg.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let sum = 0; let n = 0
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128) { sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++ }
    const dark = n ? sum / n < 140 : true
    const px = Math.round(lg.info.height * 0.28); const py = Math.round(lg.info.height * 0.22)
    const W = lg.info.width + px * 2; const H = lg.info.height + py * 2
    const plate = svg(W, H, `<rect width="${W}" height="${H}" rx="${radius}" fill="${dark ? '#ffffff' : '#0b0f19'}" fill-opacity="${dark ? 0.94 : 0.8}"/>`)
    const out = await sharp(plate).composite([{ input: lg.data, left: px, top: py }]).png().toBuffer()
    return { data: out, info: { width: W, height: H } }
  } catch { return null }
}

// ── Fundo + carro inteiro ───────────────────────────────────────────────────

async function background(spec: DesignSpec, photo: Buffer, W: number, H: number, accent: string): Promise<Buffer> {
  const sharp = await sharpLib()
  const blurred = (dim: number) => sharp(photo, { failOn: 'none' }).rotate().resize(W, H, { fit: 'cover' }).blur(Math.round(W / 36)).modulate({ brightness: dim }).png().toBuffer()
  switch (spec.background) {
    case 'blur': case 'phone': return blurred(spec.background === 'phone' ? 0.75 : 0.45)
    case 'vhs': return sharp(await blurred(0.5)).composite([{ input: svg(W, H, `<rect width="100%" height="100%" fill="#3a0a5a" fill-opacity="0.35"/>`), left: 0, top: 0 }]).png().toBuffer()
    case 'news': return sharp(svg(W, H, `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a2a66"/><stop offset="1" stop-color="#03112e"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${Array.from({ length: 24 }, (_, i) => `<rect x="0" y="${i * H / 24}" width="${W}" height="1.5" fill="#ffffff" fill-opacity="0.05"/>`).join('')}`)).png().toBuffer()
    case 'synthwave': {
      const horizon = Math.round(H * 0.62)
      const grid = Array.from({ length: 14 }, (_, i) => { const y = horizon + Math.pow(i / 13, 2) * (H - horizon); return `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ff2bd6" stroke-opacity="0.8" stroke-width="3"/>` }).join('')
      const rays = Array.from({ length: 17 }, (_, i) => { const x = (i - 8) * W / 5 + W / 2; return `<line x1="${W / 2}" y1="${horizon}" x2="${x}" y2="${H}" stroke="#ff2bd6" stroke-opacity="0.8" stroke-width="3"/>` }).join('')
      const sun = Array.from({ length: 6 }, (_, i) => `<rect x="${W * 0.2}" y="${horizon - H * 0.16 + i * H * 0.03}" width="${W * 0.6}" height="${H * 0.012}" fill="#1a0033"/>`).join('')
      return sharp(svg(W, H, `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12002b"/><stop offset="0.55" stop-color="#5b0a7a"/><stop offset="0.62" stop-color="#ff5f9e"/><stop offset="0.63" stop-color="#1a0033"/><stop offset="1" stop-color="#0b0018"/></linearGradient><linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe45e"/><stop offset="1" stop-color="#ff2bd6"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#s)"/><circle cx="${W / 2}" cy="${horizon - H * 0.05}" r="${W * 0.3}" fill="url(#sun)"/>${sun}${grid}${rays}`)).png().toBuffer()
    }
    case 'gloss': return sharp(svg(W, H, `<defs><radialGradient id="g" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="#4fa3ff"/><stop offset="0.6" stop-color="#0a3fa8"/><stop offset="1" stop-color="#021a4a"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${Array.from({ length: 12 }, (_, i) => `<polygon points="${W / 2},${H * 0.35} ${W / 2 + Math.cos(i / 12 * Math.PI * 2) * W * 1.2},${H * 0.35 + Math.sin(i / 12 * Math.PI * 2) * W * 1.2} ${W / 2 + Math.cos((i + 0.4) / 12 * Math.PI * 2) * W * 1.2},${H * 0.35 + Math.sin((i + 0.4) / 12 * Math.PI * 2) * W * 1.2}" fill="#ffffff" fill-opacity="0.06"/>`).join('')}`)).png().toBuffer()
    case 'black': return sharp(svg(W, H, `<defs><radialGradient id="g" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="#262018"/><stop offset="1" stop-color="#000000"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`)).png().toBuffer()
    case 'speed': return sharp(svg(W, H, `<rect width="100%" height="100%" fill="#101114"/>${Array.from({ length: 9 }, (_, i) => `<polygon points="${-W + i * W * 0.35},${H} ${-W * 0.7 + i * W * 0.35},${H} ${i * W * 0.35 + W * 0.3},0 ${i * W * 0.35},0" fill="${i % 3 === 0 ? accent : '#ffffff'}" fill-opacity="${i % 3 === 0 ? 0.35 : 0.04}"/>`).join('')}`)).png().toBuffer()
    case 'sunburst': return sharp(svg(W, H, `<rect width="100%" height="100%" fill="#ffd400"/>${Array.from({ length: 24 }, (_, i) => `<polygon points="${W / 2},${H * 0.42} ${W / 2 + Math.cos(i / 24 * Math.PI * 2) * H},${H * 0.42 + Math.sin(i / 24 * Math.PI * 2) * H} ${W / 2 + Math.cos((i + 0.5) / 24 * Math.PI * 2) * H},${H * 0.42 + Math.sin((i + 0.5) / 24 * Math.PI * 2) * H}" fill="#ffb300" fill-opacity="0.8"/>`).join('')}`)).png().toBuffer()
    case 'warm': return sharp(svg(W, H, `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1dc"/><stop offset="1" stop-color="#ffd3a8"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`)).png().toBuffer()
    case 'paper': return sharp(svg(W, H, `<rect width="100%" height="100%" fill="#f4f1ea"/>`)).png().toBuffer()
    default: return sharp(svg(W, H, `<defs><radialGradient id="g" cx="0.5" cy="0.45" r="0.8"><stop offset="0" stop-color="#3a3f4b"/><stop offset="1" stop-color="#0c0e12"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`)).png().toBuffer()
  }
}

/**
 * Fundo do estilo com o carro INTEIRO por cima (encaixado, nunca cortado).
 * `box` = área do carro em frações do quadro (x, y, largura, altura).
 */
export async function designBase(style: DesignStyle, photo: Buffer, W: number, H: number, brandColor: string, box = { x: 0.03, y: 0.22, w: 0.94, h: 0.5 }): Promise<Buffer> {
  const sharp = await sharpLib()
  const spec = DESIGNS[style]
  const accent = spec.accent === 'brand' ? safeColor(brandColor, '#16a34a') : spec.accent
  const bg = await background(spec, photo, W, H, accent)
  const bw = Math.round(W * box.w); const bh = Math.round(H * box.h)
  const car = await sharp(photo, { failOn: 'none' }).rotate().resize({ width: bw, height: bh, fit: 'inside' }).png().toBuffer({ resolveWithObject: true })
  const left = Math.round(W * box.x + (bw - car.info.width) / 2); const top = Math.round(H * box.y + (bh - car.info.height) / 2)
  const layers: Layer[] = []
  const fw = car.info.width; const fh = car.info.height
  // Moldura/sombra conforme o estilo.
  if (style === 'REVISTA' || style === 'FAMILIA' || style === 'AMADOR') {
    const b = Math.round(W * 0.012)
    layers.push({ input: svg(fw + b * 2, fh + b * 2, `<rect width="100%" height="100%" rx="${style === 'FAMILIA' ? b * 3 : 0}" fill="#ffffff"/>`), left: left - b, top: top - b })
  } else if (style === 'LUXO') {
    layers.push({ input: svg(fw + 24, fh + 24, `<rect x="2" y="2" width="${fw + 20}" height="${fh + 20}" fill="none" stroke="${accent}" stroke-width="2"/>`), left: left - 12, top: top - 12 })
  } else if (style !== 'CLASSICO' && style !== 'TIKTOK') {
    layers.push({ input: await sharp(svg(fw + 40, fh + 40, `<rect x="20" y="20" width="${fw}" height="${fh}" fill="#000000" fill-opacity="0.55"/>`)).blur(14).png().toBuffer(), left: left - 20, top: top - 8 })
  }
  let carImg = car.data
  if (style === 'FAMILIA') carImg = await sharp(car.data).composite([{ input: svg(fw, fh, `<rect width="${fw}" height="${fh}" rx="${Math.round(W * 0.036)}" fill="#fff"/>`), blend: 'dest-in' }]).png().toBuffer()
  if (style === 'ANOS90') carImg = await sharp(car.data).modulate({ saturation: 1.25 }).png().toBuffer()
  layers.push({ input: carImg, left, top })
  // Efeitos por cima de tudo (linhas de TV).
  if (style === 'ANOS80' || style === 'ANOS90') layers.push({ input: svg(W, H, Array.from({ length: Math.round(H / 6) }, (_, i) => `<rect x="0" y="${i * 6}" width="${W}" height="2" fill="#000" fill-opacity="0.16"/>`).join('')), left: 0, top: 0 })
  return sharp(bg).composite(layers).jpeg({ quality: 90 }).toBuffer()
}

// ── Cenas do vídeo (PNG 720×1280) ───────────────────────────────────────────

export type SceneKind = 'hook' | 'info' | 'price' | 'cta'

export async function designOverlay(kind: SceneKind, c: DesignCtx, chip: string | undefined, n: number): Promise<Buffer> {
  const W = 720; const H = 1280
  const s = c.spec; const A = accentOf(c)
  const L: Layer[] = []
  const bottom = Math.round(H * 0.76)
  const facts = [c.year, c.km != null ? `${c.km.toLocaleString('pt-BR')} km` : '', c.gear ?? ''].filter(Boolean).join('  •  ')

  // Elementos fixos do estilo (topo).
  if (s.id === 'TELEJORNAL') {
    const b = await text('PLANTÃO', 'bebas', 40, '#ffffff'); L.push({ input: svg(b.info.width + 36, 58, `<rect width="100%" height="100%" fill="${A}"/>`), left: 30, top: 60 }, at(b, 48, 60 + (58 - b.info.height) / 2))
    const live = await text('● AO VIVO', 'sansBold', 22, '#ffffff'); L.push({ input: svg(live.info.width + 26, 40, `<rect width="100%" height="100%" rx="6" fill="#000" fill-opacity="0.55"/>`), left: W - live.info.width - 56, top: 69 }, at(live, W - live.info.width - 43, 69 + (40 - live.info.height) / 2))
    const tick = await text(`${c.storeName.toLocaleUpperCase('pt-BR')}   •   ${c.whatsapp ? `WHATSAPP ${c.whatsapp}` : 'VENHA CONFERIR'}   •   ESTOQUE ATUALIZADO`, 'sansBold', 22, '#ffffff')
    L.push({ input: svg(W, 50, `<rect width="100%" height="100%" fill="${s.accent2}"/><rect width="120" height="100%" fill="${A}"/>`), left: 0, top: H - 50 }, at(await text('NOTÍCIAS', 'bebas', 30, '#fff'), 12, H - 46), at(tick, 136, H - 50 + (50 - tick.info.height) / 2))
  } else if (s.id === 'ANOS90') {
    L.push(at(await styled(await text('PLAY ▶', 'vhs', 56, '#ffffff'), 'PLAY ▶', 'vhs', 56, undefined, 'shadow'), 36, 50))
    L.push(at(await text(new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).toLocaleUpperCase('pt-BR').replace(/\./g, ''), 'vhs', 40, '#ffffff'), 36, H - 110))
  } else if (s.id === 'AMADOR') {
    L.push(at(await text('● REC', 'sansBold', 26, '#ff3b30'), 36, 60))
  } else if (s.id === 'REVISTA') {
    L.push({ input: svg(W, 150, `<rect width="100%" height="100%" fill="${A}"/>`), left: 0, top: 0 })
    const mast = await fit(c.storeName.toLocaleUpperCase('pt-BR'), 'abril', 78, '#ffffff', W - 60); L.push(at(mast, centerX(mast, W), 75 - mast.info.height / 2))
  } else if (s.id === 'LUXO') {
    L.push({ input: svg(W, 2, `<rect width="100%" height="2" fill="${A}"/>`), left: 0, top: 120 })
    const st = await fit(c.storeName.toLocaleUpperCase('pt-BR'), 'elegant', 30, A, W - 80); L.push(at(st, centerX(st, W), 70))
  }

  if (kind === 'hook') {
    if (s.id === 'TELEJORNAL') {
      L.push({ input: svg(W, 190, `<rect width="100%" height="190" fill="${s.panel}" fill-opacity="0.95"/><rect width="100%" height="10" fill="${A}"/>`), left: 0, top: bottom - 40 })
      const k = await text(s.hook, 'bebas', 40, '#ffd400'); L.push(at(k, 30, bottom - 20))
      const t = await fit(c.title.toLocaleUpperCase('pt-BR'), 'bebas', 70, '#ffffff', W - 60); L.push(at(t, 30, bottom + 22))
      if (facts) L.push(at(await text(facts, 'sansBold', 24, '#cfd8e8'), 30, bottom + 25 + t.info.height))
    } else if (s.id === 'REVISTA') {
      const k = await text(s.hook.toLocaleUpperCase('pt-BR'), 'sansBold', 26, A); L.push(at(k, 40, bottom - 20))
      const t = await fit(c.title, 'abril', 76, '#111111', W - 80); L.push({ input: svg(W, t.info.height + 150, `<rect width="100%" height="100%" fill="#ffffff" fill-opacity="0.9"/>`), left: 0, top: bottom + 16 }, at(t, 40, bottom + 26))
      if (facts) L.push(at(await text(facts, 'sansBold', 26, '#444'), 40, bottom + 36 + t.info.height))
    } else {
      L.push({ input: svg(W, H - bottom + 80, `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${['FAMILIA'].includes(s.id) ? 0 : 0.7}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`), left: 0, top: bottom - 80 })
      const hookColor = s.id === 'FAMILIA' ? A : s.id === 'ANOS80' ? s.accent2 : s.id === 'FEIRAO' ? '#e50914' : A
      const hk = await word(c, s.hook, s.hookFont ?? s.title, s.id === 'ANOS80' ? 52 : 60, hookColor, W - 60, s.id === 'ANOS80' ? 'glow' : s.id === 'FEIRAO' ? 'outline' : undefined)
      const hookTop = s.id === 'TIKTOK' || s.id === 'AMADOR' ? 170 : bottom - 150
      if (s.id === 'ANOS2000' || s.id === 'FEIRAO') {
        const R = 150; const cx = W - 160; const cy = 250
        const pts = Array.from({ length: 32 }, (_, i) => { const r = i % 2 ? R : R * 0.78; const a = i / 32 * Math.PI * 2; return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}` }).join(' ')
        L.push({ input: svg(W, 520, `<polygon points="${pts}" fill="${s.id === 'FEIRAO' ? '#e50914' : '#ff7a00'}" stroke="#fff" stroke-width="6"/>`), left: 0, top: 0 })
        const b1 = await fit(s.id === 'FEIRAO' ? 'SÓ HOJE' : 'IMPERDÍVEL', s.title, 44, '#ffffff', 220); L.push(at(b1, cx - b1.info.width / 2, cy - b1.info.height / 2))
      }
      L.push(at(hk, centerX(hk, W), hookTop))
      const t = await word(c, c.title, s.title, s.id === 'LUXO' ? 54 : 64, s.id === 'FAMILIA' ? s.text : '#ffffff', W - 60, s.id === 'ANOS80' ? 'glow' : undefined)
      L.push(at(t, centerX(t, W), bottom + 10))
      if (facts) { const f = await word(c, facts, s.body, 30, s.id === 'FAMILIA' ? s.text : '#e8e8e8', W - 60, s.outline ? 'outline' : 'none'); L.push(at(f, centerX(f, W), bottom + 20 + t.info.height)) }
    }
  } else if (kind === 'info' && chip) {
    const label = caseOf(c, chip)
    if (s.id === 'TELEJORNAL') {
      L.push({ input: svg(W, 110, `<rect width="100%" height="110" fill="${s.panel}" fill-opacity="0.95"/><rect width="16" height="110" fill="${A}"/>`), left: 0, top: bottom + 30 })
      const t = await fit(label, 'bebas', 60, '#ffffff', W - 70); L.push(at(t, 40, bottom + 30 + (110 - t.info.height) / 2))
    } else if (s.id === 'TIKTOK' || s.id === 'AMADOR' || s.id === 'ANOS90') {
      const t = await word(c, chip, s.title, s.id === 'AMADOR' ? 60 : 74, s.id === 'ANOS90' ? s.accent : '#ffffff', W - 60, 'outline'); L.push(at(t, centerX(t, W), bottom + 10))
    } else if (s.id === 'FEIRAO') {
      const t = await fit(label, 'comic', 64, '#e50914', W - 120)
      L.push({ input: svg(t.info.width + 70, t.info.height + 40, `<rect width="100%" height="100%" rx="10" fill="#ffffff" stroke="#e50914" stroke-width="6"/>`), left: centerX(t, W) - 35, top: bottom + 10 }, at(t, centerX(t, W), bottom + 30))
    } else if (s.id === 'LUXO') {
      const t = await fit(label, 'elegant', 44, s.accent2, W - 100); L.push({ input: svg(t.info.width + 80, 2, `<rect width="100%" height="2" fill="${A}"/>`), left: centerX(t, W) - 40, top: bottom + 16 }, at(t, centerX(t, W), bottom + 34), { input: svg(t.info.width + 80, 2, `<rect width="100%" height="2" fill="${A}"/>`), left: centerX(t, W) - 40, top: bottom + 50 + t.info.height })
    } else if (s.id === 'ANOS80') {
      const g = await fit(label, 'retro', 58, s.accent2, W - 80); const t = await styled(g, label, 'retro', g.size ?? 58, g.wrap, 'glow', s.accent2); L.push(at(t, centerX(t, W), bottom + 10))
    } else if (s.id === 'ESPORTIVO') {
      const t = await fit(label, 'sport', 52, '#ffffff', W - 140)
      L.push({ input: svg(t.info.width + 120, t.info.height + 40, `<polygon points="30,0 ${t.info.width + 120},0 ${t.info.width + 90},${t.info.height + 40} 0,${t.info.height + 40}" fill="${A}"/>`), left: centerX(t, W) - 60, top: bottom + 16 }, at(t, centerX(t, W), bottom + 36))
    } else if (s.id === 'REVISTA') {
      const t = await fit(label, 'abril', 56, '#111111', W - 120)
      L.push({ input: svg(t.info.width + 60, t.info.height + 36, `<rect width="100%" height="100%" fill="#ffffff"/><rect width="10" height="100%" fill="${A}"/>`), left: 40, top: bottom + 16 }, at(t, 70, bottom + 34))
    } else {
      const t = await fit(label, s.id === 'FAMILIA' ? 'sansBold' : s.body, 46, s.id === 'FAMILIA' ? s.text : '#ffffff', W - 140)
      const pillColor = s.id === 'FAMILIA' ? '#ffffff' : A
      L.push({ input: svg(t.info.width + 70, t.info.height + 34, `<rect width="100%" height="100%" rx="${(t.info.height + 34) / 2}" fill="${pillColor}"/>`), left: centerX(t, W) - 35, top: bottom + 16 }, at(t, centerX(t, W), bottom + 33))
    }
  } else if (kind === 'price' && c.price != null) {
    const top = Math.round(H * 0.76)
    const onCard = ['FAMILIA', 'REVISTA', 'FEIRAO'].includes(s.id)
    const priceColor = ['FAMILIA', 'REVISTA'].includes(s.id) ? A : s.id === 'LUXO' ? s.accent2 : s.id === 'ANOS80' ? s.accent2 : s.id === 'FEIRAO' ? '#e50914' : A
    if (['FAMILIA', 'REVISTA'].includes(s.id)) L.push({ input: svg(W - 80, 330, `<rect width="100%" height="100%" rx="28" fill="#ffffff" fill-opacity="0.95"/>`), left: 40, top: top - 110 })
    if (s.id === 'FEIRAO') L.push({ input: svg(W - 60, 330, `<rect width="100%" height="100%" rx="20" fill="#ffffff" stroke="#e50914" stroke-width="10"/>`), left: 30, top: top - 110 })
    const lead = await word(c, s.id === 'LUXO' ? 'Investimento' : 'Por apenas', s.body, 36, onCard ? '#333333' : '#ffffff', W - 80, s.outline && !onCard ? 'outline' : 'none')
    L.push(at(lead, centerX(lead, W), top - lead.info.height))
    if (c.oldPrice && c.oldPrice > c.price) { const o = await text(`de ${money(c.oldPrice)}`, 'sans', 30, ['FAMILIA', 'REVISTA', 'FEIRAO'].includes(s.id) ? '#666666' : '#cccccc'); L.push(at(o, centerX(o, W), top - lead.info.height - o.info.height - 6)) }
    const p = await word(c, money(c.price), s.price, 110, priceColor, W - 60, s.id === 'ANOS80' ? 'glow' : (s.id === 'TIKTOK' || s.id === 'ANOS90') ? 'outline' : 'none')
    L.push(at(p, centerX(p, W), top + 10))
    if (c.condition) { const cn = await word(c, c.condition, s.body, 30, onCard ? '#333333' : '#ffffff', W - 100, s.outline && !onCard ? 'outline' : 'none'); L.push(at(cn, centerX(cn, W), top + 30 + p.info.height)) }
  } else if (kind === 'cta') {
    const dark = !['FAMILIA', 'REVISTA', 'FEIRAO'].includes(s.id)
    L.push({ input: svg(W, H, `<rect width="100%" height="100%" fill="${dark ? '#000' : '#fff'}" fill-opacity="${dark ? 0.72 : 0.82}"/>`), left: 0, top: 0 })
    let y = 260
    if (c.logo) { const lg = await plated(c.logo, 380, 150, 22); if (lg) { L.push(at(lg, centerX(lg, W), y)); y += lg.info.height + 40 } }
    else { const st = await word(c, c.storeName, s.title, 58, dark ? '#ffffff' : '#111111', W - 80, dark ? undefined : 'none'); L.push(at(st, centerX(st, W), y)); y += st.info.height + 40 }
    const t = await word(c, c.title, s.title, 50, dark ? '#ffffff' : '#111111', W - 80, dark ? undefined : 'none'); L.push(at(t, centerX(t, W), y)); y += t.info.height + 20
    if (c.price != null) { const p = await word(c, money(c.price), s.price, 80, dark ? (s.id === 'LUXO' ? s.accent2 : A) : A, W - 80, s.id === 'ANOS80' ? 'glow' : 'none'); L.push(at(p, centerX(p, W), y)); y += p.info.height + 50 }
    const ctaText = c.whatsapp ? `${s.cta}  ${c.whatsapp}` : s.cta
    const b = await fit(caseOf(c, ctaText), s.id === 'LUXO' ? 'elegant' : 'sansBold', 36, s.id === 'FEIRAO' ? '#ffd400' : '#ffffff', W - 140)
    L.push({ input: svg(b.info.width + 70, b.info.height + 44, `<rect width="100%" height="100%" rx="${(b.info.height + 44) / 2}" fill="${s.id === 'LUXO' ? '#000' : A}" ${s.id === 'LUXO' ? `stroke="${A}" stroke-width="3"` : ''}/>`), left: centerX(b, W) - 35, top: y }, at(b, centerX(b, W), y + 22))
    y += b.info.height + 80
    if (c.instagram) { const ig = await text(c.instagram.startsWith('@') ? c.instagram : `@${c.instagram}`, 'sansBold', 30, dark ? '#ffffff' : '#111111'); L.push(at(ig, centerX(ig, W), y)) }
  }
  void n
  return compose(W, H, L)
}

// ── Arte pronta (Post/Carrossel 1080×1350, Story 1080×1920) ─────────────────

/**
 * Layout próprio da arte (nada se sobrepõe): topo com o selo/chamada do
 * estilo, o carro inteiro no meio, título + dados, e a faixa com preço e
 * contato (logo sobre placa que contrasta). Story respeita a área segura.
 */
export async function designArt(style: DesignStyle, c: Omit<DesignCtx, 'spec'>, photo: Buffer, format: 'POST' | 'CARROSSEL' | 'STORY' | 'REELS'): Promise<Buffer> {
  const vertical = format === 'STORY' || format === 'REELS'
  const W = 1080; const H = vertical ? 1920 : 1350
  const ctx: DesignCtx = { ...c, spec: DESIGNS[style] }
  const s = ctx.spec; const A = accentOf(ctx)
  const light = ['FAMILIA', 'REVISTA', 'FEIRAO'].includes(style)
  const top0 = vertical ? 230 : 40 // área segura do Story
  const band = vertical ? 330 : 250
  const bandTop = H - band - (vertical ? 260 : 0)
  const carTop = top0 + (vertical ? 210 : 150)
  const carH = bandTop - carTop - (vertical ? 260 : 190)
  const base = await designBase(style, photo, W, H, c.brandColor, { x: 0.04, y: carTop / H, w: 0.92, h: carH / H })
  const L: Layer[] = []
  // Topo: selo/chamada do estilo.
  if (style === 'REVISTA') {
    L.push({ input: svg(W, 150, `<rect width="100%" height="100%" fill="${A}"/>`), left: 0, top: top0 - 40 })
    const m = await fit(c.storeName.toLocaleUpperCase('pt-BR'), 'abril', 96, '#ffffff', W - 80); L.push(at(m, centerX(m, W), top0 + 35 - m.info.height / 2))
  } else if (style === 'TELEJORNAL') {
    const b = await text('PLANTÃO', 'bebas', 60, '#ffffff'); L.push({ input: svg(b.info.width + 50, 84, `<rect width="100%" height="100%" fill="${A}"/>`), left: 40, top: top0 }, at(b, 65, top0 + (84 - b.info.height) / 2))
    const k = await text(s.hook, 'bebas', 50, '#ffffff'); L.push({ input: svg(k.info.width + 40, 84, `<rect width="100%" height="100%" fill="${s.panel}"/>`), left: 40 + b.info.width + 50, top: top0 }, at(k, 60 + b.info.width + 50, top0 + (84 - k.info.height) / 2))
  } else {
    const hk = await word(ctx, s.hook, s.hookFont ?? s.title, 84, style === 'FAMILIA' ? A : style === 'ANOS80' ? s.accent2 : style === 'FEIRAO' ? '#e50914' : light ? A : '#ffffff', W - 120, style === 'ANOS80' ? 'glow' : style === 'FEIRAO' || style === 'TIKTOK' || style === 'ANOS90' ? 'outline' : 'none')
    L.push(at(hk, centerX(hk, W), top0 + 20))
    if (style === 'ANOS2000' || style === 'FEIRAO' || style === 'CLASSICO') {
      const R = 120; const cx = W - 150; const cy = carTop + 60
      const pts = Array.from({ length: 32 }, (_, i) => { const r = i % 2 ? R : R * 0.8; const a = i / 32 * Math.PI * 2; return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}` }).join(' ')
      L.push({ input: svg(W, carTop + 200, `<polygon points="${pts}" fill="${style === 'FEIRAO' ? '#e50914' : A}" stroke="#fff" stroke-width="5"/>`), left: 0, top: 0 })
      const b1 = await fit(style === 'FEIRAO' ? 'SÓ HOJE' : style === 'CLASSICO' ? 'OFERTA' : 'IMPERDÍVEL', style === 'CLASSICO' ? 'anton' : s.title, 40, '#ffffff', 170); L.push(at(b1, cx - b1.info.width / 2, cy - b1.info.height / 2))
    }
  }
  if (style === 'ANOS90') L.push(at(await text('PLAY ▶', 'vhs', 64, '#ffffff'), 40, top0 - (vertical ? 0 : 10)))
  // Título + dados abaixo do carro.
  const tTop = carTop + carH + 30
  const titleColor = light ? (style === 'FEIRAO' ? '#111111' : s.text) : '#ffffff'
  if (light) L.push({ input: svg(W - 80, vertical ? 230 : 170, `<rect width="100%" height="100%" rx="24" fill="#ffffff" fill-opacity="0.9"/>`), left: 40, top: tTop - 16 })
  const t = await word(ctx, c.title, s.title, style === 'LUXO' ? 70 : 80, titleColor, W - 120, style === 'ANOS80' ? 'glow' : style === 'TIKTOK' ? 'outline' : 'none')
  L.push(at(t, centerX(t, W), tTop))
  const facts = [c.year, c.km != null ? `${c.km.toLocaleString('pt-BR')} km` : '', c.gear ?? ''].filter(Boolean).join('  •  ')
  if (facts) { const f = await word(ctx, facts, s.body, 38, light ? '#444444' : '#e5e5e5', W - 120, 'none'); L.push(at(f, centerX(f, W), tTop + t.info.height + 8)) }
  // Faixa: preço à esquerda, logo e contatos à direita.
  L.push({ input: svg(W, band, `<rect width="100%" height="100%" fill="${light ? '#ffffff' : '#000000'}" fill-opacity="${light ? 0.95 : 0.78}"/><rect width="100%" height="10" fill="${A}"/>`), left: 0, top: bandTop })
  if (c.price != null) {
    const lead = await text(style === 'LUXO' ? 'INVESTIMENTO' : 'POR APENAS', 'sansBold', 30, light ? '#666666' : '#cccccc'); L.push(at(lead, 50, bandTop + 36))
    const p = await word(ctx, money(c.price), s.price, 104, light ? A : (style === 'LUXO' ? s.accent2 : A), W * 0.52, style === 'ANOS80' ? 'glow' : 'none'); L.push(at(p, 44, bandTop + 36 + lead.info.height))
    if (c.condition) { const cn = await fit(c.condition, 'sansBold', 28, light ? '#444' : '#dddddd', W * 0.52); L.push(at(cn, 50, bandTop + 44 + lead.info.height + p.info.height)) }
  }
  let cy = bandTop + 40
  if (c.logo) { const lg = await plated(c.logo, 320, 110, 18); if (lg) { L.push(at(lg, W - lg.info.width - 50, cy)); cy += lg.info.height + 18 } }
  for (const line of [c.whatsapp && `WhatsApp ${c.whatsapp}`, c.instagram && (c.instagram.startsWith('@') ? c.instagram : `@${c.instagram}`)].filter(Boolean) as string[]) {
    const tx = await fit(line, 'sansBold', 34, light ? '#222222' : '#ffffff', W * 0.4); L.push(at(tx, W - tx.info.width - 50, cy)); cy += tx.info.height + 8
  }
  const sharp = await sharpLib()
  return sharp(await compose(W, H, L, base)).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
}
