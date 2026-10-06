// =============================================================================
// POST /api/finance/payroll/advances — adiantamento/vale ou benefício avulso do
// colaborador (DESPESA com employeeUserId). finance.payroll
//   { userId*, kind: 'ADIANTAMENTO'|'BENEFICIO', amount*, date* 'YYYY-MM-DD',
//     paid (true = pago agora → exige accountId), accountId?, description?, notes? }
//   → { success, data: FinancialEntry }
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeGuard } from '@/lib/finance/access'
import { payrollCategories } from '@/lib/finance/payroll'

const schema = z.object({
  userId:      z.string().min(1, 'Colaborador inválido.'),
  kind:        z.enum(['ADIANTAMENTO', 'BENEFICIO']).default('ADIANTAMENTO'),
  amount:      z.number({ invalid_type_error: 'Valor inválido.' }).positive('Informe o valor.'),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  paid:        z.boolean().default(true),
  accountId:   z.string().nullish(),
  description: z.string().trim().max(240).nullish(),
  notes:       z.string().max(1000).nullish(),
})

const bad = (error: string) => NextResponse.json({ success: false, error }, { status: 400 })

export async function POST(req: Request) {
  const g = await financeGuard('finance.payroll', req)
  if (g.error) return g.error
  const { user, tenantId } = g

  try {
    const d = schema.parse(await req.json())
    if (d.paid && !d.accountId) return bad('Informe a conta do pagamento.')
    const [emp, account] = await Promise.all([
      prisma.user.findFirst({ where: { id: d.userId, tenantId }, select: { id: true, name: true, unitId: true, seller: { select: { fullName: true } } } }),
      d.accountId ? prisma.financialAccount.findFirst({ where: { id: d.accountId, tenantId }, select: { id: true } }) : null,
    ])
    if (!emp) return bad('Colaborador inválido.')
    if (d.accountId && !account) return bad('Conta inválida.')

    const cats = await payrollCategories(tenantId)
    const categoryId = d.kind === 'ADIANTAMENTO' ? cats.advanceId : cats.benefitId
    const who = emp.seller?.fullName || emp.name
    const date = new Date(`${d.date}T12:00:00.000Z`)
    const entry = await prisma.financialEntry.create({
      data: {
        tenantId, type: 'DESPESA', status: d.paid ? 'PAGO' : 'PREVISTO',
        description: d.description || `${d.kind === 'ADIANTAMENTO' ? 'Adiantamento' : 'Benefício'} — ${who}`,
        amount: Math.round(d.amount * 100) / 100, dueDate: date, competenceDate: date, paidDate: d.paid ? date : null,
        accountId: d.accountId || null, categoryId, employeeUserId: emp.id, unitId: emp.unitId ?? null,
        counterparty: who, notes: d.notes || null, source: 'MANUAL', createdById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialEntry', entityId: entry.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: entry }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
