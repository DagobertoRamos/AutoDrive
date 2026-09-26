// =============================================================================
// /api/partner-stores/[id]
//   PATCH  { ...campos, active? }  edita / ativa / desativa
//   DELETE                         exclui se não tiver carros; senão só desativa
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { partnerStoreData } from '@/lib/stock/partner-stores'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function load(ctx: Ctx) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() } as const
  if (!canAccessModule(user.role, 'registrations.vehicles')) return { error: forbiddenResponse('Sem permissão para editar lojas parceiras.') } as const
  const tenantId = assertTenantId(user.tenantId, user.role)
  const { id } = await ctx.params
  const row = await prisma.partnerStore.findFirst({ where: { id, ...tenantWhere(user.role, tenantId) } })
  if (!row) return { error: NextResponse.json({ success: false, error: 'Loja parceira não encontrada.' }, { status: 404 }) } as const
  return { user, row } as const
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const g = await load(ctx)
    if ('error' in g) return g.error
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const onlyToggle = Object.keys(body).length === 1 && typeof body.active === 'boolean'
    let data: Record<string, unknown>
    if (onlyToggle) {
      data = { active: body.active }
    } else {
      const parsed = partnerStoreData({ ...g.row, ...body })
      if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
      data = { ...parsed.data, ...(typeof body.active === 'boolean' ? { active: body.active } : {}) }
      const dup = await prisma.partnerStore.findFirst({ where: { tenantId: g.row.tenantId, id: { not: g.row.id }, name: { equals: parsed.data.name, mode: 'insensitive' } }, select: { id: true } })
      if (dup) return NextResponse.json({ success: false, error: 'Já existe uma loja parceira com esse nome.' }, { status: 409 })
    }
    const row = await prisma.partnerStore.update({ where: { id: g.row.id }, data })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.row.tenantId, action: 'UPDATE', entity: 'PartnerStore', entityId: row.id, userName: g.user.name, userRole: g.user.role, beforeData: g.row, afterData: row })
    return NextResponse.json({ success: true, data: row })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const g = await load(ctx)
    if ('error' in g) return g.error
    const used = await prisma.vehicle.count({ where: { partnerStoreId: g.row.id } })
    if (used > 0) {
      await prisma.partnerStore.update({ where: { id: g.row.id }, data: { active: false } })
      return NextResponse.json({ success: true, deactivated: true, message: `A loja tem ${used} carro(s) no histórico: foi desativada (não some do histórico).` })
    }
    await prisma.partnerStore.delete({ where: { id: g.row.id } })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.row.tenantId, action: 'DELETE', entity: 'PartnerStore', entityId: g.row.id, userName: g.user.name, userRole: g.user.role, beforeData: g.row })
    return NextResponse.json({ success: true, deleted: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
