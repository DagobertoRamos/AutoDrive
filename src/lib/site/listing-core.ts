// =============================================================================
// Site da loja — regra de publicação do estoque. PURO (testado).
//   • Carro ATIVO e com status de estoque visível (Disponível / Em promoção)
//     entra no site automaticamente como "Em breve" (sem fotos).
//   • Quando o carro ganha fotos (painel de fotos do estoque), vira
//     "Publicado". O fluxo de fotos TRATADAS (estúdio) é opcional, por loja,
//     e ainda não está ligado.
//   • Vendido, reservado, bloqueado etc. ou tirado manualmente (hidden) → fora.
// =============================================================================

import { slugify } from './config-core'

export const SITE_VISIBLE_STOCK = ['DISPONIVEL', 'EM_PROMOCAO'] as const
export type SiteVehicleState = 'HIDDEN' | 'EM_BREVE' | 'PUBLICADO'
export const PHOTO_STATUSES = ['ORIGEM', 'EM_TRATAMENTO', 'TRATADA'] as const
export type PhotoStatus = (typeof PHOTO_STATUSES)[number]

export interface ListingLike { photosStatus: string; hidden: boolean }
export interface StockLike { active: boolean; stockStatus: string | null }

export function siteVehicleState(v: StockLike, listing: ListingLike | null | undefined, photoCount: number): SiteVehicleState {
  if (!v.active || !v.stockStatus || !(SITE_VISIBLE_STOCK as readonly string[]).includes(v.stockStatus)) return 'HIDDEN'
  if (listing?.hidden) return 'HIDDEN'
  return photoCount > 0 ? 'PUBLICADO' : 'EM_BREVE'
}

export interface TitleLike { id: string; brand: string | null; model: string | null; version: string | null; modelYear: number | null; year: number | null }

export function vehicleTitle(v: TitleLike): string {
  return [v.brand, v.model, v.version].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || 'Veículo'
}

/** Slug estável do anúncio: "<marca-modelo-versao-ano>--<id>". O id garante unicidade. */
export function vehicleSlug(v: TitleLike): string {
  const base = slugify([v.brand, v.model, v.version, v.modelYear ?? v.year].filter(Boolean).join(' '), 90) || 'veiculo'
  return `${base}--${v.id}`
}

export function vehicleIdFromSlug(slug: string): string | null {
  const i = decodeURIComponent(slug).lastIndexOf('--')
  const id = i >= 0 ? decodeURIComponent(slug).slice(i + 2) : ''
  return /^[a-z0-9]{10,40}$/i.test(id) ? id : null
}

export interface PriceLike {
  salePrice: number | null; promoPrice: number | null; isPromo: boolean
  promoStartsAt: Date | null; promoEndsAt: Date | null
}

/** Preço que o site mostra: promoção vigente (com "de" riscado) ou preço de venda. */
export function effectivePrice(v: PriceLike, now = new Date()): { price: number | null; oldPrice: number | null } {
  const promoOn = v.isPromo && v.promoPrice != null && v.promoPrice > 0 &&
    (!v.promoStartsAt || v.promoStartsAt <= now) && (!v.promoEndsAt || v.promoEndsAt >= now)
  if (promoOn) return { price: v.promoPrice, oldPrice: v.salePrice != null && v.salePrice > (v.promoPrice ?? 0) ? v.salePrice : null }
  return { price: v.salePrice != null && v.salePrice > 0 ? v.salePrice : null, oldPrice: null }
}

export type PromoState = 'ATIVA' | 'AGENDADA' | 'ENCERRADA' | 'NENHUMA'

/** Situação da promoção do carro (para o painel de Promoções). */
export function promoState(v: PriceLike, now = new Date()): PromoState {
  if (!v.isPromo || v.promoPrice == null || v.promoPrice <= 0) return 'NENHUMA'
  if (v.promoEndsAt && v.promoEndsAt < now) return 'ENCERRADA'
  if (v.promoStartsAt && v.promoStartsAt > now) return 'AGENDADA'
  return 'ATIVA'
}

/** Desconto em % (inteiro) de "de" para "por"; null se não houver desconto. */
export function discountPct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from <= 0 || to >= from) return null
  return Math.round(((from - to) / from) * 100)
}

export function money(value: number | null): string {
  if (value == null) return 'Consulte'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

const FUEL_LABEL: Record<string, string> = { FLEX: 'Flex', GASOLINA: 'Gasolina', ETANOL: 'Etanol', DIESEL: 'Diesel', ELETRICO: 'Elétrico', HIBRIDO: 'Híbrido', GNV: 'GNV' }
const TRANSMISSION_LABEL: Record<string, string> = { MANUAL: 'Manual', AUTOMATICO: 'Automático', CVT: 'CVT', SEMI_AUTOMATICO: 'Semiautomático', AUTOMATIZADO: 'Automatizado' }

/** Rótulo amigável de combustível/câmbio (o estoque grava códigos como FLEX, AUTOMATICO). */
export function fuelLabel(v: string | null | undefined): string {
  const k = String(v ?? '').trim()
  return FUEL_LABEL[k.toUpperCase()] ?? k
}
export function transmissionLabel(v: string | null | undefined): string {
  const k = String(v ?? '').trim()
  return TRANSMISSION_LABEL[k.toUpperCase()] ?? k
}
