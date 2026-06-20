// =============================================================================
// /api/financing/banks — bancos para financiamento. Multi-tenant.
//   GET  : financing (read; ?active=true)   POST : financing.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createBankSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const onlyActive = searchParams.get('active') === 'true'
    const data = await prisma.financeBank.findMany({
      where: tenantWhere(user.role, tenantId, onlyActive ? { active: true } : {}) as never,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, active: true, notes: true, _count: { select: { proposals: true } } },
    })
    return NextResponse.json({ success: true, data: data.map((b) => ({ ...b, proposals: b._count.proposals })) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão para cadastrar bancos.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const d = createBankSchema.parse(await req.json())
    const bank = await prisma.financeBank.create({
      data: { tenantId, name: d.name, code: d.code ?? null, active: d.active, notes: d.notes ?? null },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinanceBank', entityId: bank.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: bank }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
