// =============================================================================
// Site da loja — feed do catálogo da Meta (Facebook/Instagram/WhatsApp).
// Núcleo PURO (testado), porta do meta-feed do dagobertoeasycar: CSV no formato
// de produtos, que a Meta busca pela URL programada. Só entram carros
// publicados (com foto e preço); o resto sai no relatório com o motivo.
// =============================================================================

import type { SiteVehicle } from './vehicles'
import { fuelLabel, transmissionLabel } from './listing-core'

export const META_FEED_HEADERS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'additional_image_link',
  'brand', 'model', 'version', 'year', 'mileage', 'transmission', 'fuel_type', 'body_style', 'color', 'city', 'state',
] as const
export type MetaFeedItem = Record<(typeof META_FEED_HEADERS)[number], string>

export type MetaFeedIssueCode = 'SEM_FOTO' | 'SEM_PRECO' | 'LINK_SEM_HTTPS'
export interface MetaFeedIssue { id: string; title: string; code: MetaFeedIssueCode; message: string }

export interface MetaFeedOptions {
  /** URL absoluta de um caminho do site (ex.: /veiculos/slug → https://loja.com.br/veiculos/slug). */
  abs: (path: string) => string
  city: string
  state: string
}

export interface MetaFeedResult { items: MetaFeedItem[]; issues: MetaFeedIssue[]; csv: string; total: number; exported: number; ignored: number }

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
export function toCsv(items: MetaFeedItem[]): string {
  return [META_FEED_HEADERS.map(csvCell).join(','), ...items.map((i) => META_FEED_HEADERS.map((h) => csvCell(i[h])).join(','))].join('\r\n') + '\r\n'
}

/** A Meta recusa marcação na descrição: texto puro, espaços normalizados. */
export function plainText(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const money = (n: number) => `${n.toFixed(2)} BRL`
const isHttps = (u: string) => /^https:\/\//i.test(u)

function description(v: SiteVehicle, city: string): string {
  const facts = [v.version, v.year || v.modelYear ? `${v.year ?? '—'}/${v.modelYear ?? '—'}` : '', v.km != null ? `${v.km.toLocaleString('pt-BR')} km` : '',
    transmissionLabel(v.transmission), fuelLabel(v.fuel), v.bodyType, v.color, city].map((x) => String(x ?? '').trim()).filter(Boolean)
  const parts = [plainText(v.description) || v.title, facts.join(' · ')]
  if (v.options.length) parts.push(`Opcionais: ${v.options.join(', ')}`)
  return parts.filter(Boolean).join('\n').slice(0, 5000)
}

export function buildMetaFeed(vehicles: SiteVehicle[], o: MetaFeedOptions): MetaFeedResult {
  const items: MetaFeedItem[] = []
  const issues: MetaFeedIssue[] = []
  for (const v of vehicles) {
    const issue = (code: MetaFeedIssueCode, message: string) => issues.push({ id: v.id, title: v.title, code, message })
    if (v.state !== 'PUBLICADO' || !v.photos.length) { issue('SEM_FOTO', 'Sem fotos: entra no catálogo quando ganhar fotos no estoque.'); continue }
    if (v.price == null || v.price <= 0) { issue('SEM_PRECO', 'Sem preço de venda no estoque.'); continue }
    const link = o.abs(`/veiculos/${v.slug}`)
    const images = v.photos.map((p) => (/^https?:\/\//i.test(p) ? p : o.abs(p)))
    if (!isHttps(link) || !isHttps(images[0])) issue('LINK_SEM_HTTPS', 'Endereço sem https: a Meta só aceita depois que o site estiver no domínio publicado.')
    const promo = v.oldPrice != null && v.oldPrice > v.price
    items.push({
      id: v.id,
      title: v.title.slice(0, 150),
      description: description(v, o.city),
      availability: 'in stock',
      condition: 'used',
      price: money(promo ? v.oldPrice! : v.price),
      sale_price: promo ? money(v.price) : '',
      link,
      image_link: images[0],
      additional_image_link: images.slice(1, 11).join(','),
      brand: v.brand,
      model: v.model,
      version: v.version,
      year: String(v.modelYear ?? v.year ?? ''),
      mileage: v.km != null ? `${v.km} km` : '',
      transmission: transmissionLabel(v.transmission),
      fuel_type: fuelLabel(v.fuel),
      body_style: v.bodyType,
      color: v.color,
      city: o.city,
      state: o.state,
    })
  }
  return { items, issues, csv: toCsv(items), total: vehicles.length, exported: items.length, ignored: vehicles.length - items.length }
}

/** "Osasco - SP", "Osasco/SP", "Osasco, SP" → { city, state }. */
export function cityStateFrom(line: string): { city: string; state: string } {
  const m = /^(.*?)[\s,/-]+([A-Za-z]{2})\s*$/.exec(line.trim())
  if (m && m[1].trim()) {
    const city = m[1].split(/[,–-]/).map((s) => s.trim()).filter(Boolean).pop() ?? ''
    return { city, state: m[2].toUpperCase() }
  }
  return { city: '', state: '' }
}
