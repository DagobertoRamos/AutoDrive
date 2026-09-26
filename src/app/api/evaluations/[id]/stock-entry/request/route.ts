// =============================================================================
// POST /api/evaluations/[id]/stock-entry/request
// Vendedor devolve a avaliação ao gestor depois que o cliente aceitou a
// proposta: status → AGUARDANDO_ENTRADA e os gerentes são avisados.
// Body opcional: { note?: string }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canViewEvaluation } from '@/lib/evaluation/permissions'
import { recordHistory } from '@/lib/evaluation/history'
import { blockRequestStockEntry, EVAL_AWAITING_STOCK } from '@/lib/evaluation/stock-entry-core'
import { loadEvaluationForStock, notifyManagersStockRequest } from '@/lib/evaluation/stock-entry'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await ctxArg.params

  try {
    const ev = await loadEvaluationForStock(id)
    if (!ev) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canViewEvaluation(user, { tenantId: ev.tenantId } as never)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const blocked = blockRequestStockEntry(ev)
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

    const body = await req.json().catch(() => ({})) as { note?: string }
    const note = String(body.note ?? '').trim().slice(0, 500) || null

    await prisma.vehicleEvaluation.update({ where: { id }, data: { status: EVAL_AWAITING_STOCK } })
    await recordHistory({
      tenantId: ev.tenantId ?? '', evaluationId: id,
      userId: session.user.id, userName: session.user.name ?? undefined, userRole: session.user.role,
      action: 'REQUEST_STOCK_ENTRY',
      oldValue: { status: ev.status }, newValue: { status: EVAL_AWAITING_STOCK },
      notes: note ?? undefined,
    })
    await notifyManagersStockRequest(ev, session.user.name ?? null)

    return NextResponse.json({ data: { id, status: EVAL_AWAITING_STOCK } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
