// =============================================================================
// Google Drive — ACERVO das imagens da loja (fotos do estoque, logos, banners).
// Não muda como o site serve as imagens (site_assets + CDN, rápido e quase sem
// custo de banco): aqui só fica uma cópia organizada no Drive da loja.
//   Fotos do estoque/<MM-AAAA da entrada>/<Marca Modelo - PLACA>/Foto N.jpg
//   Site/<Logos|Banners|Imagens>/
// Vínculo em drive_files com a chave `asset://<id>`. Apagar a imagem no
// sistema NÃO apaga o acervo (é guarda).
// =============================================================================

import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readSiteAsset } from '@/lib/site/assets'
import { siteAssetUrl } from '@/lib/site/assets-core'
import { drivePath } from './drive-core'
import { driveEnabled } from './drive'
import { putKeyOnDrive } from './drive-keys'

/** Tipos de imagem que entram no acervo (vídeos e fotos temporárias ficam fora). */
export const ARCHIVE_KINDS = ['VEHICLE_PHOTO', 'LOGO', 'LOGO_LIGHT', 'FAVICON', 'DOC_LOGO', 'BANNER', 'IMAGE'] as const
const ARCHIVE_SET = new Set<string>(ARCHIVE_KINDS)

const SITE_LEAF: Record<string, string> = { LOGO: 'Logos', LOGO_LIGHT: 'Logos', FAVICON: 'Logos', DOC_LOGO: 'Logos', BANNER: 'Banners', IMAGE: 'Imagens' }
const SITE_LABEL: Record<string, string> = { LOGO: 'Logo', LOGO_LIGHT: 'Logo clara', FAVICON: 'Favicon', DOC_LOGO: 'Logo dos documentos', BANNER: 'Banner', IMAGE: 'Imagem' }
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export const assetDriveKey = (id: string) => `asset://${id}`

async function storeName(tenantId: string): Promise<string> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, nomeFantasia: true } }).catch(() => null)
  return t?.nomeFantasia?.trim() || t?.name?.trim() || 'Loja'
}

/** Copia uma imagem para o acervo. false = não se aplica, já copiada ou Drive desconectado. */
export async function archiveAssetToDrive(id: string): Promise<boolean> {
  const key = assetDriveKey(id)
  if (await prisma.driveFile.findUnique({ where: { key }, select: { key: true } })) return false
  if (!(await driveEnabled())) return false
  const asset = await readSiteAsset(id)
  if (!asset || !ARCHIVE_SET.has(asset.kind)) return false
  const store = await storeName(asset.tenantId)
  const ext = EXT[asset.mimeType] ?? 'img'
  let path: string[]
  let fileName: string
  if (asset.kind === 'VEHICLE_PHOTO') {
    const vp = await prisma.vehiclePhoto.findFirst({
      where: { url: siteAssetUrl(id) },
      select: { order: true, vehicle: { select: { brand: true, model: true, plate: true, entryDate: true, createdAt: true } } },
    })
    const v = vp?.vehicle
    path = v
      ? drivePath({ store, area: 'STOCK_PHOTOS', date: v.entryDate ?? v.createdAt, vehicle: v })
      : drivePath({ store, area: 'STOCK_PHOTOS', date: new Date(), leaf: 'Sem veículo' })
    fileName = `Foto ${String((vp?.order ?? 0) + 1).padStart(2, '0')} - ${id}.${ext}`
  } else {
    path = drivePath({ store, area: 'SITE', date: new Date(), leaf: SITE_LEAF[asset.kind] })
    fileName = `${SITE_LABEL[asset.kind] ?? 'Imagem'} - ${id}.${ext}`
  }
  await putKeyOnDrive({ key, path, fileName, mimeType: asset.mimeType, bytes: Buffer.from(asset.data), tenantId: asset.tenantId })
  return true
}

/** Agenda a cópia para depois da resposta (fora de requisição, a rotina de 6 h leva). */
export function scheduleAssetArchive(id: string, kind: string) {
  if (!ARCHIVE_SET.has(kind)) return
  const run = () => archiveAssetToDrive(id).then(() => undefined).catch((e) => console.warn('[drive-assets] acervo', id, e instanceof Error ? e.message : e))
  try { after(run) } catch { /* fora de requisição: a migração periódica copia */ }
}

/** Imagens que ainda não têm cópia no acervo. */
export async function assetsToArchive(take: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT a.id FROM site_assets a
    WHERE a.kind = ANY(${[...ARCHIVE_KINDS]}::text[])
      AND NOT EXISTS (SELECT 1 FROM drive_files f WHERE f.key = 'asset://' || a.id)
    ORDER BY a."createdAt" ASC LIMIT ${take}`
  return rows.map((r) => r.id)
}

export async function assetsToArchiveCount(): Promise<number> {
  const r = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM site_assets a
    WHERE a.kind = ANY(${[...ARCHIVE_KINDS]}::text[])
      AND NOT EXISTS (SELECT 1 FROM drive_files f WHERE f.key = 'asset://' || a.id)`
  return Number(r[0]?.n ?? 0)
}
