// =============================================================================
// /api/finance/accounts/[id] — editar / inativar conta financeira. finance.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeCan, financeGuard } from '@/lib/finance/access'
import { periodError } from '@/lib/finance/period-lock'
import { entryDiff } from '@/lib/finance/entry-audit'
import { tenantRefError } from '@/lib/finance/tenant-refs'
import { accountData, accountUpdateSchema } from '../schema'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Conta não encontrada.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  const { id } = await params

  try {
    const existing = await prisma.financialAccount.findFirst({ where: { id, tenantId } })
    if (!existing) return notFound()
    const d = accountUpdateSchema.parse(await req.json())
    if (d.unitId) {
      const refErr = await tenantRefError(tenantId, { unitId: d.unitId })
      if (refErr) return NextResponse.json({ success: false, error: refErr }, { status: 400 })
    }
    // Saldo inicial mexe em todos os saldos: exige "ver saldos" e respeita o fechamento.
    const touchesOpening = (d.openingBalance !== undefined && Math.abs(Number(d.openingBalance) - Number(existing.openingBalance)) > 0.004)
      || (d.openingDate !== undefined && (d.openingDate || null) !== (existing.openingDate ? existing.openingDate.toISOString().slice(0, 10) : null))
    if (!(await financeCan(user, 'finance.balances'))) { delete (d as Record<string, unknown>).openingBalance; delete (d as Record<string, unknown>).openingDate }
    else if (touchesOpening) {
      const closed = await periodError(tenantId, [existing.openingDate, d.openingDate || null])
      if (closed) return NextResponse.json({ success: false, error: closed }, { status: 400 })
    }
    const account = await prisma.financialAccount.update({ where: { id }, data: accountData(d) as never })
    const changed = entryDiff(existing as unknown as Record<string, unknown>, account as unknown as Record<string, unknown>)
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialAccount', entityId: id, userName: user.name, userRole: user.role, beforeData: changed?.before, afterData: changed?.after })
    return NextResponse.json({ success: true, data: account })
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
    const existing = await prisma.financialAccount.findFirst({ where: { id, tenantId } })
    if (!existing) return notFound()
    // Soft delete (preserva o histórico de lançamentos).
    await prisma.financialAccount.update({ where: { id }, data: { active: false } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialAccount', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
