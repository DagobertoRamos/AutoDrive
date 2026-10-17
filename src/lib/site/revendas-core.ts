// =============================================================================
// Site da loja — importação de estoque de sites da plataforma "revendas"
// (ASP.NET, fotos em s3.amazonaws.com/revendas, ex.: donnamultimarcas.com.br).
// PURO (testado). Esses sites não têm feed: a listagem vem paginada por
//   POST /Anuncio/_Busca  (pagina=1,2,… até voltar vazio)
// e cada anúncio tem a ficha completa em /Anuncio/Details/<id>.
//   • Card da listagem: id, marca/modelo/versão, cor, anos, combustível, km, PREÇO.
//   • Detalhe: fotos grandes (.jpg) na ordem da galeria, câmbio, portas,
//     opcionais, observações, tipo (carro/moto). Placa vem mascarada → ignorada.
// O resultado tem o mesmo formato do feed CSV (FeedVehicle + extras), então
// segue pelo mesmo planFeedSync/runFeedImport.
// =============================================================================

import { feedTitle, normalizeFuel, normalizeTransmission, parseKm, type FeedExtras, type FeedVehicle } from './feed-import-core'
import { isPlaceholderPhoto } from '@/lib/vehicle-placeholder'

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** Texto limpo de um trecho de HTML (tags fora, entidades decodificadas, espaços colapsados). */
const text = (html: string) => decodeHtml(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

/** "R$99.900,00" → 99900. */
export function parseBrl(v: string): number | null {
  const m = v.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export interface RevendasCard {
  extId: string
  brand: string
  model: string
  version: string
  color: string | null
  year: number | null // fabricação
  modelYear: number | null
  fuel: string | null
  km: number | null
  price: number | null
}

const yearOk = (y: number) => (Number.isInteger(y) && y > 1900 && y < 2100 ? y : null)

/** Cards de uma página da listagem (/Anuncio/Busca ou /Anuncio/_Busca). */
export function parseRevendasListing(html: string): RevendasCard[] {
  const out: RevendasCard[] = []
  const seen = new Set<string>()
  // Cada card tem o título <h3 …model-tile> logo após o link do anúncio.
  const re = /<a href="\/Anuncio\/Details\/(\d+)">\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<\/a>([\s\S]*?)(?=<a href="\/Anuncio\/Details\/\d+">\s*<button|<hr|$)/g
  for (const m of html.matchAll(re)) {
    const extId = m[1]
    if (seen.has(extId)) continue
    seen.add(extId)
    const [brand = '', model = ''] = text(m[2]).split(/\s+-\s+/)
    const rest = m[3]
    const version = text(rest.match(/<h6><strong>([\s\S]*?)<\/strong><\/h6>/)?.[1] ?? '')
    const specs = [...rest.matchAll(/<h6>([\s\S]*?)<\/h6>/g)].map((x) => text(x[1])).find((s) => s.includes('|')) ?? ''
    const parts = specs.split('|').map((s) => s.trim())
    const years = parts.find((p) => /^\d{4}\s*\/\s*\d{4}$/.test(p))
    const [y1, y2] = years ? years.split('/').map((y) => Number(y.trim())) : [NaN, NaN]
    const kmPart = parts.find((p) => /km$/i.test(p))
    const fuelPart = parts.find((p) => p !== years && p !== kmPart && p !== parts[0])
    out.push({
      extId,
      brand: brand.trim(),
      model: model.trim(),
      version,
      color: parts[0] && parts[0] !== years ? parts[0] : null,
      year: yearOk(y1),
      modelYear: yearOk(y2),
      fuel: fuelPart ? normalizeRevendasFuel(fuelPart) : null,
      km: kmPart ? parseKm(kmPart) : null,
      price: parseBrl(rest),
    })
  }
  return out
}

/** A plataforma escreve "Gasolina e álcool" para flex e "Gasolina, álcool e elétrico" para híbrido. */
export function normalizeRevendasFuel(v: string): string | null {
  const k = v.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
  if (/eletric/.test(k) && /gasolina|alcool|etanol|flex/.test(k)) return 'HIBRIDO'
  if (/gasolina e (alcool|etanol)|flex/.test(k)) return 'FLEX'
  return normalizeFuel(v)
}

export interface RevendasDetail {
  photos: string[]
  fields: Record<string, string>
}

/** Ficha do anúncio: fotos (ordem da galeria) + tabela de detalhes (rótulo → valor). */
export function parseRevendasDetail(html: string): RevendasDetail {
  const photos = [...html.matchAll(/<a class="lightbox" href="(https:\/\/[^"]+)"/g)]
    .map((m) => decodeHtml(m[1]))
    .filter((u) => !isPlaceholderPhoto(u))
  const table = html.match(/<table[^>]*id="detalhes"[^>]*>([\s\S]*?)<\/table>/)?.[1] ?? ''
  const fields: Record<string, string> = {}
  for (const row of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]))
    if (cells.length >= 2 && cells[0]) fields[cells[0]] = cells[1]
  }
  return { photos: [...new Set(photos)], fields }
}

