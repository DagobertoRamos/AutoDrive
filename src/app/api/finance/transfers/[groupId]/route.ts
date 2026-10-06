// =============================================================================
// DELETE /api/finance/transfers/[groupId] — desfaz a transferência: cancela a
// saída e a entrada do mesmo grupo (nada é apagado). finance.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { periodError } from '@/lib/finance/period-lock'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { bad } from '@/app/api/finance/center/entries/_lib/shared'

type Ctx = { params: Promise<{ groupId: string }> }

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { groupId } = await params
  try {
    const reason = new URL(req.url).searchParams.get('reason')?.trim() || 'Transferência desfeita'
    const legs = await prisma.financialEntry.findMany({ where: { transferGroupId: groupId, tenantId: g.tenantId, status: { not: 'CANCELADO' } }, select: { id: true, amount: true, accountId: true, type: true, notes: true } })
    if (!legs.length) return bad('Transferência não encontrada.', 404)
    const legDates = await prisma.financialEntry.findMany({ where: { id: { in: legs.map((l) => l.id) } }, select: { paidDate: true } })
    const closed = await periodError(g.tenantId, legDates.map((l) => l.paidDate))
    if (closed) return bad(closed)
    // Nunca apaga: as duas pernas ficam canceladas (saem dos saldos, ficam no histórico).
    await prisma.$transaction(legs.map((l) => prisma.financialEntry.update({ where: { id: l.id }, data: { status: 'CANCELADO', notes: [l.notes, `Cancelada: ${reason}`].filter(Boolean).join('\n').slice(0, 2000) } })))
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: 'FINANCE_TRANSFER_CANCEL', entity: 'FinancialTransfer', entityId: groupId, userName: g.user.name, userRole: g.user.role, beforeData: legs.map((l) => ({ id: l.id, type: l.type, amount: Number(l.amount), accountId: l.accountId })), afterData: { status: 'CANCELADO', reason } })
    return NextResponse.json({ success: true, canceled: legs.length })
  } catch (err) {
    return handlePrismaError(err)
  }
}
