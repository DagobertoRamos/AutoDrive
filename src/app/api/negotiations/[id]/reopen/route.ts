// =============================================================================
// POST /api/negotiations/[id]/reopen — Reabrir negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canReopenDeal } from '@/lib/negotiation-permissions'
import { createDealAudit, createStatusHistory } from '@/lib/negotiation-service'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations.manage')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  if (!canReopenDeal(session.user.role)) {
    return NextResponse.json({ error: 'Apenas ADM e MASTER podem reabrir negociações' }, { status: 403 })
  }

  let body: { notes?: string } = {}
  try {
    body = await req.json()
  } catch { /* ignore */ }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  if (deal.status !== 'CANCELADA' && deal.status !== 'FINALIZADA') {
    return NextResponse.json({ error: 'Apenas negociações canceladas ou finalizadas podem ser reabertas' }, { status: 409 })
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data: {
          status:         'RASCUNHO',
          cancelledAt:    null,
          cancelledById:  null,
          cancelledReason: null,
          finalizedAt:    null,
        },
      })

      const reason = body.notes ?? `Reaberto por ${session.user.name}`
      await createStatusHistory(tx as unknown as any, params.id, deal.status, 'RASCUNHO', session.user.id, reason)

      await createDealAudit(tx as unknown as any, {
        dealId:   params.id,
        tenantId: deal.tenantId,
        unitId:   deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'REABRIR',
        field:    'status',
        oldValue: deal.status,
        newValue: 'RASCUNHO',
        reason,
      })

      await tx.auditLog.create({
        data: {
          userId:        session.user.id,
          tenantId:      session.user.tenantId ?? null,
          action:        'REOPEN',
          entity:        'Deal',
          entityId:      params.id,
          userName:      session.user.name,
          userRole:      session.user.role,
          status:        'SUCCESS',
          afterData:     { status: 'RASCUNHO' } as never,
          beforeData:    { status: deal.status } as never,
        },
      })

      return d
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
