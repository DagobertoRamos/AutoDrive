// =============================================================================
// /api/marketing/sdr/policies/[id] — editar/excluir política de distribuição.
// PATCH / DELETE : marketing.sdr.manage. Tenant-scoped, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { updatePolicySchema } from '@/lib/validators/marketing'
import type { Prisma } from '@prisma/client'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Política não encontrada.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'marketing.sdr.manage'); if (gate) return gate }
  const { id } = await params
  try {
    const existing = await prisma.marketingLeadDistributionPolicy.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Política de outro tenant.')
    const d = updatePolicySchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.name !== undefined) data.name = d.name
    if (d.mode !== undefined) data.mode = d.mode
    if (d.active !== undefined) data.active = d.active
    if (d.teamId !== undefined) data.teamId = d.teamId ?? null
    if (d.unitId !== undefined) data.unitId = d.unitId ?? null
    if (d.priority !== undefined) data.priority = d.priority
    if (d.config !== undefined) data.config = (d.config ?? undefined) as Prisma.InputJsonValue | undefined
    await prisma.marketingLeadDistributionPolicy.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'MarketingLeadDistributionPolicy', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'marketing.sdr.manage'); if (gate) return gate }
  const { id } = await params
  try {
    const existing = await prisma.marketingLeadDistributionPolicy.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Política de outro tenant.')
    await prisma.marketingLeadDistributionPolicy.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'MarketingLeadDistributionPolicy', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
