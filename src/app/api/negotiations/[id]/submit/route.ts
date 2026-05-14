// =============================================================================
// POST /api/negotiations/[id]/submit — Enviar para aprovação
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
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (deal.status !== 'RASCUNHO' && deal.status !== 'REABERTA') {
    return NextResponse.json({ error: 'Apenas rascunhos podem ser enviados para aprovação' }, { status: 409 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.deal.update({
      where: { id: params.id },
      data:  { status: 'AGUARDANDO_LIBERACAO' },
    })
    await tx.dealStatusHistory.create({
      data: {
        dealId:         params.id,
        previousStatus: deal.status,
        newStatus:      'AGUARDANDO_LIBERACAO',
        changedByUserId:    session.user.id,
        reason:         'Enviado para aprovação pelo vendedor',
      },
    })
    return d
  })

  return NextResponse.json({ data: updated })
}
