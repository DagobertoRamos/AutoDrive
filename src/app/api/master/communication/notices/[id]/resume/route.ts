import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma }          from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const notice = await prisma.internalNotice.findFirst({ where: { id: params.id, deletedAt: null } })
    if (!notice) return NextResponse.json({ success: false, error: 'Aviso não encontrado.' }, { status: 404 })
    if (notice.status !== 'PAUSED') {
      return NextResponse.json({ success: false, error: 'Somente avisos pausados podem ser reativados.' }, { status: 400 })
    }
    const updated = await prisma.internalNotice.update({
      where: { id: params.id },
      data:  { status: 'ACTIVE', active: true, updatedById: session.id },
    })
    await prisma.internalNoticeLog.create({ data: { noticeId: params.id, userId: session.id, action: 'RESUMED' } }).catch(() => {})
    return NextResponse.json({ success: true, data: updated, message: 'Aviso reativado.' })
  } catch (err) { return handlePrismaError(err) }
}
