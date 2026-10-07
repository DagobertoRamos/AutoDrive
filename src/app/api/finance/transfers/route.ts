// =============================================================================
// /api/finance/transfers — transferência entre contas da loja.
//   GET  : finance — últimas transferências ?from&to (YYYY-MM-DD)
//          → { data: [{ groupId, date, amount, description, from: {id,name}, to: {id,name} }] }
//   POST : finance.manage — { fromAccountId, toAccountId, amount, date, description? }
//          → 2 lançamentos com o mesmo transferGroupId (saída DESPESA PAGO na origem,
//            entrada RECEITA RECEBIDO no destino), sem categoria, source TRANSFER (fora da DRE).
//          → { success, data: { groupId, entries: [out, in] } }
// Exclusão: DELETE /api/finance/transfers/[groupId].
// =============================================================================

import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z, ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { periodError } from '@/lib/finance/period-lock'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { noonUtc } from '@/lib/finance/recurrence-core'
import { spDayEnd, spDayStart } from '@/lib/dashboard/tz'
import { bad } from '@/app/api/finance/center/entries/_lib/shared'

export const dynamic = 'force-dynamic'

const TRANSFER_SOURCE = 'TRANSFER'
const YMD = /^\d{4}-\d{2}-\d{2}$/

const schema = z.object({
  fromAccountId: z.string().min(1, 'Informe a conta de origem.').max(40),
  toAccountId: z.string().min(1, 'Informe a conta de destino.').max(40),
  amount: z.coerce.number().positive('Informe o valor.').max(100_000_000),
  date: z.string().regex(YMD, 'Informe a data.'),
  description: z.string().trim().max(200).nullable().optional(),
})

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  try {
    const sp = new URL(req.url).searchParams
    const from = sp.get('from'); const to = sp.get('to')
    const rows = await prisma.financialEntry.findMany({
      where: {
        tenantId: g.tenantId, transferGroupId: { not: null }, status: { not: 'CANCELADO' },
        ...((from && YMD.test(from)) || (to && YMD.test(to)) ? { paidDate: { ...(from && YMD.test(from) ? { gte: spDayStart(from) } : {}), ...(to && YMD.test(to) ? { lte: spDayEnd(to) } : {}) } } : {}),
      },
      orderBy: [{ paidDate: 'desc' }, { createdAt: 'desc' }], take: 400,
      select: { transferGroupId: true, type: true, amount: true, paidDate: true, description: true, account: { select: { id: true, name: true } } },
    })
    const groups = new Map<string, { groupId: string; date: Date | null; amount: number; description: string; from: { id: string; name: string } | null; to: { id: string; name: string } | null }>()
    for (const r of rows) {
      const k = r.transferGroupId!
      const cur = groups.get(k) ?? { groupId: k, date: r.paidDate, amount: Number(r.amount), description: r.description, from: null, to: null }
      if (r.type === 'DESPESA') cur.from = r.account; else cur.to = r.account
      groups.set(k, cur)
    }
    return NextResponse.json({ success: true, data: [...groups.values()] })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  try {
    const d = schema.parse(await req.json())
    if (d.fromAccountId === d.toAccountId) return bad('Escolha contas diferentes.')
    const closed = await periodError(tenantId, [d.date])
    if (closed) return bad(closed)
    const accounts = await prisma.financialAccount.findMany({ where: { id: { in: [d.fromAccountId, d.toAccountId] }, tenantId }, select: { id: true, name: true } })
    const fromAcc = accounts.find((a) => a.id === d.fromAccountId); const toAcc = accounts.find((a) => a.id === d.toAccountId)
    if (!fromAcc || !toAcc) return bad('Conta inválida.')
    const day = noonUtc(d.date)
    // Clique duplo: a mesma transferência da mesma pessoa em segundos não duplica.
    const twin = await prisma.financialEntry.findFirst({
      where: { tenantId, createdById: user.id, type: 'DESPESA', accountId: fromAcc.id, amount: d.amount, paidDate: day, transferGroupId: { not: null }, status: { not: 'CANCELADO' }, createdAt: { gte: new Date(Date.now() - 15_000) } },
      select: { transferGroupId: true },
    })
    if (twin?.transferGroupId) return NextResponse.json({ success: true, duplicate: true, data: { groupId: twin.transferGroupId, entries: [] } })
    const groupId = randomUUID()
    const desc = d.description?.trim() || `Transferência ${fromAcc.name} → ${toAcc.name}`
    const common = {
      tenantId, amount: d.amount, dueDate: day, paidDate: day, competenceDate: day, categoryId: null,
      transferGroupId: groupId, source: TRANSFER_SOURCE, paymentMethod: 'Transferência', createdById: user.id,
    }
    const entries = await prisma.$transaction([
      prisma.financialEntry.create({ data: { ...common, type: 'DESPESA', status: 'PAGO', accountId: fromAcc.id, description: desc, counterparty: toAcc.name } }),
      prisma.financialEntry.create({ data: { ...common, type: 'RECEITA', status: 'RECEBIDO', accountId: toAcc.id, description: desc, counterparty: fromAcc.name } }),
    ])
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialTransfer', entityId: groupId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { groupId, entries: entries.map((e) => ({ ...e, amount: Number(e.amount) })) } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
