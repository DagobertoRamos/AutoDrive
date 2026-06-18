// =============================================================================
// /api/marketing/sdr/teams/[id] — editar/excluir time SDR.
// PATCH / DELETE : marketing.sdr.manage. Tenant-scoped, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { updateTeamSchema } from '@/lib/validators/marketing'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Time não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr.manage')) return forbiddenResponse('Sem permissão.')
  const { id } = await params
  try {
    const existing = await prisma.marketingSdrTeam.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Time de outro tenant.')
    const d = updateTeamSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.name !== undefined) data.name = d.name
    if (d.description !== undefined) data.description = d.description ?? null
    if (d.unitId !== undefined) data.unitId = d.unitId ?? null
    if (d.active !== undefined) data.active = d.active
    await prisma.marketingSdrTeam.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'MarketingSdrTeam', entityId: id, userName: user.name, userRole: user.role })
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
  const { id } = await params
  try {
    const existing = await prisma.marketingSdrTeam.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Time de outro tenant.')
    // Membros são removidos em cascata (onDelete: Cascade).
    await prisma.marketingSdrTeam.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'MarketingSdrTeam', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
