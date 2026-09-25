// =============================================================================
// Tratamento de fotos (estúdio) — regras PURAS, testadas.
// Usadas pelas rotas /api/integrations/photos/* que a extensão do Chrome chama.
//
// Portadas do site de origem (src/lib/vehicle-photos.ts de lá) para as duas
// pontas concordarem: a extensão não pode baixar a arte da loja que o site já
// descarta, e a pasta do carro no disco tem de ter o mesmo nome de sempre.
//
// ARTE DA LOJA (conferido em 19 veículos, 17/09/2026):
//   · BNDV (Now Car, Justo Car): logotipo em /sites-logo/, banner em /sites-banners/.
//   · AutoConf (Tchesco, EasyCar): a 1ª foto em .png é a composição de
//     marketing da loja. .png no meio só é arte quando é MINORIA na galeria —
//     há carro com a galeria inteira em .png, e ali tudo é foto de verdade.
// =============================================================================

const HOSTS_AUTOCONF = ['autoconf-production.s3.amazonaws.com', 'resized-images.autoconf.com.br', 'static.autoconf.com.br']

const CAMINHOS_DE_MARCA = [/\/sites-logo\//i, /\/sites-banners\//i, /\/logo[.\-_]/i, /\/banner[s]?[.\-_/]/i, /marca[-_ ]?d.?agua/i, /watermark/i]

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase() } catch { return '' }
}

function extOf(url: string): string {
  return (url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
}

export function isStoreArt(url: string): boolean {
  return CAMINHOS_DE_MARCA.some((re) => re.test(url))
}

/** Separa a galeria em foto do CARRO (vai para tratamento) e arte da LOJA (fica de fora). */
export function splitPhotos(urls: string[]): { photos: string[]; storeArt: string[] } {
  const all = [...new Set(urls.map((u) => String(u ?? '').trim()).filter(Boolean))]
  const isAutoconfPng = (u: string) => HOSTS_AUTOCONF.includes(hostOf(u)) && extOf(u) === 'png'
  const pngs = all.filter(isAutoconfPng).length
  const pngIsException = pngs > 0 && pngs * 2 < all.length
  const photos: string[] = []
  const storeArt: string[] = []
  all.forEach((u, i) => {
    const art = isStoreArt(u) || (i === 0 && isAutoconfPng(u)) || (i > 0 && pngIsException && isAutoconfPng(u))
    ;(art ? storeArt : photos).push(u)
  })
  return { photos, storeArt }
}

/**
 * Galeria que já veio tratada do site de origem: lá, a foto tratada é
 * guardada no Vercel Blob, e foto de parceiro nunca mora ali. Tratar de novo
 * gastaria horas de chat à toa.
 */
export function treatedAtOrigin(urls: string[]): boolean {
  return urls.length > 0 && urls.every((u) => /(^|\.)blob\.vercel-storage\.com$/i.test(hostOf(u)))
}

export type OriginKind = 'PARCEIRO' | 'PROPRIO' | 'PARTICULAR'

export interface OriginLike {
  originType?: string | null // OWN | PARTNER | PRIVATE (site de origem)
  partnerName?: string | null
}

/**
 * De onde é o carro. Loja parceira vence tudo; sem origem importada, o tipo de
 * estoque decide (consignado sem loja = particular, o resto = próprio).
 */
export function vehicleOrigin(origin: OriginLike | null | undefined, stockType: string | null | undefined): { kind: OriginKind; store: string | null } {
  const partner = String(origin?.partnerName ?? '').trim()
  if (partner) return { kind: 'PARCEIRO', store: partner }
  const t = String(origin?.originType ?? '').toUpperCase()
  if (t === 'PRIVATE') return { kind: 'PARTICULAR', store: null }
  if (t === 'OWN' || t === 'PARTNER') return { kind: 'PROPRIO', store: null }
  return { kind: stockType === 'CONSIGNADO' ? 'PARTICULAR' : 'PROPRIO', store: null }
}

/** Tira acento e caractere proibido em nome de arquivo no Windows. */
export function cleanFolderName(text: string): string {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/["*?<>|]/g, '')
    .replace(/[\\/:]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-\s]+|[-\s]+$/g, '')
}

/** Pasta da origem: nome da loja parceira, "autodrive" (próprio) ou "particular". */
export function originFolder(o: { kind: OriginKind; store: string | null }): string {
  if (o.kind === 'PARCEIRO' && o.store) return cleanFolderName(o.store).slice(0, 80)
  return o.kind === 'PROPRIO' ? 'autodrive' : 'particular'
}

export interface FolderVehicle {
  id: string
  plate?: string | null
  internalCode?: string | null
  brand?: string | null
  model?: string | null
  version?: string | null
  modelYear?: number | null
}

/** "PLACA - Marca Modelo Versão Ano": a placa primeiro, que é o que se procura no Explorer. */
export function vehicleFolder(v: FolderVehicle): string {
  const key = cleanFolderName(v.plate || v.internalCode || v.id.slice(0, 8)) || 'sem-placa'
  const desc = cleanFolderName([v.brand, v.model, v.version, v.modelYear].filter(Boolean).join(' '))
  return `${key}${desc ? ` - ${desc}` : ''}`.slice(0, 120)
}

/** URL relativa do SaaS (/api/site/assets/…) vira absoluta para a extensão baixar. */
export function absoluteUrl(url: string, origin: string): string {
  return url.startsWith('/') ? `${origin.replace(/\/+$/, '')}${url}` : url
}

/**
 * Lista final de fotos tratadas: só endereços do próprio SaaS (os que a
 * extensão acabou de subir), sem repetição, no máximo 40.
 */
export function cleanTreatedList(urls: unknown, max = 40): string[] | null {
  if (!Array.isArray(urls)) return null
  const out: string[] = []
  for (const u of urls) {
    const s = typeof u === 'string' ? u.trim() : ''
    const m = /\/api\/site\/assets\/([a-z0-9]{10,40})$/i.exec(s)
    if (!m) return null
    const rel = `/api/site/assets/${m[1]}`
    if (!out.includes(rel)) out.push(rel)
  }
  return out.length && out.length <= max ? out : null
}
