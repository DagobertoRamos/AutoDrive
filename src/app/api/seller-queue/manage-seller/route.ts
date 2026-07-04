// =============================================================================
// POST /api/seller-queue/manage-seller — a GESTÃO controla a fila de OUTRO
// vendedor: pausar, voltar (resume), colocar na fila (add) ou retirar (remove).
// Gate: sellerQueue.lead. Auditado. Body: { sellerId, action, reason? }
//   action: 'pause' | 'resume' | 'add' | 'remove'
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate, nextPosition, getOrCreateQueue, logQueueEvent } from '@/lib/seller-queue/queue'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

const ACTIONS = ['pause', 'resume', 'add', 'remove'] as const
type Action = (typeof ACTIONS)[number]

const ACTION_PERMISSION: Record<Action, string> = {
  pause: 'queue.pause_other',
  resume: 'queue.resume_other',
  add: 'queue.add_participant',
  remove: 'queue.remove_participant',
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = user.unitId
  if (!unitId) return forbiddenResponse('Seu usuário não tem unidade vinculada.')

  try {
    const body = await req.json().catch(() => ({}))
    const sellerId = typeof body?.sellerId === 'string' ? body.sellerId : ''
    const action = body?.action as Action
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
    if (!sellerId || !ACTIONS.includes(action)) {
      return NextResponse.json({ success: false, error: 'Parâmetros inválidos (sellerId/action).' }, { status: 400 })
    }
    if (!await canAccessModuleForUser(user, ACTION_PERMISSION[action])) {
      return forbiddenResponse('Sem permissão para esta ação na fila.')
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: 'Informe o motivo da ação administrativa.' }, { status: 400 })
    }

    // O alvo precisa ser um vendedor da unidade.
    const seller = await prisma.seller.findFirst({ where: { userId: sellerId, unit: { tenantId } }, select: { id: true } })
    if (!seller) return NextResponse.json({ success: false, error: 'Vendedor não encontrado nesta loja.' }, { status: 404 })

    const queue = action === 'add'
      ? await getOrCreateQueue(tenantId, unitId)
      : await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
    if (!queue) return NextResponse.json({ success: false, error: 'Fila do dia não encontrada.' }, { status: 404 })

    const entry = await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: queue.id, sellerId } } })

    if (action === 'add') {
      if (entry) {
        await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'WAITING', position: await nextPosition(queue.id), pausedAt: null, leftAt: null, joinedAt: new Date(), lastActiveAt: new Date() } })
      } else {
        await prisma.sellerQueueEntry.create({ data: { tenantId, unitId, queueId: queue.id, sellerId, status: 'WAITING', position: await nextPosition(queue.id), lastActiveAt: new Date() } })
      }
      await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'CHECK_IN', sellerId, actorId: user.id, reason })
    } else if (action === 'remove') {
      if (!entry || entry.status === 'LEFT') return NextResponse.json({ success: false, error: 'Vendedor não está na fila.' }, { status: 404 })
      await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'LEFT', leftAt: new Date() } })
      await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'CHECK_OUT', sellerId, actorId: user.id, entryId: entry.id, reason })
    } else if (action === 'pause') {
      if (!entry || !['WAITING', 'NEXT'].includes(entry.status)) return NextResponse.json({ success: false, error: 'Vendedor não está aguardando na fila.' }, { status: 409 })
      await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'PAUSED', pausedAt: new Date() } })
      await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'PAUSE', sellerId, actorId: user.id, entryId: entry.id, reason })
    } else {
      if (!entry || entry.status !== 'PAUSED') return NextResponse.json({ success: false, error: 'Vendedor não está pausado.' }, { status: 409 })
      await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'WAITING', pausedAt: null, position: await nextPosition(queue.id), lastActiveAt: new Date() } })
      await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'RESUME', sellerId, actorId: user.id, entryId: entry.id, reason })
    }

    await createSafeAuditLog({ userId: user.id, tenantId, action: `QUEUE_MGR_${action.toUpperCase()}`, entity: 'SellerQueueEntry', entityId: entry?.id ?? seller.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
