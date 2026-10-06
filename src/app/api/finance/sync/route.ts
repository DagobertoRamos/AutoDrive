// =============================================================================
// /api/finance/sync — gera lançamentos financeiros a partir de vendas
// finalizadas e comissões (idempotente). finance.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { syncFinanceFromBusiness } from '@/lib/finance/finance-sync'
import { legacyFinanceGuard } from '@/app/api/finance/center/entries/_lib/shared'

export async function POST(req?: Request) {
  const g = await legacyFinanceGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g

  try {
    // MASTER com loja escolhida sincroniza só ela; sem loja, segue global.
    const result = await syncFinanceFromBusiness(tenantId ? 'ADM' : user.role, tenantId)
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE_CHANGE', entity: 'FinancialEntry', entityId: 'sync', userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return handlePrismaError(err)
  }
}
