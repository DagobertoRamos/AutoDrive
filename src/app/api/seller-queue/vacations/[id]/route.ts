// =============================================================================
// DELETE /api/seller-queue/vacations/:id — cancela uma ausência (status →
// CANCELADO; não apaga, mantém histórico). Gate: queue.vacations.manage.
// Tenant/unit-scoped e auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'queue.vacations.manage')) return forbiddenResponse('Sem permissão para gerir férias/ausências.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const vac = await prisma.sellerVacation.findUnique({ where: { id }, select: { id: true, tenantId: true, status: true } })
    if (!vac) return NextResponse.json({ success: false, error: 'Ausência não encontrada.' }, { status: 404 })
    if (vac.tenantId !== tenantId) return forbiddenResponse('Ausência de outra empresa.')
    if (vac.status === 'CANCELADO') return NextResponse.json({ success: true, data: { id } })

    await prisma.sellerVacation.update({ where: { id }, data: { status: 'CANCELADO', canceledById: user.id } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CANCEL', entity: 'SellerVacation', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
