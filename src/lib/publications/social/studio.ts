// =============================================================================
// Estúdio social — serviço (servidor): identidade da loja, arte a partir do
// link assinado, prévia na tela e vídeo do Reels guardado para a rede baixar.
// =============================================================================

import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { loadSiteConfig } from '@/lib/site/config'
import { readSiteAsset } from '@/lib/site/assets'
import { fuelLabel, gearLabel, type ListingPayload } from '../content-core'
import { originalBytes } from '../media'
import type { MediaClaims } from '../media-token'
import { fetchImageSafely } from '../safe-fetch'
import { loadPublicationSettings } from '../settings'
import { renderArt } from './art'
import { maybeEnhance } from './enhance'
import { isArtTemplate, isSocialFormat, type ArtTemplate, type SocialFormat } from './formats'
import { designCtxOf, planFor, renderArtClip, renderReel, sceneBases, sceneStillOf, type ReelInput } from './reel'
import { photoScenes, REEL_TIMING, type ReelSegment } from './reel-core'
import { DESIGNS, isDesignStyle, type DesignStyle } from './design-styles'
import { designArt } from './design-render'

export const SOCIAL_VIDEO_KIND = 'SOCIAL_VIDEO'

export interface Brand { storeName: string; primaryColor: string; darkColor: string; whatsapp: string; instagram: string; logo: Buffer | null; site?: string }

const ASSET = /\/api\/site\/assets\/([a-z0-9]{10,40})/i
export const photoRef = (tenantId: string, url: string) => { const m = ASSET.exec(url); return m ? { t: tenantId, a: m[1] } : { t: tenantId, u: url } }

async function logoBytes(url: string): Promise<Buffer | null> {
  if (!url) return null
  try {
    const m = ASSET.exec(url)
    if (m) { const a = await readSiteAsset(m[1]); return a ? Buffer.from(a.data) : null }
    return /^https:\/\//i.test(url) ? (await fetchImageSafely(url)).bytes : null
  } catch { return null }
}

/** Nome, cores, logo e contatos da loja (site da loja + Central de Publicações). */
export async function loadBrand(tenantId: string): Promise<Brand> {
  const [site, settings, tenant] = await Promise.all([
    loadSiteConfig(tenantId).catch(() => null),
    loadPublicationSettings(tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, nomeFantasia: true } }),
  ])
  const id = site?.identity
  return {
    storeName: id?.name || tenant?.nomeFantasia || tenant?.name || 'Nossa loja',
    primaryColor: id?.primaryColor || '#16a34a',
    darkColor: id?.darkColor || '#061b29',
    whatsapp: settings.contacts.whatsapp || settings.contacts.phone || '',
    instagram: settings.contacts.instagram || '',
    site: settings.contacts.site || '',
    logo: await logoBytes(id?.logoUrl || ''),
  }
}

type Facts = { brand: string | null; model: string | null; version: string | null; year: number | null; modelYear: number | null; km: number | null; transmission: string | null }

function artFacts(v: Facts) {
  return { brand: v.brand, model: v.model, version: v.version, year: v.year, modelYear: v.modelYear, km: v.km, gear: gearLabel(v.transmission) }
}

/** Desenha a arte pedida pelo link assinado (rota pública de mídia). */
export async function artFromClaims(c: MediaClaims): Promise<Buffer> {
  const x = c.x!
  const format: SocialFormat = isSocialFormat(x.f) ? x.f : 'POST'
  const template: ArtTemplate = isArtTemplate(x.k) ? x.k : 'OFERTA'
  const [photo, brand, v] = await Promise.all([
    originalBytes(c),
    loadBrand(c.t),
    prisma.vehicle.findFirst({ where: { id: x.v, tenantId: c.t }, select: { brand: true, model: true, version: true, year: true, modelYear: true, km: true, transmission: true } }),
  ])
  if (!v) throw new Error('Veículo não encontrado.')
  const input = { ...artFacts(v), ...brand, logo: brand.logo, format, template, price: x.p ?? null, oldPrice: x.o ?? null, photo: await maybeEnhance(c.t, photo) }
  return isDesignStyle(x.d) ? designArtOf(x.d, input) : renderArt(input)
}

