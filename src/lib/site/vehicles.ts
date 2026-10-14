// =============================================================================
// Site da loja — vitrine (consultas). Só veículos visíveis pela regra de
// publicação (listing-core): ativos + Disponível/Em promoção + não escondidos.
// Publicados (com fotos) primeiro, destaques na frente; "Em breve" no fim.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { effectiveOrigin, type OriginType } from '@/lib/stock/origin-core'
import { classifyVideo } from '@/lib/publications/social/video-core'
import { brandLandings, type BrandLanding } from './seo-core'
import { brandCounts, brandVariants, type BrandCount } from './brands-core'
import { effectivePrice, siteVehicleState, SITE_VISIBLE_STOCK, vehicleIdFromSlug, vehicleSlug, vehicleTitle, type SiteVehicleState } from './listing-core'
import { realPhotoUrls } from '@/lib/vehicle-placeholder'

export const SITE_PAGE_SIZE = 24

export interface SiteVehicle {
  id: string; slug: string; title: string
  brand: string; model: string; version: string
  year: number | null; modelYear: number | null; km: number | null
  fuel: string; transmission: string; color: string; doors: number | null; bodyType: string; vehicleType: string | null
  price: number | null; oldPrice: number | null
  state: SiteVehicleState; featured: boolean; promo: boolean
  /** Cautelar/perícia aprovada no estoque: selo Periciado. */
  inspected: boolean
  /** De quem é o carro — vira a tag pública (Estoque X / Lojista parceiro / Particular intermediado). */
  origin: OriginType
  photos: string[]; cover: string | null
  description: string; options: string[]; videoUrl: string
  seoTitle: string; seoDescription: string
}

export interface SiteFilters {
  q?: string; brand?: string; fuel?: string; transmission?: string
  yearMin?: number; yearMax?: number; priceMin?: number; priceMax?: number
  type?: 'cars' | 'motorcycles'; sort?: string; page?: number
}

const SELECT = {
  id: true, brand: true, model: true, version: true, year: true, modelYear: true, km: true,
  fuel: true, transmission: true, color: true, doors: true, bodyType: true, vehicleType: true,
  salePrice: true, promoPrice: true, isPromo: true, promoStartsAt: true, promoEndsAt: true,
  active: true, stockStatus: true, createdAt: true, cautelarStatus: true,
  originType: true, partnerStoreId: true, stockType: true,
  photos: { select: { url: true, isMain: true, order: true }, orderBy: [{ isMain: 'desc' as const }, { order: 'asc' as const }] },
  siteListing: { select: { photosStatus: true, hidden: true, featured: true, description: true, options: true, videoUrl: true, seoTitle: true, seoDescription: true, title: true } },
} satisfies Prisma.VehicleSelect

type Row = Prisma.VehicleGetPayload<{ select: typeof SELECT }>

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d))

