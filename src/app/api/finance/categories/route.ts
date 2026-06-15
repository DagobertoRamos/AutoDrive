// =============================================================================
// /api/finance/categories — categorias de receita/despesa. Multi-tenant.
//   GET  : finance (read, filtro ?kind=)   POST : finance.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createCategorySchema } from '@/lib/validators/finance'
import { zodErrorResponse } from '@/lib/finance/finance-service'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance')) return forbiddenResponse('Sem acesso ao financeiro.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const extra: Record<string, unknown> = {}
    const kind = searchParams.get('kind')
    if (kind === 'RECEITA' || kind === 'DESPESA') extra.kind = kind
    if (searchParams.get('active') === 'true') extra.active = true
    const data = await prisma.financialCategory.findMany({
      where: tenantWhere(user.role, tenantId, extra),
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'finance.manage')) return forbiddenResponse('Sem permissão para gerenciar categorias.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const d = createCategorySchema.parse(await req.json())
    const category = await prisma.financialCategory.create({
      data: { tenantId, name: d.name, kind: d.kind, color: d.color ?? null, active: d.active },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialCategory', entityId: category.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: category }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
