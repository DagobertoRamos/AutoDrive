// =============================================================================
// /api/finance/categories/[id] — editar / inativar categoria. finance.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateCategorySchema } from '@/lib/validators/finance'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Categoria não encontrada.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'finance'); if (gate) return gate }
  const { id } = await params

  try {
    const existing = await prisma.financialCategory.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Categoria de outro tenant.')

    const d = updateCategorySchema.parse(await req.json())
    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) if (v !== undefined) updateData[k] = v

    const category = await prisma.financialCategory.update({ where: { id }, data: updateData })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinancialCategory', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: category })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'finance'); if (gate) return gate }
  const { id } = await params

  try {
    const existing = await prisma.financialCategory.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Categoria de outro tenant.')

    await prisma.financialCategory.update({ where: { id }, data: { active: false } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinancialCategory', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
