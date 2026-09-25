// =============================================================================
// Site da loja — importação de estoque por feed (lado do banco).
// Configuração por env, de propósito restrita (hoje só a AutoDrive):
//   SITE_FEED_IMPORT="<tenantId>|<url do feed CSV>"   (várias: separadas por ;)
//   SITE_FEED_LEGACY_DB="<postgres url do site de origem>" (opcional, SÓ LEITURA)
//     → completa cada carro com o que o painel do site antigo mostra: placa,
//       código interno, fabricação, km, portas, cor, opcionais, vídeo, SEO,
//       promoção de/por, reservado, destaque e LOJA PARCEIRA (+ link, preço do
//       parceiro e margem). O CSV não tem nada disso.
// O vínculo extId → vehicleId fica em SystemSetting `t:<tenantId>:site:feedimport:v1`
// junto com o resumo da última execução. Grava direto no banco (sem as rotas
// de estoque), então não dispara pendências nem avisos.
// =============================================================================

import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { prisma } from '@/lib/prisma'
import {
  mergeLegacy, parseFeed, planFeedSync, samePhotos,
  type FeedExtras, type FeedOrigin, type FeedVehicle, type LegacyVehicle,
} from './feed-import-core'

type Item = FeedVehicle & { extras: FeedExtras }

export interface FeedImportSource { tenantId: string; url: string }

export interface FeedImportResult {
  tenantId: string
  ok: boolean
  feed: number
  created: number
  updated: number
  removed: number
  aborted: string | null
  error?: string
  /** Quantos itens do feed foram completados pelo banco do site de origem. */
  enriched?: number
  legacyError?: string
  at: string
}

// slugs: link antigo (/veiculos/<slug> do site de origem) → vehicleId, p/ redirecionar.
// origins: vehicleId → dados de origem (loja parceira, código, link...) — o Vehicle não tem colunas p/ isso.
interface ImportState { map: Record<string, string>; slugs: Record<string, string>; origins: Record<string, FeedOrigin>; last?: FeedImportResult }

export function feedImportSources(env = process.env.SITE_FEED_IMPORT): FeedImportSource[] {
  return String(env ?? '').split(';').map((s) => s.trim()).filter(Boolean).flatMap((s) => {
    const [tenantId, url] = s.split('|').map((x) => x?.trim())
    return tenantId && /^https:\/\//i.test(url ?? '') ? [{ tenantId, url: url! }] : []
  })
}

const stateKey = (tenantId: string) => `t:${tenantId}:site:feedimport:v1`

async function loadState(tenantId: string): Promise<ImportState> {
  const row = await prisma.systemSetting.findFirst({ where: { key: stateKey(tenantId) }, select: { value: true } })
  try { const s = JSON.parse(row?.value ?? '{}'); return { map: s.map ?? {}, slugs: s.slugs ?? {}, origins: s.origins ?? {}, last: s.last } } catch { return { map: {}, slugs: {}, origins: {} } }
}

async function saveState(tenantId: string, state: ImportState) {
  const value = JSON.stringify(state)
  const key = stateKey(tenantId)
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key, value, tenantId, group: 'site', description: 'Importação de estoque do site (feed)' } })
}

/** Lê o cadastro completo no banco do site de origem (só SELECT). */
async function fetchLegacy(extIds: string[]): Promise<Map<string, LegacyVehicle>> {
  const url = process.env.SITE_FEED_LEGACY_DB
  if (!url || !extIds.length) return new Map()
  neonConfig.webSocketConstructor = ws
  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    const { rows } = await pool.query<LegacyVehicle>(
      `SELECT v.catalog_item_id, v.plate, v.year_make, v.year_model, v.mileage, v.doors, v.color, v.options,
              v.video_url, v.internal_code, v.origin_type, v.store, v.fuel, v.transmission, v.body_type,
              v.price_cents, v.old_price_cents, v.promotion, v.origin_price_cents, v.price_markup_cents,
              v.source_url, v.featured, v.stock_status, v.seo_title, v.seo_description,
              p.name AS partner_name, p.city AS partner_city, p.whatsapp AS partner_whatsapp
         FROM vehicles v LEFT JOIN partners p ON p.id = v.partner_id
        WHERE v.catalog_item_id = ANY($1::text[])`,
      [extIds],
    )
    return new Map(rows.map((r) => [r.catalog_item_id, r]))
  } finally {
    await pool.end().catch(() => {})
  }
}

