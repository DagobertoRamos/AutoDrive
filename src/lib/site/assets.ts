// Grava imagens da loja no banco (tabela site_assets) — usado pelo painel do
// site (logo/favicon) e pelas fotos do estoque. Valida pelo conteúdo.
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { siteAssetUrl, sniffImage } from './assets-core'

export class ImageRejected extends Error {}

export async function storeTenantImage(tenantId: string, kind: string, bytes: Uint8Array): Promise<{ id: string; url: string; width: number | null; height: number | null }> {
  const info = sniffImage(bytes)
  if (!info) throw new ImageRejected('Envie imagens JPG, PNG ou WebP.')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const asset = await prisma.siteAsset.create({
    data: { tenantId, kind, mimeType: info.mime, fileSize: bytes.length, width: info.width, height: info.height, sha256, data: Buffer.from(bytes) },
    select: { id: true },
  })
  return { id: asset.id, url: siteAssetUrl(asset.id), width: info.width, height: info.height }
}

/** Id do asset a partir da URL pública (/api/site/assets/<id>), ou null se for URL externa. */
export function assetIdFromUrl(url: string): string | null {
  const m = /^\/api\/site\/assets\/([a-z0-9]{10,40})$/i.exec(url)
  return m ? m[1] : null
}
