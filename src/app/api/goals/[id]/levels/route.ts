// =============================================================================
// /api/goals/[id]/levels — Listar e substituir os níveis de progressão da meta
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canManageGoals, canReadGoal } from '@/lib/goals/service'
import { replaceLevelsSchema } from '@/lib/validators/goal'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

function notFound() {
  return NextResponse.json({ success: false, error: 'Meta não encontrada.' }, { status: 404 })
}

// ── GET — listar níveis ───────────────────────────────────────────────────────

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

    return NextResponse.json({ success: true, data: goal.levels })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PUT — substituir todos os níveis (apenas gestão) ──────────────────────────

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'goals'); if (gate) return gate }
  if (!canManageGoals(user.role)) return forbiddenResponse('Apenas gestores podem configurar níveis.')
  const { id } = await params

  try {
    const goal = await prisma.goal.findUnique({ where: { id } })
    if (!goal) return notFound()
    if (user.role !== 'MASTER' && goal.tenantId !== user.tenantId) {
      return forbiddenResponse('Meta de outro tenant.')
    }

    const { levels } = replaceLevelsSchema.parse(await req.json())

    // Substituição atômica: remove os antigos e recria.
    const result = await prisma.$transaction(async (tx) => {
      await tx.goalLevel.deleteMany({ where: { goalId: id } })
      if (levels.length > 0) {
        await tx.goalLevel.createMany({
          data: levels.map((l) => ({
            goalId:      id,
            level:       l.level,
            targetValue: l.targetValue,
            label:       l.label ?? null,
            reward:      l.reward ?? null,
          })),
        })
      }
      // Meta passa a ser progressiva sse há níveis; simples caso contrário.
      await tx.goal.update({
        where: { id },
        data:  { progressive: levels.length > 0, updatedBy: user.id },
      })
      return tx.goalLevel.findMany({ where: { goalId: id }, orderBy: { level: 'asc' } })
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: goal.tenantId,
      action:   'UPDATE',
      entity:   'GoalLevels',
      entityId: id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: result })
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
