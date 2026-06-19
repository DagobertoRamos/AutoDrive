// =============================================================================
// /api/marketing/sdr/teams — Mesa SDR: times de pré-vendas (loja).
//   GET  : marketing.sdr        — lista times do tenant (+contagem de membros)
//   POST : marketing.sdr.manage — cria time
// Tenant-scoped, auditado. (Fase 3.)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/marketing/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createTeamSchema } from '@/lib/validators/marketing'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr')) return forbiddenResponse('Sem acesso à Mesa SDR.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  try {
    const rows = await prisma.marketingSdrTeam.findMany({
      where: { tenantId: tid },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { members: true } } },
    })
    return NextResponse.json({
      success: true,
      data: rows.map((t) => ({ id: t.id, name: t.name, description: t.description, unitId: t.unitId, active: t.active, members: t._count.members })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr.manage')) return forbiddenResponse('Sem permissão para gerenciar a Mesa SDR.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  try {
    const d = createTeamSchema.parse(await req.json())
    const t = await prisma.marketingSdrTeam.create({
      data: { tenantId: tid, name: d.name, description: d.description ?? null, unitId: d.unitId ?? null, active: d.active, createdById: user.id },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'CREATE', entity: 'MarketingSdrTeam', entityId: t.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: t.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
