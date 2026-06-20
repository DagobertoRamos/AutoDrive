// =============================================================================
// /api/finance/sync — gera lançamentos financeiros a partir de vendas
// finalizadas e comissões (idempotente). finance.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { syncFinanceFromBusiness } from '@/lib/finance/finance-sync'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function POST() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance.manage')) return forbiddenResponse('Sem permissão para sincronizar o financeiro.')
  { const gate = await assertModuleEnabled(user, 'finance'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const result = await syncFinanceFromBusiness(user.role, tenantId)
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE_CHANGE', entity: 'FinancialEntry', entityId: 'sync', userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return handlePrismaError(err)
  }
}
