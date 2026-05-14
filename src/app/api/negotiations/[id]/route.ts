// =============================================================================
// /api/negotiations/[id] — Detalhar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'

export async function GET(
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

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      person: true,
      seller: { include: { user: { select: { name: true, email: true } } } },
      vehicles: {
        include: {
          vehicle: true,
        },
      },
      history: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!deal) {
    return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  }

  // Enriquecer histórico com nome do usuário (query separada)
  const userIds = deal.history
    .map((h) => h.changedByUserId)
    .filter((id): id is string => !!id)
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  const dealWithHistory = {
    ...deal,
    statusHistory: deal.history.map((h) => ({
      ...h,
      changedByUser: h.changedByUserId ? { name: userMap[h.changedByUserId] ?? null } : null,
    })),
  }

  // Isolamento por tenant
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  return NextResponse.json({ data: dealWithHistory })
}
