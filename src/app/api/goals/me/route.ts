// =============================================================================
// /api/goals/me — Metas relevantes para o usuário logado, com progresso já
// calculado. Base para os cards do dashboard do vendedor.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { goalReadWhere, computeGoalProgress } from '@/lib/goals/service'

// ── GET — metas ativas do usuário + progresso ─────────────────────────────────

export async function GET(_req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const goals = await prisma.goal.findMany({
      where: { ...goalReadWhere(user), status: 'ATIVA', active: true },
      include: { levels: { orderBy: { level: 'asc' } } },
      orderBy: [{ scope: 'asc' }, { type: 'asc' }],
    })

    const now = new Date()
    const data = await Promise.all(
      goals.map(async (goal) => ({
        goal,
        progress: await computeGoalProgress(goal, now),
      })),
    )

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
