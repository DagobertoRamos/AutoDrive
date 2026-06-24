// =============================================================================
// GET /api/seller-queue/current — estado da fila da unidade hoje.
// Gate: sellerQueue.view. Retorna a fila ordenada, o "vendedor da vez", a
// posição do solicitante e a contagem de clientes aguardando. Tenant/unit-scoped.
// MASTER: passar ?unitId=. Não cria fila (só leitura).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate , unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'
import { getActiveQueueBlock } from '@/lib/seller-queue/penalty'
import { getActivePosVenda } from '@/lib/seller-queue/pos-vendas'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=) ou tenha unidade vinculada.' }, { status: 400 })

  try {
    const ucfg = await getUnitConfig(tenantId, unitId)
    const alerts = {
      sound: ucfg?.alertSound ?? true,
      soundType: ucfg?.alertSoundType ?? 'siren',
      browserPush: ucfg?.alertBrowserPush ?? true,
      repeatSeconds: ucfg?.alertRepeatSeconds ?? 10,
    }
    const allowChooseSeller = ucfg?.allowChooseSeller ?? true
    const myBlockRaw = await getActiveQueueBlock(tenantId, unitId, user.id)
    const myBlock = myBlockRaw ? { type: myBlockRaw.type, endsAt: myBlockRaw.endsAt } : null
    const myPosVendaRaw = await getActivePosVenda(tenantId, unitId, user.id)
    const myPosVenda = myPosVendaRaw ? { status: myPosVendaRaw.status } : null
    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } } })
    if (!queue) {
      return NextResponse.json({ success: true, data: { queue: null, entries: [], vendedorDaVez: null, me: null, arrivalsPending: 0, alerts, allowChooseSeller, myBlock, myPosVenda } })
    }

    const [entries, arrivalsPending] = await Promise.all([
      prisma.sellerQueueEntry.findMany({
        where: { queueId: queue.id, status: { notIn: ['LEFT'] } },
        orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
      }),
      prisma.sellerQueueCustomerArrival.count({ where: { queueId: queue.id, status: { in: ['PENDING', 'CALLING'] } } }),
    ])

    // Nomes dos vendedores (User não tem relação direta no model da fila).
    const names = new Map<string, string>()
    if (entries.length) {
      const us = await prisma.user.findMany({ where: { id: { in: entries.map((e) => e.sellerId) } }, select: { id: true, name: true } })
      us.forEach((u) => names.set(u.id, u.name))
    }

    const list = entries.map((e) => ({
      id: e.id, sellerId: e.sellerId, sellerName: names.get(e.sellerId) ?? e.sellerId,
      status: e.status, position: e.position, joinedAt: e.joinedAt, blocked: e.blocked, attendanceCount: e.attendanceCount,
    }))
    const vencedor = list.find((e) => e.status === 'WAITING' && !e.blocked) ?? null
    const meRaw = list.find((e) => e.sellerId === user.id) ?? null
    // Posição REAL na fila: rank entre os que estão aguardando (1º, 2º, 3º…),
    // não o campo interno `position` (que cresce como contador ao ir pro fim).
    const lineOrder = list.filter((e) => (e.status === 'WAITING' || e.status === 'NEXT') && !e.blocked)
    const myRank = lineOrder.findIndex((e) => e.sellerId === user.id) + 1
    const me = meRaw ? { ...meRaw, position: myRank > 0 ? myRank : meRaw.position } : null

    // Atendimento ativo do próprio solicitante (p/ aceitar/recusar/finalizar).
    const myAtt = await prisma.sellerQueueAttendance.findFirst({
      where: { queueId: queue.id, sellerId: user.id, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
      orderBy: { calledAt: 'desc' },
      include: { arrival: { select: { customerName: true, customerPhone: true, customerEmail: true, recurring: true } } },
    })

    return NextResponse.json({
      success: true,
      data: {
        queue: { id: queue.id, date: queue.date, status: queue.status, unitId },
        entries: list,
        vendedorDaVez: vencedor ? { sellerId: vencedor.sellerId, sellerName: vencedor.sellerName, position: vencedor.position } : null,
        me,
        arrivalsPending,
        alerts,
        allowChooseSeller,
        myBlock,
        myPosVenda,
        myAttendance: myAtt ? { id: myAtt.id, status: myAtt.status, acceptDeadline: myAtt.acceptDeadline, arrival: myAtt.arrival } : null,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