function vehicleData(item: Item) {
  const x = item.extras
  return {
    brand: item.brand || null,
    model: item.model || null,
    version: item.version || null,
    year: x.year ?? item.modelYear,
    modelYear: item.modelYear,
    km: item.km || null, // carro usado com "0 km" no feed = km não informado
    ...(x.plate ? { plate: x.plate } : {}),
    ...(x.doors ? { doors: x.doors } : {}),
    ...(x.consigned ? { stockType: 'CONSIGNADO' as const } : {}),
    // Promoção de/por do site antigo: "de" = preço de venda, "por" = promocional.
    ...(x.promo
      ? { salePrice: x.promo.from, promoPrice: x.promo.to, isPromo: true }
      : x.origin ? { promoPrice: null, isPromo: false } : {}),
    salePrice: item.price,
    fuel: item.fuel,
    transmission: item.transmission,
    bodyType: item.bodyType,
    color: item.color,
    vehicleType: item.vehicleType,
    mainPhotoUrl: item.photos[0] ?? null,
    ...(item.inspected ? { cautelarStatus: 'APROVADA' as const } : {}),
  }
}

async function writePhotos(vehicleId: string, photos: string[]) {
  await prisma.$transaction([
    prisma.vehiclePhoto.deleteMany({ where: { vehicleId } }),
    prisma.vehiclePhoto.createMany({ data: photos.map((url, i) => ({ vehicleId, url, order: i, isMain: i === 0 })) }),
  ])
}

async function upsertListing(tenantId: string, vehicleId: string, item: Item) {
  const data = {
    title: item.title || null,
    description: item.description || null,
    ...(item.extras.options.length ? { options: item.extras.options } : {}),
    ...(item.extras.videoUrl ? { videoUrl: item.extras.videoUrl } : {}),
    ...(item.extras.seoTitle ? { seoTitle: item.extras.seoTitle } : {}),
    ...(item.extras.seoDescription ? { seoDescription: item.extras.seoDescription } : {}),
    ...(item.extras.origin ? { featured: item.extras.featured } : {}),
  }
  await prisma.siteListing.upsert({
    where: { vehicleId },
    create: { tenantId, vehicleId, ...data, publishedAt: item.photos.length ? new Date() : null },
    update: data,
  })
}

