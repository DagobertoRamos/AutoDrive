// /api/suppliers/[id] — PATCH edita/ativa/desativa · DELETE exclui (ou desativa se já tem serviços).
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { supplierData } from '@/lib/stock/suppliers'
import { identityLockError } from '@/lib/identity-lock'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function load(ctx: Ctx) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() } as const
  if (!canAccessModule(user.role, 'stock.manage') && !canAccessModule(user.role, 'finance')) return { error: forbiddenResponse() } as const
  const tenantId = assertTenantId(user.tenantId, user.role)
  const { id } = await ctx.params
  const row = await prisma.supplier.findFirst({ where: { id, ...tenantWhere(user.role, tenantId) } })
  if (!row) return { error: NextResponse.json({ success: false, error: 'Fornecedor não encontrado.' }, { status: 404 }) } as const
  return { user, row } as const
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const g = await load(ctx)
    if ('error' in g) return g.error
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    { const lockErr = identityLockError(g.user.role, g.row as unknown as Record<string, unknown>, body, { document: 'document', email: 'email' }); if (lockErr) return NextResponse.json({ success: false, error: lockErr }, { status: 403 }) }
    let data: Record<string, unknown>
    if (Object.keys(body).length === 1 && typeof body.active === 'boolean') data = { active: body.active }
    else {
      const parsed = supplierData({ ...g.row, ...body })
      if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
      const dup = await prisma.supplier.findFirst({ where: { tenantId: g.row.tenantId, document: parsed.data.document, id: { not: g.row.id } }, select: { name: true } })
      if (dup) return NextResponse.json({ success: false, error: `CPF/CNPJ já cadastrado: ${dup.name}.` }, { status: 409 })
      data = { ...parsed.data, ...(typeof body.active === 'boolean' ? { active: body.active } : {}) }
    }
    const row = await prisma.supplier.update({ where: { id: g.row.id }, data })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.row.tenantId, action: 'UPDATE', entity: 'Supplier', entityId: row.id, userName: g.user.name, userRole: g.user.role, beforeData: g.row, afterData: row })
    return NextResponse.json({ success: true, data: row })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const g = await load(ctx)
    if ('error' in g) return g.error
    const used = await prisma.vehicleService.count({ where: { supplierId: g.row.id } }) + await prisma.vehicle.count({ where: { partnerStoreId: g.row.id } })
    if (used) {
      await prisma.supplier.update({ where: { id: g.row.id }, data: { active: false } })
      return NextResponse.json({ success: true, deactivated: true, message: 'Fornecedor com histórico: foi desativado.' })
    }
    await prisma.supplier.delete({ where: { id: g.row.id } })
    return NextResponse.json({ success: true, deleted: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
