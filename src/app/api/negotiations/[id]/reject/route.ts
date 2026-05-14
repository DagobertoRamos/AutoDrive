// =============================================================================
// POST /api/negotiations/[id]/reject — Recusar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations.approve')
  } catch {
    return NextResponse.json({ error: 'Sem permissão para recusar' }, { status: 403 })
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (deal.status !== 'AGUARDANDO_LIBERACAO') {
    return NextResponse.json({ error: 'Apenas negociações aguardando liberação podem ser recusadas' }, { status: 409 })
  }

  let reason = 'Recusada pelo gerente'
  try {
    const body = await req.json()
    if (body?.reason) reason = body.reason
  } catch {
    // reason not provided — use default
  }

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.deal.update({
      where: { id: params.id },
      data:  { status: 'RECUSADA' },
    })
    await tx.dealStatusHistory.create({
      data: {
        dealId:         params.id,
        previousStatus: 'AGUARDANDO_LIBERACAO',
        newStatus:      'RECUSADA',
        changedByUserId:    session.user.id,
        reason,
      },
    })
    await tx.auditLog.create({
      data: {
        userId:   session.user.id,
        tenantId: session.user.tenantId ?? null,
        action:   'REJECT',
        entity:   'Deal',
        entityId: params.id,
        userName: session.user.name,
        userRole: session.user.role,
        status:   'SUCCESS',
      },
    })
    return d
  })

  return NextResponse.json({ data: updated })
}
