// GET /api/site-admin/lead-photos/[id] — uma foto enviada pelo cliente. Só para
// quem enxerga o lead no CRM (mesma loja e mesmo escopo). Cache privado.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readSiteAsset } from '@/lib/site/assets'
import { getSessionUser } from '@/lib/auth-guards'
import { resolveActingTenant } from '@/lib/acting-tenant'
import { canAccessLeadByScope, resolveCrmScope } from '@/lib/crm/shared'

export const runtime = 'nodejs'

const notFound = () => new NextResponse('Não encontrado', { status: 404 })

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new NextResponse('Não autorizado', { status: 401 })
  const { id } = await params
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return notFound()
  const tenantId = await resolveActingTenant(user, req)
  const scope = await resolveCrmScope(user)
  if (!tenantId || !scope) return notFound()
  const stored = await readSiteAsset(id).catch(() => null)
  const asset = stored && stored.tenantId === tenantId && stored.kind === 'LEAD_PHOTO' ? stored : null
  if (!asset) return notFound()
  const lead = await prisma.marketingLead.findFirst({
    where: { tenantId, metadata: { path: ['sitePhotos'], array_contains: [id] } },
    select: { assignedToUserId: true, unitId: true },
  }).catch(() => null)
  if (!lead || !canAccessLeadByScope(scope, user, lead)) return notFound()
  const body = new Uint8Array(asset.data)
  return new NextResponse(body, {
    headers: {
      'Content-Type': asset.mimeType, 'Content-Length': String(body.length),
      'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'",
    },
  })
}
