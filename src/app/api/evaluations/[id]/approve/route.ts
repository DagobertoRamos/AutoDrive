// =============================================================================
// POST /api/evaluations/[id]/approve — aprova (gerência+) e libera resultado.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canApproveServices }   from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'

export async function POST(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canApproveServices(user)) {
      return NextResponse.json({ error: 'Apenas gerência pode aprovar.' }, { status: 403 })
    }

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data: {
        result: 'APROVADO',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: 'APPROVED' as any,
        evaluatedAt: new Date(),
      },
    })

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'APPROVE',
      oldValue: { status: ctx.status, result: 'PENDENTE' },
      newValue: { status: 'APPROVED', result: 'APROVADO' },
    }).catch(() => {})

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
