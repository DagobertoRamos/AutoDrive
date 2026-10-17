// PUT /api/site-admin/listings/[vehicleId] — edita o anúncio do carro no site
// (destaque, esconder, título, descrição, opcionais, vídeo, SEO). Gate: site.manage.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { sanitizeListingInput } from '@/lib/site/listing-input'
import { refreshSiteVehicles } from '@/lib/site/vehicles'
import { logEvent } from '@/lib/publications/service'

export const dynamic = 'force-dynamic'

export async function PUT(req: Request, { params }: { params: Promise<{ vehicleId: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site.manage')) return forbiddenResponse('Sem permissão para editar anúncios.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { vehicleId } = await params
  const parsed = sanitizeListingInput(await req.json().catch(() => ({})))
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })

  try {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: { id: true } })
    if (!vehicle) return NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 })
    const v = parsed.value
    const before = await prisma.siteListing.findUnique({ where: { vehicleId }, select: { hidden: true } })
    const listing = await prisma.siteListing.upsert({
      where: { vehicleId },
      create: { tenantId, vehicleId, ...v },
      update: v,
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SiteListing', entityId: vehicleId, userName: user.name, userRole: user.role, afterData: v })
    // Esconder/mostrar aqui = pausar/reativar o anúncio do SITE na Central de
    // Publicações (o site já reflete pelo siteListing; só alinha o estado).
    if ((before?.hidden ?? false) !== v.hidden) {
      const pub = await prisma.publication.findFirst({ where: { tenantId, vehicleId, channel: 'SITE', archivedAt: null }, orderBy: { updatedAt: 'desc' } })
      if (pub && (v.hidden ? pub.desiredState === 'PUBLICADO' : pub.desiredState === 'PAUSADO' && (!pub.pausedReason || pub.pausedReason === 'MANUAL'))) {
        const st = v.hidden ? 'PAUSADO' : 'PUBLICADO'
        await prisma.publication.update({ where: { id: pub.id }, data: { desiredState: st, status: st, confirmedState: st, pausedReason: v.hidden ? 'MANUAL' : null, remoteStatus: v.hidden ? 'ESCONDIDO' : null, lastVerifiedAt: new Date(), generation: pub.generation + 1 } })
        await logEvent(prisma, { tenantId, publicationId: pub.id, vehicleId, channel: 'SITE', type: v.hidden ? 'PAUSAR' : 'RETOMAR', message: v.hidden ? 'Escondido do site em Site › Anúncios.' : 'Mostrado no site em Site › Anúncios.', fromStatus: pub.status, toStatus: st, actor: { id: user.id, name: user.name, role: user.role } })
      }
    }
    refreshSiteVehicles(tenantId)
    return NextResponse.json({ success: true, data: listing })
  } catch (err) {
    return handlePrismaError(err)
  }
}