/** Arte no modelo visual escolhido (Post/Carrossel 4:5, Story/Reels 9:16). */
async function designArtOf(style: DesignStyle, i: Parameters<typeof renderArt>[0]): Promise<Buffer> {
  const ctx = designCtxOf({ ...i, template: i.template }, style)
  const { spec: _spec, ...c } = ctx
  void _spec
  return designArt(style, c, i.photo, i.format === 'STORY' || i.format === 'REELS' ? 'STORY' : 'POST')
}

/** Prévia na tela (usuário logado da loja): mesma arte que vai para a rede. */
export async function previewArt(tenantId: string, vehicleId: string, photoUrl: string, format: SocialFormat, template: ArtTemplate, price: number | null, oldPrice: number | null, opts: { forVideo?: boolean; endCard?: boolean; design?: DesignStyle | null } = {}): Promise<Buffer> {
  const [photo, brand, v] = await Promise.all([
    originalBytes(photoRef(tenantId, photoUrl)),
    loadBrand(tenantId),
    prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: { brand: true, model: true, version: true, year: true, modelYear: true, km: true, transmission: true } }),
  ])
  if (!v) throw new Error('Veículo não encontrado.')
  const { design, ...rest } = opts
  const input = { ...artFacts(v), ...brand, logo: brand.logo, format, template, price, oldPrice, photo: await maybeEnhance(tenantId, photo), ...rest }
  if (design) return designArtOf(design, input)
  return renderArt(input, { quality: 80 })
}

async function storeVideo(tenantId: string, mp4: Buffer): Promise<string> {
  const sha256 = createHash('sha256').update(mp4).digest('hex')
  const existing = await prisma.siteAsset.findFirst({ where: { tenantId, kind: SOCIAL_VIDEO_KIND, sha256 }, select: { id: true } })
  if (existing) return existing.id
  const a = await prisma.siteAsset.create({ data: { tenantId, kind: SOCIAL_VIDEO_KIND, mimeType: 'video/mp4', fileSize: mp4.length, width: 720, height: 1280, sha256, data: new Uint8Array(mp4) }, select: { id: true } })
  return a.id
}

const factsOfPayload = (p: ListingPayload) => artFacts({ brand: p.vehicle.brand ?? null, model: p.vehicle.model ?? null, version: p.vehicle.version ?? null, year: p.vehicle.year ?? null, modelYear: p.vehicle.modelYear ?? null, km: p.vehicle.km ?? null, transmission: p.vehicle.transmission ?? null })

