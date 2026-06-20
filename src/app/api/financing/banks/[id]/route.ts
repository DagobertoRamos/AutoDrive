// =============================================================================
// /api/financing/banks/[id] — editar / inativar banco. financing.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateBankSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Banco não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const { id } = await params

  try {
    const existing = await prisma.financeBank.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Banco de outro tenant.')

    const d = updateBankSchema.parse(await req.json())
    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) if (v !== undefined) updateData[k] = v

    const bank = await prisma.financeBank.update({ where: { id }, data: updateData })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinanceBank', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: bank })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const { id } = await params

  try {
    const existing = await prisma.financeBank.findUnique({ where: { id }, include: { _count: { select: { proposals: true } } } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Banco de outro tenant.')

    // Com fichas vinculadas → inativa (preserva histórico). Sem fichas → remove.
    if (existing._count.proposals > 0) {
      await prisma.financeBank.update({ where: { id }, data: { active: false } })
      await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinanceBank', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true, deactivated: true })
    }
    await prisma.financeBank.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'FinanceBank', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
