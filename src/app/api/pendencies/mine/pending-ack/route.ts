// =============================================================================
// GET /api/pendencies/mine/pending-ack — pendências ABERTAS do colaborador
// logado (como responsável) que ele ainda NÃO deu "Ciente". Usado pelo popup
// que abre ao entrar no sistema. "Ciente" = um comentário marcador (ver
// /acknowledge) — assim a leitura fica registrada na linha do tempo.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { ACK_MARK } from '@/lib/pendencies/ack'

const OPEN = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA', 'PAUSADA', 'REATIVADA', 'VENCIDA']

export async function GET() {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    { const gate = await assertModuleEnabled(session.user, 'pendencies'); if (gate) return gate }

    // responsibleId é Seller.id → mapeia do usuário logado.
    const seller = await prisma.seller.findFirst({ where: { userId: session.user.id }, select: { id: true } })
    if (!seller) return NextResponse.json({ success: true, data: [] })

    const data = await prisma.pendency.findMany({
      where: {
        responsibleId: seller.id,
        status: { in: OPEN as never },
        ...(session.user.tenantId ? { tenantId: session.user.tenantId } : {}),
        // ainda não confirmou leitura (sem comentário marcador dele)
        comments: { none: { userId: session.user.id, content: { startsWith: ACK_MARK } } },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 20,
      select: {
        id: true, customerName: true, plate: true, type: true, description: true,
        priority: true, status: true, dueDate: true, createdAt: true,
        unit: { select: { name: true } },
      },
    })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/pendencies/mine/pending-ack]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
