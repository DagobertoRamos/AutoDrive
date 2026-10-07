// =============================================================================
// POST /api/finance/center/settlements/batch — baixa em lote.
//   { type, paidDate, accountId?, paymentMethod?, description?,
//     items: [{ entryId, principal?, interest?, discount?, settleRemainderAsDiscount? }] }
//   principal menor que o saldo = baixa parcial daquele item.
// GET ?from&to — lotes do período (para consulta/comprovante).
// =============================================================================

import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard, requireFinance } from '@/lib/finance/access'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { settleBatch } from '@/lib/finance/settlement'
import { noonUtc } from '@/lib/finance/recurrence-core'

const money = z.coerce.number().min(0).max(100_000_000).nullable().optional()
const schema = z.object({
  type: z.enum(['RECEITA', 'DESPESA']),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  accountId: z.string().max(40).nullable().optional(),
  paymentMethod: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(200).nullable().optional(),
  items: z.array(z.object({
    entryId: z.string().min(1).max(40),
    principal: money,
    interest: money,
    discount: money,
    settleRemainderAsDiscount: z.boolean().optional(),
  })).min(1).max(200),
})

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const perm = await requireFinance(g.user, 'finance.settle')
  if (perm) return perm
  try {
    const d = schema.parse(await req.json())
    if (d.accountId) {
      const acc = await prisma.financialAccount.findFirst({ where: { id: d.accountId, tenantId: g.tenantId }, select: { id: true } })
      if (!acc) return NextResponse.json({ success: false, error: 'Conta inválida.' }, { status: 400 })
    }
    const r = await settleBatch(g.tenantId, d, { id: g.user.id, name: g.user.name, role: g.user.role })
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
    return NextResponse.json({ success: true, data: r })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from'), to = searchParams.get('to')
  const data = await prisma.financialSettlementBatch.findMany({
    where: {
      tenantId: g.tenantId,
      ...(from || to ? { paidDate: { ...(from ? { gte: noonUtc(from) } : {}), ...(to ? { lte: noonUtc(to) } : {}) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json({ success: true, data: data.map((b) => ({ ...b, total: Number(b.total) })) })
}
