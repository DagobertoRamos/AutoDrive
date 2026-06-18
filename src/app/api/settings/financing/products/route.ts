// =============================================================================
// /api/settings/financing/products — produtos agregados do F&I (loja).
//   GET  : financing.config — lista produtos (garantia/seguro/proteção/...)
//   POST : financing.config — cria produto
// Tenant-scoped, auditado. MASTER não gerencia config da loja.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createProductSchema } from '@/lib/validators/financing'
import { zodErrorResponse, num } from '@/lib/finance/finance-service'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem acesso às configurações de F&I.')
  if (user.role === 'MASTER' || !user.tenantId) return forbiddenResponse('Produtos são gerenciados pela loja, não pelo MASTER.')
  try {
    const rows = await prisma.financeProduct.findMany({ where: { tenantId: user.tenantId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
    return NextResponse.json({ success: true, data: rows.map((p) => ({ id: p.id, name: p.name, kind: p.kind, defaultValue: p.defaultValue == null ? null : num(p.defaultValue), active: p.active })) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão para configurar produtos.')
  if (user.role === 'MASTER' || !user.tenantId) return forbiddenResponse('Produtos são gerenciados pela loja, não pelo MASTER.')
  try {
    const d = createProductSchema.parse(await req.json())
    const p = await prisma.financeProduct.create({
      data: { tenantId: user.tenantId, name: d.name, kind: d.kind, defaultValue: d.defaultValue ?? null, active: d.active },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: user.tenantId, action: 'CREATE', entity: 'FinanceProduct', entityId: p.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: p.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
