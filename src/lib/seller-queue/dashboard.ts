// =============================================================================
// seller-queue/dashboard.ts — dados OPERACIONAIS agregados do dashboard da fila
// numa única chamada (atendimentos ativos + lembretes + bloqueios). Reduz o
// número de fetches do dashboard (6→2 no polling rápido). O ranking (7 dias) e o
// log ficam FORA daqui (carregam numa cadência lenta no front). Escopo tenant+unidade.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { queueDate } from './queue'
import { getReminderDashboard } from './reminders'
import { listBlockedSellers } from './penalty'

export async function getQueueDashboardData(opts: {
  tenantId: string
  unitId: string
  userId: string
  canManage: boolean
}) {
  const { tenantId, unitId, userId } = opts
  const queue = await prisma.sellerQueue.findUnique({
    where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } },
    select: { id: true },
  }).catch(() => null)

  const [attsRaw, reminders, blocks] = await Promise.all([
    queue
      ? prisma.sellerQueueAttendance.findMany({
          where: { queueId: queue.id, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
          orderBy: { calledAt: 'desc' },
          take: 200,
          select: {
            id: true, sellerId: true, status: true, visitType: true, result: true,
            calledAt: true, acceptDeadline: true, acceptedAt: true, finishedAt: true, leadId: true,
            arrival: { select: { customerName: true, customerPhone: true, recurring: true } },
          },
        }).catch(() => [])
      : Promise.resolve([]),
    getReminderDashboard({ tenantId, unitId, userId }).catch(() => null),
    opts.canManage ? listBlockedSellers(tenantId, unitId).catch(() => []) : Promise.resolve([]),
  ])

  // Nome do vendedor: o registro de atendimento não tem o nome. Buscamos o melhor
  // rótulo (Seller.fullName → User.name → começo do e-mail) — antes o quadro
  // "Atendimentos em andamento" ficava sem nome quando User.name era nulo.
  const sellerIds = [...new Set(attsRaw.map((a) => a.sellerId))]
  const nameMap = new Map<string, string>()
  if (sellerIds.length) {
    const [users, sellers] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true, email: true } }).catch(() => []),
      prisma.seller.findMany({ where: { userId: { in: sellerIds } }, select: { userId: true, fullName: true, shortName: true } }).catch(() => []),
    ])
    const bySeller = new Map(sellers.map((s) => [s.userId, s.fullName || s.shortName || '']))
    for (const u of users) nameMap.set(u.id, bySeller.get(u.id) || u.name || u.email?.split('@')[0] || 'Vendedor')
    for (const id of sellerIds) if (!nameMap.get(id)) nameMap.set(id, bySeller.get(id) || 'Vendedor')
  }

  const attendances = attsRaw.map((a) => ({
    id: a.id, sellerId: a.sellerId, sellerName: nameMap.get(a.sellerId) ?? 'Vendedor',
    status: a.status, type: a.visitType ?? null, result: a.result ?? null,
    calledAt: a.calledAt, acceptDeadline: a.acceptDeadline, acceptedAt: a.acceptedAt,
    finishedAt: a.finishedAt, leadId: a.leadId, arrival: a.arrival,
  }))

  return { attendances, reminders, blocks }
}
