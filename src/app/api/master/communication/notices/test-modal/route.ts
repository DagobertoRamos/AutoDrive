// POST /api/master/communication/notices/test-modal
// Cria notificação de teste tipo MODAL obrigatório apenas para o MASTER logado.
import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma }          from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const body    = await req.json().catch(() => ({}))
    const title   = (body.title   as string) || 'Teste de Modal Obrigatório'
    const message = (body.message as string) || 'Este é um teste de aviso em modal central com confirmação de ciência.'
    const type    = (body.type    as string) || 'INFO'

    const notice = await prisma.internalNotice.create({
      data: {
        title, message, type, severity: type, priority: 'HIGH',
        status: 'ACTIVE', targetType: 'SELECTED_USERS', targetUsers: [session.id],
        displayType: 'MODAL', displayChannels: ['MODAL'],
        startsAt: new Date(), endsAt: new Date(Date.now() + 10 * 60_000),
        required: true, dismissible: false, blockUntilRead: Boolean(body.blockUntilRead),
        allowComments: false,
        actionLabel: 'Li e estou ciente',
        createdBy: session.id, active: true, publishedAt: new Date(),
      },
    })
    await prisma.internalNoticeLog.create({ data: { noticeId: notice.id, userId: session.id, action: 'TESTED', details: { channel: 'MODAL', isQuickTest: true } } }).catch(() => {})

    return NextResponse.json({ success: true, message: 'Teste de modal criado.', notice })
  } catch (err) { return handlePrismaError(err) }
}
