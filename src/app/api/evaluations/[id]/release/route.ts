// =============================================================================
// POST /api/evaluations/[id]/release
//
// Gerente+ precifica e libera o resultado da avaliação ao vendedor.
// Aceita body opcional com:
//   - evaluatedValue, desiredValue, minimumValue, suggestedSalePrice (R$)
//   - evaluatorFeedback (texto)
// Define status='LIBERADA' + releasedAt + releasedByUserId. Notifica o
// vendedor (approvalRequestedById ou evaluatedById) via in-app/email/whatsapp.
//
// IMPORTANTE: NÃO cria Vehicle aqui. A entrada no estoque acontece apenas
// quando uma negociação do tipo COMPRA for finalizada/aprovada — esse é o
// momento real em que a loja "comprou" o veículo. Até lá a avaliação fica
// disponível para seleção no fluxo COMPRA via /api/negotiations/evaluations.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canApproveServices }   from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'
import { notify }               from '@/services/notification.service'

function safeNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canApproveServices(user)) {
      return NextResponse.json({ error: 'Apenas gerência pode liberar o resultado.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
      status: 'LIBERADA',
      releasedAt:       new Date(),
      releasedByUserId: session.user.id,
    }
    const evaluatedValue   = safeNumber(body?.evaluatedValue)
    const desiredValue     = safeNumber(body?.desiredValue)
    const minimumValue     = safeNumber(body?.minimumValue)
    const suggestedPrice   = safeNumber(body?.suggestedSalePrice)
    if (evaluatedValue   != null) data.evaluatedValue   = evaluatedValue
    if (desiredValue     != null) data.desiredValue     = desiredValue
    if (minimumValue     != null) data.minimumValue     = minimumValue
    if (suggestedPrice   != null) data.suggestedSalePrice = suggestedPrice
    if (typeof body?.evaluatorFeedback === 'string') data.evaluatorFeedback = body.evaluatorFeedback

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data,
    })

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'RELEASE',
      oldValue: { status: ctx.status },
      newValue: { status: 'LIBERADA', evaluatedValue, desiredValue, minimumValue, suggestedSalePrice: suggestedPrice },
    }).catch(() => {})

    // ── Notifica vendedor (in-app obrigatório; email/whatsapp best-effort) ─
    try {
      const ev = await prisma.vehicleEvaluation.findUnique({
        where: { id: params.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        select: { plate: true, brand: true, model: true, evaluatedById: true, approvalRequestedById: true } as any,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sellerId: string | null = (ev as any)?.approvalRequestedById ?? ev?.evaluatedById ?? null
      if (sellerId) {
        const desc = [ev?.plate, ev?.brand, ev?.model].filter(Boolean).join(' • ') || 'Avaliação'
        await notify({
          userId:   sellerId,
          tenantId: ctx.tenantId ?? null,
          type:     'NEGOCIACAO_LIBERADA',
          title:    'Avaliação liberada pelo gerente',
          message:  `${desc} foi precificada e liberada. Confira os valores.`,
          actionUrl: `/estoque/avaliacao/${params.id}/inspecao`,
          metadata:  { evaluationId: params.id },
          channels:  ['APP_WEB', 'EMAIL', 'WHATSAPP'],
        })
      }
    } catch (e) {
      console.error('[release] notify seller failed', e)
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
