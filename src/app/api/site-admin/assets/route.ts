// =============================================================================
// POST /api/site-admin/assets — envia um arquivo do site (logo, versão clara,
// favicon, imagem). multipart: file, kind. Gate: site.manage.
// Valida pelo conteúdo (PNG/JPEG/WebP), guarda no banco e devolve a URL pública.
// Mantém só os 3 envios mais recentes de cada tipo (os antigos saem).
// =============================================================================

import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { SITE_ASSET_KINDS, SITE_ASSET_MAX_BYTES, siteAssetUrl, sniffImage, type SiteAssetKind } from '@/lib/site/assets-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site.manage')) return forbiddenResponse('Sem permissão para configurar o site.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const kind = String(form?.get('kind') ?? '') as SiteAssetKind
  if (!(file instanceof Blob)) return NextResponse.json({ success: false, error: 'Arquivo não enviado.' }, { status: 400 })
  if (!SITE_ASSET_KINDS.includes(kind)) return NextResponse.json({ success: false, error: 'Tipo de arquivo inválido.' }, { status: 400 })
  if (file.size > SITE_ASSET_MAX_BYTES) return NextResponse.json({ success: false, error: 'Arquivo muito grande (máx. 2 MB).' }, { status: 413 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = sniffImage(bytes)
  if (!info) return NextResponse.json({ success: false, error: 'Envie uma imagem PNG, JPG ou WebP.' }, { status: 415 })

  try {
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const asset = await prisma.siteAsset.create({
      data: { tenantId, kind, mimeType: info.mime, fileSize: bytes.length, width: info.width, height: info.height, sha256, data: Buffer.from(bytes) },
      select: { id: true },
    })
    const old = await prisma.siteAsset.findMany({ where: { tenantId, kind }, orderBy: { createdAt: 'desc' }, skip: 3, select: { id: true } })
    if (old.length) await prisma.siteAsset.deleteMany({ where: { id: { in: old.map((o) => o.id) } } })
    return NextResponse.json({ success: true, data: { id: asset.id, url: siteAssetUrl(asset.id), width: info.width, height: info.height } }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
