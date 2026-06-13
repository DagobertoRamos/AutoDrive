// =============================================================================
// POST /api/evaluations/[id]/reject — recusa avaliação (gerência+); requer motivo.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canApproveServices }   from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'

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
    if (!canApproveServices(user)) {
      return NextResponse.json({ error: 'Apenas gerência pode recusar.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = String(body?.reason ?? '').trim()
    if (!reason) return NextResponse.json({ error: 'Motivo da recusa é obrigatório.' }, { status: 400 })

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data: {
        result: 'RECUSADO',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: 'REJECTED' as any,
        evaluationNotes: reason,
      },
    })

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'REJECT',
      newValue: { status: 'REJECTED', result: 'RECUSADO', reason },
    }).catch(() => {})

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
