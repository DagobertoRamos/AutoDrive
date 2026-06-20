// =============================================================================
// POST /api/negotiations/[id]/reject — Desaprovar / Recusar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const REJECTABLE_STATUSES = new Set(['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'])

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations.approve') }
  catch { return NextResponse.json({ error: 'Sem permissão para desaprovar' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations.approve'); if (gate) return gate }

  try {
    const body   = await req.json().catch(() => ({}))
    const reason = (body?.reason as string | undefined)?.trim()
    if (!reason) {
      return NextResponse.json({ error: 'Motivo da desaprovação é obrigatório.' }, { status: 400 })
    }

    const deal = await prisma.deal.findUnique({ where: { id: params.id } })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    if (!REJECTABLE_STATUSES.has(deal.status)) {
      return NextResponse.json({ error: 'Apenas negociações aguardando aprovação podem ser desaprovadas' }, { status: 409 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data: {
          status:        'DESAPROVADA',
          approvedById:  session.user.id,
          approvedAt:    new Date(),
          approvalNotes: reason,
          // legado
          recusedAt:       new Date(),
          recusedByUserId: session.user.id,
          recusedReason:   reason,
        } as object,
      })
      await tx.dealStatusHistory.create({
        data: {
          dealId:          params.id,
          previousStatus:  deal.status,
          newStatus:       'DESAPROVADA',
          changedByUserId: session.user.id,
          reason,
        },
      })
      await tx.auditLog.create({
        data: {
          userId:        session.user.id,
          tenantId:      session.user.tenantId ?? null,
          action:        'REJECT',
          entity:        'Deal',
          entityId:      params.id,
          userName:      session.user.name,
          userRole:      session.user.role,
          status:        'SUCCESS',
          beforeData:    { status: deal.status } as never,
          afterData:     { status: 'DESAPROVADA', reason } as never,
        },
      })
      return d
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