/** Foto reduzida para o vídeo (1600 px bastam para 1080×1920): tratar a original custa muito tempo. */
async function forVideo(b: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(b, { failOn: 'none' }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer()
}

/**
 * Gera o vídeo do anúncio e guarda o MP4 (site_assets) para a rede baixar.
 *   REELS: todas as fotos + quadro final.  CLIP: uma arte com zoom (Story,
 *   capa de Carrossel, Post com música). `audio` = trilha CC0 embutida.
 * Mesmo conteúdo = mesmo arquivo (reaproveita pelo hash).
 */
export async function renderAndStoreVideo(tenantId: string, p: ListingPayload, kind: 'REELS' | 'CLIP', format: SocialFormat, template: ArtTemplate, audioIn: Buffer | null | Promise<Buffer | null>): Promise<{ assetId: string; seconds: number; mp4: Buffer; timing?: string }> {
  const t0 = Date.now()
  const brand = await loadBrand(tenantId)
  // Só as fotos que o vídeo usa (tratar foto custa tempo no servidor).
  const need = kind === 'REELS' ? Math.min(REEL_TIMING.maxPhotos, photoScenes(p.social?.seconds ?? 30, DESIGNS[p.social?.design ?? 'CLASSICO'].motion === 'dinamico') + 1) : 1
  // Em paralelo (leitura do banco + tratamento), mantendo a ordem; foto inacessível é pulada.
  const loadedPhotos = await Promise.all(p.photos.slice(0, need).map((url) => originalBytes(photoRef(tenantId, url)).then(forVideo).then((b) => maybeEnhance(tenantId, b)).catch(() => null)))
  const photos = loadedPhotos.filter((x): x is Buffer => !!x)
  const audio = await audioIn
  if (!photos.length) throw new Error('Nenhuma foto do veículo pôde ser aberta para montar o vídeo.')
  const loaded = Date.now() - t0
  const base = { ...factsOfPayload(p), ...brand, logo: brand.logo, template, price: p.price, oldPrice: p.oldPrice }
  const design = p.social?.design ?? null
  const still = { ...base, photo: photos[0], format: (format === 'STORY' ? 'STORY' : 'POST') as SocialFormat }
  const out = kind === 'REELS'
    ? await renderReel({ ...reelInputOf(p, base), photos, audio })
    : await renderArtClip(design ? await designArtOf(design, still) : await renderArt(still, { quality: 90 }), format === 'STORY' ? 10 : 12, audio)
  const t1 = Date.now()
  const assetId = await storeVideo(tenantId, out.mp4)
  const timing = `fotos ${loaded} ms; ${'timing' in out && out.timing ? out.timing : 'vídeo'}; gravação ${Date.now() - t1} ms`
  return { assetId, seconds: out.seconds, mp4: out.mp4, timing }
}

/** Dados do Reels deste anúncio (modelo visual e duração vêm de `p.social`). */
function reelInputOf(p: ListingPayload, base: Omit<ReelInput, 'photos' | 'fuel' | 'options' | 'conditions' | 'design' | 'seconds'>): Omit<ReelInput, 'photos'> {
  return { ...base, fuel: fuelLabel(p.vehicle.fuel), options: p.options, conditions: p.conditions, design: p.social?.design ?? 'CLASSICO', seconds: p.social?.seconds ?? 30 }
}

/** Roteiro do Reels deste anúncio (o mesmo do vídeo gerado). */
export function reelPlanFor(p: ListingPayload, template: ArtTemplate): ReelSegment[] {
  const base = { ...factsOfPayload(p), storeName: '', template, price: p.price, oldPrice: p.oldPrice }
  return planFor(Math.min(REEL_TIMING.maxPhotos, p.photos.length), reelInputOf(p, base))
}

/** Quadro parado de uma cena do Reels (prévia na tela), igual ao vídeo. */
export async function reelPreviewFrame(tenantId: string, p: ListingPayload, template: ArtTemplate, index: number): Promise<Buffer> {
  const segs = reelPlanFor(p, template)
  const k = Math.max(0, Math.min(segs.length - 1, index))
  const seg = segs[k]
  const brand = await loadBrand(tenantId)
  const url = p.photos[seg.photo] ?? p.photos[0]
  if (!url) throw new Error('O veículo não tem fotos.')
  const photo = await maybeEnhance(tenantId, await originalBytes(photoRef(tenantId, url)))
  const input = reelInputOf(p, { ...factsOfPayload(p), ...brand, logo: brand.logo, template, price: p.price, oldPrice: p.oldPrice })
  const style = input.design ?? 'CLASSICO'
  const ctx = designCtxOf(input, style)
  return sceneStillOf(seg, await sceneBases([photo], style, ctx.brandColor)(0), ctx, k)
}

/** Compat: Reels sem trilha. */
export async function renderAndStoreReel(tenantId: string, p: ListingPayload, template: ArtTemplate): Promise<{ assetId: string; seconds: number; mp4: Buffer }> {
  return renderAndStoreVideo(tenantId, p, 'REELS', 'REELS', template, null)
}

/** Vídeos gerados com mais de 2 dias: a rede já baixou (leva minutos); libera espaço. */
export async function pruneSocialVideos(days = 2): Promise<number> {
  const r = await prisma.siteAsset.deleteMany({ where: { kind: SOCIAL_VIDEO_KIND, createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } }).catch(() => ({ count: 0 }))
  return r.count
}
