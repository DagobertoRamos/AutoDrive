// =============================================================================
// /api/settings/financing/products/[id] — editar/excluir produto agregado (F&I).
// PATCH / DELETE : financing.config. Tenant-scoped, auditado. MASTER bloqueado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateProductSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Produto não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const existing = await prisma.financeProduct.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, tid, existing.tenantId)) return forbiddenResponse('Produto de outro tenant.')
    const d = updateProductSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.name !== undefined) data.name = d.name
    if (d.kind !== undefined) data.kind = d.kind
    if (d.defaultValue !== undefined) data.defaultValue = d.defaultValue ?? null
    if (d.active !== undefined) data.active = d.active
    await prisma.financeProduct.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinanceProduct', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const existing = await prisma.financeProduct.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, tid, existing.tenantId)) return forbiddenResponse('Produto de outro tenant.')
    await prisma.financeProduct.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'FinanceProduct', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
