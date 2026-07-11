// =============================================================================
// DELETE /api/crm/leads/[id]/vehicles/[vehicleId] — remove (soft) veículo do lead.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, ctxArg: { params: { id: string; vehicleId: string } | Promise<{ id: string; vehicleId: string }> }) {
  const { id, vehicleId } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.vehicle.manage')) return forbiddenResponse('Sem permissão.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const entry = await prisma.crmLeadVehicle.findFirst({ where: { id: vehicleId, leadId: id, tenantId } })
    if (!entry) return NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 })
    // Soft-remove: preserva histórico.
    await prisma.crmLeadVehicle.update({ where: { id: vehicleId }, data: { removedAt: new Date(), removedReason: 'Removido pelo usuário' } })
    return NextResponse.json({ success: true })
  } catch (err) { return handlePrismaError(err) }
}
