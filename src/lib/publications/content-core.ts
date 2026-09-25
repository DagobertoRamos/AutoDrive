// =============================================================================
// Conteúdo do anúncio por canal. PURO (testado).
//
// O estoque é a fonte central. Ordem de prioridade de cada campo:
//   ajuste do destino (overrides) > conteúdo preparado (draft) > estoque/site.
// NUNCA inventa opcionais, garantia ou financiamento: a descrição automática
// usa só a ficha do estoque, os opcionais já cadastrados no anúncio do site e
// as condições digitadas pela loja.
// =============================================================================

import { createHash } from 'crypto'
import { effectivePrice } from '@/lib/site/listing-core'
import type { ChannelSpec } from './channels'

export interface ContactSettings {
  whatsapp?: string | null
  phone?: string | null
  email?: string | null
  instagram?: string | null
  site?: string | null
  contactName?: string | null
}

export interface VehicleFacts {
  id: string
  unitId?: string | null
  plate?: string | null
  chassi?: string | null
  brand?: string | null
  model?: string | null
  version?: string | null
  year?: number | null
  modelYear?: number | null
  km?: number | null
  color?: string | null
  fuel?: string | null
  transmission?: string | null
  doors?: number | null
  bodyType?: string | null
  engine?: string | null
  salePrice?: number | null
  promoPrice?: number | null
  isPromo?: boolean
  promoStartsAt?: Date | null
  promoEndsAt?: Date | null
  conditionType?: string | null
}

export interface ContentSource {
  title?: string | null
  description?: string | null
  conditions?: string | null
  price?: number | null
  photos?: string[] | null
}

export interface ListingPayload {
  reference: string
  vehicle: VehicleFacts
  title: string
  description: string
  caption: string // redes sociais
  price: number | null
  oldPrice: number | null
  photos: string[] // ordem final; [0] = capa
  options: string[]
  conditions: string
  contacts: ContactSettings
  location: { zip?: string | null; city?: string | null; state?: string | null; address?: string | null; neighborhood?: string | null }
  storeName: string
  isNew: boolean
}

const FUEL: Record<string, string> = { FLEX: 'Flex', GASOLINA: 'Gasolina', ETANOL: 'Etanol', DIESEL: 'Diesel', ELETRICO: 'Elétrico', HIBRIDO: 'Híbrido', GNV: 'GNV' }
const GEAR: Record<string, string> = { MANUAL: 'Manual', AUTOMATICO: 'Automático', CVT: 'Automático CVT', SEMI_AUTOMATICO: 'Semiautomático', AUTOMATIZADO: 'Automatizado' }

export const fuelLabel = (f?: string | null) => (f ? FUEL[f.toUpperCase()] ?? f : null)
export const gearLabel = (g?: string | null) => (g ? GEAR[g.toUpperCase()] ?? g : null)

const clean = (s?: string | null) => String(s ?? '').replace(/\s+/g, ' ').trim()
const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

export function baseTitle(v: VehicleFacts): string {
  const t = [v.brand, v.model, v.version].map(clean).filter(Boolean).join(' ')
  const yr = v.modelYear ?? v.year
  return [t || 'Veículo', yr ? String(yr) : ''].filter(Boolean).join(' ')
}

/** Fatos objetivos da ficha, em linhas curtas. */
export function factLines(v: VehicleFacts): string[] {
  const lines: string[] = []
  if (v.year || v.modelYear) lines.push(`Ano ${v.year ?? '—'}/${v.modelYear ?? '—'}`)
  if (v.km != null) lines.push(`${v.km.toLocaleString('pt-BR')} km`)
  const g = gearLabel(v.transmission); if (g) lines.push(`Câmbio ${g.toLowerCase()}`)
  const f = fuelLabel(v.fuel); if (f) lines.push(`Combustível ${f.toLowerCase()}`)
  if (v.color) lines.push(`Cor ${clean(v.color).toLowerCase()}`)
  if (v.doors) lines.push(`${v.doors} portas`)
  if (v.engine) lines.push(`Motor ${clean(v.engine)}`)
  return lines
}

export function contactLines(c: ContactSettings): string[] {
  const out: string[] = []
  if (c.whatsapp) out.push(`WhatsApp: ${c.whatsapp}`)
  if (c.phone && c.phone !== c.whatsapp) out.push(`Telefone: ${c.phone}`)
  if (c.instagram) out.push(`Instagram: ${c.instagram.startsWith('@') ? c.instagram : `@${c.instagram}`}`)
  if (c.site) out.push(`Site: ${c.site}`)
  return out
}

/** Descrição automática: só com o que existe no cadastro. */
export function autoDescription(v: VehicleFacts, options: string[], conditions: string): string {
  const parts = [`${baseTitle(v)}.`, factLines(v).join(' · ')]
  if (options.length) parts.push(`Opcionais: ${options.join(', ')}.`)
  if (conditions) parts.push(conditions)
  return parts.filter(Boolean).join('\n\n')
}

