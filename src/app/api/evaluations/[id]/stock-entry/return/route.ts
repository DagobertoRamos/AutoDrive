// =============================================================================
// POST /api/evaluations/[id]/stock-entry/return
// Gestor devolve ao vendedor (ex.: faltou algo na negociação): volta a LIBERADA.
// Body: { reason?: string }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canApproveServices, canViewEvaluation } from '@/lib/evaluation/permissions'
import { recordHistory } from '@/lib/evaluation/history'
import { EVAL_AWAITING_STOCK } from '@/lib/evaluation/stock-entry-core'
import { evalLabel, loadEvaluationForStock, notifySeller } from '@/lib/evaluation/stock-entry'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await ctxArg.params
  const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
  if (!canApproveServices(user)) return NextResponse.json({ error: 'Apenas gerência pode devolver ao vendedor.' }, { status: 403 })

  try {
    const ev = await loadEvaluationForStock(id)
    if (!ev) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })
    if (!canViewEvaluation(user, { tenantId: ev.tenantId } as never)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    if ((ev.status ?? '').toUpperCase() !== EVAL_AWAITING_STOCK) {
      return NextResponse.json({ error: 'A avaliação não está aguardando entrada no estoque.' }, { status: 409 })
    }

    const body = await req.json().catch(() => ({})) as { reason?: string }
    const reason = String(body.reason ?? '').trim().slice(0, 500) || null

    await prisma.vehicleEvaluation.update({ where: { id }, data: { status: 'LIBERADA' } })
    await recordHistory({
      tenantId: ev.tenantId ?? '', evaluationId: id,
      userId: session.user.id, userName: session.user.name ?? undefined, userRole: session.user.role,
      action: 'RETURN_STOCK_ENTRY',
      oldValue: { status: ev.status }, newValue: { status: 'LIBERADA' },
      notes: reason ?? undefined,
    })
    await notifySeller(ev, 'Entrada no estoque devolvida',
      `${evalLabel(ev)}: o gestor devolveu a avaliação${reason ? ` — ${reason}` : ''}.`,
      `/estoque/avaliacao/${id}/inspecao`)

    return NextResponse.json({ data: { id, status: 'LIBERADA' } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
