// =============================================================================
// Conector: Site próprio (interno). Publicar = anúncio visível no site da loja
// com a capa e a ordem aprovadas. Confirmação: lê o anúncio pela MESMA regra
// da vitrine pública (siteVehicleState) — não basta ter gravado.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { loadSiteConfig, publicSiteRoot } from '@/lib/site/config'
import { siteVehicleState, vehicleSlug } from '@/lib/site/listing-core'
import { channelSpec } from '../channels'
import { ConnectorError } from '../errors'
import type { ListingPayload } from '../content-core'
import type { Connector, ConnectorContext, RemoteRef, RemoteResult } from './types'

const spec = channelSpec('SITE')!

function appOrigin(): string {
  return (process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

async function siteRoot(tenantId: string): Promise<string | null> {
  const cfg = await loadSiteConfig(tenantId)
  if (!cfg.enabled) return null
  return publicSiteRoot(cfg, process.env.SITE_BASE_DOMAIN, appOrigin())
}

async function readState(tenantId: string, vehicleId: string): Promise<RemoteResult> {
  const v = await prisma.vehicle.findFirst({
    where: { id: vehicleId, tenantId },
    select: {
      id: true, brand: true, model: true, version: true, modelYear: true, year: true, active: true, stockStatus: true,
      siteListing: { select: { hidden: true, photosStatus: true } }, _count: { select: { photos: true } },
    },
  })
  if (!v) return { state: 'NAO_ENCONTRADO', message: 'Veículo não existe mais no estoque.' }
  const st = siteVehicleState({ active: v.active, stockStatus: v.stockStatus }, v.siteListing ? { hidden: v.siteListing.hidden, photosStatus: v.siteListing.photosStatus } : null, v._count.photos)
  const root = await siteRoot(tenantId)
  const url = root ? `${root}/veiculos/${vehicleSlug(v)}` : null
  if (st === 'PUBLICADO') return root ? { state: 'PUBLICADO', remoteId: v.id, remoteUrl: url, remoteStatus: 'PUBLICADO' } : { state: 'EM_ANALISE', remoteId: v.id, message: 'Site da loja desativado: o anúncio só aparece quando o site estiver no ar.' }
  if (st === 'EM_BREVE') return { state: 'EM_ANALISE', remoteId: v.id, remoteUrl: url, remoteStatus: 'EM_BREVE', message: 'No site como "Em breve" (sem fotos).' }
  // Vendido/fora do estoque vendável = fora do site, mesmo que também esteja escondido.
  const stockVisible = v.active && ['DISPONIVEL', 'EM_PROMOCAO'].includes(String(v.stockStatus))
  if (stockVisible && v.siteListing?.hidden) return { state: 'PAUSADO', remoteId: v.id, remoteStatus: 'ESCONDIDO' }
  // Venda em andamento: a vitrine já oculta o carro — equivale a pausado.
  if (v.active && ['EM_NEGOCIACAO', 'RESERVADO'].includes(String(v.stockStatus))) return { state: 'PAUSADO', remoteId: v.id, remoteStatus: 'VENDA_EM_ANDAMENTO' }
  return { state: 'REMOVIDO', remoteId: v.id, remoteStatus: 'FORA_DO_SITE', message: 'Fora do site pela situação do estoque.' }
}

/** Aplica capa e ordem aprovadas às fotos que já estão na galeria. */
async function applyPhotoOrder(vehicleId: string, photos: string[]): Promise<void> {
  const gallery = await prisma.vehiclePhoto.findMany({ where: { vehicleId }, select: { id: true, url: true, order: true } })
  if (!gallery.length || !photos.length) return
  const pos = new Map(photos.map((u, i) => [u, i]))
  const known = gallery.filter((g) => pos.has(g.url)).sort((a, b) => pos.get(a.url)! - pos.get(b.url)!)
  const rest = gallery.filter((g) => !pos.has(g.url)).sort((a, b) => a.order - b.order)
  const ordered = [...known, ...rest]
  const same = ordered.every((g, i) => g.order === i) && ordered[0]?.url === gallery.find((x) => x.order === 0)?.url
  if (same) return
  await prisma.$transaction([
    ...ordered.map((g, i) => prisma.vehiclePhoto.update({ where: { id: g.id }, data: { order: i, isMain: i === 0 } })),
    prisma.vehicle.update({ where: { id: vehicleId }, data: { mainPhotoUrl: ordered[0].url } }),
  ])
}

async function setHidden(tenantId: string, vehicleId: string, hidden: boolean) {
  await prisma.siteListing.upsert({ where: { vehicleId }, create: { tenantId, vehicleId, hidden }, update: { hidden } })
}

export const siteConnector: Connector = {
  spec,
  async testConnection(ctx) {
    const root = await siteRoot(ctx.connection.tenantId)
    return root ? { ok: true, message: 'Site da loja no ar.', account: root } : { ok: false, message: 'Site da loja desativado. Ative em Site › Configurações.' }
  },
  async validate(_p, ctx) {
    const root = await siteRoot(ctx.connection.tenantId)
    return root ? [] : [{ field: 'site', severity: 'warning', message: 'O site da loja está desativado.', hint: 'Ative em Site › Configurações; o anúncio fica pronto e aparece quando o site entrar no ar.' }]
  },
  async publish(p: ListingPayload, ctx: ConnectorContext) {
    const tenantId = ctx.connection.tenantId
    const exists = await prisma.vehicle.count({ where: { id: p.vehicle.id, tenantId } })
    if (!exists) throw new ConnectorError('NOT_FOUND', 'Veículo não encontrado nesta loja.')
    await applyPhotoOrder(p.vehicle.id, p.photos)
    await setHidden(tenantId, p.vehicle.id, false)
    return readState(tenantId, p.vehicle.id)
  },
  async get(ref: RemoteRef, ctx) {
    return readState(ctx.connection.tenantId, ref.vehicleId)
  },
  async update(_ref, p, ctx) {
    await applyPhotoOrder(p.vehicle.id, p.photos)
    return readState(ctx.connection.tenantId, p.vehicle.id)
  },
  async pause(ref, ctx) {
    await setHidden(ctx.connection.tenantId, ref.vehicleId, true)
    return readState(ctx.connection.tenantId, ref.vehicleId)
  },
  async resume(_ref, p, ctx) {
    await setHidden(ctx.connection.tenantId, p.vehicle.id, false)
    return readState(ctx.connection.tenantId, p.vehicle.id)
  },
  async remove(ref, _reason, ctx) {
    const id = ref.vehicleId
    // Vendido/retirado já sai do site pela situação do estoque; esconder
    // garante a saída mesmo se o estoque ainda não foi atualizado.
    await setHidden(ctx.connection.tenantId, id, true)
    const r = await readState(ctx.connection.tenantId, id)
    return r.state === 'PAUSADO' ? { ...r, state: 'REMOVIDO' } : r
  },
}
