// =============================================================================
// POST /api/finance/payroll/pay — paga a folha de um colaborador no mês. finance.payroll
//   { month*, userId*, accountId*, paidDate* 'YYYY-MM-DD', entryIds?, commissionIds?,
//     discountAdvances? (padrão true), note? }
//   Baixa salário/benefícios e as comissões (comissão vira PAGO no sistema de
//   comissões) e desconta os adiantamentos pagos no salário.
//   → { success, data: { result: { paidEntries, paidCommissions, discounted, total }, employee } }
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeGuard } from '@/lib/finance/access'
import { loadPayrollMonth, payEmployee } from '@/lib/finance/payroll'

const schema = z.object({
  month:            z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.'),
  userId:           z.string().min(1, 'Colaborador inválido.'),
  accountId:        z.string().min(1, 'Informe a conta.'),
  paidDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data do pagamento.'),
  entryIds:         z.array(z.string()).optional(),
  commissionIds:    z.array(z.string()).optional(),
  discountAdvances: z.boolean().optional(),
  note:             z.string().max(500).nullish(),
})

export async function POST(req: Request) {
  const g = await financeGuard('finance.payroll', req)
  if (g.error) return g.error
  const { user, tenantId } = g

  try {
    const d = schema.parse(await req.json())
    const [employee, account] = await Promise.all([
      prisma.user.findFirst({ where: { id: d.userId, tenantId }, select: { id: true } }),
      prisma.financialAccount.findFirst({ where: { id: d.accountId, tenantId, active: true }, select: { id: true } }),
    ])
    if (!employee) return NextResponse.json({ success: false, error: 'Colaborador não encontrado.' }, { status: 404 })
    if (!account) return NextResponse.json({ success: false, error: 'Conta inválida.' }, { status: 400 })

    const out = await payEmployee(tenantId, d)
    if ('error' in out) return NextResponse.json({ success: false, error: out.error }, { status: 400 })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'Payroll', entityId: d.userId, afterData: { month: d.month, ...out.result }, userName: user.name, userRole: user.role })
    const month = await loadPayrollMonth(tenantId, d.month, d.userId)
    return NextResponse.json({ success: true, data: { result: out.result, employee: month.employees[0] ?? null } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
