// =============================================================================
// POST /api/evaluations/[id]/items/[itemId]/revaluate
//
// Reavaliação de item: cria um EvaluationService vinculado ao item, atualiza
// status/notes do item, registra história e recalcula totais.
//
// Body:
//   {
//     status?: 'CONFORME' | 'ATENCAO' | 'REPARO' | 'OBRIGATORIO' | 'REAVALIAR' | 'NA',
//     priority?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE',
//     itemNotes?: string,
//     service: {
//       serviceType: string,
//       description: string,
//       estimatedCost: number,
//       priority?: string,
//       notes?: string,
//       responsibleId?: string,
//     } | null  // null = só atualiza item (sem adicionar serviço novo)
//   }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext, recalcItemTotal, recalcTotals } from '@/lib/evaluation/service'
import { canRevaluateItem }     from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string; itemId: string } | Promise<{ id: string; itemId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canRevaluateItem(user, ctx))
      return NextResponse.json({ error: 'Sem permissão para reavaliar' }, { status: 403 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item: any = await (prisma as any).evaluationItem.findUnique({
      where: { id: params.itemId },
    })
    if (!item || item.evaluationId !== params.id)
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })

    const body = await req.json()
    const { status, priority, itemNotes, service } = body

    let newService = null

    await prisma.$transaction(async (tx) => {
      // 1) Atualiza item (status/priority/notes)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemUpdates: any = {}
      if (status    !== undefined) itemUpdates.status   = status
      if (priority  !== undefined) itemUpdates.priority = priority
      if (itemNotes !== undefined) itemUpdates.notes    = itemNotes

      if (Object.keys(itemUpdates).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx as any).evaluationItem.update({
          where: { id: params.itemId },
          data:  itemUpdates,
        })
      }

      // 2) Cria service (se enviado)
      if (service && service.serviceType && service.description) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newService = await (tx as any).evaluationService.create({
          data: {
            tenantId:     ctx.tenantId ?? null,
            evaluationId: params.id,
            itemId:       params.itemId,
            section:      item.section,
            description:  String(service.description),
            serviceType:  String(service.serviceType),
            estimatedCost: service.estimatedCost != null ? Number(service.estimatedCost) : 0,
            priority:     service.priority      ?? priority ?? null,
            notes:        service.notes         ?? null,
            responsibleId: service.responsibleId ?? null,
            status:       'PREDICTED',
            createdById:  session.user.id,
          },
        })
      }
    })

    // 3) Recalcula totais (item + avaliação)
    await recalcItemTotal(params.itemId)
    await recalcTotals(params.id)

    // 4) Histórico
    await recordHistory({
      tenantId:    ctx.tenantId ?? '',
      evaluationId:params.id,
      itemId:      params.itemId,
      serviceId:   (newService as { id?: string } | null)?.id ?? null,
      userId:      session.user.id,
      userName:    session.user.name,
      userRole:    session.user.role,
      action:      newService ? 'ADD_SERVICE' : 'REVALUATE',
      oldValue:    { status: item.status, priority: item.priority, notes: item.notes },
      newValue:    { status, priority, itemNotes, service },
    })

    // 5) Retornar item atualizado + service + total da avaliação
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fresh: any = await (prisma as any).evaluationItem.findUnique({
      where: { id: params.itemId },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const services: any[] = await (prisma as any).evaluationService.findMany({
      where: { itemId: params.itemId, status: { not: 'CANCELED' } },
      orderBy: { createdAt: 'asc' },
    })
    const ev = await prisma.vehicleEvaluation.findUnique({
      where: { id: params.id },
      select: { totalExpenses: true, status: true },
    })

    // Marca a avaliação como IN_PROGRESS se ainda estava DRAFT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((ev as any)?.status === 'DRAFT') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.vehicleEvaluation.update({
        where: { id: params.id },
        data:  { status: 'IN_PROGRESS' as never },
      }).catch(() => {})
    }

    return NextResponse.json({
      data: {
        item:          fresh,
        services,
        service:       newService,
        totalExpenses: ev?.totalExpenses ?? 0,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
