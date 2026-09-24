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

/** Apaga banners enviados que não estão mais na config (com folga de 1h para
 *  quem enviou e ainda não salvou). */
export async function pruneUnusedBanners(tenantId: string, inUse: string[]): Promise<void> {
  const keep = inUse.map(assetIdFromUrl).filter((x): x is string => !!x)
  await prisma.siteAsset.deleteMany({
    where: { tenantId, kind: 'BANNER', id: { notIn: keep }, createdAt: { lt: new Date(Date.now() - 3600_000) } },
  }).catch(() => undefined)
}

/** Id do asset a partir da URL pública (/api/site/assets/<id>), ou null se for URL externa. */
export function assetIdFromUrl(url: string): string | null {
  const m = /^\/api\/site\/assets\/([a-z0-9]{10,40})$/i.exec(url)
  return m ? m[1] : null
}

export interface StoredAsset { tenantId: string; kind: string; mimeType: string; sha256: string; data: Uint8Array }

/**
 * Lê o arquivo de um asset. Via SQL com base64 porque o adapter Neon (usado em
 * produção) não consegue devolver colunas bytea pelo Prisma ("JS functions
 * cannot be represented as a serde_json::Value").
 */
export async function readSiteAsset(id: string): Promise<StoredAsset | null> {
  const rows = await prisma.$queryRaw<{ tenantId: string; kind: string; mimeType: string; sha256: string; b64: string }[]>`
    SELECT "tenantId", kind, "mimeType", sha256, encode(data, 'base64') AS b64 FROM site_assets WHERE id = ${id} LIMIT 1`
  const r = rows[0]
  if (!r) return null
  return { tenantId: r.tenantId, kind: r.kind, mimeType: r.mimeType, sha256: r.sha256, data: new Uint8Array(Buffer.from(r.b64, 'base64')) }
}