function toSiteVehicle(r: Row): SiteVehicle {
  const l = r.siteListing
  const photos = realPhotoUrls(r.photos.map((p) => p.url))
  const state = siteVehicleState({ active: r.active, stockStatus: r.stockStatus }, l, photos.length)
  const { price, oldPrice } = effectivePrice({ salePrice: num(r.salePrice), promoPrice: num(r.promoPrice), isPromo: r.isPromo, promoStartsAt: r.promoStartsAt, promoEndsAt: r.promoEndsAt })
  const options = Array.isArray(l?.options) ? (l!.options as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const t = { id: r.id, brand: r.brand, model: r.model, version: r.version, modelYear: r.modelYear, year: r.year }
  return {
    id: r.id, slug: vehicleSlug(t), title: l?.title?.trim() || vehicleTitle(t),
    brand: r.brand ?? '', model: r.model ?? '', version: r.version ?? '',
    year: r.year, modelYear: r.modelYear, km: r.km,
    fuel: r.fuel ?? '', transmission: r.transmission ?? '', color: r.color ?? '', doors: r.doors, bodyType: r.bodyType ?? '', vehicleType: r.vehicleType,
    price, oldPrice, state, featured: !!l?.featured, promo: oldPrice != null, inspected: r.cautelarStatus === 'APROVADA',
    origin: effectiveOrigin(r),
    photos, cover: photos[0] ?? null,
    description: l?.description ?? '', options, videoUrl: classifyVideo(l?.videoUrl)?.siteUrl ?? '',
    seoTitle: l?.seoTitle ?? '', seoDescription: l?.seoDescription ?? '',
  }
}

function baseWhere(tenantId: string): Prisma.VehicleWhereInput {
  return {
    tenantId, active: true, stockStatus: { in: [...SITE_VISIBLE_STOCK] },
    OR: [{ siteListing: { is: null } }, { siteListing: { is: { hidden: false } } }],
  }
}

// ── Vitrine em memória ──────────────────────────────────────────────────────
// Toda página do site (e cada robô de busca) precisava do estoque inteiro com
// fotos — ~0,5 MB do banco por página, e a transferência do banco é cobrada.
// Agora o estoque visível de cada loja é lido no máximo 1x por minuto por
// instância (consultas simultâneas compartilham a mesma leitura); listagem,
// marcas, filtros e anúncio saem daqui. Mudança no estoque aparece em até 1 min.
const CATALOG_TTL_MS = 60_000

interface CatalogEntry { v: SiteVehicle; createdAt: number; rawBrand: string | null }

const catalogCache = new Map<string, { at: number; data: Promise<CatalogEntry[]> }>()

function catalog(tenantId: string): Promise<CatalogEntry[]> {
  const hit = catalogCache.get(tenantId)
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.data
  const data = prisma.vehicle
    .findMany({ where: baseWhere(tenantId), select: SELECT, orderBy: { createdAt: 'desc' }, take: 2000 })
    .then((rows) => rows.map((r) => ({ v: toSiteVehicle(r), createdAt: r.createdAt.getTime(), rawBrand: r.brand })))
  catalogCache.set(tenantId, { at: Date.now(), data })
  data.catch(() => { if (catalogCache.get(tenantId)?.data === data) catalogCache.delete(tenantId) })
  return data
}

const eqi = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function matches(e: CatalogEntry, f: SiteFilters, brandIn: string[] | null): boolean {
  const v = e.v
  const q = f.q?.trim().toLowerCase()
  if (q && ![v.brand, v.model, v.version].some((x) => x.toLowerCase().includes(q))) return false
  // Marca: todas as grafias do estoque que são a mesma marca ("VW - VolksWagen" = Volkswagen).
  if (f.brand && !(brandIn?.length ? brandIn.includes(e.rawBrand ?? '') : eqi(v.brand, f.brand))) return false
  if (f.fuel && !eqi(v.fuel, f.fuel)) return false
  if (f.transmission && !eqi(v.transmission, f.transmission)) return false
  if (f.yearMin && !(v.modelYear != null && v.modelYear >= f.yearMin)) return false
  if (f.yearMax && !(v.modelYear != null && v.modelYear <= f.yearMax)) return false
  if (f.type === 'motorcycles' && v.vehicleType !== 'MOTORCYCLE') return false
  if (f.type === 'cars' && v.vehicleType === 'MOTORCYCLE') return false
  return true
}

function sortRows(list: SiteVehicle[], sort: string | undefined, created: Map<string, number>): SiteVehicle[] {
  const rank = (v: SiteVehicle) => (v.state === 'PUBLICADO' ? 0 : 1)
  const by: Record<string, (a: SiteVehicle, b: SiteVehicle) => number> = {
    recent: (a, b) => (created.get(b.id) ?? 0) - (created.get(a.id) ?? 0),
    price_asc: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    price_desc: (a, b) => (b.price ?? -1) - (a.price ?? -1),
    year_desc: (a, b) => (b.modelYear ?? 0) - (a.modelYear ?? 0),
    year_asc: (a, b) => (a.modelYear ?? 9999) - (b.modelYear ?? 9999),
    km_asc: (a, b) => (a.km ?? Infinity) - (b.km ?? Infinity),
    name: (a, b) => a.title.localeCompare(b.title),
  }
  const cmp = by[sort ?? 'recent'] ?? by.recent
  return [...list].sort((a, b) => rank(a) - rank(b) || Number(b.featured) - Number(a.featured) || cmp(a, b))
}

/** Lista paginada. A ordenação (publicado → destaque → critério) é feita em memória: estoque de loja é pequeno. */
export async function listSiteVehicles(tenantId: string, f: SiteFilters = {}): Promise<{ items: SiteVehicle[]; total: number }> {
  const entries = await catalog(tenantId)
  const brandIn = f.brand ? brandVariants(f.brand, entries.map((e) => e.rawBrand ?? '')) : null
  const rows = entries.filter((e) => matches(e, f, brandIn))
  const created = new Map(rows.map((e) => [e.v.id, e.createdAt]))
  // Faixa de preço sobre o preço exibido (promoção vigente), não o de venda.
  const inPrice = (v: SiteVehicle) => (!f.priceMin || (v.price != null && v.price >= f.priceMin)) && (!f.priceMax || (v.price != null && v.price <= f.priceMax))
  const all = sortRows(rows.map((e) => e.v).filter((v) => v.state !== 'HIDDEN' && inPrice(v)), f.sort, created)
  const page = Math.max(1, f.page ?? 1)
  return { items: all.slice((page - 1) * SITE_PAGE_SIZE, page * SITE_PAGE_SIZE), total: all.length }
}

/** Marcas com carro no site, já unificadas, com logo e quantidade (carrossel de marcas). */
export async function siteBrandCounts(tenantId: string): Promise<BrandCount[]> {
  return brandCounts((await catalog(tenantId)).map((e) => e.rawBrand ?? ''))
}

/** Marcas com carro visível no site (páginas por marca, rodapé). */
export async function siteBrandLandings(tenantId: string): Promise<BrandLanding[]> {
  return brandLandings((await catalog(tenantId)).map((e) => ({ brand: e.rawBrand ?? '', price: e.v.price })))
}

/** Todos os carros visíveis no site (feed do catálogo, sitemap), mais novos primeiro. */
export async function listAllSiteVehicles(tenantId: string, max = 2000): Promise<SiteVehicle[]> {
  return (await catalog(tenantId)).slice(0, max).map((e) => e.v)
}

export async function findSiteVehicle(tenantId: string, slug: string): Promise<SiteVehicle | null> {
  const id = vehicleIdFromSlug(slug)
  if (!id) return null
  const v = (await catalog(tenantId)).find((e) => e.v.id === id)?.v ?? null
  return v && v.state !== 'HIDDEN' ? v : null
}

export async function siteFilterOptions(tenantId: string) {
  const rows = await catalog(tenantId)
  const uniq = (xs: (string | number | null)[]) => [...new Set(xs.filter((x): x is string | number => x != null && x !== ''))]
  return {
    brands: brandCounts(rows.map((e) => e.rawBrand)).map((b) => ({ value: b.slug, label: b.label })),
    fuels: (uniq(rows.map((e) => e.v.fuel)) as string[]).sort(),
    transmissions: (uniq(rows.map((e) => e.v.transmission)) as string[]).sort(),
    years: (uniq(rows.map((e) => e.v.modelYear)) as number[]).sort((a, b) => b - a),
  }
}

/** Veículo do formulário de lead (valida que pertence à loja e está no site). Leitura direta, sem cache. */
export async function siteVehicleRef(tenantId: string, vehicleId: string) {
  const row = await prisma.vehicle.findFirst({ where: { ...baseWhere(tenantId), id: vehicleId }, select: SELECT })
  return row ? toSiteVehicle(row) : null
}
