// =============================================================================
// /api/marketing/sdr/members/[id] — editar/remover membro da Mesa SDR.
// PATCH / DELETE : marketing.sdr.manage. Tenant-scoped, auditado.
// (Atualização de presença também via PATCH — presence.)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { updateMemberSchema } from '@/lib/validators/marketing'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Membro não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr.manage')) return forbiddenResponse('Sem permissão.')
  const { id } = await params
  try {
    const existing = await prisma.marketingSdrMember.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Membro de outro tenant.')
    const d = updateMemberSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.role !== undefined) data.role = d.role
    if (d.active !== undefined) data.active = d.active
    if (d.presence !== undefined) { data.presence = d.presence; data.lastPresenceAt = new Date() }
    if (d.maxOpenLeads !== undefined) data.maxOpenLeads = d.maxOpenLeads ?? null
    if (d.weight !== undefined) data.weight = d.weight ?? null
    if (d.unitId !== undefined) data.unitId = d.unitId ?? null
    await prisma.marketingSdrMember.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'MarketingSdrMember', entityId: id, userName: user.name, userRole: user.role })
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
    const existing = await prisma.marketingSdrMember.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Membro de outro tenant.')
    await prisma.marketingSdrMember.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'MarketingSdrMember', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
