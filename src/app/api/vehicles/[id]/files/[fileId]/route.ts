// DELETE /api/vehicles/[id]/files/[fileId] — remove um arquivo do veículo.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { syncIntake } from '@/lib/stock/intake'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.manage') && !canAccessModule(user.role, 'finance')) return forbiddenResponse()
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { id, fileId } = await ctx.params
    const f = await prisma.vehicleFile.findFirst({ where: { id: fileId, vehicleId: id, vehicle: { ...tenantWhere(user.role, tenantId) } }, select: { id: true, kind: true, fileName: true, tenantId: true } })
    if (!f) return NextResponse.json({ success: false, error: 'Arquivo não encontrado.' }, { status: 404 })
    await prisma.vehicleFile.delete({ where: { id: f.id } })
    await createSafeAuditLog({ userId: user.id, tenantId: f.tenantId, action: 'DELETE', entity: 'VehicleFile', entityId: f.id, userName: user.name, userRole: user.role, beforeData: f })
    if (f.kind === 'LAUDO_CAUTELAR') await syncIntake(id, { id: user.id, name: user.name, role: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