export async function runFeedImport(src: FeedImportSource): Promise<FeedImportResult> {
  const at = new Date().toISOString()
  const base = { tenantId: src.tenantId, feed: 0, created: 0, updated: 0, removed: 0, at }
  const state = await loadState(src.tenantId)
  let result: FeedImportResult
  try {
    const res = await fetch(src.url, { cache: 'no-store', headers: { 'user-agent': 'AutoDrive-SiteImport/1.0' }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Feed respondeu HTTP ${res.status}`)
    const parsed = parseFeed(await res.text())
    let legacy = new Map<string, LegacyVehicle>()
    let legacyError: string | undefined
    try { legacy = await fetchLegacy(parsed.map((i) => i.extId)) } catch (e) { legacyError = e instanceof Error ? e.message : String(e) }
    const items: Item[] = parsed.map((i) => mergeLegacy(i, legacy.get(i.extId)))
    const enrichInfo = { enriched: items.filter((i) => legacy.has(i.extId)).length, ...(legacyError ? { legacyError } : {}) }

    const known = Object.values(state.map)
    const existing = known.length
      ? await prisma.vehicle.findMany({ where: { id: { in: known }, tenantId: src.tenantId }, select: { id: true, active: true, stockStatus: true, photos: { select: { url: true }, orderBy: { order: 'asc' } }, siteListing: { select: { photosLocked: true } } } })
      : []
    const byId = new Map(existing.map((v) => [v.id, v]))
    // Vínculo para veículo apagado no SaaS: esquece e recria.
    for (const [ext, id] of Object.entries(state.map)) if (!byId.has(id)) delete state.map[ext]
    const activeIds = new Set(existing.filter((v) => v.active).map((v) => v.id))

    const plan = planFeedSync(items, state.map, activeIds)
    if (plan.aborted) {
      result = { ...base, ok: false, feed: items.length, aborted: plan.aborted, ...enrichInfo }
    } else {
      const unit = await prisma.unit.findFirst({ where: { tenantId: src.tenantId }, orderBy: { createdAt: 'asc' }, select: { id: true } })
      let created = 0
      let updated = 0
      for (const item of plan.create) {
        const v = await prisma.vehicle.create({
          data: {
            tenantId: src.tenantId, unitId: unit?.id ?? null, ...vehicleData(item),
            conditionType: 'USADO', stockStatus: item.extras.reserved ? 'RESERVADO' : 'DISPONIVEL', active: true, isAvailableForSale: true,
            entryDate: new Date(), notes: `Importado do site antigo (${item.extId})`,
          },
          select: { id: true },
        })
        state.map[item.extId] = v.id
        if (item.legacySlug) state.slugs[item.legacySlug] = v.id
        if (item.extras.origin) state.origins[v.id] = item.extras.origin
        if (item.photos.length) await writePhotos(v.id, item.photos)
        await upsertListing(src.tenantId, v.id, item)
        created++
      }
      for (const { vehicleId, item } of plan.update) {
        const cur = byId.get(vehicleId)
        // Volta ao site se tinha saído do feed; reservado segue o site de origem,
        // mas só alterna DISPONIVEL ↔ RESERVADO (não mexe em negociação/venda feita no SaaS).
        const reservedSync =
          item.extras.reserved && cur?.stockStatus === 'DISPONIVEL' ? { stockStatus: 'RESERVADO' as const }
          : !item.extras.reserved && item.extras.origin && cur?.stockStatus === 'RESERVADO' ? { stockStatus: 'DISPONIVEL' as const }
          : {}
        // Fotos travadas (tratadas no estúdio ou em tratamento): a galeria e a
        // capa ficam como estão; o resto do cadastro segue o site de origem.
        const locked = cur?.siteListing?.photosLocked === true
        const { mainPhotoUrl, ...data } = vehicleData(item)
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { ...data, ...(locked ? {} : { mainPhotoUrl }), ...reservedSync, ...(cur && !cur.active ? { active: true, exitDate: null, stockStatus: item.extras.reserved ? 'RESERVADO' : 'DISPONIVEL' } : {}) },
        })
        if (!locked && !samePhotos(cur?.photos.map((p) => p.url) ?? [], item.photos)) await writePhotos(vehicleId, item.photos)
        await upsertListing(src.tenantId, vehicleId, item)
        if (item.legacySlug) state.slugs[item.legacySlug] = vehicleId
        if (item.extras.origin) state.origins[vehicleId] = item.extras.origin
        updated++
      }
      if (plan.remove.length) {
        await prisma.vehicle.updateMany({ where: { id: { in: plan.remove }, tenantId: src.tenantId }, data: { active: false, exitDate: new Date() } })
      }
      result = { ...base, ok: true, feed: items.length, created, updated, removed: plan.remove.length, aborted: null, ...enrichInfo }
    }
  } catch (e) {
    result = { ...base, ok: false, aborted: null, error: e instanceof Error ? e.message : String(e) }
  }
  state.last = result
  await saveState(src.tenantId, state)
  return result
}

/** Origem de cada veículo importado (vehicleId → loja parceira, código, link...). Vazio se a loja não importa feed. */
export async function feedOrigins(tenantId: string | null | undefined): Promise<Record<string, FeedOrigin>> {
  if (!tenantId) return {}
  const row = await prisma.systemSetting.findFirst({ where: { key: stateKey(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row) return {}
  try { return JSON.parse(row.value).origins ?? {} } catch { return {} }
}

/** Painel admin do site de origem (enquanto ele existir), p/ /admin no domínio da loja. */
export function legacyAdminOrigin(tenantId: string): string | null {
  const src = feedImportSources().find((s) => s.tenantId === tenantId)
  try { return src ? new URL(src.url).origin : null } catch { return null }
}

/** Link antigo do site de origem → id do veículo no SaaS (null se não houver importação/vínculo). */
export async function legacyVehicleId(tenantId: string, slug: string): Promise<string | null> {
  const row = await prisma.systemSetting.findFirst({ where: { key: stateKey(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row) return null
  try { return (JSON.parse(row.value).slugs ?? {})[decodeURIComponent(slug).toLowerCase()] ?? null } catch { return null }
}
