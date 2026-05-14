// =============================================================================
// /api/master/communication/notices
// GET  — lista avisos com stats de leitura e logs
// POST — cria novo aviso
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError }              from '@/lib/prisma-errors'
import { prisma }                         from '@/lib/prisma'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { error } = await requireMaster()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')   // DRAFT | SCHEDULED | ACTIVE | PAUSED | CANCELLED | EXPIRED | ARCHIVED
  const search  = searchParams.get('search')
  const type    = searchParams.get('type')
  const target  = searchParams.get('targetType')
  // legado
  const active  = searchParams.get('active')

  try {
    const where: Record<string, unknown> = { deletedAt: null }

    if (status) {
      where.status = status
    } else if (active != null) {
      // backward compat
      where.active = active === 'true'
    }

    if (type)   where.type       = type
    if (target) where.targetType = target
    if (search) {
      where.OR = [
        { title:   { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ]
    }

    const notices = await prisma.internalNotice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { reads: true, logs: true } },
      },
    })

    return NextResponse.json({ success: true, data: notices })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()
    const {
      title, message, type, severity, priority, status,
      targetType, targetId, targetTenants, targetUnits, targetRoles, targetUsers,
      displayType, displayChannels,
      startsAt, endsAt, required, dismissible, blockUntilRead, allowComments,
      actionUrl, actionLabel,
    } = body

    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Título e mensagem são obrigatórios.' },
        { status: 400 },
      )
    }

    const resolvedStatus = status ?? 'ACTIVE'
    const now            = new Date()

    const notice = await prisma.internalNotice.create({
      data: {
        title:           String(title).trim(),
        message:         String(message).trim(),
        type:            type        || 'INFO',
        severity:        severity    || 'INFO',
        priority:        priority    || 'MEDIUM',
        status:          resolvedStatus,
        targetType:      targetType  || 'ALL',
        targetId:        targetId    || null,
        targetTenants:   targetTenants  ?? undefined,
        targetUnits:     targetUnits    ?? undefined,
        targetRoles:     targetRoles    ?? undefined,
        targetUsers:     targetUsers    ?? undefined,
        displayType:     displayType || 'BELL',
        displayChannels: displayChannels ?? ['BELL'],
        startsAt:        startsAt ? new Date(startsAt) : now,
        endsAt:          endsAt   ? new Date(endsAt)   : null,
        required:        Boolean(required),
        dismissible:     dismissible !== false,
        blockUntilRead:  Boolean(blockUntilRead),
        allowComments:   Boolean(allowComments),
        actionUrl:       actionUrl   || null,
        actionLabel:     actionLabel || null,
        createdBy:       session.id,
        active:          resolvedStatus === 'ACTIVE',
        publishedAt:     resolvedStatus === 'ACTIVE' ? now : null,
      },
    })

    // Log
    await prisma.internalNoticeLog.create({
      data: {
        noticeId: notice.id,
        userId:   session.id,
        action:   resolvedStatus === 'DRAFT' ? 'CREATED' : 'PUBLISHED',
        details:  { title: notice.title, status: notice.status, targetType: notice.targetType },
      },
    }).catch(() => {})

    await logMasterAction(session, 'CREATE_NOTICE', 'InternalNotice', notice.id, {
      afterData: { title: notice.title, type: notice.type, status: notice.status, targetType: notice.targetType }, req,
    })

    return NextResponse.json({ success: true, data: notice, message: 'Aviso criado com sucesso.' }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
