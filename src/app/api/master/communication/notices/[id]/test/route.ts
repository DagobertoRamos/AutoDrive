// =============================================================================
// POST /api/master/communication/notices/[id]/test
// Cria notificação de teste somente para o MASTER logado.
// Não impacta usuários reais. Registra no log.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma }          from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const notice = await prisma.internalNotice.findFirst({ where: { id: params.id, deletedAt: null } })
    if (!notice) return NextResponse.json({ success: false, error: 'Aviso não encontrado.' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const channel = (body.channel as string) ?? 'BELL' // BELL | BALLOON | BANNER | MODAL

    // Cria aviso de teste temporário para o MASTER
    const testNotice = await prisma.internalNotice.create({
      data: {
        title:           `[TESTE] ${notice.title}`,
        message:         notice.message,
        type:            notice.type,
        severity:        notice.severity,
        priority:        notice.priority,
        status:          'ACTIVE',
        targetType:      'SELECTED_USERS',
        targetUsers:     [session.id],
        displayType:     channel,
        displayChannels: [channel],
        startsAt:        new Date(),
        endsAt:          new Date(Date.now() + 10 * 60_000), // expira em 10 min
        required:        false,
        dismissible:     true,
        blockUntilRead:  false,
        allowComments:   false,
        actionUrl:       notice.actionUrl,
        actionLabel:     notice.actionLabel,
        createdBy:       session.id,
        active:          true,
        publishedAt:     new Date(),
      },
    })

    await prisma.internalNoticeLog.create({
      data: {
        noticeId: params.id,
        userId:   session.id,
        action:   'TESTED',
        details:  { channel, testNoticeId: testNotice.id },
      },
    }).catch(() => {})

    return NextResponse.json({
      success:       true,
      message:       `Teste enviado como ${channel} apenas para você. Nenhum usuário real foi impactado.`,
      testNoticeId:  testNotice.id,
      channel,
      notice: {
        id:      testNotice.id,
        title:   testNotice.title,
        message: testNotice.message,
        type:    testNotice.type,
        severity: testNotice.severity,
        channel,
        actionUrl:   testNotice.actionUrl,
        actionLabel: testNotice.actionLabel,
      },
    })
  } catch (err) { return handlePrismaError(err) }
}
