// GET /api/finance/center/permissions — permissões finas do financeiro do usuário
// (para as telas esconderem o que ele não pode usar; o servidor confere de novo).
import { NextResponse } from 'next/server'
import { financeCan, financeGuard, hasFinanceAccess, type FinanceFinePermission } from '@/lib/finance/access'

export const dynamic = 'force-dynamic'
const FINE: FinanceFinePermission[] = ['finance.settle', 'finance.reverse', 'finance.reconcile', 'finance.balances', 'finance.profit', 'finance.export', 'finance.period']

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const u = { ...g.user, tenantId: g.tenantId }
  const entries = await Promise.all(FINE.map(async (p) => [p.replace('finance.', ''), await financeCan(u, p)] as const))
  return NextResponse.json({ success: true, data: { ...Object.fromEntries(entries), manage: await hasFinanceAccess(u, 'finance.manage'), payroll: await hasFinanceAccess(u, 'finance.payroll') } })
}
