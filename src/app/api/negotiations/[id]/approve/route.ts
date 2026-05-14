// =============================================================================
// POST /api/negotiations/[id]/approve — Aprovar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations.approve')
  } catch {
    return NextResponse.json({ error: 'Sem permissão para aprovar' }, { status: 403 })
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (deal.status !== 'AGUARDANDO_LIBERACAO') {
    return NextResponse.json({ error: 'Apenas negociações aguardando liberação podem ser aprovadas' }, { status: 409 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.deal.update({
      where: { id: params.id },
      data:  { status: 'LIBERADA' },
    })
    await tx.dealStatusHistory.create({
      data: {
        dealId:         params.id,
        previousStatus: 'AGUARDANDO_LIBERACAO',
        newStatus:      'LIBERADA',
        changedByUserId:    session.user.id,
        reason:         `Aprovado por ${session.user.name}`,
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
      },
    })
    return d
  })

  return NextResponse.json({ data: updated })
}
