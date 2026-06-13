// =============================================================================
// POST /api/evaluations/[id]/reopen — reabre avaliação finalizada (gerência+).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canReopenEvaluation } from '@/lib/evaluation/permissions'
import { recordHistory }       from '@/lib/evaluation/history'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canReopenEvaluation(user, ctx))
      return NextResponse.json({ error: 'Sem permissão para reabrir' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const reason = body?.reason ? String(body.reason) : null

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data:  { status: 'REOPENED' as never },
    })

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'REOPEN',
      oldValue: { status: ctx.status },
      newValue: { status: 'REOPENED' },
      notes: reason ?? undefined,
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
