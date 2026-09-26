// =============================================================================
// PATCH /api/vehicles/[id]/pendencies/[pendencyId] — resolve/reabre uma
// pendência de estoque (ex.: "Recebimento do veículo"). Gate: stock.manage.
// Body: { resolved: boolean }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; pendencyId: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.manage')) return forbiddenResponse('Sem permissão para editar o estoque.')
  { const gate = await assertModuleEnabled(user, 'stock.view'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { id, pendencyId } = await ctx.params
    const body = await req.json().catch(() => ({})) as { resolved?: unknown }
    if (typeof body.resolved !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Informe resolved: true ou false.' }, { status: 400 })
    }

    const pend = await prisma.vehicleStockPendency.findFirst({
      where:  { id: pendencyId, vehicleId: id, vehicle: { ...tenantWhere(user.role, tenantId) } },
      select: { id: true, resolved: true, vehicle: { select: { tenantId: true } } },
    })
    if (!pend) return NextResponse.json({ success: false, error: 'Pendência não encontrada.' }, { status: 404 })

    const updated = await prisma.vehicleStockPendency.update({
      where: { id: pendencyId },
      data:  body.resolved
        ? { resolved: true, resolvedAt: new Date(), resolvedById: user.id }
        : { resolved: false, resolvedAt: null, resolvedById: null },
      include: { option: true, resolvedBy: { select: { id: true, name: true } } },
    })

    await createSafeAuditLog({
      userId: user.id, tenantId: pend.vehicle.tenantId ?? null, action: 'UPDATE', entity: 'VehicleStockPendency', entityId: pendencyId,
      userName: user.name, userRole: user.role,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
