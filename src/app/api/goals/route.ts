// =============================================================================
// /api/goals — Listar e criar metas comerciais (multi-tenant, por escopo)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  assertUnitBelongsToTenant,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canManageGoals, goalReadWhere } from '@/lib/goals/service'
import { createGoalSchema } from '@/lib/validators/goal'

function zodResponse(err: ZodError) {
  return NextResponse.json(
    { success: false, error: err.errors[0]?.message ?? 'Dados inválidos.', issues: err.errors },
    { status: 400 },
  )
}

// ── GET — listar metas que o usuário pode ver ─────────────────────────────────

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const { searchParams } = new URL(req.url)
    const filters: Record<string, unknown> = {}
    const type = searchParams.get('type')
    const scope = searchParams.get('scope')
    const status = searchParams.get('status')
    const unitId = searchParams.get('unitId')
    const userId = searchParams.get('userId')
    if (type) filters.type = type
    if (scope) filters.scope = scope
    if (status) filters.status = status
    if (unitId) filters.unitId = unitId
    if (userId) filters.userId = userId

    const goals = await prisma.goal.findMany({
      where: { ...goalReadWhere(user), ...filters },
      include: { levels: { orderBy: { level: 'asc' } } },
      orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
    })

    return NextResponse.json({ success: true, data: goals })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — criar meta (apenas gestão) ─────────────────────────────────────────

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  if (!canManageGoals(user.role)) {
    return forbiddenResponse('Apenas gestores podem cadastrar metas.')
  }

  try {
    const data = createGoalSchema.parse(await req.json())

    if (data.scope === 'GLOBAL' && user.role !== 'MASTER') {
      return forbiddenResponse('Apenas MASTER pode criar metas globais.')
    }

    const tenantId = data.scope === 'GLOBAL' ? null : assertTenantId(user.tenantId, user.role)

    if (data.scope === 'UNIT' && data.unitId) {
      await assertUnitBelongsToTenant(data.unitId, tenantId, user.role)
    }

    const goal = await prisma.goal.create({
      data: {
        tenantId,
        unitId:      data.scope === 'UNIT' ? data.unitId : null,
        userId:      data.scope === 'USER' ? data.userId : null,
        type:        data.type,
        scope:       data.scope,
        period:      data.period,
        title:       data.title ?? null,
        startDate:   data.startDate,
        endDate:     data.endDate,
        targetValue: data.targetValue,
        measureUnit: data.measureUnit,
        progressive: data.progressive,
        notes:       data.notes ?? null,
        createdBy:   user.id,
        ...(data.progressive && data.levels?.length
          ? {
              levels: {
                create: data.levels.map((l) => ({
                  level:       l.level,
                  targetValue: l.targetValue,
                  label:       l.label ?? null,
                  reward:      l.reward ?? null,
                })),
              },
            }
          : {}),
      },
      include: { levels: { orderBy: { level: 'asc' } } },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'CREATE',
      entity:   'Goal',
      entityId: goal.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: goal }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodResponse(err)
    return handlePrismaError(err)
  }
}
