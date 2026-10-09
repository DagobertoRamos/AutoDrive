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
  mergeLegacy, parseFeed, planFeedSync, relinkByPlate, samePhotos,
  type FeedExtras, type FeedOrigin, type FeedVehicle, type LegacyVehicle,
} from './feed-import-core'
import { normalizeOrigin, partnerRefFromName } from '@/lib/stock/origin-core'
import { ensurePartnerStoreByName } from '@/lib/stock/partner-stores'
import { realPhotoUrls } from '@/lib/vehicle-placeholder'
import { SITE_VISIBLE_STOCK } from './listing-core'

// Status definidos no SaaS que a importação nunca sobrescreve.
const KEEP_STOCK = ['VENDIDO', 'EM_NEGOCIACAO', 'RESERVADO']

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
// removed: veículos que a PRÓPRIA importação desativou (saíram do feed) — só esses voltam sozinhos.
interface ImportState { map: Record<string, string>; slugs: Record<string, string>; origins: Record<string, FeedOrigin>; removed: Record<string, true>; last?: FeedImportResult }

export function feedImportSources(env = process.env.SITE_FEED_IMPORT): FeedImportSource[] {
  return String(env ?? '').split(';').map((s) => s.trim()).filter(Boolean).flatMap((s) => {
    const [tenantId, url] = s.split('|').map((x) => x?.trim())
    return tenantId && /^https:\/\//i.test(url ?? '') ? [{ tenantId, url: url! }] : []
  })
}

const stateKey = (tenantId: string) => `t:${tenantId}:site:feedimport:v1`

async function loadState(tenantId: string): Promise<ImportState> {
  const row = await prisma.systemSetting.findFirst({ where: { key: stateKey(tenantId) }, select: { value: true } })
  try { const s = JSON.parse(row?.value ?? '{}'); return { map: s.map ?? {}, slugs: s.slugs ?? {}, origins: s.origins ?? {}, removed: s.removed ?? {}, last: s.last } } catch { return { map: {}, slugs: {}, origins: {}, removed: {} } }
}

async function saveSetting(tenantId: string, key: string, data: unknown, description: string) {
  const value = JSON.stringify(data)
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key, value, tenantId, group: 'site', description } })
}

const saveState = (tenantId: string, state: ImportState) => saveSetting(tenantId, stateKey(tenantId), state, 'Importação de estoque do site (feed)')

// ── Parceiros pausados (Site › Configurações) ────────────────────────────────
// Carro de parceiro pausado não entra nem atualiza; os que estavam no estoque
// saem do site e dos anúncios. Fica em chave própria (não no estado da
// importação) para o cron, que grava o estado no fim, não desfazer a pausa.
// parked: veículos que a PAUSA desativou — voltam sozinhos ao reativar o parceiro.
interface PartnerBlocks { blocked: Record<string, { name: string; at: string }>; parked: Record<string, true> }

const partnersKey = (tenantId: string) => `t:${tenantId}:site:feedpartners:v1`

async function loadPartnerBlocks(tenantId: string): Promise<PartnerBlocks> {
  const row = await prisma.systemSetting.findFirst({ where: { key: partnersKey(tenantId) }, select: { value: true } })
  try { const s = JSON.parse(row?.value ?? '{}'); return { blocked: s.blocked ?? {}, parked: s.parked ?? {} } } catch { return { blocked: {}, parked: {} } }
}

/** Lê, altera e grava na hora (sem segurar cópia velha). */
async function updatePartnerBlocks(tenantId: string, fn: (b: PartnerBlocks) => void) {
  const b = await loadPartnerBlocks(tenantId)
  fn(b)
  await saveSetting(tenantId, partnersKey(tenantId), b, 'Parceiros pausados na importação do site')
}

const originRef = (o: FeedOrigin | null | undefined) => (o?.partnerName?.trim() ? partnerRefFromName(o.partnerName) : null)

