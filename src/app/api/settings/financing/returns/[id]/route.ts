// =============================================================================
// /api/settings/financing/returns/[id] — editar / excluir regra de retorno (F&I).
// PATCH (financing.config) / DELETE (financing.config). Tenant-scoped, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateReturnRuleSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Regra não encontrada.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão.')
  if (user.role === 'MASTER' || !user.tenantId) return forbiddenResponse('Retornos são gerenciados pela loja, não pelo MASTER.')
  const { id } = await params

  try {
    const existing = await prisma.financeReturnRule.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Regra de outro tenant.')

    const d = updateReturnRuleSchema.parse(await req.json())
    if (d.bankId) {
      const ok = await prisma.financeBank.findFirst({ where: { id: d.bankId, tenantId: existing.tenantId }, select: { id: true } })
      if (!ok) return forbiddenResponse('Banco inválido para esta loja.')
    }
    const data: Record<string, unknown> = {}
    if (d.bankId !== undefined) data.bankId = d.bankId ?? null
    if (d.percent !== undefined) data.percent = d.percent ?? null
    if (d.fixedValue !== undefined) data.fixedValue = d.fixedValue ?? null
    if (d.minInstallments !== undefined) data.minInstallments = d.minInstallments ?? null
    if (d.maxInstallments !== undefined) data.maxInstallments = d.maxInstallments ?? null
    if (d.notes !== undefined) data.notes = d.notes ?? null
    if (d.active !== undefined) data.active = d.active

    await prisma.financeReturnRule.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinanceReturnRule', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão.')
  if (user.role === 'MASTER' || !user.tenantId) return forbiddenResponse('Retornos são gerenciados pela loja, não pelo MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.financeReturnRule.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Regra de outro tenant.')
    await prisma.financeReturnRule.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'FinanceReturnRule', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
