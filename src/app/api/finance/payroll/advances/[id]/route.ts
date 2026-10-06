// =============================================================================
// /api/finance/payroll/advances/[id] — adiantamento do colaborador. finance.payroll
//   PATCH  { discounted: boolean, month? 'YYYY-MM', note? } → marca/desmarca como
//          descontado na folha (fica nas observações do lançamento).
//   DELETE → cancela o lançamento (não apaga).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeGuard } from '@/lib/finance/access'
import { removeDiscountTag, withDiscountTag } from '@/lib/finance/payroll-core'

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({
  discounted: z.boolean(),
  month:      z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.').optional(),
  note:       z.string().max(300).nullish(),
})
const notFound = () => NextResponse.json({ success: false, error: 'Lançamento não encontrado.' }, { status: 404 })

async function findOwn(id: string, tenantId: string) {
  return prisma.financialEntry.findFirst({ where: { id, tenantId, employeeUserId: { not: null }, type: 'DESPESA' }, select: { id: true, notes: true, status: true } })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.payroll', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  const { id } = await params

  try {
    const existing = await findOwn(id, tenantId)
    if (!existing) return notFound()
    const d = schema.parse(await req.json())
    if (d.discounted && !d.month) return NextResponse.json({ success: false, error: 'Informe o mês da folha.' }, { status: 400 })
    const notes = d.discounted ? withDiscountTag(existing.notes, d.month!, d.note) : removeDiscountTag(existing.notes) || null
    const entry = await prisma.financialEntry.update({ where: { id }, data: { notes } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialEntry', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: entry })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.payroll', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  const { id } = await params

  try {
    const existing = await findOwn(id, tenantId)
    if (!existing) return notFound()
    await prisma.financialEntry.update({ where: { id }, data: { status: 'CANCELADO' } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialEntry', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