const MOTO = /\bmoto/i

/** Card + ficha → item no formato da importação. */
export function revendasItem(card: RevendasCard, detail: RevendasDetail | null): FeedVehicle & { extras: FeedExtras } {
  const f = detail?.fields ?? {}
  const opts = (f['Opcionais'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const obs = (f['Observações'] ?? '').trim()
  const doors = Number(f['Quantidade de portas'])
  const yearsField = (f['Ano de fabricação / modelo'] ?? '').split('/').map((y) => Number(y.trim()))
  const year = yearOk(yearsField[0]) ?? card.year
  const modelYear = yearOk(yearsField[1]) ?? card.modelYear
  const version = f['Versão'] || card.version
  const brand = f['Marca'] || card.brand
  const model = f['Modelo'] || card.model
  return {
    extId: card.extId,
    brand, model, version,
    modelYear,
    km: parseKm(f['Km rodados'] ?? '') ?? card.km,
    price: card.price,
    fuel: (f['Combustível'] ? normalizeRevendasFuel(f['Combustível']) : null) ?? card.fuel,
    transmission: f['Câmbio'] ? normalizeTransmission(f['Câmbio']) : null,
    bodyType: null,
    color: f['Cor'] || card.color,
    vehicleType: MOTO.test(f['Tipo do veículo'] ?? '') ? 'MOTORCYCLE' : 'CAR',
    title: feedTitle(brand, model, version),
    // Observação "." (vazia na prática) não vira descrição.
    description: obs.replace(/^[.\s-]+$/, ''),
    photos: detail?.photos ?? [],
    legacySlug: null,
    inspected: /\bpericiad[oa]\b/i.test(obs),
    extras: {
      plate: null, // a plataforma mascara a placa (Q*****3)
      year,
      doors: Number.isInteger(doors) && doors > 0 && doors < 10 ? doors : null,
      options: [...new Set(opts)],
      videoUrl: null, consigned: false, featured: false, reserved: false, promo: null,
      seoTitle: null, seoDescription: null,
      origin: null,
    },
  }
}

/** URL pública do anúncio no site de origem. */
export const revendasDetailUrl = (base: string, extId: string) => `${base.replace(/\/+$/, '')}/Anuncio/Details/${extId}`

/** Corpo do POST da listagem (mesmos filtros vazios que o próprio site manda). */
export function revendasListingBody(page: number): string {
  return new URLSearchParams({
    pagina: String(page), listaModelos: '', listaTipos: '', listaMarcas: '', anoInicial: '', anoFinal: '',
    valorInicial: '0', valorFinal: '0', ordenacao: 'marca_modelo', blindagem: 'False',
  }).toString()
}
