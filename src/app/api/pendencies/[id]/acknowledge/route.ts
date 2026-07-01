// =============================================================================
// POST /api/pendencies/[id]/acknowledge — "Ciente": o responsável confirma que
// LEU a pendência. Registra a leitura na linha do tempo (comentário marcador) e
// marca eventuais notificações da pendência como lidas. Não altera o status.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { ACK_MARK } from '@/lib/pendencies/ack'

export async function POST(_req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    const pendency = await prisma.pendency.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!pendency) return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })

    // Idempotente: se já confirmou, não duplica.
    const already = await prisma.pendencyComment.findFirst({
      where: { pendencyId: params.id, userId: session.user.id, content: { startsWith: ACK_MARK } },
      select: { id: true },
    })
    if (!already) {
      await prisma.pendencyComment.create({
        data: {
          pendencyId: params.id,
          userId:     session.user.id,
          content:    `${ACK_MARK} — leitura confirmada por ${session.user.name ?? 'colaborador'}`,
          internal:   true,
        },
      }).catch(() => {})
    }

    // Marca como lida a notificação de pendência do usuário (limpa o sininho).
    await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false, actionUrl: { contains: '/pendencias' } },
      data:  { read: true },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/pendencies/[id]/acknowledge]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
