// =============================================================================
// PATCH /api/master/communication/notices/[id]  — edita aviso
// DELETE /api/master/communication/notices/[id] — soft delete
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError }              from '@/lib/prisma-errors'
import { prisma }                         from '@/lib/prisma'
import { dispatchInternalNoticeNotifications } from '@/lib/internal-notices/dispatch'

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const existing = await prisma.internalNotice.findFirst({
      where: { id: params.id, deletedAt: null },
    })
    if (!existing) return NextResponse.json({ success: false, error: 'Aviso não encontrado.' }, { status: 404 })

    const body = await req.json()
    const {
      title, message, type, severity, priority, status,
      targetType, targetId, targetTenants, targetUnits, targetRoles, targetUsers,
      displayType, displayChannels,
      startsAt, endsAt, required, dismissible, blockUntilRead, allowComments,
      actionUrl, actionLabel,
    } = body

    const data: Record<string, unknown> = { updatedById: session.id }

    if (title       !== undefined) data.title           = String(title).trim()
    if (message     !== undefined) data.message         = String(message).trim()
    if (type        !== undefined) data.type            = type
    if (severity    !== undefined) data.severity        = severity
    if (priority    !== undefined) data.priority        = priority
    if (targetType  !== undefined) data.targetType      = targetType
    if (targetId    !== undefined) data.targetId        = targetId || null
    if (targetTenants !== undefined) data.targetTenants = targetTenants
    if (targetUnits   !== undefined) data.targetUnits   = targetUnits
    if (targetRoles   !== undefined) data.targetRoles   = targetRoles
    if (targetUsers   !== undefined) data.targetUsers   = targetUsers
    if (displayType !== undefined) data.displayType     = displayType
    if (displayChannels !== undefined) data.displayChannels = displayChannels
    if (startsAt    !== undefined) data.startsAt        = startsAt ? new Date(startsAt) : existing.startsAt
    if (endsAt      !== undefined) data.endsAt          = endsAt ? new Date(endsAt) : null
    if (required    !== undefined) data.required        = Boolean(required)
    if (dismissible !== undefined) data.dismissible     = Boolean(dismissible)
    if (blockUntilRead !== undefined) data.blockUntilRead = Boolean(blockUntilRead)
    if (allowComments  !== undefined) data.allowComments  = Boolean(allowComments)
    if (actionUrl   !== undefined) data.actionUrl       = actionUrl   || null
    if (actionLabel !== undefined) data.actionLabel     = actionLabel || null

    // Status change
    if (status !== undefined && status !== existing.status) {
      data.status = status
      data.active = status === 'ACTIVE'
      if (status === 'ACTIVE' && !existing.publishedAt) data.publishedAt = new Date()
    }

    const updated = await prisma.internalNotice.update({
      where: { id: params.id },
      data,
    })

    await prisma.internalNoticeLog.create({
      data: {
        noticeId: params.id,
        userId:   session.id,
        action:   'EDITED',
        details:  { changedFields: Object.keys(data).filter(k => k !== 'updatedById') },
      },
    }).catch(() => {})

    await logMasterAction(session, 'UPDATE_NOTICE', 'InternalNotice', params.id, {
      beforeData: { title: existing.title, status: existing.status },
      afterData:  { title: updated.title,  status: updated.status  },
      req,
    })

    if (status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const dispatchResult = await dispatchInternalNoticeNotifications(updated).catch((err) => {
        console.warn('[internal-notices] push dispatch failed:', err instanceof Error ? err.message : err)
        return { recipients: 0 }
      })
      if (dispatchResult.recipients > 0) {
        await prisma.internalNoticeLog.create({
          data: {
            noticeId: params.id,
            userId:   session.id,
            action:   'PUSH_DISPATCHED',
            details:  { recipients: dispatchResult.recipients },
          },
        }).catch(() => {})
      }
    }

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── DELETE (soft) ─────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const existing = await prisma.internalNotice.findFirst({
      where: { id: params.id, deletedAt: null },
    })
    if (!existing) return NextResponse.json({ success: false, error: 'Aviso não encontrado.' }, { status: 404 })

    const now = new Date()
    await prisma.internalNotice.update({
      where: { id: params.id },
      data:  { deletedAt: now, status: 'DELETED', active: false, updatedById: session.id },
    })

    await prisma.internalNoticeLog.create({
      data: {
        noticeId: params.id,
        userId:   session.id,
        action:   'DELETED',
        details:  { previousStatus: existing.status },
      },
    }).catch(() => {})

    await logMasterAction(session, 'DELETE_NOTICE', 'InternalNotice', params.id, {
      beforeData: { title: existing.title, status: existing.status }, req,
    })

    return NextResponse.json({ success: true, message: 'Aviso excluído.' })
  } catch (err) {
    return handlePrismaError(err)
  }
}
