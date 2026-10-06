// =============================================================================
// GET /api/finance/payroll?month=YYYY-MM — fechamento da folha do mês. finance.payroll
//   → { success, data: { month, monthLabel, categories, employees: PayrollEmployee[],
//                        totals, accounts: [{id,name,type}], tenant: {name, cnpj} } }
// (src/lib/finance/payroll.ts)
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { loadPayrollMonth } from '@/lib/finance/payroll'
import { isMonth } from '@/lib/finance/payroll-core'

export async function GET(req: Request) {
  const g = await financeGuard('finance.payroll', req)
  if (g.error) return g.error
  const { tenantId } = g

  try {
    const sp = new URL(req.url).searchParams
    const month = sp.get('month') ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
    if (!isMonth(month)) return NextResponse.json({ success: false, error: 'Mês inválido.' }, { status: 400 })
    const [data, accounts, tenant] = await Promise.all([
      loadPayrollMonth(tenantId, month, sp.get('userId') || undefined),
      prisma.financialAccount.findMany({ where: { tenantId, active: true }, select: { id: true, name: true, type: true }, orderBy: { name: 'asc' } }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, razaoSocial: true, cnpj: true } }),
    ])
    return NextResponse.json({ success: true, data: { ...data, accounts, tenant: { name: tenant?.razaoSocial || tenant?.name || '', cnpj: tenant?.cnpj ?? null } } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
