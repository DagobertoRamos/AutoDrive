// =============================================================================
// /api/goals/[id]/progress — Calcular (GET) e persistir snapshot (POST) do
// progresso de uma meta. Todo o cálculo vive no service layer.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canReadGoal, canManageGoals, computeGoalProgress, persistGoalProgress } from '@/lib/goals/service'

type Ctx = { params: Promise<{ id: string }> }

function notFound() {
  return NextResponse.json({ success: false, error: 'Meta não encontrada.' }, { status: 404 })
}

// ── GET — calcular progresso (sem persistir) ──────────────────────────────────

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const { id } = await params

  try {
    const goal = await prisma.goal.findUnique({
      where: { id },
      include: { levels: { orderBy: { level: 'asc' } } },
    })
    if (!goal) return notFound()
    if (!canReadGoal(user, goal)) return forbiddenResponse('Sem acesso a esta meta.')

    const progress = await computeGoalProgress(goal, new Date())
    return NextResponse.json({ success: true, data: progress })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — recalcular e persistir o snapshot (apenas gestão) ──────────────────

export async function POST(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canManageGoals(user.role)) return forbiddenResponse('Apenas gestores podem recalcular metas.')
  const { id } = await params

  try {
    const goal = await prisma.goal.findUnique({
      where: { id },
      include: { levels: { orderBy: { level: 'asc' } } },
    })
    if (!goal) return notFound()
    if (user.role !== 'MASTER' && goal.tenantId !== user.tenantId) {
      return forbiddenResponse('Meta de outro tenant.')
    }

    const progress = await persistGoalProgress(goal, new Date())
    return NextResponse.json({ success: true, data: progress })
  } catch (err) {
    return handlePrismaError(err)
  }
}
