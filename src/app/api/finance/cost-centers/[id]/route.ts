// =============================================================================
// /api/finance/cost-centers/[id] — editar / inativar / excluir centro de custo. finance.manage
//   DELETE: exclui se não tem lançamentos, despesas fixas, orçamento nem filhos;
//           senão inativa (?mode=inactivate força). → { success, deleted }
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeGuard } from '@/lib/finance/access'
import { isDescendant } from '../../categories/tree'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Centro de custo não encontrado.' }, { status: 404 })
const bad = (error: string) => NextResponse.json({ success: false, error }, { status: 400 })

const updateSchema = z.object({
  name:     z.string().trim().min(2, 'Informe o nome.').max(120).optional(),
  code:     z.string().trim().max(20).nullish(),
  parentId: z.string().nullish(),
  active:   z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  const { id } = await params

  try {
    const existing = await prisma.financialCostCenter.findFirst({ where: { id, tenantId } })
    if (!existing) return notFound()
    const d = updateSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.name !== undefined) data.name = d.name
    if (d.code !== undefined) data.code = d.code || null
    if (d.active !== undefined) data.active = d.active
    if (d.parentId !== undefined) {
      if (d.parentId) {
        if (d.parentId === id) return bad('Escolha outro centro de custo pai.')
        const all = await prisma.financialCostCenter.findMany({ where: { tenantId }, select: { id: true, parentId: true } })
        if (!all.some((c) => c.id === d.parentId)) return bad('Centro de custo pai inválido.')
        if (isDescendant(all, id, d.parentId)) return bad('Não é possível mover para dentro de um filho dele.')
      }
      data.parentId = d.parentId || null
    }
    const cc = await prisma.financialCostCenter.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialCostCenter', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: cc })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  const { id } = await params

  try {
    const existing = await prisma.financialCostCenter.findFirst({ where: { id, tenantId } })
    if (!existing) return notFound()
    const force = new URL(req.url).searchParams.get('mode') === 'inactivate'
    const [entries, recurrences, budgets, children] = await Promise.all([
      prisma.financialEntry.count({ where: { costCenterId: id } }),
      prisma.financialRecurrence.count({ where: { costCenterId: id } }),
      prisma.financialBudget.count({ where: { costCenterId: id } }),
      prisma.financialCostCenter.count({ where: { parentId: id } }),
    ])
    if (force || entries + recurrences + budgets + children > 0) {
      await prisma.financialCostCenter.update({ where: { id }, data: { active: false } })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialCostCenter', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true, deleted: false })
    }
    await prisma.financialCostCenter.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'DELETE', entity: 'FinancialCostCenter', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, deleted: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
