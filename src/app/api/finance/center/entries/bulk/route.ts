// =============================================================================
// POST /api/finance/center/entries/bulk — ações em lote (finance.manage).
//   { action: 'settle', ids[], paidDate, accountId?, paymentMethod? }  → baixa cada um pelo valor
//   { action: 'cancel', ids[], reason? }
//   { action: 'delete', ids[], reason? }  → cancela (nunca apaga) — voidEntry
//   → { success, done, failed: [{ id, description, error }] }
// =============================================================================

import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard, requireFinance } from '@/lib/finance/access'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { bad, canPayroll, centerRefError } from '../_lib/shared'
import { cancelEntry, settleEntry, voidEntry } from '../_lib/settle'

export const maxDuration = 60

const schema = z.object({
  action: z.enum(['settle', 'cancel', 'delete']),
  ids: z.array(z.string().max(40)).min(1, 'Selecione os lançamentos.').max(300),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').optional(),
  accountId: z.string().max(40).nullable().optional(),
  paymentMethod: z.string().trim().max(60).nullable().optional(),
  reason: z.string().trim().max(300).nullable().optional(),
})

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  try {
    const d = schema.parse(await req.json())
    if (d.action === 'settle' && !d.paidDate) return bad('Informe a data.')
    const perm = await requireFinance(g.user, d.action === 'settle' ? 'finance.settle' : 'finance.reverse')
    if (perm) return perm
    const refErr = await centerRefError(g.tenantId, { accountId: d.accountId })
    if (refErr) return bad(refErr)
    const payroll = await canPayroll(g.user)
    const rows = await prisma.financialEntry.findMany({
      where: { id: { in: d.ids }, tenantId: g.tenantId, ...(payroll ? {} : { employeeUserId: null }) },
      select: { id: true, description: true, source: true, status: true },
    })
    let done = 0
    const failed: Array<{ id: string; description: string; error: string }> = []
    for (const r of rows) {
      let error: string | null = null
      try {
        if (d.action === 'settle') {
          error = r.status === 'PREVISTO' ? await settleEntry(r.id, { paidDate: d.paidDate!, accountId: d.accountId, paymentMethod: d.paymentMethod }, { id: g.user.id, name: g.user.name, role: g.user.role }, g.tenantId) : null
          if (!error && r.status !== 'PREVISTO') continue
        } else if (d.action === 'cancel') {
          error = await cancelEntry(r.id, d.reason)
        } else {
          error = await voidEntry(r.id, d.reason, { id: g.user.id, name: g.user.name, role: g.user.role })
        }
      } catch (err) {
        console.error('[finance/bulk]', r.id, err)
        error = 'Falha ao processar.'
      }
      if (error) failed.push({ id: r.id, description: r.description, error })
      else done++
    }
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: `BULK_${d.action.toUpperCase()}`, entity: 'FinancialEntry', entityId: null, userName: g.user.name, userRole: g.user.role, afterData: { ids: rows.map((r) => r.id), done, failed, reason: d.reason ?? null } })
    return NextResponse.json({ success: true, done, failed })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
