import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma }          from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireMaster()
  if (error) return error
  try {
    const [reads, totalReads, clicked, dismissed, displayed] = await prisma.$transaction([
      prisma.internalNoticeRead.count({ where: { noticeId: params.id, readAt: { not: undefined } } }),
      prisma.internalNoticeRead.count({ where: { noticeId: params.id } }),
      prisma.internalNoticeRead.count({ where: { noticeId: params.id, clickedAt:  { not: null } } }),
      prisma.internalNoticeRead.count({ where: { noticeId: params.id, dismissed:  true          } }),
      prisma.internalNoticeRead.count({ where: { noticeId: params.id, displayedAt: { not: null } } }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        reads,
        views: displayed || totalReads,
        clicks: clicked,
        dismissals: dismissed,
        pending: Math.max(0, totalReads - reads),
        readRate: totalReads > 0 ? Math.round((reads / totalReads) * 100) : 0,
      },
    })
  } catch (err) { return handlePrismaError(err) }
}