// Em negociação/vendido no SaaS a pausa não mexe.
const IN_SALE = ['VENDIDO', 'EM_NEGOCIACAO']

export function feedImportSourceFor(tenantId: string): FeedImportSource | null {
  return feedImportSources().find((s) => s.tenantId === tenantId) ?? null
}

export interface FeedPartner { ref: string; name: string; city: string | null; onSite: number; total: number; blocked: boolean; blockedAt: string | null }

/** Parceiros que chegam pelo feed, com quantos carros estão no site. */
export async function listFeedPartners(tenantId: string): Promise<FeedPartner[]> {
  const [state, blocks] = await Promise.all([loadState(tenantId), loadPartnerBlocks(tenantId)])
  const byVehicle = Object.entries(state.origins).flatMap(([id, o]) => { const ref = originRef(o); return ref ? [{ id, ref, o }] : [] })
  const vehicles = byVehicle.length
    ? await prisma.vehicle.findMany({ where: { tenantId, id: { in: byVehicle.map((x) => x.id) } }, select: { id: true, active: true, stockStatus: true } })
    : []
  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const out = new Map<string, FeedPartner>()
  for (const { id, ref, o } of byVehicle) {
    const v = vById.get(id)
    if (!v) continue
    const p = out.get(ref) ?? { ref, name: o.partnerName!.trim(), city: o.partnerCity ?? null, onSite: 0, total: 0, blocked: false, blockedAt: null }
    p.total++
    if (v.active && (SITE_VISIBLE_STOCK as readonly string[]).includes(v.stockStatus ?? '')) p.onSite++
    out.set(ref, p)
  }
  for (const [ref, b] of Object.entries(blocks.blocked)) {
    const p = out.get(ref) ?? { ref, name: b.name, city: null, onSite: 0, total: 0, blocked: false, blockedAt: null }
    out.set(ref, { ...p, blocked: true, blockedAt: b.at })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/**
 * Pausa: desativa na hora os carros do parceiro (fora os em negociação/vendidos)
 * e devolve os ids para retirar os anúncios. Reativar: só tira a pausa — a
 * próxima importação traz os carros de volta (e os anúncios retirados).
 */
export async function setFeedPartnerBlocked(tenantId: string, ref: string, block: boolean): Promise<{ deactivated: string[] }> {
  if (!block) {
    await updatePartnerBlocks(tenantId, (b) => { delete b.blocked[ref] })
    return { deactivated: [] }
  }
  const state = await loadState(tenantId)
  const mine = Object.entries(state.origins).filter(([, o]) => originRef(o) === ref)
  const name = mine[0]?.[1].partnerName?.trim()
  const prev = (await loadPartnerBlocks(tenantId)).blocked[ref]
  if (!name && !prev) throw new Error('Parceiro não encontrado.')
  const rows = mine.length
    ? await prisma.vehicle.findMany({ where: { tenantId, id: { in: mine.map(([id]) => id) }, active: true, stockStatus: { notIn: IN_SALE as never[] } }, select: { id: true } })
    : []
  const ids = rows.map((r) => r.id)
  if (ids.length) await prisma.vehicle.updateMany({ where: { tenantId, id: { in: ids } }, data: { active: false, exitDate: new Date() } })
  await updatePartnerBlocks(tenantId, (b) => {
    b.blocked[ref] = { name: name ?? prev!.name, at: prev?.at ?? new Date().toISOString() }
    for (const id of ids) b.parked[id] = true
  })
  return { deactivated: ids }
}

/**
 * Lojas parceiras do site antigo → Cadastros › Lojas parceiras (só SELECT lá).
 * Cria as que faltam e completa campos vazios; não sobrescreve edição feita no SaaS.
 */
async function syncLegacyPartners(tenantId: string) {
  const url = process.env.SITE_FEED_LEGACY_DB
  if (!url) return
  neonConfig.webSocketConstructor = ws
  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    const { rows } = await pool.query<Record<string, string | boolean | null>>(
      `SELECT name, legal_name, cnpj, responsible_name, whatsapp, email, city, address, instagram, website, commission, notes, active
         FROM partners WHERE NULLIF(BTRIM(name), '') IS NOT NULL`,
    )
    for (const r of rows) {
      const id = await ensurePartnerStoreByName(tenantId, String(r.name), { city: (r.city as string) || null, whatsapp: (r.whatsapp as string) || null })
      const cur = await prisma.supplier.findUnique({ where: { id } })
      if (!cur) continue
      const fill: Record<string, string> = {}
      const map: Array<[keyof typeof cur, string]> = [['legalName', 'legal_name'], ['document', 'cnpj'], ['repName', 'responsible_name'], ['email', 'email'], ['address', 'address'], ['commission', 'commission']]
      for (const [k, col] of map) {
        const v = String(r[col] ?? '').trim()
        if (v && !cur[k]) fill[k as string] = k === 'document' ? v.replace(/\D/g, '') : v
      }
      if (fill.document) fill.personType = fill.document.length === 11 ? 'PF' : 'PJ'
      if (Object.keys(fill).length) await prisma.supplier.update({ where: { id }, data: fill })
    }
  } finally {
    await pool.end().catch(() => {})
  }
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
    mainPhotoUrl: realPhotoUrls(item.photos)[0] ?? null,
    ...(item.inspected ? { cautelarStatus: 'APROVADA' as const } : {}),
  }
}

