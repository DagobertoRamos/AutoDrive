// =============================================================================
// POST /api/evaluations/[id]/cancel — cancela avaliação (gerência+); requer motivo.
// Marca status='CANCELADA', registra cancelledById/cancelReason/cancelledAt.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canCancelEvaluation }   from '@/lib/evaluation/permissions'
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
    if (!canCancelEvaluation(user)) {
      return NextResponse.json({ error: 'Apenas gerência pode cancelar a avaliação.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = String(body?.reason ?? body?.motivo ?? '').trim()
    if (!reason) {
      return NextResponse.json({ error: 'Motivo do cancelamento é obrigatório.' }, { status: 400 })
    }

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: 'CANCELADA' as any,
        cancelledAt:   new Date(),
        cancelledById: session.user.id,
        cancelReason:  reason,
      },
    })

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'CANCEL',
      oldValue: { status: ctx.status },
      newValue: { status: 'CANCELADA', reason },
    }).catch(() => {})

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
