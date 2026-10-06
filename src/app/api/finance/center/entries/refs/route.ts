// =============================================================================
// GET /api/finance/center/entries/refs — cadastros para os formulários do
// Centro Financeiro (finance): contas, plano de contas (árvore), centros de
// custo e fornecedores ativos da loja + permissões do usuário.
//   → { success, data: { accounts, categories, costCenters, suppliers, canManage, canPayroll } }
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { canManage, canPayroll } from '../_lib/shared'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { tenantId, user } = g
  try {
    await ensureFinanceSetup(tenantId).catch((err) => console.error('[finance/refs] setup', err))
    const [accounts, categories, costCenters, suppliers, manage, payroll] = await Promise.all([
      prisma.financialAccount.findMany({ where: { tenantId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, type: true } }),
      prisma.financialCategory.findMany({ where: { tenantId, active: true }, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }, { name: 'asc' }], select: { id: true, name: true, code: true, kind: true, parentId: true } }),
      prisma.financialCostCenter.findMany({ where: { tenantId, active: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }], select: { id: true, name: true, code: true } }),
      prisma.supplier.findMany({ where: { tenantId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
      canManage(user), canPayroll(user),
    ])
    return NextResponse.json({ success: true, data: { accounts, categories, costCenters, suppliers, canManage: manage, canPayroll: payroll } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
