// =============================================================================
// POST /api/evaluations/[id]/services
// Cria um serviço GERAL (sem itemId) — usado na aba "Serviços" da avaliação.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext, recalcTotals } from '@/lib/evaluation/service'
import { canEditEvaluation }    from '@/lib/evaluation/permissions'
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
    if (!canEditEvaluation(user, ctx))
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json()
    const { serviceType, description, estimatedCost, priority, notes, responsibleId } = body
    if (!serviceType || !description) {
      return NextResponse.json({ error: 'serviceType e description são obrigatórios.' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (prisma as any).evaluationService.create({
      data: {
        tenantId:     ctx.tenantId ?? null,
        evaluationId: params.id,
        itemId:       null,
        section:      'GERAL',
        description:  String(description),
        serviceType:  String(serviceType),
        estimatedCost: estimatedCost != null ? Number(estimatedCost) : 0,
        priority:     priority      ?? null,
        notes:        notes         ?? null,
        responsibleId: responsibleId ?? null,
        status:       'PREDICTED',
        createdById:  session.user.id,
      },
    })

    await recalcTotals(params.id)
    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      serviceId: created.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'ADD_SERVICE',
      newValue: { serviceType, description, estimatedCost },
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
