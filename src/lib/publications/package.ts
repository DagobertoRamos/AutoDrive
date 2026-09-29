// =============================================================================
// Pacote para anúncio (servidor): textos, fotos tratadas (luz/cor/nitidez e,
// se pedida, a identidade da loja com WhatsApp) e o vídeo vertical do carro.
// Cada arquivo sai separado (limite de resposta do servidor); o .zip é
// fechado no navegador.
// =============================================================================

import type { DesignStyle, VideoSeconds } from './social/design-styles'
import { fuelLabel, gearLabel } from './content-core'
import { originalBytes } from './media'
import { buildFor, loadVehicle, payloadContext } from './service'
import { packageFileBase, packageTexts } from './package-core'
import type { BrandMark } from './social/avulsa-core'
import { brandPhoto, tenantBrand } from './social/brand-frame'
import { enhancePhoto } from './social/enhance'
import type { ArtTemplate } from './social/formats'
import { audioToEmbed } from './social/music'
import type { MusicChoice } from './social/music-core'
import { photoRef, renderAndStoreVideo } from './social/studio'

async function load(tenantId: string, vehicleId: string) {
  const v = await loadVehicle(tenantId, vehicleId)
  if (!v) throw new Error('Veículo não encontrado nesta loja.')
  const ctx = await payloadContext(tenantId)
  const p = await buildFor(tenantId, v, 'pacote', null, ctx)
  return { v, p, ctx }
}

export async function packageManifest(tenantId: string, vehicleId: string) {
  const { v, p, ctx } = await load(tenantId, vehicleId)
  const base = packageFileBase({ title: p.title, plate: v.plate })
  const texts = packageTexts({
    title: p.title, brand: p.vehicle.brand, model: p.vehicle.model, version: p.vehicle.version, year: p.vehicle.year, modelYear: p.vehicle.modelYear, km: p.vehicle.km,
    gear: gearLabel(p.vehicle.transmission), fuel: fuelLabel(p.vehicle.fuel), color: p.vehicle.color, plate: v.plate,
    price: p.price, oldPrice: p.oldPrice, description: p.description, conditions: p.conditions, caption: p.caption, options: p.options,
    storeName: p.storeName, city: p.location.city, whatsapp: ctx.settings.contacts.whatsapp, instagram: ctx.settings.contacts.instagram, site: ctx.settings.contacts.site,
  })
  return { base, title: p.title, photos: p.photos.length, texts, music: ctx.settings.autoPublish.social.music }
}

/** N-ª foto do anúncio: tratada (luz/cor/nitidez) e, se pedido, com a identidade da loja. */
export async function packagePhoto(tenantId: string, vehicleId: string, n: number, opts: { treat: boolean; brand: BrandMark | null }): Promise<Buffer> {
  const { p } = await load(tenantId, vehicleId)
  const url = p.photos[Math.max(0, Math.min(p.photos.length - 1, n))]
  if (!url) throw new Error('O veículo não tem fotos.')
  let img = await originalBytes(photoRef(tenantId, url))
  if (opts.treat) img = (await enhancePhoto(img)).bytes
  const sharp = (await import('sharp')).default
  if (opts.brand) return brandPhoto(img, await tenantBrand(tenantId), opts.brand)
  return sharp(img, { failOn: 'none' }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
}

/** Vídeo vertical (Reels) do carro, com música livre opcional. Guardado para baixar em partes. */
export async function packageVideo(tenantId: string, vehicleId: string, opts: { template: ArtTemplate; music: MusicChoice | null; design?: DesignStyle; seconds?: VideoSeconds }) {
  const { v, p: base } = await load(tenantId, vehicleId)
  const p = { ...base, social: { format: 'REELS' as const, template: opts.template, design: opts.design ?? 'CLASSICO', seconds: opts.seconds ?? 30 } }
  let audio: Buffer | null = null
  const t0 = Date.now()
  if (opts.music) { try { audio = (await audioToEmbed(opts.music, v.id)).bytes } catch { audio = null } }
  const musicMs = Date.now() - t0
  const r = await renderAndStoreVideo(tenantId, p, 'REELS', 'REELS', opts.template, audio)
  return { assetId: r.assetId, seconds: r.seconds, size: r.mp4.length, music: !!audio, timing: `música ${musicMs} ms; ${r.timing ?? ''}` }
}
