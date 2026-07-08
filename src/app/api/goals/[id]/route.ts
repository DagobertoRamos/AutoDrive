// =============================================================================
// /api/goals/[id] — Detalhe, atualização e exclusão de uma meta
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertUnitBelongsToTenant,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canManageGoals, canReadGoal } from '@/lib/goals/service'
import { updateGoalSchema } from '@/lib/validators/goal'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

function notFound() {
  return NextResponse.json({ success: false, error: 'Meta não encontrada.' }, { status: 404 })
}

// ── GET — detalhe ─────────────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'goals'); if (gate) return gate }
  const { id } = await params

  try {
    const goal = await prisma.goal.findUnique({
      where: { id },
      include: { levels: { orderBy: { level: 'asc' } } },
    })
    if (!goal) return notFound()
    if (!canReadGoal(user, goal)) return forbiddenResponse('Sem acesso a esta meta.')

    return NextResponse.json({ success: true, data: goal })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PATCH — atualizar (apenas gestão, dentro do tenant) ───────────────────────

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'goals'); if (gate) return gate }
  if (!canManageGoals(user.role)) return forbiddenResponse('Apenas gestores podem editar metas.')
  const { id } = await params

  try {
    const goal = await prisma.goal.findUnique({ where: { id } })
    if (!goal) return notFound()
    if (user.role !== 'MASTER' && goal.tenantId !== user.tenantId) {
      return forbiddenResponse('Meta de outro tenant.')
    }

    const data = updateGoalSchema.parse(await req.json())

    if (data.unitId) {
      await assertUnitBelongsToTenant(data.unitId, goal.tenantId, user.role)
    }

    const period = data.period !== undefined ? data.period : goal.period
    const scope = data.scope !== undefined ? data.scope : goal.scope

    // Evitar duplicidade de outra meta ativa com os mesmos critérios
    const duplicate = await prisma.goal.findFirst({
      where: {
        id:          { not: id },
        tenantId:    goal.tenantId,
        type:        data.type !== undefined ? data.type : goal.type,
        scope,
        period,
        status:      'ATIVA',
        active:      true,
        ...(scope === 'USER' ? { userId: data.userId !== undefined ? data.userId : goal.userId } : {}),
        ...(scope === 'ROLE' ? { targetRole: data.targetRole !== undefined ? data.targetRole : goal.targetRole } : {}),
        ...(scope === 'UNIT' ? { unitId: data.unitId !== undefined ? data.unitId : goal.unitId } : {}),
      },
    })
    if (duplicate) {
      return NextResponse.json(
        { success: false, error: 'Já existe outra meta ativa cadastrada para este mesmo escopo.' },
        { status: 400 },
      )
    }

    const startDate = data.startDate !== undefined ? data.startDate : goal.startDate
    const endDate = period === 'MONTHLY' ? new Date('2099-12-31T23:59:59.999Z') : (data.endDate !== undefined ? data.endDate : goal.endDate)

    const updated = await prisma.goal.update({
      where: { id },
      data: {
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.scope !== undefined ? { scope: data.scope } : {}),
        ...(data.period !== undefined ? { period: data.period } : {}),
        ...(data.title !== undefined ? { title: data.title ?? null } : {}),
        ...(data.unitId !== undefined ? { unitId: data.unitId ?? null } : {}),
        ...(data.userId !== undefined ? { userId: data.userId ?? null } : {}),
        ...(data.targetRole !== undefined ? { targetRole: data.targetRole ?? null } : {}),
        startDate,
        endDate,
        ...(data.targetValue !== undefined ? { targetValue: data.targetValue } : {}),
        ...(data.measureUnit !== undefined ? { measureUnit: data.measureUnit } : {}),
        ...(data.progressive !== undefined ? { progressive: data.progressive } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
        updatedBy: user.id,
      },
      include: { levels: { orderBy: { level: 'asc' } } },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: goal.tenantId,
      action:   'UPDATE',
      entity:   'Goal',
      entityId: id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0]?.message ?? 'Dados inválidos.', issues: err.errors },
        { status: 400 },
      )
    }
    return handlePrismaError(err)
  }
}

// ── DELETE — excluir (apenas gestão, dentro do tenant) ────────────────────────

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'goals'); if (gate) return gate }
  if (!canManageGoals(user.role)) return forbiddenResponse('Apenas gestores podem excluir metas.')
  const { id } = await params

  try {
    const goal = await prisma.goal.findUnique({ where: { id } })
    if (!goal) return notFound()
    if (user.role !== 'MASTER' && goal.tenantId !== user.tenantId) {
      return forbiddenResponse('Meta de outro tenant.')
    }

    // levels e progress têm onDelete: Cascade no schema.
    await prisma.goal.delete({ where: { id } })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: goal.tenantId,
      action:   'DELETE',
      entity:   'Goal',
      entityId: id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
