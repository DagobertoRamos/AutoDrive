// =============================================================================
// POST /api/evaluations/[id]/finish — finaliza avaliação
// Valida cabeçalho mínimo, recalcula totais, marca status=FINALIZED.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext, recalcTotals } from '@/lib/evaluation/service'
import { canFinishEvaluation } from '@/lib/evaluation/permissions'
import { recordHistory }       from '@/lib/evaluation/history'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canFinishEvaluation(user, ctx))
      return NextResponse.json({ error: 'Sem permissão para finalizar' }, { status: 403 })

    const ev = await prisma.vehicleEvaluation.findUnique({ where: { id: params.id } })
    if (!ev) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    // Validações mínimas
    const errors: string[] = []
    if (!ev.plate) errors.push('Placa é obrigatória.')
    if (!ev.brand || !ev.model) errors.push('Marca e modelo são obrigatórios.')
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0], errors }, { status: 400 })
    }

    await recalcTotals(params.id)

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data:  {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status:      'FINALIZED' as any,
        evaluatedAt: new Date(),
      },
    })

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'FINISH',
      newValue: { status: 'FINALIZED' },
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
