// =============================================================================
// /api/finance/accounts — contas financeiras (caixa/banco). Multi-tenant.
//   GET  : finance (read)        POST : finance.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createAccountSchema } from '@/lib/validators/finance'
import { zodErrorResponse } from '@/lib/finance/finance-service'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance')) return forbiddenResponse('Sem acesso ao financeiro.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const onlyActive = searchParams.get('active') === 'true'
    const data = await prisma.financialAccount.findMany({
      where: tenantWhere(user.role, tenantId, onlyActive ? { active: true } : {}),
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance.manage')) return forbiddenResponse('Sem permissão para gerenciar contas.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const d = createAccountSchema.parse(await req.json())
    const account = await prisma.financialAccount.create({
      data: { tenantId, name: d.name, type: d.type, openingBalance: d.openingBalance, active: d.active, createdById: user.id },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialAccount', entityId: account.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: account }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
