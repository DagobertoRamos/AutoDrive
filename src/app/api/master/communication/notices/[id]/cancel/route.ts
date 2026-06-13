import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma }          from '@/lib/prisma'

export async function POST(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const notice = await prisma.internalNotice.findFirst({ where: { id: params.id, deletedAt: null } })
    if (!notice) return NextResponse.json({ success: false, error: 'Aviso não encontrado.' }, { status: 404 })
    if (['CANCELLED', 'DELETED', 'ARCHIVED'].includes(notice.status)) {
      return NextResponse.json({ success: false, error: 'Aviso já está cancelado, arquivado ou excluído.' }, { status: 400 })
    }
    const now = new Date()
    const updated = await prisma.internalNotice.update({
      where: { id: params.id },
      data:  { status: 'CANCELLED', active: false, cancelledAt: now, updatedById: session.id },
    })
    await prisma.internalNoticeLog.create({ data: { noticeId: params.id, userId: session.id, action: 'CANCELLED', details: { previousStatus: notice.status } } }).catch(() => {})
    return NextResponse.json({ success: true, data: updated, message: 'Aviso cancelado.' })
  } catch (err) { return handlePrismaError(err) }
}
