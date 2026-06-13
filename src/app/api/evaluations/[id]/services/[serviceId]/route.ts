// =============================================================================
// PATCH  /api/evaluations/[id]/services/[serviceId]  — atualizar serviço
// DELETE /api/evaluations/[id]/services/[serviceId]  — remover serviço
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext, recalcItemTotal, recalcTotals } from '@/lib/evaluation/service'
import { canEditEvaluation, canDeleteService } from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'

async function loadService(serviceId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any).evaluationService.findUnique({ where: { id: serviceId } })
}

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string; serviceId: string } | Promise<{ id: string; serviceId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canEditEvaluation(user, ctx))
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const existing = await loadService(params.serviceId)
    if (!existing || existing.evaluationId !== params.id)
      return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })

    const body = await req.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    for (const k of ['description', 'serviceType', 'priority', 'notes', 'status', 'responsibleId']) {
      if (k in body) data[k] = body[k]
    }
    if ('estimatedCost' in body) data.estimatedCost = body.estimatedCost != null ? Number(body.estimatedCost) : 0
    if ('actualCost'    in body) data.actualCost    = body.actualCost    != null ? Number(body.actualCost)    : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma as any).evaluationService.update({
      where: { id: params.serviceId },
      data,
    })

    if (existing.itemId) await recalcItemTotal(existing.itemId)
    await recalcTotals(params.id)

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      itemId: existing.itemId,
      serviceId: params.serviceId,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'UPDATE_SERVICE',
      oldValue: existing,
      newValue: data,
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(
  _req: NextRequest,
  ctxArg: { params: { id: string; serviceId: string } | Promise<{ id: string; serviceId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canDeleteService(user, ctx))
      return NextResponse.json({ error: 'Sem permissão para excluir serviço' }, { status: 403 })

    const existing = await loadService(params.serviceId)
    if (!existing || existing.evaluationId !== params.id)
      return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).evaluationService.delete({ where: { id: params.serviceId } })

    if (existing.itemId) await recalcItemTotal(existing.itemId)
    await recalcTotals(params.id)

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      itemId: existing.itemId,
      serviceId: params.serviceId,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'REMOVE_SERVICE',
      oldValue: existing,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
