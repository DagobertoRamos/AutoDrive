// =============================================================================
// GET /api/internal-notices/active — Avisos internos ativos para o usuário atual
// Retorna avisos do MASTER ainda não lidos/confirmados pelo usuário.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const displayType = searchParams.get('displayType') || undefined // BELL | BANNER | MODAL

    const now = new Date()

    // Busca avisos ativos que se aplicam ao usuário
    const notices = await prisma.internalNotice.findMany({
      where: {
        active:   true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        // Filtro por displayType se especificado
        ...(displayType ? { displayType } : {}),
        // Exclui os que o usuário já leu/dispensou
        reads: {
          none: {
            userId:    session.user.id,
            dismissed: true,
          },
        },
        // Aplica targetType
        AND: [
          {
            OR: [
              { targetType: 'ALL' },
              { targetType: 'ROLE',   targetId: session.user.role },
              { targetType: 'USER',   targetId: session.user.id },
              ...(session.user.tenantId
                ? [{ targetType: 'TENANT', targetId: session.user.tenantId }]
                : []),
            ],
          },
        ],
      },
      select: {
        id:          true,
        title:       true,
        message:     true,
        type:        true,
        displayType: true,
        required:    true,
        dismissible: true,
        actionUrl:   true,
        actionLabel: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    return NextResponse.json({ success: true, data: notices })
  } catch (err) {
    console.error('[GET /api/internal-notices/active]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
