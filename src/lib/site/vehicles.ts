// =============================================================================
// Site da loja — vitrine (consultas). Só veículos visíveis pela regra de
// publicação (listing-core): ativos + Disponível/Em promoção + não escondidos.
// Publicados (fotos tratadas) primeiro, destaques na frente; "Em breve" no fim.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { effectivePrice, siteVehicleState, SITE_VISIBLE_STOCK, vehicleIdFromSlug, vehicleSlug, vehicleTitle, type SiteVehicleState } from './listing-core'

export const SITE_PAGE_SIZE = 24

export interface SiteVehicle {
  id: string; slug: string; title: string
  brand: string; model: string; version: string
  year: number | null; modelYear: number | null; km: number | null
  fuel: string; transmission: string; color: string; doors: number | null; bodyType: string; vehicleType: string | null
  price: number | null; oldPrice: number | null
  state: SiteVehicleState; featured: boolean; promo: boolean
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
  active: true, stockStatus: true, createdAt: true,
  photos: { select: { url: true, isMain: true, order: true }, orderBy: [{ isMain: 'desc' as const }, { order: 'asc' as const }] },
  siteListing: { select: { photosStatus: true, hidden: true, featured: true, description: true, options: true, videoUrl: true, seoTitle: true, seoDescription: true, title: true } },
} satisfies Prisma.VehicleSelect

type Row = Prisma.VehicleGetPayload<{ select: typeof SELECT }>

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d))

function toSiteVehicle(r: Row): SiteVehicle {
  const l = r.siteListing
  const state = siteVehicleState({ active: r.active, stockStatus: r.stockStatus }, l)
  const { price, oldPrice } = effectivePrice({ salePrice: num(r.salePrice), promoPrice: num(r.promoPrice), isPromo: r.isPromo, promoStartsAt: r.promoStartsAt, promoEndsAt: r.promoEndsAt })
  // Fotos só aparecem depois de tratadas (regra do "Em breve").
  const photos = state === 'PUBLICADO' ? r.photos.map((p) => p.url) : []
  const options = Array.isArray(l?.options) ? (l!.options as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const t = { id: r.id, brand: r.brand, model: r.model, version: r.version, modelYear: r.modelYear, year: r.year }
  return {
    id: r.id, slug: vehicleSlug(t), title: l?.title?.trim() || vehicleTitle(t),
    brand: r.brand ?? '', model: r.model ?? '', version: r.version ?? '',
    year: r.year, modelYear: r.modelYear, km: r.km,
    fuel: r.fuel ?? '', transmission: r.transmission ?? '', color: r.color ?? '', doors: r.doors, bodyType: r.bodyType ?? '', vehicleType: r.vehicleType,
    price, oldPrice, state, featured: !!l?.featured, promo: oldPrice != null,
    photos, cover: photos[0] ?? null,
    description: l?.description ?? '', options, videoUrl: l?.videoUrl ?? '',
    seoTitle: l?.seoTitle ?? '', seoDescription: l?.seoDescription ?? '',
  }
}

function baseWhere(tenantId: string): Prisma.VehicleWhereInput {
  return {
    tenantId, active: true, stockStatus: { in: [...SITE_VISIBLE_STOCK] },
    OR: [{ siteListing: { is: null } }, { siteListing: { is: { hidden: false } } }],
  }
}

function filteredWhere(tenantId: string, f: SiteFilters): Prisma.VehicleWhereInput {
  const and: Prisma.VehicleWhereInput[] = [baseWhere(tenantId)]
  const q = f.q?.trim()
  if (q) and.push({ OR: [{ brand: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }, { version: { contains: q, mode: 'insensitive' } }] })
  if (f.brand) and.push({ brand: { equals: f.brand, mode: 'insensitive' } })
  if (f.fuel) and.push({ fuel: { equals: f.fuel, mode: 'insensitive' } })
  if (f.transmission) and.push({ transmission: { equals: f.transmission, mode: 'insensitive' } })
  if (f.yearMin) and.push({ modelYear: { gte: f.yearMin } })
  if (f.yearMax) and.push({ modelYear: { lte: f.yearMax } })
  if (f.priceMin) and.push({ salePrice: { gte: f.priceMin } })
  if (f.priceMax) and.push({ salePrice: { lte: f.priceMax } })
  if (f.type === 'motorcycles') and.push({ vehicleType: 'MOTORCYCLE' })
  if (f.type === 'cars') and.push({ OR: [{ vehicleType: null }, { vehicleType: { not: 'MOTORCYCLE' } }] })
  return { AND: and }
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
  const rows = await prisma.vehicle.findMany({ where: filteredWhere(tenantId, f), select: SELECT, take: 1000 })
  const created = new Map(rows.map((r) => [r.id, r.createdAt.getTime()]))
  const all = sortRows(rows.map(toSiteVehicle).filter((v) => v.state !== 'HIDDEN'), f.sort, created)
  const page = Math.max(1, f.page ?? 1)
  return { items: all.slice((page - 1) * SITE_PAGE_SIZE, page * SITE_PAGE_SIZE), total: all.length }
}

export async function findSiteVehicle(tenantId: string, slug: string): Promise<SiteVehicle | null> {
  const id = vehicleIdFromSlug(slug)
  if (!id) return null
  const row = await prisma.vehicle.findFirst({ where: { ...baseWhere(tenantId), id }, select: SELECT })
  const v = row ? toSiteVehicle(row) : null
  return v && v.state !== 'HIDDEN' ? v : null
}

export async function siteFilterOptions(tenantId: string) {
  const rows = await prisma.vehicle.findMany({ where: baseWhere(tenantId), select: { brand: true, fuel: true, transmission: true, modelYear: true } })
  const uniq = (xs: (string | number | null)[]) => [...new Set(xs.filter((x): x is string | number => x != null && x !== ''))]
  return {
    brands: (uniq(rows.map((r) => r.brand)) as string[]).sort((a, b) => a.localeCompare(b)),
    fuels: (uniq(rows.map((r) => r.fuel)) as string[]).sort(),
    transmissions: (uniq(rows.map((r) => r.transmission)) as string[]).sort(),
    years: (uniq(rows.map((r) => r.modelYear)) as number[]).sort((a, b) => b - a),
  }
}

/** Veículo do formulário de lead (valida que pertence à loja e está no site). */
export async function siteVehicleRef(tenantId: string, vehicleId: string) {
  const row = await prisma.vehicle.findFirst({ where: { ...baseWhere(tenantId), id: vehicleId }, select: SELECT })
  return row ? toSiteVehicle(row) : null
}
