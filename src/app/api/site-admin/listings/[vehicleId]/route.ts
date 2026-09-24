// PUT /api/site-admin/listings/[vehicleId] — edita o anúncio do carro no site
// (destaque, esconder, título, descrição, opcionais, vídeo, SEO). Gate: site.manage.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { sanitizeListingInput } from '@/lib/site/listing-input'

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
    const listing = await prisma.siteListing.upsert({
      where: { vehicleId },
      create: { tenantId, vehicleId, ...v },
      update: v,
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SiteListing', entityId: vehicleId, userName: user.name, userRole: user.role, afterData: v })
    return NextResponse.json({ success: true, data: listing })
  } catch (err) {
    return handlePrismaError(err)
  }
}
