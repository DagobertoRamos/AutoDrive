// POST /api/master/communication/notices/test-banner
// Cria notificação de teste tipo BANNER apenas para o MASTER logado.
import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma }          from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const body    = await req.json().catch(() => ({}))
    const title   = (body.title   as string) || 'Teste de Banner'
    const message = (body.message as string) || 'Este é um teste de notificação em banner superior.'
    const type    = (body.type    as string) || 'INFO'

    const notice = await prisma.internalNotice.create({
      data: {
        title, message, type, severity: type, priority: 'MEDIUM',
        status: 'ACTIVE', targetType: 'SELECTED_USERS', targetUsers: [session.id],
        displayType: 'BANNER', displayChannels: ['BANNER'],
        startsAt: new Date(), endsAt: new Date(Date.now() + 10 * 60_000),
        required: false, dismissible: true, blockUntilRead: false, allowComments: false,
        createdBy: session.id, active: true, publishedAt: new Date(),
      },
    })
    await prisma.internalNoticeLog.create({ data: { noticeId: notice.id, userId: session.id, action: 'TESTED', details: { channel: 'BANNER', isQuickTest: true } } }).catch(() => {})

    return NextResponse.json({ success: true, message: 'Teste de banner criado.', notice })
  } catch (err) { return handlePrismaError(err) }
}
