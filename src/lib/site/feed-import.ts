// =============================================================================
// Site da loja — importação de estoque por feed (lado do banco).
// Configuração por env, de propósito restrita (hoje só a AutoDrive):
//   SITE_FEED_IMPORT="<tenantId>|<url do feed CSV>"   (várias: separadas por ;)
// O vínculo extId → vehicleId fica em SystemSetting `t:<tenantId>:site:feedimport:v1`
// junto com o resumo da última execução. Grava direto no banco (sem as rotas
// de estoque), então não dispara pendências nem avisos.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { parseFeed, planFeedSync, samePhotos, type FeedVehicle } from './feed-import-core'

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
  at: string
}

// slugs: link antigo (/veiculos/<slug> do site de origem) → vehicleId, p/ redirecionar.
interface ImportState { map: Record<string, string>; slugs: Record<string, string>; last?: FeedImportResult }

export function feedImportSources(env = process.env.SITE_FEED_IMPORT): FeedImportSource[] {
  return String(env ?? '').split(';').map((s) => s.trim()).filter(Boolean).flatMap((s) => {
    const [tenantId, url] = s.split('|').map((x) => x?.trim())
    return tenantId && /^https:\/\//i.test(url ?? '') ? [{ tenantId, url: url! }] : []
  })
}

const stateKey = (tenantId: string) => `t:${tenantId}:site:feedimport:v1`

async function loadState(tenantId: string): Promise<ImportState> {
  const row = await prisma.systemSetting.findFirst({ where: { key: stateKey(tenantId) }, select: { value: true } })
  try { const s = JSON.parse(row?.value ?? '{}'); return { map: s.map ?? {}, slugs: s.slugs ?? {}, last: s.last } } catch { return { map: {}, slugs: {} } }
}

async function saveState(tenantId: string, state: ImportState) {
  const value = JSON.stringify(state)
  const key = stateKey(tenantId)
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key, value, tenantId, group: 'site', description: 'Importação de estoque do site (feed)' } })
}

function vehicleData(item: FeedVehicle) {
  return {
    brand: item.brand || null,
    model: item.model || null,
    version: item.version || null,
    year: item.modelYear,
    modelYear: item.modelYear,
    km: item.km,
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

async function upsertListing(tenantId: string, vehicleId: string, item: FeedVehicle) {
  const data = { title: item.title || null, description: item.description || null }
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
    const items = parseFeed(await res.text())

    const known = Object.values(state.map)
    const existing = known.length
      ? await prisma.vehicle.findMany({ where: { id: { in: known }, tenantId: src.tenantId }, select: { id: true, active: true, photos: { select: { url: true }, orderBy: { order: 'asc' } } } })
      : []
    const byId = new Map(existing.map((v) => [v.id, v]))
    // Vínculo para veículo apagado no SaaS: esquece e recria.
    for (const [ext, id] of Object.entries(state.map)) if (!byId.has(id)) delete state.map[ext]
    const activeIds = new Set(existing.filter((v) => v.active).map((v) => v.id))

    const plan = planFeedSync(items, state.map, activeIds)
    if (plan.aborted) {
      result = { ...base, ok: false, feed: items.length, aborted: plan.aborted }
    } else {
      const unit = await prisma.unit.findFirst({ where: { tenantId: src.tenantId }, orderBy: { createdAt: 'asc' }, select: { id: true } })
      let created = 0
      let updated = 0
      for (const item of plan.create) {
        const v = await prisma.vehicle.create({
          data: {
            tenantId: src.tenantId, unitId: unit?.id ?? null, ...vehicleData(item),
            conditionType: 'USADO', stockStatus: 'DISPONIVEL', active: true, isAvailableForSale: true,
            entryDate: new Date(), notes: `Importado do site antigo (${item.extId})`,
          },
          select: { id: true },
        })
        state.map[item.extId] = v.id
        if (item.legacySlug) state.slugs[item.legacySlug] = v.id
        if (item.photos.length) await writePhotos(v.id, item.photos)
        await upsertListing(src.tenantId, v.id, item)
        created++
      }
      for (const { vehicleId, item } of plan.update) {
        const cur = byId.get(vehicleId)
        // Volta ao site se tinha saído do feed; não mexe em status de venda feito no SaaS.
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { ...vehicleData(item), ...(cur && !cur.active ? { active: true, exitDate: null, stockStatus: 'DISPONIVEL' } : {}) },
        })
        if (!samePhotos(cur?.photos.map((p) => p.url) ?? [], item.photos)) await writePhotos(vehicleId, item.photos)
        await upsertListing(src.tenantId, vehicleId, item)
        if (item.legacySlug) state.slugs[item.legacySlug] = vehicleId
        updated++
      }
      if (plan.remove.length) {
        await prisma.vehicle.updateMany({ where: { id: { in: plan.remove }, tenantId: src.tenantId }, data: { active: false, exitDate: new Date() } })
      }
      result = { ...base, ok: true, feed: items.length, created, updated, removed: plan.remove.length, aborted: null }
    }
  } catch (e) {
    result = { ...base, ok: false, aborted: null, error: e instanceof Error ? e.message : String(e) }
  }
  state.last = result
  await saveState(src.tenantId, state)
  return result
}

/** Link antigo do site de origem → id do veículo no SaaS (null se não houver importação/vínculo). */
export async function legacyVehicleId(tenantId: string, slug: string): Promise<string | null> {
  const row = await prisma.systemSetting.findFirst({ where: { key: stateKey(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row) return null
  try { return (JSON.parse(row.value).slugs ?? {})[decodeURIComponent(slug).toLowerCase()] ?? null } catch { return null }
}
