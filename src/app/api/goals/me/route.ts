// =============================================================================
// /api/goals/me — Metas relevantes para o usuário logado, com progresso já
// calculado. Base para os cards do dashboard do vendedor.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { goalReadWhere, computeGoalProgress } from '@/lib/goals/service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

// ── GET — metas ativas do usuário + progresso ─────────────────────────────────

export async function GET(_req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'goals'); if (gate) return gate }

  try {
    const goals = await prisma.goal.findMany({
      where: { ...goalReadWhere(user), status: 'ATIVA', active: true },
      include: { levels: { orderBy: { level: 'asc' } } },
    })

    // Agrupa metas por (type, period) e resolve por prioridade (USER > ROLE > UNIT > TENANT > GLOBAL)
    const groups: Record<string, typeof goals> = {}
    for (const g of goals) {
      const key = `${g.type}_${g.period}`
      if (!groups[key]) groups[key] = []
      groups[key].push(g)
    }

    const scopePriority: Record<string, number> = {
      USER: 1,
      ROLE: 2,
      UNIT: 3,
      TENANT: 4,
      GLOBAL: 5,
    }

    const resolvedGoals: typeof goals = []
    for (const key in groups) {
      const sorted = groups[key].sort((a, b) => (scopePriority[a.scope] ?? 99) - (scopePriority[b.scope] ?? 99))
      resolvedGoals.push(sorted[0])
    }

    // Ordenar resolvedGoals para manter exibição organizada por escopo e tipo
    resolvedGoals.sort((a, b) => {
      if (a.scope !== b.scope) return (scopePriority[a.scope] ?? 99) - (scopePriority[b.scope] ?? 99)
      return a.type.localeCompare(b.type)
    })

    const now = new Date()
    const data = await Promise.all(
      resolvedGoals.map(async (goal) => ({
        goal,
        progress: await computeGoalProgress(goal, now, user.id),
      })),
    )

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
