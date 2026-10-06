// =============================================================================
// POST /api/finance/budgets/copy — copia o orçamento de um mês para outro. finance.manage
//   { fromMonth, toMonth, costCenterId?: string|null, overwrite?: boolean }
//   Sem overwrite, só preenche as categorias ainda sem valor no mês de destino.
//   → { success, data: { copied } }
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeGuard } from '@/lib/finance/access'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const schema = z.object({
  fromMonth:    z.string().regex(MONTH, 'Mês inválido.'),
  toMonth:      z.string().regex(MONTH, 'Mês inválido.'),
  costCenterId: z.string().nullish(),
  overwrite:    z.boolean().default(false),
})

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g

  try {
    const d = schema.parse(await req.json())
    if (d.fromMonth === d.toMonth) return NextResponse.json({ success: false, error: 'Escolha meses diferentes.' }, { status: 400 })
    const costCenterId = d.costCenterId || null
    const [source, target] = await Promise.all([
      prisma.financialBudget.findMany({ where: { tenantId, month: d.fromMonth, costCenterId } }),
      prisma.financialBudget.findMany({ where: { tenantId, month: d.toMonth, costCenterId } }),
    ])
    if (!source.length) return NextResponse.json({ success: false, error: 'O mês de origem não tem orçamento.' }, { status: 400 })
    const targetBy = new Map(target.map((t) => [t.categoryId, t]))
    let copied = 0
    for (const s of source) {
      const t = targetBy.get(s.categoryId)
      if (t) {
        if (!d.overwrite) continue
        await prisma.financialBudget.update({ where: { id: t.id }, data: { amount: s.amount } })
      } else {
        await prisma.financialBudget.create({ data: { tenantId, month: d.toMonth, categoryId: s.categoryId, costCenterId, amount: s.amount } })
      }
      copied++
    }
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialBudget', entityId: costCenterId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { copied } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
