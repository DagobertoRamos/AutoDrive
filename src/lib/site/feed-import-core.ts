// =============================================================================
// Site da loja — importação de estoque por feed (CSV no formato do catálogo
// da Meta). PURO (testado). Usado hoje só pela AutoDrive, que puxa o estoque
// do site antigo (sitedagobertoeasycar) até ele ser desligado.
//   • Cada linha vira um veículo normalizado (códigos do estoque do SaaS).
//   • A foto "em-breve" do site antigo não é foto: o carro entra sem fotos
//     e aparece como "Em breve" pela regra de publicação.
//   • planFeedSync decide o que criar / atualizar / tirar do site, com trava
//     contra feed quebrado (vazio ou encolhido de repente).
// =============================================================================

export interface FeedVehicle {
  extId: string
  brand: string
  model: string
  version: string
  modelYear: number | null
  km: number | null
  price: number | null
  fuel: string | null
  transmission: string | null
  bodyType: string | null
  color: string | null
  vehicleType: 'CAR' | 'MOTORCYCLE'
  title: string
  description: string
  photos: string[]
  legacySlug: string | null // último trecho do link no site antigo (/veiculos/<slug>)
  /** A descrição do site de origem diz "periciado". */
  inspected: boolean
}

/** CSV RFC 4180 (aspas, aspas duplas escapadas e quebras de linha dentro do campo). */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // tira o BOM
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}

const FUEL: Record<string, string> = {
  gasolina: 'GASOLINA', flex: 'FLEX', diesel: 'DIESEL', alcool: 'ETANOL', etanol: 'ETANOL',
  eletrico: 'ELETRICO', gnv: 'GNV', 'gasolina e eletrico': 'HIBRIDO', hibrido: 'HIBRIDO',
  'gasolina, gas natural e alcool': 'FLEX',
}
const TRANSMISSION: Record<string, string> = {
  manual: 'MANUAL', automatico: 'AUTOMATICO', automatica: 'AUTOMATICO', automatizado: 'AUTOMATIZADO',
  automatizada: 'AUTOMATIZADO', cvt: 'CVT', 'semi-automatica': 'SEMI_AUTOMATICO', semiautomatica: 'SEMI_AUTOMATICO',
}
const MOTO_BODIES = new Set(['custom', 'street', 'scooter', 'trail', 'naked', 'esportiva', 'motoneta', 'big trail', 'touring'])

const fold = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

export function normalizeFuel(v: string): string | null {
  const k = fold(v)
  return k ? FUEL[k] ?? v.trim().toUpperCase() : null
}
export function normalizeTransmission(v: string): string | null {
  const k = fold(v)
  return k ? TRANSMISSION[k] ?? v.trim().toUpperCase() : null
}

/** "14900.00 BRL" → 14900; vazio/zero → null. */
export function parsePrice(v: string): number | null {
  const n = Number(String(v).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}
/** "36000 km" → 36000. */
export function parseKm(v: string): number | null {
  const d = String(v).replace(/\D/g, '')
  return d ? Number(d) : null
}

export function isPlaceholderPhoto(url: string): boolean {
  return /\/em-breve\.(jpe?g|png|webp)(\?|$)/i.test(url)
}

/** Título curto: a versão do feed costuma repetir o modelo ("Palio EX 1.0"). */
export function feedTitle(brand: string, model: string, version: string): string {
  const v = version.trim()
  if (v && brand.trim() && fold(v).startsWith(fold(brand))) return v
  const rest = v && fold(v).startsWith(fold(model)) ? v : [model, v].filter(Boolean).join(' ')
  return [brand.trim(), rest.trim()].filter(Boolean).join(' ')
}

/** `https://site/veiculos/fiat-palio-2001-815886` → `fiat-palio-2001-815886`. */
export function legacySlugFromLink(link: string): string | null {
  try {
    const m = new URL(link).pathname.match(/\/veiculos\/([^/]+)\/?$/)
    return m ? decodeURIComponent(m[1]).toLowerCase() : null
  } catch { return null }
}

export function parseFeed(text: string): FeedVehicle[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const head = rows[0].map((h) => h.trim())
  const col = (r: string[], name: string) => (r[head.indexOf(name)] ?? '').trim()
  const out: FeedVehicle[] = []
  const seen = new Set<string>()
  for (const r of rows.slice(1)) {
    const extId = col(r, 'id')
    if (!extId || seen.has(extId)) continue
    if (col(r, 'availability') && fold(col(r, 'availability')) !== 'in stock') continue
    seen.add(extId)
    const photos = [col(r, 'image_link'), ...col(r, 'additional_image_link').split(',')]
      .map((u) => u.trim())
      .filter((u) => /^https:\/\//i.test(u) && !isPlaceholderPhoto(u))
    const year = Number(col(r, 'year'))
    const brand = col(r, 'brand')
    const model = col(r, 'model')
    const version = col(r, 'version')
    out.push({
      extId, brand, model, version,
      modelYear: Number.isInteger(year) && year > 1900 ? year : null,
      km: parseKm(col(r, 'mileage')),
      price: parsePrice(col(r, 'price')),
      fuel: normalizeFuel(col(r, 'fuel_type')),
      transmission: normalizeTransmission(col(r, 'transmission')),
      bodyType: col(r, 'body_style') || null,
      color: col(r, 'color') || null,
      vehicleType: MOTO_BODIES.has(fold(col(r, 'body_style'))) ? 'MOTORCYCLE' : 'CAR',
      title: feedTitle(brand, model, version) || col(r, 'title'),
      description: col(r, 'description'),
      photos: [...new Set(photos)],
      legacySlug: legacySlugFromLink(col(r, 'link')),
      inspected: /\bpericiad[oa]\b/.test(fold(col(r, 'description'))),
    })
  }
  return out
}

export interface SyncPlan {
  create: FeedVehicle[]
  update: { vehicleId: string; item: FeedVehicle }[]
  remove: string[] // vehicleIds que saíram do feed
  aborted: string | null
}

/**
 * Decide o que fazer. `map` = extId → vehicleId já importado e ainda ativo.
 * Trava: feed vazio, ou com menos da metade do que já estava no ar (com
 * pelo menos 20 carros), é tratado como falha do site de origem — nada muda.
 */
export function planFeedSync(items: FeedVehicle[], map: Record<string, string>, activeIds: Set<string>): SyncPlan {
  const live = Object.entries(map).filter(([, id]) => activeIds.has(id))
  if (!items.length) return { create: [], update: [], remove: [], aborted: 'Feed vazio' }
  if (live.length >= 20 && items.length < live.length / 2) {
    return { create: [], update: [], remove: [], aborted: `Feed com ${items.length} carros (antes ${live.length}) — parece falha do site de origem` }
  }
  const inFeed = new Set(items.map((i) => i.extId))
  const create: FeedVehicle[] = []
  const update: SyncPlan['update'] = []
  for (const item of items) {
    const id = map[item.extId]
    if (id) update.push({ vehicleId: id, item })
    else create.push(item)
  }
  const remove = live.filter(([ext]) => !inFeed.has(ext)).map(([, id]) => id)
  return { create, update, remove, aborted: null }
}

export function samePhotos(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((u, i) => u === b[i])
}
