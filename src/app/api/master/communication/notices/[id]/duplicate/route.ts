import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }   from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma }          from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireMaster()
  if (error) return error
  try {
    const original = await prisma.internalNotice.findFirst({ where: { id: params.id, deletedAt: null } })
    if (!original) return NextResponse.json({ success: false, error: 'Aviso não encontrado.' }, { status: 404 })

    const copy = await prisma.internalNotice.create({
      data: {
        title:           `[Cópia] ${original.title}`,
        message:         original.message,
        type:            original.type,
        severity:        original.severity,
        priority:        original.priority,
        status:          'DRAFT',
        targetType:      original.targetType,
        targetId:        original.targetId,
        targetTenants:   original.targetTenants ?? undefined,
        targetUnits:     original.targetUnits   ?? undefined,
        targetRoles:     original.targetRoles   ?? undefined,
        targetUsers:     original.targetUsers   ?? undefined,
        displayType:     original.displayType,
        displayChannels: original.displayChannels,
        startsAt:        new Date(),
        endsAt:          null,
        required:        original.required,
        dismissible:     original.dismissible,
        blockUntilRead:  original.blockUntilRead,
        allowComments:   original.allowComments,
        actionUrl:       original.actionUrl,
        actionLabel:     original.actionLabel,
        createdBy:       session.id,
        active:          false,
      },
    })

    await prisma.internalNoticeLog.create({ data: { noticeId: copy.id, userId: session.id, action: 'CREATED', details: { duplicatedFrom: original.id } } }).catch(() => {})
    await prisma.internalNoticeLog.create({ data: { noticeId: params.id, userId: session.id, action: 'DUPLICATED', details: { newId: copy.id } } }).catch(() => {})

    return NextResponse.json({ success: true, data: copy, message: 'Aviso duplicado como rascunho.' })
  } catch (err) { return handlePrismaError(err) }
}
