// =============================================================================
// PATCH /api/evaluations/[id]/items/[itemId] — atualizar status/notes/priority do item
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canEditEvaluation }    from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canEditEvaluation(user, ctx))
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const body = await req.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any = await (prisma as any).evaluationItem.findUnique({
      where: { id: params.itemId },
    })
    if (!existing || existing.evaluationId !== params.id) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    for (const k of ['status', 'priority', 'notes']) if (k in body) data[k] = body[k]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma as any).evaluationItem.update({
      where: { id: params.itemId },
      data,
    })

    await recordHistory({
      tenantId:    ctx.tenantId ?? '',
      evaluationId:params.id,
      itemId:      params.itemId,
      userId:      session.user.id,
      userName:    session.user.name,
      userRole:    session.user.role,
      action:      'UPDATE_ITEM',
      oldValue:    { status: existing.status, priority: existing.priority, notes: existing.notes },
      newValue:    data,
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
