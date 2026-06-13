// =============================================================================
// GET /api/evaluations/[id]/history[?itemId=]
// Lista o histórico de uma avaliação ou de um item específico.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canViewEvaluation }    from '@/lib/evaluation/permissions'

export async function GET(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canViewEvaluation(user, ctx))
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const itemId = req.nextUrl.searchParams.get('itemId') ?? undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { evaluationId: params.id }
    if (itemId) where.itemId = itemId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await (prisma as any).evaluationHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    }).catch(() => [])

    return NextResponse.json({ data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
