// =============================================================================
// /api/marketing/sdr/members — Mesa SDR: membros (pré-vendedores) de um time.
//   GET  : marketing.sdr        — lista membros do tenant (filtro ?teamId=)
//   POST : marketing.sdr.manage — adiciona membro (valida time e usuário do tenant)
// Tenant-scoped, auditado. (Fase 3.)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createMemberSchema } from '@/lib/validators/marketing'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr')) return forbiddenResponse('Sem acesso à Mesa SDR.')
  const tid = user.tenantId
  if (!tid) return forbiddenResponse('A Mesa SDR pertence à loja.')
  const teamId = new URL(req.url).searchParams.get('teamId') ?? undefined
  try {
    const rows = await prisma.marketingSdrMember.findMany({
      where: { tenantId: tid, ...(teamId ? { teamId } : {}) },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({
      success: true,
      data: rows.map((m) => ({
        id: m.id, teamId: m.teamId, userId: m.userId, role: m.role, active: m.active,
        presence: m.presence, maxOpenLeads: m.maxOpenLeads, weight: m.weight == null ? null : Number(m.weight),
        unitId: m.unitId, lastAssignedAt: m.lastAssignedAt,
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr.manage')) return forbiddenResponse('Sem permissão para gerenciar a Mesa SDR.')
  const tid = user.tenantId
  if (!tid) return forbiddenResponse('A Mesa SDR pertence à loja.')
  try {
    const d = createMemberSchema.parse(await req.json())
    // Time precisa ser do tenant.
    const team = await prisma.marketingSdrTeam.findFirst({ where: { id: d.teamId, tenantId: tid }, select: { id: true } })
    if (!team) return NextResponse.json({ success: false, error: 'Time inválido para esta loja.' }, { status: 400 })
    // Usuário precisa pertencer ao tenant.
    const member = await prisma.user.findFirst({ where: { id: d.userId, tenantId: tid }, select: { id: true } })
    if (!member) return NextResponse.json({ success: false, error: 'Usuário inválido para esta loja.' }, { status: 400 })

    const m = await prisma.marketingSdrMember.create({
      data: {
        tenantId: tid, teamId: d.teamId, userId: d.userId, role: d.role, active: d.active,
        maxOpenLeads: d.maxOpenLeads ?? null, weight: d.weight ?? null, unitId: d.unitId ?? null,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'CREATE', entity: 'MarketingSdrMember', entityId: m.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: m.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