async function writePhotos(vehicleId: string, all: string[]) {
  const photos = realPhotoUrls(all) // arte "em breve" do site antigo não vira foto
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
    create: { tenantId, vehicleId, ...data, publishedAt: realPhotoUrls(item.photos).length ? new Date() : null },
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
    await syncLegacyPartners(src.tenantId).catch((e) => console.error('[feed-import] parceiros do site antigo', e instanceof Error ? e.message : e))
    const blocks = await loadPartnerBlocks(src.tenantId)
    // Sem o banco do site antigo o item vem sem parceiro: usa a origem já gravada do carro.
    const isBlocked = (i: Item) => { const ref = originRef(i.extras.origin ?? state.origins[state.map[i.extId] ?? '']); return !!ref && !!blocks.blocked[ref] }
    const merged: Item[] = parsed.map((i) => mergeLegacy(i, legacy.get(i.extId)))
    // Parceiro pausado: os carros dele ficam fora (não criam, não atualizam, saem do site).
    const items = merged.filter((i) => !isBlocked(i))
    const blockedExt = merged.filter(isBlocked).map((i) => i.extId)
    const enrichInfo = { enriched: items.filter((i) => legacy.has(i.extId)).length, ...(legacyError ? { legacyError } : {}) }

    const known = Object.values(state.map)
    const existing = known.length
      ? await prisma.vehicle.findMany({ where: { id: { in: known }, tenantId: src.tenantId }, select: { id: true, plate: true, createdAt: true, exitDate: true, active: true, stockStatus: true, photos: { select: { url: true }, orderBy: { order: 'asc' } }, siteListing: { select: { photosLocked: true } } } })
      : []
    const byId = new Map(existing.map((v) => [v.id, v]))
    // Vínculo para veículo apagado no SaaS: esquece e recria.
    for (const [ext, id] of Object.entries(state.map)) if (!byId.has(id)) delete state.map[ext]
    state.map = relinkByPlate(items, state.map, existing)
    const activeIds = new Set(existing.filter((v) => v.active).map((v) => v.id))

    const plan = planFeedSync(items, state.map, activeIds)
    // Carro de parceiro pausado em negociação/vendido no SaaS não é desativado.
    const inSale = new Set(blockedExt.map((ext) => state.map[ext]).filter((id) => id && IN_SALE.includes(byId.get(id)?.stockStatus ?? '')))
    if (inSale.size) plan.remove = plan.remove.filter((id) => !inSale.has(id))
    if (plan.aborted) {
      result = { ...base, ok: false, feed: items.length, aborted: plan.aborted, ...enrichInfo }
    } else {
      const unit = await prisma.unit.findFirst({ where: { tenantId: src.tenantId }, orderBy: { createdAt: 'asc' }, select: { id: true } })
      let created = 0
      let updated = 0
      const revived: Array<{ id: string; since: Date }> = []
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
        await applyFeedOrigin(src.tenantId, v.id, item.extras.origin, true)
        if (realPhotoUrls(item.photos).length) await writePhotos(v.id, item.photos)
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
        // Só reativa o que a importação desativou; apagado/vendido no SaaS fica como está.
        const revive = !!cur && !cur.active && (state.removed[vehicleId] === true || blocks.parked[vehicleId] === true)
        const reviveData = revive
          ? { active: true, exitDate: null, ...(KEEP_STOCK.includes(cur.stockStatus ?? '') ? {} : { stockStatus: item.extras.reserved ? 'RESERVADO' as const : 'DISPONIVEL' as const }) }
          : {}
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { ...data, ...(locked ? {} : { mainPhotoUrl }), ...reservedSync, ...reviveData },
        })
        delete state.removed[vehicleId]
        if (revive) revived.push({ id: vehicleId, since: cur.exitDate ?? new Date(0) })
        if (!locked && !samePhotos(cur?.photos.map((p) => p.url) ?? [], realPhotoUrls(item.photos))) await writePhotos(vehicleId, item.photos)
        await upsertListing(src.tenantId, vehicleId, item)
        if (item.legacySlug) state.slugs[item.legacySlug] = vehicleId
        if (item.extras.origin) state.origins[vehicleId] = item.extras.origin
        await applyFeedOrigin(src.tenantId, vehicleId, item.extras.origin, false)
        updated++
      }
      if (plan.remove.length) {
        await prisma.vehicle.updateMany({ where: { id: { in: plan.remove }, tenantId: src.tenantId }, data: { active: false, exitDate: new Date() } })
        for (const id of plan.remove) state.removed[id] = true
      }
      const unparked = revived.map((r) => r.id).filter((id) => blocks.parked[id])
      if (unparked.length) await updatePartnerBlocks(src.tenantId, (b) => { for (const id of unparked) delete b.parked[id] })
      // Saiu do feed e voltou: os anúncios retirados pela saída voltam ao ar (site incluso).
      if (revived.length) await import('@/lib/publications/service').then((m) => m.resumeAfterRestock(src.tenantId, revived)).catch((e) => console.error('[feed-import] reativar anúncios', e instanceof Error ? e.message : e))
      result = { ...base, ok: true, feed: items.length, created, updated, removed: plan.remove.length, aborted: null, ...enrichInfo }
    }
  } catch (e) {
    result = { ...base, ok: false, aborted: null, error: e instanceof Error ? e.message : String(e) }
  }
  state.last = result
  await saveState(src.tenantId, state)
  return result
}

/**
 * Origem do site antigo → colunas do veículo (originType + loja parceira
 * cadastrada). Na atualização só preenche se o SaaS ainda não tiver origem:
 * o que a loja definir no painel (Publicações) prevalece.
 */
export async function applyFeedOrigin(tenantId: string, vehicleId: string, origin: FeedOrigin | null, isNew: boolean) {
  const type = normalizeOrigin(origin?.originType)
  if (!origin || !type) return
  try {
    if (!isNew) {
      const cur = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { originType: true } })
      if (cur?.originType) return
    }
    const partnerStoreId = type === 'PARTNER' && origin.partnerName
      ? await ensurePartnerStoreByName(tenantId, origin.partnerName, { city: origin.partnerCity, whatsapp: origin.partnerWhatsapp })
      : null
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { originType: type, partnerStoreId } })
  } catch (e) {
    console.error('[feed-import] origem não aplicada', vehicleId, e instanceof Error ? e.message : e)
  }
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
