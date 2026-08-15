// =============================================================================
// POST /api/evaluations/[id]/services
//
// Cria/atualiza um serviço da avaliação:
//   • sem itemId  → serviço GERAL (aba "Serviços");
//   • com itemId  → serviço VINCULADO ao item (lançado pelo ItemDrawer).
//
// IDEMPOTENTE para serviços de item: faz upsert por
// (evaluationId, itemId, serviceType). Antes, a rota IGNORAVA o itemId enviado
// e criava sempre um registro novo com itemId=null/section=GERAL — reeditar o
// mesmo item duplicava o serviço, inflava o total de gastos e desvinculava o
// custo do item. Duplo clique também gerava dois registros.
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

    const rawItemId = typeof body.itemId === 'string' ? body.itemId.trim() : ''
    let itemId: string | null = null
    let section = 'GERAL'

    if (rawItemId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = await (prisma as any).evaluationItem.findUnique({
        where:  { id: rawItemId },
        select: { id: true, evaluationId: true, section: true },
      })
      // Item de OUTRA avaliação nunca pode ser vinculado aqui.
      if (!item || item.evaluationId !== params.id) {
        return NextResponse.json({ error: 'Item não encontrado nesta avaliação.' }, { status: 404 })
      }
      itemId  = item.id
      section = item.section ?? 'GERAL'
    }

    const data = {
      tenantId:      ctx.tenantId ?? null,
      evaluationId:  params.id,
      itemId,
      section,
      description:   String(description),
      serviceType:   String(serviceType),
      estimatedCost: estimatedCost != null ? Number(estimatedCost) : 0,
      priority:      priority      ?? null,
      notes:         notes         ?? null,
      responsibleId: responsibleId ?? null,
    }

    // Serviço de item: 1 registro por (item, tipo de serviço) — reeditar
    // atualiza; não duplica.
    const existing = itemId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? await (prisma as any).evaluationService.findFirst({
          where: {
            evaluationId: params.id,
            itemId,
            serviceType: String(serviceType),
            status: { not: 'CANCELED' },
          },
          select: { id: true },
        })
      : null

    const saved = existing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? await (prisma as any).evaluationService.update({
          where: { id: existing.id },
          data,
        })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : await (prisma as any).evaluationService.create({
          data: { ...data, status: 'PREDICTED', createdById: session.user.id },
        })

    await recalcTotals(params.id)
    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      itemId:    itemId ?? undefined,
      serviceId: saved.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: existing ? 'UPDATE_SERVICE' : 'ADD_SERVICE',
      newValue: { serviceType, description, estimatedCost, itemId },
    })

    return NextResponse.json({ data: saved }, { status: existing ? 200 : 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
