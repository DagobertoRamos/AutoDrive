// =============================================================================
// Variantes de foto para os canais (servidor). Nunca recorta nem distorce o
// carro: só ajusta a largura máxima mantendo a proporção, corrige a rotação,
// tira metadados (EXIF/GPS) e entrega JPEG. Cor e lataria preservadas.
// Fotos da loja vêm do banco (site_assets, só tipo de veículo); fotos
// externas passam pelo download protegido contra SSRF.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { readSiteAsset } from '@/lib/site/assets'
import { fetchImageSafely } from './safe-fetch'
import type { MediaClaims } from './media-token'

const PUBLIC_KINDS = new Set(['VEHICLE_PHOTO', 'IMAGE'])

export class MediaNotFound extends Error {}

async function originalBytes(c: Pick<MediaClaims, 't' | 'a' | 'u'>): Promise<Buffer> {
  if (c.a) {
    const asset = await readSiteAsset(c.a)
    if (!asset || asset.tenantId !== c.t || !PUBLIC_KINDS.has(asset.kind)) throw new MediaNotFound('Foto não encontrada.')
    return Buffer.from(asset.data)
  }
  // URL externa: só se for foto cadastrada de um veículo DESTA loja.
  const owned = await prisma.vehiclePhoto.count({ where: { url: c.u!, vehicle: { tenantId: c.t } } })
  const original = owned ? 1 : await prisma.siteListing.count({ where: { tenantId: c.t, originalPhotos: { array_contains: [c.u!] } } }).catch(() => 0)
  if (!owned && !original) throw new MediaNotFound('Foto não pertence a esta loja.')
  return (await fetchImageSafely(c.u!)).bytes
}

export async function renderVariant(c: Pick<MediaClaims, 't' | 'a' | 'u' | 'w'>): Promise<Buffer> {
  const input = await originalBytes(c)
  const sharp = (await import('sharp')).default
  return sharp(input, { failOn: 'error' })
    .rotate()
    .resize({ width: c.w, withoutEnlargement: true, fit: 'inside' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer()
}

/** Confere se as fotos abrem e têm tamanho mínimo (prévia: "imagens inacessíveis"). */
export async function checkPhotos(tenantId: string, urls: string[], minWidth = 640): Promise<Array<{ url: string; ok: boolean; width?: number; height?: number; problem?: string }>> {
  const sharp = (await import('sharp')).default
  const out = []
  for (const url of urls.slice(0, 40)) {
    try {
      const m = /\/api\/site\/assets\/([a-z0-9]{10,40})/i.exec(url)
      const bytes = await originalBytes(m ? { t: tenantId, a: m[1] } : { t: tenantId, u: url })
      const meta = await sharp(bytes).metadata()
      const w = meta.autoOrient?.width ?? meta.width ?? 0; const h = meta.autoOrient?.height ?? meta.height ?? 0
      out.push({ url, ok: w >= minWidth, width: w, height: h, problem: w < minWidth ? `Resolução baixa (${w}×${h}); o mínimo recomendado é ${minWidth}px de largura.` : undefined })
    } catch (e) {
      out.push({ url, ok: false, problem: e instanceof MediaNotFound ? 'Foto não encontrada nesta loja.' : `Não foi possível abrir a foto: ${(e as Error).message}` })
    }
  }
  return out
}
