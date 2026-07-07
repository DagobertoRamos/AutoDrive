import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { notify } from '@/services/notification.service'
import { logQueueEvent, queueDate } from '@/lib/seller-queue/queue'

export const dynamic = 'force-dynamic'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER']

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action

    if (action === 'respond') {
      const notificationId = typeof body?.notificationId === 'string' ? body.notificationId : ''
      const durationSeconds = typeof body?.durationSeconds === 'number' ? body.durationSeconds : 0

      if (!notificationId) {
        return NextResponse.json({ success: false, error: 'notificationId é obrigatório.' }, { status: 400 })
      }

      const notif = await prisma.notification.findUnique({
        where: { id: notificationId }
      })

      if (!notif || notif.userId !== user.id) {
        return NextResponse.json({ success: false, error: 'Notificação não encontrada.' }, { status: 404 })
      }

      await prisma.notification.update({
        where: { id: notificationId },
        data: { read: true }
      })

      const queue = await prisma.sellerQueue.findFirst({
        where: { tenantId, unitId: user.unitId || '', date: queueDate() },
        select: { id: true }
      })

      await logQueueEvent({
        tenantId,
        unitId: user.unitId || '',
        queueId: queue?.id ?? null,
        type: 'MANAGER_OVERRIDE',
        sellerId: user.id,
        actorId: user.id,
        reason: `Teste de atenção respondido: vendedor ativo (tempo de resposta: ${durationSeconds}s)`
      })

      return NextResponse.json({ success: true, durationSeconds })
    }

    const isManager = MANAGE_ROLES.includes(user.role)
    if (!isManager) {
      return forbiddenResponse('Apenas gestores podem enviar testes de atenção.')
    }

    const sellerId = typeof body?.sellerId === 'string' ? body.sellerId : ''
    if (!sellerId) {
      return NextResponse.json({ success: false, error: 'sellerId é obrigatório.' }, { status: 400 })
    }

    const targetSeller = await prisma.seller.findFirst({
      where: { userId: sellerId, unit: { tenantId } },
      select: { unitId: true, user: { select: { name: true } } }
    })
    if (!targetSeller) {
      return NextResponse.json({ success: false, error: 'Vendedor não encontrado nesta loja.' }, { status: 404 })
    }

    await notify({
      userId: sellerId,
      tenantId,
      type: 'WARNING',
      title: 'Teste de atenção! ⚠️',
      message: `Enviado por ${user.name}. Responda agora mesmo para testar notificações, vibração e som.`,
      actionUrl: '/vendedor-da-vez/testes',
      metadata: { kind: 'test_attention', sentAt: new Date().toISOString() },
      channels: ['APP_WEB'],
    })

    const queue = await prisma.sellerQueue.findFirst({
      where: { tenantId, unitId: targetSeller.unitId, date: queueDate() },
      select: { id: true }
    })

    await logQueueEvent({
      tenantId,
      unitId: targetSeller.unitId,
      queueId: queue?.id ?? null,
      type: 'MANAGER_OVERRIDE',
      sellerId,
      actorId: user.id,
      reason: `Teste de atenção enviado para o vendedor ${targetSeller.user?.name ?? sellerId}`
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const events = await prisma.sellerQueueEvent.findMany({
      where: { tenantId, type: 'MANAGER_OVERRIDE' },
      orderBy: { createdAt: 'desc' },
      take: 30
    })

    const ids = Array.from(new Set(events.flatMap((e) => [e.sellerId, e.actorId]).filter(Boolean))) as string[]
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true }
    })
    const nameMap = new Map(users.map((u) => [u.id, u.name]))

    const list = events.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      type: e.type,
      sellerId: e.sellerId,
      sellerName: e.sellerId ? nameMap.get(e.sellerId) ?? e.sellerId : null,
      actorId: e.actorId,
      actorName: e.actorId ? nameMap.get(e.actorId) ?? e.actorId : null,
      reason: e.reason
    }))

    return NextResponse.json({ success: true, data: list })
  } catch (err) {
    return handlePrismaError(err)
  }
}
