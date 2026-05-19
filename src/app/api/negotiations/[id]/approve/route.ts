// =============================================================================
// POST /api/negotiations/[id]/approve — Aprovar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { APPROVABLE_STATUSES }  from '@/lib/negotiation-permissions'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations.approve') }
  catch { return NextResponse.json({ error: 'Sem permissão para aprovar' }, { status: 403 }) }

  try {
    const body  = await req.json().catch(() => ({}))
    const notes = body?.notes as string | undefined

    const deal = await prisma.deal.findUnique({ where: { id: params.id } })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    if (!APPROVABLE_STATUSES.has(deal.status)) {
      return NextResponse.json({ error: 'Apenas negociações aguardando aprovação podem ser aprovadas' }, { status: 409 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data: {
          status:       'APROVADA',
          approvedById: session.user.id,
          approvedAt:   new Date(),
          approvalNotes: notes ?? null,
          // legado
          releasedAt:       new Date(),
          releasedByUserId: session.user.id,
        } as object,
      })
      await tx.dealStatusHistory.create({
        data: {
          dealId:          params.id,
          previousStatus:  deal.status,
          newStatus:       'APROVADA',
          changedByUserId: session.user.id,
          reason:          notes ?? `Aprovado por ${session.user.name}`,
        },
      })
      await tx.auditLog.create({
        data: {
          userId:   session.user.id,
          tenantId: session.user.tenantId ?? null,
          action:   'APPROVE',
          entity:   'Deal',
          entityId: params.id,
          userName: session.user.name,
          userRole: session.user.role,
          status:   'SUCCESS',
          afterData: { status: 'APROVADA', notes } as never,
        },
      })
      return d
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
