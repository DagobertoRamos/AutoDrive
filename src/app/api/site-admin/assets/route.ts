// =============================================================================
// POST /api/site-admin/assets — envia um arquivo do site (logo, versão clara,
// favicon, imagem). multipart: file, kind. Gate: site.manage.
// Valida pelo conteúdo (PNG/JPEG/WebP), guarda no banco e devolve a URL pública.
// Mantém só os 3 envios mais recentes de cada tipo (os antigos saem).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { SITE_ASSET_KINDS, SITE_ASSET_MAX_BYTES, type SiteAssetKind } from '@/lib/site/assets-core'
import { ImageRejected, storeTenantImage } from '@/lib/site/assets'

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

  try {
    const saved = await storeTenantImage(tenantId, kind, new Uint8Array(await file.arrayBuffer()))
    const old = await prisma.siteAsset.findMany({ where: { tenantId, kind }, orderBy: { createdAt: 'desc' }, skip: 3, select: { id: true } })
    if (old.length) await prisma.siteAsset.deleteMany({ where: { id: { in: old.map((o) => o.id) } } })
    return NextResponse.json({ success: true, data: saved }, { status: 201 })
  } catch (err) {
    if (err instanceof ImageRejected) return NextResponse.json({ success: false, error: err.message }, { status: 415 })
    return handlePrismaError(err)
  }
}