export interface BuildInput {
  reference: string
  vehicle: VehicleFacts
  siteListing?: { title?: string | null; description?: string | null; options?: unknown } | null
  gallery: string[]
  draft?: ContentSource | null
  overrides?: ContentSource | null
  contacts: ContactSettings
  location: ListingPayload['location']
  storeName: string
  now?: Date
}

export function buildPayload(i: BuildInput): ListingPayload {
  const o = i.overrides ?? {}
  const d = i.draft ?? {}
  const options = Array.isArray(i.siteListing?.options) ? (i.siteListing!.options as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()).map(clean) : []
  const conditions = clean(o.conditions ?? d.conditions)
  const title = clean(o.title) || clean(d.title) || clean(i.siteListing?.title) || baseTitle(i.vehicle)
  const description = (o.description ?? '').trim() || (d.description ?? '').trim() || (i.siteListing?.description ?? '').trim() || autoDescription(i.vehicle, options, conditions)
  const stockPrice = effectivePrice({
    salePrice: i.vehicle.salePrice ?? null, promoPrice: i.vehicle.promoPrice ?? null, isPromo: !!i.vehicle.isPromo,
    promoStartsAt: i.vehicle.promoStartsAt ?? null, promoEndsAt: i.vehicle.promoEndsAt ?? null,
  }, i.now)
  const price = positive(o.price) ?? positive(d.price) ?? stockPrice.price
  const oldPrice = positive(o.price) || positive(d.price) ? null : stockPrice.oldPrice
  const photos = dedupe((o.photos?.length ? o.photos : d.photos?.length ? d.photos : i.gallery) ?? [])
  const caption = [
    `🚗 ${title}`,
    price != null ? `💰 ${money(price)}` : '',
    factLines(i.vehicle).join(' · '),
    conditions,
    contactLines(i.contacts).join('\n'),
  ].filter(Boolean).join('\n\n')
  return {
    reference: i.reference, vehicle: i.vehicle, title, description, caption, price, oldPrice, photos, options, conditions,
    contacts: i.contacts, location: i.location, storeName: i.storeName,
    isNew: (i.vehicle.conditionType ?? '').toUpperCase() === 'NOVO' || i.vehicle.km === 0,
  }
}

function positive(n: unknown): number | null {
  const v = typeof n === 'string' ? Number(n) : typeof n === 'number' ? n : NaN
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null
}
function dedupe(list: string[]): string[] {
  const seen = new Set<string>(); const out: string[] = []
  for (const u of list) { const k = String(u ?? '').trim(); if (k && !seen.has(k)) { seen.add(k); out.push(k) } }
  return out
}

/** Texto final para o canal: corta no limite e tira contatos onde o canal proíbe. */
export function channelText(p: ListingPayload, spec: ChannelSpec): { title: string; description: string; truncated: string[] } {
  const truncated: string[] = []
  let title = p.title
  if (spec.text.titleMax && title.length > spec.text.titleMax) { title = title.slice(0, spec.text.titleMax).trim(); truncated.push('título') }
  let description = spec.group === 'SOCIAL' || spec.group === 'MANUAL' ? p.caption : p.description
  if (!spec.text.contactsInDescription) description = stripContacts(description)
  else if (spec.group === 'PROPRIO' || spec.group === 'PORTAL') {
    const c = contactLines(p.contacts)
    if (c.length && !c.some((l) => description.includes(l))) description = `${description}\n\n${c.join('\n')}`
  }
  if (spec.text.descriptionMax && description.length > spec.text.descriptionMax) { description = description.slice(0, spec.text.descriptionMax - 1).trimEnd() + '…'; truncated.push('descrição') }
  return { title, description, truncated }
}

/** Remove telefone, e-mail, @perfil e endereço de site (portais que penalizam contato na descrição). */
export function stripContacts(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/^(whatsapp|telefone|instagram|site)\s*:/i.test(l.trim()))
    .join('\n')
    .replace(/\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')
    .replace(/(^|\s)@[\w.]{3,}/g, '$1')
    .replace(/\b(?:https?:\/\/)?(?:www\.)[\w-]+\.[\w.\/-]+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Impressão digital do conteúdo enviado (detecta o que mudou; idempotência). */
export function payloadHash(p: ListingPayload): string {
  const stable = JSON.stringify({
    t: p.title, d: p.description, c: p.caption, p: p.price, o: p.oldPrice, f: p.photos, op: p.options, cd: p.conditions,
    k: p.vehicle.km, ct: p.contacts,
  })
  return createHash('sha256').update(stable).digest('hex').slice(0, 32)
}

/** Referência curta e estável no canal (OLX aceita até 19 caracteres [A-Za-z0-9_-]). */
export function shortRef(seed: string, len = 19): string {
  const h = createHash('sha256').update(seed).digest()
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  let out = ''
  for (let i = 0; out.length < len - 2 && i < h.length; i++) out += alphabet[h[i] % 36]
  return 'ad' + out
}

/** Separa o WhatsApp para campos de país/DDD/número (ex.: ML seller_contact). */
export function splitBrPhone(raw?: string | null): { country: string; area: string; number: string; full: string } | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.length < 10 || d.length > 11) return null
  return { country: '55', area: d.slice(0, 2), number: d.slice(2), full: d }
}
