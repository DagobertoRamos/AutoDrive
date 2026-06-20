// =============================================================================
// /api/finance/entries/[id] — ver / editar / liquidar / excluir lançamento.
//   GET    : finance (read)
//   PATCH  : finance.manage (edita campos; status PAGO/RECEBIDO grava paidDate)
//   DELETE : finance.manage (hard delete de lançamento MANUAL; integrados não)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateEntrySchema } from '@/lib/validators/finance'
import { zodErrorResponse, ownsTenant, num } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Lançamento não encontrado.' }, { status: 404 })

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance')) return forbiddenResponse('Sem acesso ao financeiro.')
  { const gate = await assertModuleEnabled(user, 'finance'); if (gate) return gate }
  const { id } = await params

  try {
    const e = await prisma.financialEntry.findUnique({ where: { id }, include: { account: true, category: true } })
    if (!e) return notFound()
    if (!ownsTenant(user.role, user.tenantId, e.tenantId)) return forbiddenResponse('Lançamento de outro tenant.')
    return NextResponse.json({ success: true, data: { ...e, amount: num(e.amount) } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'finance'); if (gate) return gate }
  const { id } = await params

  try {
    const existing = await prisma.financialEntry.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Lançamento de outro tenant.')

    const d = updateEntrySchema.parse(await req.json())
    const updateData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) if (v !== undefined) updateData[k] = v

    // Liquidação: ao marcar PAGO/RECEBIDO sem data, registra agora.
    if ((d.status === 'PAGO' || d.status === 'RECEBIDO') && !d.paidDate && !existing.paidDate) {
      updateData.paidDate = new Date()
    }

    const entry = await prisma.financialEntry.update({ where: { id }, data: updateData })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinancialEntry', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { ...entry, amount: num(entry.amount) } })
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
    const existing = await prisma.financialEntry.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Lançamento de outro tenant.')
    // Lançamentos integrados (VENDA/COMISSAO/...) não são apagados manualmente — cancela.
    if (existing.source && existing.source !== 'MANUAL') {
      await prisma.financialEntry.update({ where: { id }, data: { status: 'CANCELADO' } })
      await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'CANCEL', entity: 'FinancialEntry', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true, canceled: true })
    }
    await prisma.financialEntry.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'FinancialEntry', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
