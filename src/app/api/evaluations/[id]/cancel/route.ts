// =============================================================================
// POST /api/evaluations/[id]/cancel — cancela avaliação (gerência+); requer motivo.
// Marca status='CANCELADA' (fica no sistema), registra no histórico e nos leads.
// Carro já no estoque: só depois de devolvido (negociação ou estoque).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canCancelEvaluation, canViewEvaluation }   from '@/lib/evaluation/permissions'
import { cancelEvaluation }     from '@/lib/evaluation/cancel-service'

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
    if (!canViewEvaluation(user, ctx)) {
      return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    }
    if (['CANCELADA', 'CANCELED'].includes(String(ctx.status ?? '').toUpperCase())) {
      return NextResponse.json({ error: 'Avaliação já cancelada.' }, { status: 409 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = String(body?.reason ?? body?.motivo ?? '').trim()
    if (!reason) {
      return NextResponse.json({ error: 'Motivo do cancelamento é obrigatório.' }, { status: 400 })
    }

    // Serviço único: histórico da avaliação + registro nos leads ligados.
    const r = await cancelEvaluation({
      tenantId: ctx.tenantId ?? '', evaluationId: params.id, reason, origin: 'MANUAL',
      actor: { id: session.user.id, name: session.user.name ?? null, role: session.user.role },
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    const updated = await prisma.vehicleEvaluation.findUnique({ where: { id: params.id } })
    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
