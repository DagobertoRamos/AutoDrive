// =============================================================================
// DELETE /api/finance/transfers/[groupId] — desfaz a transferência (apaga a
// saída e a entrada do mesmo grupo). finance.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { bad } from '@/app/api/finance/center/entries/_lib/shared'
import { deleteEntriesFiles } from '@/app/api/finance/entries/[id]/attachments/_storage'

type Ctx = { params: Promise<{ groupId: string }> }

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { groupId } = await params
  try {
    const ids = await prisma.financialEntry.findMany({ where: { transferGroupId: groupId, tenantId: g.tenantId }, select: { id: true } })
    await deleteEntriesFiles(ids.map((x) => x.id)).catch(() => {})
    const r = await prisma.financialEntry.deleteMany({ where: { transferGroupId: groupId, tenantId: g.tenantId } })
    if (!r.count) return bad('Transferência não encontrada.', 404)
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: 'DELETE', entity: 'FinancialTransfer', entityId: groupId, userName: g.user.name, userRole: g.user.role })
    return NextResponse.json({ success: true, deleted: r.count })
  } catch (err) {
    return handlePrismaError(err)
  }
}
